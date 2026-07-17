// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// Falsifier suite for the town. These drive the SAME modules the browser page
// loads (nothing is stubbed for tests) — the town boots, evolves, and is
// acted on entirely headlessly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTown } from '../src/town/index.js';
import { makeResidents } from '../src/town/residents.js';
import { maybePetition } from '../src/town/door.js';
import { drawReading, applyMood, MOODS, VOCAB } from '../src/town/moods.js';
import { mulberry32 } from '../src/physics/rng.js';

// ------------------------------------------------------------- boot + shape

test('town boots deterministically with 48 residents', () => {
  const t = createTown({ seed: 42 });
  const s = t.state;
  assert.equal(s.residents.length, 48);
  assert.equal(s.tau, 0);
  assert.equal(s.R, 0);
  assert.equal(s.ledger.size(), 0);
  assert.equal(s.cellar.done, false);
  assert.ok(typeof s.gallery.glueR === 'number');
  // the steeropathy homage handles lead the roster
  const names = s.residents.map((r) => r.name);
  for (const n of ['ember', 'nova', 'quill', 'atlas']) assert.ok(names.includes(n), `missing ${n}`);
  // every resident carries a 16-d portrait
  assert.equal(s.residents[0].vec.length, 16);
});

test('town: default seed is 42 and reset re-seeds', () => {
  const t = createTown();
  assert.equal(t.state.seed, 42);
  t.act({ type: 'reset', seed: 7 });
  assert.equal(t.state.seed, 7);
});

// --------------------------------------------------------------- determinism

test('two towns, same seed -> identical state hash after 1000 ticks', () => {
  const a = createTown({ seed: 1234 });
  const b = createTown({ seed: 1234 });
  for (let i = 0; i < 1000; i++) {
    a.tick();
    b.tick();
  }
  assert.equal(a.hash(), b.hash());
});

test('different seeds -> different state hash', () => {
  const a = createTown({ seed: 1 });
  const b = createTown({ seed: 2 });
  for (let i = 0; i < 1000; i++) {
    a.tick();
    b.tick();
  }
  assert.notEqual(a.hash(), b.hash());
});

// ----------------------------------------------------------------- the plaza

test('R crosses 0.9 within 5000 ticks under gathering (several seeds)', () => {
  for (const seed of [42, 7, 999, 1, 2026]) {
    const t = createTown({ seed });
    let cross = -1;
    for (let i = 1; i <= 5000; i++) {
      t.tick();
      if (t.state.R >= 0.9) {
        cross = i;
        break;
      }
    }
    assert.ok(cross > 0 && cross < 5000, `seed ${seed}: R never reached 0.9 (cross=${cross})`);
  }
});

test('plaza: a crystallization moment mints exactly one receipt (refractory holds)', () => {
  const t = createTown({ seed: 42 });
  for (let i = 0; i < 2000; i++) t.tick();
  // stable town holds sync -> one moment, not a stream of them
  assert.equal(t.state.crystallized, 1);
});

test('plaza: tapping a resident dips R, then it re-coheres', () => {
  const t = createTown({ seed: 42 });
  for (let i = 0; i < 1500; i++) t.tick();
  const before = t.state.R;
  assert.ok(before >= 0.9);
  // knock several residents out of phase
  for (const id of ['res-00', 'res-05', 'res-09', 'res-12', 'res-20', 'res-25', 'res-30']) {
    t.act({ type: 'tapResident', id });
  }
  t.tick();
  const dipped = t.state.R;
  assert.ok(dipped < before - 0.02, `expected a dip: ${before} -> ${dipped}`);
  for (let i = 0; i < 120; i++) t.tick();
  assert.ok(t.state.R >= 0.9, `expected re-cohere, got ${t.state.R}`);
});

// ------------------------------------------------------------------ the door

test('the door NEVER commits on disagreement (500 seeded petitions)', () => {
  // drive door.js#maybePetition directly, 500 times
  let disagreements = 0;
  let commitsOnDisagreement = 0;
  let commitsOnAgreement = 0;
  const state = {
    tau: 200, // a petition tick
    rng: mulberry32(31337),
    residents: makeResidents(31337),
  };
  for (let n = 0; n < 500; n++) {
    const p = maybePetition(state);
    assert.ok(p, 'a petition tick must produce a petition');
    const [a, b] = p.readings;
    if (a !== b) {
      disagreements++;
      if (p.decision === 'commit') commitsOnDisagreement++;
    } else if (p.decision === 'commit') {
      commitsOnAgreement++;
    }
    // the invariant, stated both ways
    if (p.decision === 'commit') assert.equal(a, b, `commit requires agreement (${a} vs ${b})`);
  }
  assert.equal(commitsOnDisagreement, 0, 'the door fused a disagreement');
  assert.ok(disagreements > 0, 'the seed should produce some disagreements to test against');
  assert.ok(commitsOnAgreement > 0, 'the door should sometimes open on agreement');
});

// ----------------------------------------------------------------- the board

