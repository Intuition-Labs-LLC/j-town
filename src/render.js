// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The shell — a thin Canvas-2D + DOM driver over the pure town modules. The
// browser loads these unmodified; `node --test` drives the very same town/
// physics code headlessly. Nothing here computes the simulation; it only
// renders the town and forwards the visitor's actions into town.act(...).
// No external requests, ever.

import { createTown } from './town/index.js';
import { PLAZA_CENTER, NEIGHBOR_RADIUS } from './town/plaza.js';
import { KURAMOTO_SYNC } from './physics/kuramoto.js';
import { MOOD_NAMES } from './town/moods.js';

const C = {
  w: '#fff',
  g1: '#ccc',
  g2: '#888',
  label: '#666',
  g4: '#444',
  hair: '#333',
  ink: '#1a1a1a',
  blue: '#4a9eff',
  rose: '#fb7185',
};

const PLACARDS = {
  plaza: {
    title: 'THE PLAZA',
    line: 'residents couple their phases; the town-wide R is the vibe meter. Hold R≥0.9 for 60τ → a crystallization moment.',
    law: 'L1 · kuramotoR is phase coherence, never any other gate',
    pkg: '@intuitionlabs/jspace · kuramoto',
  },
  door: {
    title: 'THE DOOR',
    line: 'the bouncer reads two petitioners. Agree → the door opens. Disagree → talk it out on the bench. Never fused.',
    law: 'L-agree / L6 · agreementR + the commit gate; you cannot override it',
    pkg: '@intuitionlabs/jspace · agreement',
  },
  cellar: {
    title: 'THE CELLAR',
    line: 'an interaction net reduces one step at a time. At normal form it deals the same hand backwards — the hashes match.',
    law: 'confluence · strong one-step diamond; order is a lever, not the answer',
    pkg: '@intuitionlabs/jspace · inet',
  },
  gallery: {
    title: 'THE GALLERY',
    line: "one resident's 16-d portrait folded 16→8→4. The prefix keeps most of the length: glueR.",
    law: 'L1 · glueR is fold fidelity, never any other gate',
    pkg: '@intuitionlabs/sheaf · fold',
  },
  mood: {
    title: 'THE MOOD BAR',
    line: 'a mood is a contrast direction. Ordering one steers the featured resident: h + αv. Their vocab and lean shift.',
    law: 'honesty · a concept vector is a property of the contrast you chose, not of the model',
    pkg: '@intuitionlabs/jspace · steer',
  },
  board: {
    title: 'THE BOARD',
    line: 'a recurring signature climbs trace → loop → … → skill. Promotion needs your click AND a clean r-history.',
    law: 'L8 · detection never promotes · L6 · Γ_ext ∧ Γ_sys',
    pkg: 'trace-foundry · graduation',
  },
};

