// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// createTown — the whole town as one pure, seeded, tick-based object. No DOM,
// no time, no network; the browser shell and the headless test suite drive
// the exact same module. Sim time counts in j-time τ ticks.
//
//   const town = createTown({ seed: 42 });
//   town.tick();                       // advance one τ
//   town.act({ type: 'orderMood', id: 'res-00', mood: 'ember' });
//   town.subscribe((ev, state) => ...) // events + live state
//
// Every venue is one instance of the one mechanism: a population -> an R -> a
// gate -> a verdict, and every step leaves a receipt on the tab.

import { mulberry32 } from '../physics/rng.js';
import { createLedger } from '../physics/trace.js';
import { orderParameter, KURAMOTO_SYNC } from '../physics/kuramoto.js';
import { hashBytes } from '../physics/inet.js';
import { makeResidents } from './residents.js';
import { stepPlaza } from './plaza.js';
import { maybePetition } from './door.js';
import { makeCellar, cellarTick } from './cellar.js';
import { foldPortrait } from './gallery.js';
import { applyMood, MOOD_NAMES } from './moods.js';
import { scanCandidates, signoff as boardSignoff } from './board.js';

export const CRYSTALLIZE_HOLD = 60; // τ of sustained R≥0.9 to crystallize
export const CRYSTALLIZE_REARM = 0.75; // R must fall below this before the next moment can fire
export const CELLAR_EVERY = 3;
export const CELLAR_REBUILD = 300;
export const GALLERY_RECEIPT_EVERY = 200;
export const VIBE_RECEIPT_EVERY = 120;

/**
 * @param {{seed?:number}} [opts]
 * @returns {{state:object, tick:Function, act:Function, hash:Function, subscribe:Function, KURAMOTO_SYNC:number}}
 */