test('L8 FALSIFIER: detection never promotes — candidates stay at rung 0 without a signoff', () => {
  const t = createTown({ seed: 42 });
  for (let i = 0; i < 2500; i++) t.tick();
  const cands = [...t.state.candidates.values()];
  assert.ok(cands.length > 0, 'expected some recurring candidates');
  for (const c of cands) assert.equal(c.rung, 0, `${c.op} promoted itself (rung ${c.rung})`);
  // ticking MORE still never promotes
  for (let i = 0; i < 500; i++) t.tick();
  for (const c of t.state.candidates.values()) assert.equal(c.rung, 0);
});

test('the board: signoff is the double gate (Γ_ext ∧ Γ_sys)', () => {
  const t = createTown({ seed: 42 });
  for (let i = 0; i < 2500; i++) t.tick();
  const cands = [...t.state.candidates.values()];
  const good = cands.find((c) => c.gammaSys);
  const bad = cands.find((c) => !c.gammaSys);
  assert.ok(good, 'expected a Γ_sys-clear candidate (e.g. plaza.vibe)');
  assert.ok(bad, 'expected a candidate that fails Γ_sys');

  // Γ_sys clear + the click -> promotes one rung
  const okRes = t.act({ type: 'signoff', candidateId: good.op });
  assert.equal(okRes.ok, true);
  assert.equal(t.state.candidates.get(good.op).rung, 1);
  assert.equal(t.state.candidates.get(good.op).state, 'loop');

  // Γ_sys fails -> the click alone cannot promote
  const badRes = t.act({ type: 'signoff', candidateId: bad.op });
  assert.equal(badRes.ok, false);
  assert.equal(t.state.candidates.get(bad.op).rung, 0);
});

// ------------------------------------------------------------- the mood bar

test('mood steering shifts the door-vocab distribution measurably', () => {
  const resident = { vec: (() => {
    const g = mulberry32(7);
    return Array.from({ length: 16 }, () => g() * 2 - 1);
  })() };

  const N = 4000;
  const distOf = (res, seed) => {
    const rng = mulberry32(seed);
    const counts = new Map();
    for (let i = 0; i < N; i++) {
      const w = drawReading(res, rng);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return counts;
  };
  const emberFrac = (counts) => {
    let s = 0;
    for (const w of MOODS.ember.vocab) s += counts.get(w) || 0;
    return s / N;
  };

  const pre = distOf(resident, 101);
  const preFrac = emberFrac(pre);
  applyMood(resident, 'ember');
  const post = distOf(resident, 101);
  const postFrac = emberFrac(post);

  // total-variation distance between the two empirical distributions
  let tv = 0;
  for (const w of VOCAB) tv += Math.abs((pre.get(w) || 0) - (post.get(w) || 0));
  tv /= 2 * N;

  assert.ok(tv > 0.03, `distribution barely moved: TV=${tv.toFixed(4)}`);
  assert.ok(postFrac > preFrac + 0.01, `ember words did not rise: ${preFrac.toFixed(3)} -> ${postFrac.toFixed(3)}`);
});

// ----------------------------------------------------------- receipt scalars

test('L1: receipts carry the RIGHT scalar name; the four Rs are never aliased', () => {
  const t = createTown({ seed: 42 });
  const byOp = new Map();
  t.subscribe((ev) => {
    if (ev.type === 'receipt') {
      const rec = ev.rec;
      if (!byOp.has(rec.op)) byOp.set(rec.op, new Set());
      byOp.get(rec.op).add(rec.scalar);
    }
  });
  for (let i = 0; i < 2000; i++) t.tick();
  t.act({ type: 'tapResident', id: 'res-00' });
  t.act({ type: 'orderMood', id: 'res-00', mood: 'ember' });

  const expect = {
    'kuramoto.crystallize': 'kuramotoR',
    'plaza.vibe': 'kuramotoR',
    'plaza.tap': 'kuramotoR',
    'agreement.gate': 'agreementR',
    'fold.matryoshka': 'glueR',
  };
  for (const [op, scalar] of Object.entries(expect)) {
    assert.ok(byOp.has(op), `no receipts for ${op}`);
    assert.deepEqual([...byOp.get(op)], [scalar], `${op} must only ever report ${scalar}`);
  }
  // the never-alias law: glueR is never labelled kuramotoR, etc.
  assert.ok(!byOp.get('fold.matryoshka').has('kuramotoR'));
  assert.ok(!byOp.get('plaza.vibe').has('glueR'));
});

test('the tab: the confluence receipt recurs but dedupes (already on the tab)', () => {
  const t = createTown({ seed: 42 });
  let mints = 0;
  let dedupes = 0;
  t.subscribe((ev) => {
    if (ev.type === 'receipt' && ev.rec.op === 'inet.confluence') {
      if (ev.deduped) dedupes++;
      else mints++;
    }
  });
  for (let i = 0; i < 1200; i++) t.tick();
  assert.ok(mints >= 1, 'confluence should mint at least once');
  assert.ok(dedupes >= 1, 'the identical confluence receipt should dedupe on recurrence');
  // the op recurs on the board even though the feed collapses it
  assert.ok(t.state.ledger.opTotals().get('inet.confluence') > t.state.ledger.rows.filter((r) => r.op === 'inet.confluence').length);
});