function boot() {
  const canvas = document.getElementById('stage');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seedInput = document.getElementById('seed');
  let seed = clampSeed(seedInput && seedInput.value);
  let town = createTown({ seed });

  let featured = 0;
  const trails = new Map(); // id -> [{x,y}...]
  const feed = []; // newest-first display rows (incl. dedupe markers)
  let feedDirty = true;
  let boardDirty = true;

  // ---- town subscription: build the live tab feed --------------------------
  let unsub = subscribeTown();
  function subscribeTown() {
    return town.subscribe((ev) => {
      if (ev.type === 'receipt') {
        const rec = ev.rec;
        const refusal = /talk it out|DIFFER/.test(rec.note || '');
        feed.unshift({
          op: rec.op,
          r: Number.isFinite(rec.r) ? rec.r.toFixed(3) : '',
          note: rec.note || '',
          dedupe: !!ev.deduped,
          refusal,
        });
        if (feed.length > 140) feed.length = 140;
        feedDirty = true;
        boardDirty = true;
      } else if (ev.type === 'reset') {
        feed.length = 0;
        trails.clear();
        feedDirty = boardDirty = true;
      }
    });
  }

  // ---- geometry ------------------------------------------------------------
  let W = 0;
  let H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function stageRect() {
    const panel = document.getElementById('panel');
    const footer = document.getElementById('footer');
    const pl = panel ? panel.getBoundingClientRect().left : W;
    const ft = footer ? footer.getBoundingClientRect().top : H;
    return { x: 0, y: 0, w: Math.max(320, pl), h: Math.max(260, ft) };
  }
  function mapResident(s, px, py) {
    return {
      x: s.x + 0.22 * s.w + px * 0.56 * s.w,
      y: s.y + 0.1 * s.h + (py / 0.72) * 0.58 * s.h,
    };
  }

  // ---- draw ----------------------------------------------------------------
  function draw() {
    const s = stageRect();
    const st = town.state;
    ctx.clearRect(0, 0, W, H);

    drawPlazaField(s, st);
    drawCoupling(s, st);
    drawResidents(s, st);
    drawCrystalRings(s, st);
    drawGallery(s, st);
    drawCellar(s, st);
    drawDoor(s, st);
    drawFig(s.x + 0.5 * s.w, s.y + 0.02 * s.h, '//the mechanisms hang out here', 'center');

    // HUD
    const r = document.getElementById('r');
    const tau = document.getElementById('tau');
    const meter = document.getElementById('meter');
    if (r) r.textContent = st.R.toFixed(4);
    if (tau) tau.textContent = String(st.tau);
    if (meter) meter.classList.toggle('sync', st.R >= KURAMOTO_SYNC);

    if (feedDirty) renderFeed();
    if (boardDirty) renderBoard();
  }

  function drawPlazaField(s, st) {
    const c = mapResident(s, PLAZA_CENTER.x, PLAZA_CENTER.y);
    const rad = NEIGHBOR_RADIUS * 0.56 * s.w * 1.7;
    // the dashed |ψ⟩ circle
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = st.R >= KURAMOTO_SYNC ? 'rgba(74,158,255,0.5)' : C.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawFig(c.x, c.y - rad - 10, 'PLAZA · |ψ⟩', 'center');
  }

  function drawCoupling(s, st) {
    const R2 = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;
    ctx.save();
    ctx.strokeStyle = 'rgba(51,51,51,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const res = st.residents;
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const dx = res[i].pos.x - res[j].pos.x;
        const dy = res[i].pos.y - res[j].pos.y;
        if (dx * dx + dy * dy <= R2) {
          const a = mapResident(s, res[i].pos.x, res[i].pos.y);
          const b = mapResident(s, res[j].pos.x, res[j].pos.y);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawResidents(s, st) {
    const res = st.residents;
    for (let i = 0; i < res.length; i++) {
      const rr = res[i];
      const p = mapResident(s, rr.pos.x, rr.pos.y);
      // trail
      if (!reduce) {
        let tr = trails.get(rr.id);
        if (!tr) {
          tr = [];
          trails.set(rr.id, tr);
        }
        tr.push({ x: p.x, y: p.y });
        if (tr.length > 12) tr.shift();
        if (tr.length > 1) {
          ctx.strokeStyle = 'rgba(102,102,102,0.18)';
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(tr[0].x, tr[0].y);
          for (let k = 1; k < tr.length; k++) ctx.lineTo(tr[k].x, tr[k].y);
          ctx.stroke();
        }
      }
      const isFeat = i === featured;
      let col = C.g2;
      if (rr.tint === 1) col = C.blue;
      else if (rr.tint === -1) col = C.rose;
      else if (st.R >= KURAMOTO_SYNC) col = C.g1;
      // phase tick — when synced these all point the same way
      ctx.strokeStyle = isFeat ? C.blue : 'rgba(136,136,136,0.55)';
      ctx.lineWidth = isFeat ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(rr.phase) * 6, p.y + Math.sin(rr.phase) * 6);
      ctx.stroke();
      // body
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isFeat ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (isFeat) {
        ctx.strokeStyle = C.blue;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawCrystalRings(s, st) {
    if (st.ringT <= 0) return;
    const c = mapResident(s, PLAZA_CENTER.x, PLAZA_CENTER.y);
    const age = 48 - st.ringT;
    ctx.save();
    ctx.setLineDash([2, 4]);
    for (let k = 0; k < 3; k++) {
      const rad = (age + k * 10) * 2.2;
      const alpha = Math.max(0, (st.ringT / 48) * (1 - k * 0.25));
      ctx.strokeStyle = `rgba(74,158,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    drawFig(c.x, c.y, 'crystallized', 'center', C.blue);
  }

  function drawGallery(s, st) {
    const x = s.x + 18;
    const y = s.y + 0.28 * s.h;
    const g = st.gallery;
    drawFig(x, y - 14, 'GALLERY · fold 16→8→4', 'left');
    const name = st.residents[featured] ? st.residents[featured].name : '';
    const bw = 16;
    const gap = 8;
    const h = 46;
    g.stages.forEach((stage, k) => {
      const bx = x + k * (bw + gap);
      const bh = Math.max(2, stage.fidelity * h);
      ctx.fillStyle = C.ink;
      ctx.fillRect(bx, y, bw, h);
      ctx.fillStyle = k === 0 ? C.g2 : C.blue;
      ctx.fillRect(bx, y + (h - bh), bw, bh);
      drawFig(bx + bw / 2, y + h + 12, 'd' + stage.dim, 'center');
    });
    drawFig(x, y + h + 26, `glueR = ${g.glueR.toFixed(3)} · ${name}`, 'left', C.g1);
    drawFig(x, y + h + 40, 'the portrait survives the fold', 'left');
  }

  function drawCellar(s, st) {
    const box = { x: s.x + 18, y: s.y + s.h - 150, w: 190, h: 96 };
    drawFig(box.x, box.y - 8, 'CELLAR · interaction net', 'left');
    const net = st.cellar.net;
    // lay agents out on a small grid, by iteration order
    const ids = [...net.kind.keys()];
    const pos = new Map();
    const cols = 5;
    ids.forEach((id, k) => {
      pos.set(id, {
        x: box.x + 16 + (k % cols) * ((box.w - 30) / (cols - 1 || 1)),
        y: box.y + 14 + Math.floor(k / cols) * 26,
      });
    });
    // wires (agent-agent only)
    ctx.strokeStyle = 'rgba(68,68,68,0.7)';
    ctx.lineWidth = 0.6;
    for (const [a, b] of net.link) {
      if (a[0] === 'F' || b[0] === 'F') continue;
      const ai = Number(a.split(':')[0]);
      const bi = Number(b.split(':')[0]);
      if (ai >= bi) continue;
      const pa = pos.get(ai);
      const pb = pos.get(bi);
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    // agents
    for (const id of ids) {
      const p = pos.get(id);
      const k = net.kind.get(id);
      ctx.fillStyle = k === 'ERA' ? C.g4 : k === 'CON' ? C.g1 : C.g2;
      if (k === 'ERA') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        const up = k === 'CON';
        ctx.moveTo(p.x, p.y + (up ? -4 : 4));
        ctx.lineTo(p.x - 3.4, p.y + (up ? 3 : -3));
        ctx.lineTo(p.x + 3.4, p.y + (up ? 3 : -3));
        ctx.closePath();
        ctx.fill();
      }
    }
    const cel = st.cellar;
    drawFig(box.x, box.y + box.h - 22, `steps ${cel.steps} · ${cel.hash}`, 'left');
    if (cel.done) {
      const m = cel.matched;
      drawFig(
        box.x,
        box.y + box.h - 8,
        (m ? '✓ backwards = forwards ' : '✗ mismatch ') + (cel.backwardHash || ''),
        'left',
        m ? C.blue : C.rose,
      );
    } else {
      drawFig(box.x, box.y + box.h - 8, 'reducing…', 'left');
    }
  }

  function drawDoor(s, st) {
    const x = s.x + s.w - 176;
    const y = s.y + 0.3 * s.h;
    const pet = st.lastPetition;
    const open = pet && pet.decision === 'commit' && st.tau - pet.tau < 40;
    drawFig(x, y - 14, 'DOOR · agreement gate', 'left');
    // the door
    ctx.strokeStyle = open ? C.blue : C.g4;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, 40, 62);
    if (open) {
      ctx.strokeStyle = 'rgba(74,158,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(x + 40, y);
      ctx.lineTo(x + 58, y + 8);
      ctx.lineTo(x + 58, y + 54);
      ctx.lineTo(x + 40, y + 62);
      ctx.stroke();
    }
    // bench
    ctx.strokeStyle = C.g4;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 84);
    ctx.lineTo(x + 44, y + 84);
    ctx.stroke();
    const benched = st.residents.filter((r) => r.state === 'bench').length;
    const inroom = st.residents.filter((r) => r.state === 'backroom').length;
    drawFig(x, y + 98, `bench: ${benched} · back room: ${inroom}`, 'left');
    if (pet) {
      const refusal = pet.decision !== 'commit';
      drawFig(
        x,
        y + 112,
        refusal ? `"${pet.readings[0]}" ≠ "${pet.readings[1]}"` : `agreed "${pet.readings[0]}" ✓`,
        'left',
        refusal ? C.rose : C.blue,
      );
      drawFig(x, y + 124, `agreementR = ${pet.r.toFixed(3)}`, 'left');
    }
  }

  function drawFig(x, y, text, align, color) {
    ctx.fillStyle = color || C.label;
    ctx.font = '10px ui-monospace, "Cascadia Mono", "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  // ---- panels --------------------------------------------------------------
  function renderFeed() {
    feedDirty = false;
    const tab = document.getElementById('tab');
    const count = document.getElementById('tabcount');
    if (!tab) return;
    if (count) count.textContent = String(town.state.ledger.size());
    const frag = document.createDocumentFragment();
    for (let i = 0; i < Math.min(feed.length, 90); i++) {
      const f = feed[i];
      const row = document.createElement('div');
      row.className = 'row' + (f.dedupe ? ' dedupe' : '') + (f.refusal ? ' refusal' : '');
      if (f.dedupe) {
        row.innerHTML = `<span class="op">${esc(f.op)}</span><span class="note">already on the tab</span>`;
      } else {
        const rr = f.r ? `<span class="rr">${f.r}</span> ` : '';
        row.innerHTML = `<span class="op">${esc(shortOp(f.op))}</span><span class="note">${rr}${esc(f.note)}</span>`;
      }
      frag.appendChild(row);
    }
    tab.replaceChildren(frag);
  }

  function renderBoard() {
    boardDirty = false;
    const board = document.getElementById('board');
    if (!board) return;
    const cands = [...town.state.candidates.values()].sort((a, b) => b.count - a.count);
    const frag = document.createDocumentFragment();
    for (const c of cands) {
      const el = document.createElement('div');
      el.className = 'cand';
      const bars = c.rHistory
        .map((r) => `<i class="${r >= 0.6 ? 'pass' : 'fail'}" style="height:${Math.round(Math.max(0.08, r) * 14)}px"></i>`)
        .join('');
      const canPromote = c.gammaSys && c.rung < 4;
      el.innerHTML = `
        <div class="top">
          <span class="rung"><b>${esc(shortOp(c.op))}</b> · ${esc(c.state)} <span style="color:#666">(rung ${c.rung})</span></span>
          <button class="signoff ${canPromote ? 'ready' : ''}" data-cand="${esc(c.op)}" ${canPromote ? '' : 'disabled'} title="${c.gammaSys ? 'Γ_sys clear — your click is Γ_ext' : 'Γ_sys not met: r-history below 0.6'}">signoff</button>
        </div>
        <div class="bars" title="Γ_sys: r-history vs 0.6">${bars || '<span style="color:#444">no r yet</span>'}</div>`;
      frag.appendChild(el);
    }
    board.replaceChildren(frag);
  }

  // ---- controls ------------------------------------------------------------
  function setFeatured(i) {
    featured = ((i % town.state.residents.length) + town.state.residents.length) % town.state.residents.length;
    town.act({ type: 'setFeatured', id: featured });
    const lbl = document.getElementById('featlbl');
    if (lbl) lbl.innerHTML = 'steer <b>' + esc(town.state.residents[featured].name) + '</b> →';
  }

  const pauseBtn = document.getElementById('pause');
  function setPaused(p) {
    town.act({ type: p ? 'pause' : 'resume' });
    if (pauseBtn) pauseBtn.textContent = p ? 'RESUME' : 'PAUSE';
  }
  if (pauseBtn) pauseBtn.addEventListener('click', () => setPaused(!town.state.paused));

  const stepBtn = document.getElementById('step');
  if (stepBtn)
    stepBtn.addEventListener('click', () => {
      town.act({ type: 'step' });
      draw();
    });

  const resetBtn = document.getElementById('reset');
  if (resetBtn)
    resetBtn.addEventListener('click', () => {
      seed = clampSeed(seedInput && seedInput.value);
      unsub();
      town.act({ type: 'reset', seed });
      unsub = subscribeTown();
      featured = 0;
      setFeatured(0);
      draw();
    });

  document.querySelectorAll('.mood').forEach((b) =>
    b.addEventListener('click', () => {
      const mood = b.getAttribute('data-mood');
      if (MOOD_NAMES.includes(mood)) town.act({ type: 'orderMood', id: featured, mood });
    }),
  );

  const tapBtn = document.getElementById('tap');
  if (tapBtn) tapBtn.addEventListener('click', () => town.act({ type: 'tapResident', id: featured }));

  document.getElementById('board') &&
    document.getElementById('board').addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button[data-cand]');
      if (!btn) return;
      town.act({ type: 'signoff', candidateId: btn.getAttribute('data-cand') });
      boardDirty = true;
    });

  // venue placards on hover/focus
  const placard = document.getElementById('placard');
  function showPlacard(v) {
    const p = PLACARDS[v];
    if (!p || !placard) return;
    placard.innerHTML = `<b>${esc(p.title)}</b> — ${esc(p.line)}<br><span class="law">${esc(p.law)}</span><br><span class="pkg">physics: ${esc(p.pkg)}</span>`;
    placard.style.display = 'block';
    document.querySelectorAll('.venue').forEach((el) => el.classList.toggle('active', el.getAttribute('data-venue') === v));
  }
  function hidePlacard() {
    if (placard) placard.style.display = 'none';
    document.querySelectorAll('.venue').forEach((el) => el.classList.remove('active'));
  }
  document.querySelectorAll('.venue').forEach((b) => {
    const v = b.getAttribute('data-venue');
    b.addEventListener('mouseenter', () => showPlacard(v));
    b.addEventListener('focus', () => showPlacard(v));
    b.addEventListener('mouseleave', hidePlacard);
    b.addEventListener('blur', hidePlacard);
    b.addEventListener('click', () => showPlacard(v));
  });

  // canvas: click taps the nearest resident (and features it)
  canvas.addEventListener('click', (e) => {
    const s = stageRect();
    let best = -1;
    let bestD = 16 * 16;
    for (let i = 0; i < town.state.residents.length; i++) {
      const p = mapResident(s, town.state.residents[i].pos.x, town.state.residents[i].pos.y);
      const dx = p.x - e.clientX;
      const dy = p.y - e.clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      setFeatured(best);
      town.act({ type: 'tapResident', id: best });
    }
  });

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (town.state.paused) {
        town.act({ type: 'step' });
        draw();
      } else setPaused(true);
    } else if (e.key === 'ArrowRight') {
      setFeatured(featured + 1);
    } else if (e.key === 'ArrowLeft') {
      setFeatured(featured - 1);
    } else if (e.key === 't' || e.key === 'T') {
      town.act({ type: 'tapResident', id: featured });
    } else if (e.key === 'p' || e.key === 'P') {
      setPaused(!town.state.paused);
    }
  });

  if (seedInput)
    seedInput.addEventListener('change', () => {
      if (resetBtn) resetBtn.click();
    });

  // ---- loop ----------------------------------------------------------------
  setFeatured(0);
  if (reduce) setPaused(true); // reduced motion: start paused, STEP advances

  function frame() {
    if (!town.state.paused && !reduce) town.tick();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---- helpers ---------------------------------------------------------------
function clampSeed(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n >>> 0 : 42;
}
function shortOp(op) {
  return String(op).replace(/^(kuramoto|agreement|inet|fold|plaza|steer|graduation)\./, '');
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