export function createTown(opts = {}) {
  const subs = new Set();

  function init(sd) {
    const seed = (Number.isFinite(sd) ? sd : 42) >>> 0;
    const residents = makeResidents(seed);
    return {
      seed,
      rng: mulberry32(seed),
      residents,
      ledger: createLedger(),
      cellar: makeCellar(),
      tau: 0,
      R: 0,
      rSustain: 0,
      crystalReady: true, // refractory — re-arms only after R falls below CRYSTALLIZE_REARM
      crystallized: 0,
      ringT: 0,
      featured: 0,
      gallery: foldPortrait(residents[0].vec),
      candidates: new Map(),
      paused: false,
      lastPetition: null,
      moodApplied: null,
    };
  }

  let state = init(opts && Number.isFinite(opts.seed) ? opts.seed : 42);

  function notify(ev) {
    for (const fn of subs) {
      try {
        fn(ev, state);
      } catch {
        // a bad subscriber never breaks the town
      }
    }
  }

  function mint(rec) {
    const res = state.ledger.mint(rec, state.tau);
    notify({ type: 'receipt', rec, deduped: res.deduped, row: res.row });
    return res;
  }

  function findResident(id) {
    if (id == null) return null;
    if (typeof id === 'number') return state.residents[id] || null;
    return state.residents.find((r) => r.id === id || r.name === id) || null;
  }

  function tick() {
    state.tau += 1;

    // transient resident states decay back to 'wander'
    for (const r of state.residents) {
      if (r.stateT > 0) {
        r.stateT -= 1;
        if (r.stateT === 0) {
          r.state = 'wander';
          r.tint = 0;
        }
      }
    }

    // PLAZA — the vibe meter
    const R = stepPlaza(state.residents, state.rng);
    state.R = R;
    state.rSustain = R >= KURAMOTO_SYNC ? state.rSustain + 1 : 0;
    // a crystallization moment is a MOMENT: it fires once when the town first
    // holds sync, then re-arms only after the vibe genuinely falls apart
    // (e.g. the visitor taps residents until R dips below CRYSTALLIZE_REARM).
    if (R < CRYSTALLIZE_REARM) state.crystalReady = true;
    if (state.rSustain >= CRYSTALLIZE_HOLD && state.crystalReady) {
      state.crystallized += 1;
      state.ringT = 48;
      state.crystalReady = false;
      state.rSustain = 0;
      mint({
        op: 'kuramoto.crystallize',
        r: Math.round(R * 1e6) / 1e6,
        scalar: 'kuramotoR',
        note: `the vibe locked — R≥0.9 held ${CRYSTALLIZE_HOLD}τ (#${state.crystallized})`,
        witness: `R=${R.toFixed(4)}@τ${state.tau}`,
      });
    }
    if (state.ringT > 0) state.ringT -= 1;

    // a periodic vibe receipt with a fixed note — demonstrates dedupe ("already on the tab")
    if (state.tau % VIBE_RECEIPT_EVERY === 0) {
      mint({ op: 'plaza.vibe', r: Math.round(R * 1e6) / 1e6, scalar: 'kuramotoR', note: 'vibe check' });
    }

    // DOOR — the agreement gate
    const pet = maybePetition(state);
    if (pet) {
      state.lastPetition = { ...pet, tau: state.tau };
      const { a, b, readings, r, decision } = pet;
      if (decision === 'commit') {
        a.state = b.state = 'backroom';
        a.stateT = b.stateT = 40;
        a.tint = b.tint = 1;
        mint({
          op: 'agreement.gate',
          r,
          scalar: 'agreementR',
          note: `${a.name} & ${b.name} agree "${readings[0]}" — the door opens ✓`,
          witness: `commit@τ${state.tau}`,
        });
      } else {
        a.state = b.state = 'bench';
        a.stateT = b.stateT = 48;
        a.tint = b.tint = -1;
        mint({
          op: 'agreement.gate',
          r,
          scalar: 'agreementR',
          note: `${a.name} "${readings[0]}" vs ${b.name} "${readings[1]}" — talk it out (never fuse on disagreement)`,
        });
      }
    }

    // CELLAR — interaction-net reduction + the confluence stunt
    if (state.tau % CELLAR_EVERY === 0) {
      const ev = cellarTick(state.cellar);
      if (ev && ev.type === 'confluence') {
        mint({
          op: 'inet.confluence',
          note: `deal the same hand backwards — hashes ${ev.matched ? 'match' : 'DIFFER'} (${ev.forwardHash})`,
          witness: `${ev.forwardHash}=${ev.backwardHash}`,
        });
      }
    }
    if (state.cellar.done && state.tau % CELLAR_REBUILD === 0) {
      state.cellar = makeCellar();
    }

    // GALLERY — the fold
    state.gallery = foldPortrait(state.residents[state.featured].vec);
    if (state.tau % GALLERY_RECEIPT_EVERY === 0) {
      mint({
        op: 'fold.matryoshka',
        r: Math.round(state.gallery.glueR * 1e6) / 1e6,
        scalar: 'glueR',
        note: `${state.residents[state.featured].name}'s portrait survives the fold`,
      });
    }

    // BOARD — surface graduation candidates (never promote them here)
    state.candidates = scanCandidates(state.ledger, state.candidates);

    notify({ type: 'tick', tau: state.tau, R });
    return state;
  }

  function act(action) {
    if (!action || typeof action !== 'object') return { ok: false, note: 'bad action' };
    switch (action.type) {
      case 'tapResident': {
        const r = findResident(action.id);
        if (!r) return { ok: false, note: 'no such resident' };
        const preR = state.R;
        r.phase += Math.PI / 2;
        mint({
          op: 'plaza.tap',
          r: Math.round(preR * 1e6) / 1e6,
          scalar: 'kuramotoR',
          note: `tapped ${r.name} (+π/2) — watch local R dip and re-cohere`,
        });
        return { ok: true, id: r.id };
      }
      case 'orderMood': {
        const r = findResident(action.id);
        if (!r) return { ok: false, note: 'no such resident' };
        if (!MOOD_NAMES.includes(action.mood)) return { ok: false, note: 'unknown mood' };
        applyMood(r, action.mood);
        state.moodApplied = { id: r.id, mood: action.mood, tau: state.tau };
        if (r.idx === state.featured) state.gallery = foldPortrait(r.vec);
        mint({
          op: 'steer.contrast',
          note: `steered ${r.name} → ${action.mood}: a concept vector is a property of the contrast you chose, not of the model`,
          witness: `mood:${action.mood}@τ${state.tau}`,
        });
        return { ok: true, id: r.id, mood: action.mood };
      }
      case 'signoff': {
        const c = state.candidates.get(action.candidateId);
        const res = boardSignoff(c);
        if (res.ok) {
          mint({
            op: 'graduation.promote',
            r: c.rHistory.length ? Math.min(...c.rHistory) : undefined,
            scalar: c.rHistory.length ? 'agreementR' : undefined,
            note: `${action.candidateId} → ${res.state} (rung ${res.rung}) · your signoff is Γ_ext · L8: detection never promotes`,
            witness: `Γ_ext@τ${state.tau}`,
          });
        }
        return res;
      }
      case 'setFeatured': {
        const r = findResident(action.id);
        if (!r) return { ok: false, note: 'no such resident' };
        state.featured = r.idx;
        state.gallery = foldPortrait(r.vec);
        return { ok: true, id: r.id };
      }
      case 'pause':
        state.paused = true;
        return { ok: true };
      case 'resume':
        state.paused = false;
        return { ok: true };
      case 'step':
        tick();
        return { ok: true };
      case 'reset': {
        const seed = Number.isFinite(action.seed) ? action.seed : state.seed;
        state = init(seed);
        notify({ type: 'reset', seed });
        return { ok: true, seed: state.seed };
      }
      default:
        return { ok: false, note: 'unknown action ' + action.type };
    }
  }

  function hash() {
    const parts = [
      'tau:' + state.tau,
      'R:' + state.R.toFixed(6),
      'cry:' + state.crystallized,
      'cell:' + state.cellar.steps + ':' + state.cellar.hash,
      'led:' + state.ledger.size(),
    ];
    for (const r of state.residents) {
      parts.push(
        r.id +
          '|' +
          r.phase.toFixed(5) +
          '|' +
          r.pos.x.toFixed(5) +
          '|' +
          r.pos.y.toFixed(5) +
          '|' +
          r.state +
          '|' +
          r.vec.map((x) => x.toFixed(4)).join(','),
      );
    }
    return hashBytes(parts.join('\n'));
  }

  return {
    get state() {
      return state;
    },
    tick,
    act,
    hash,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    KURAMOTO_SYNC,
  };
}
