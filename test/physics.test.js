// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// Falsifier suite for the vendored physics twins. Each pinned semantic has a
// test; where a law is claimed, the test violates it and asserts the guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kuramotoConsensus, orderParameter, KURAMOTO_SYNC } from '../src/physics/kuramoto.js';
import { agreementR, gateDecision, AGREEMENT_TAU, AGREEMENT_SCALE } from '../src/physics/agreement.js';
import { foldVec } from '../src/physics/fold.js';
import { meanContrastDirection, steer } from '../src/physics/steer.js';
import { mulberry32 } from '../src/physics/rng.js';
import { createLedger } from '../src/physics/trace.js';

// ---------------------------------------------------------------- kuramoto

test('kuramoto: empty and singleton edge cases', () => {
  assert.deepEqual(kuramotoConsensus([]), { R: 0, consensus: false });
  assert.deepEqual(kuramotoConsensus([5]), { R: 1, consensus: true });
});

test('kuramoto: the π/2 law — two antipodal (saturating) values give R = 0', () => {
  // [0,1] with default tolerance 0.1: devs saturate to ±1 -> θ = ∓π/2 -> R=0
  const { R } = kuramotoConsensus([0, 1]);
  assert.equal(R, 0);
});

test('kuramoto: falsifier — a NON-saturating pair does NOT collapse to 0', () => {
  // tolerance is RELATIVE to the mean: a tiny spread around a large mean stays
  // well inside tolerance -> phases nearly aligned -> R near 1, never 0.
  const { R } = kuramotoConsensus([5, 5.01]);
  assert.ok(R > 0.9, `expected high R, got ${R}`);
});

test('kuramoto: identical values give R = 1 and consensus', () => {
  const res = kuramotoConsensus([2, 2, 2, 2]);
  assert.equal(res.R, 1);
  assert.equal(res.consensus, true);
});

test('kuramoto: R is rounded to 6 decimal places', () => {
  const { R } = kuramotoConsensus([0, 0.3, 0.7, 1]);
  assert.equal(R, Math.round(R * 1e6) / 1e6);
});

test('kuramoto: orderParameter — aligned phases -> 1, antipodal -> 0', () => {
  assert.equal(orderParameter([0, 0, 0]), 1);
  assert.ok(orderParameter([0, Math.PI]) < 1e-9);
  assert.equal(orderParameter([]), 0);
});

test('kuramoto: consensus threshold is KURAMOTO_SYNC (0.9)', () => {
  assert.equal(KURAMOTO_SYNC, 0.9);
});

// --------------------------------------------------------------- agreement

test('agreement: n=0 -> 0, n=1 -> 1', () => {
  assert.equal(agreementR([]), 0);
  assert.equal(agreementR(['x']), 1);
});

test('agreement: unanimous -> 1, one dissenter -> exp(-1/1.5)', () => {
  assert.equal(agreementR(['a', 'a', 'a']), 1);
  assert.ok(Math.abs(agreementR(['a', 'b']) - Math.exp(-1 / AGREEMENT_SCALE)) < 1e-12);
});

test('agreement: AGREEMENT_TAU is exp(-0.5/1.5) exactly', () => {
  assert.equal(AGREEMENT_TAU, Math.exp(-0.5 / 1.5));
});

test('agreement: gate commits iff r >= tau (default policy)', () => {
  assert.equal(gateDecision(1), 'commit');
  assert.equal(gateDecision(AGREEMENT_TAU), 'commit');
  assert.equal(gateDecision(AGREEMENT_TAU - 1e-6), 'escalate');
});

test('agreement L-agree FALSIFIER: disagreement is never fused into a commit', () => {
  // two distinct readings -> R ≈ 0.513 < tau -> must NOT commit
  const r = agreementR(['warm', 'cold']);
  assert.notEqual(gateDecision(r), 'commit');
});

test('agreement: policy overrides — dry_run skips, always_escalate escalates', () => {
  assert.equal(gateDecision(1, AGREEMENT_TAU, 'dry_run'), 'skip');
  assert.equal(gateDecision(1, AGREEMENT_TAU, 'always_escalate'), 'escalate');
});

// -------------------------------------------------------------------- fold

test('fold: prefix is the first dim coords', () => {
  assert.deepEqual(foldVec([1, 2, 3, 4], 2).v, [1, 2]);
});

test('fold: a zero tail is lossless (fidelity 1)', () => {
  assert.equal(foldVec([3, 4, 0, 0], 2).fidelity, 1);
});

test('fold FALSIFIER: fidelity is never greater than 1', () => {
  const rng = mulberry32(9);
  for (let t = 0; t < 200; t++) {
    const v = Array.from({ length: 16 }, () => rng() * 10 - 5);
    for (const d of [1, 2, 4, 8, 16, 20]) {
      assert.ok(foldVec(v, d).fidelity <= 1 + 1e-12);
    }
  }
});

test('fold: zero vector and over-wide dim fold with fidelity 1', () => {
  assert.equal(foldVec([0, 0, 0], 2).fidelity, 1);
  assert.equal(foldVec([1, 2], 8).fidelity, 1);
});

// ------------------------------------------------------------------- steer

test('steer: h + α·v elementwise', () => {
  assert.deepEqual(steer([1, 0, 2], [0, 1, 0], 0.5), [1, 0.5, 2]);
});

test('steer: meanContrastDirection returns a unit vector', () => {
  const dir = meanContrastDirection([[1, 0], [1, 0]], [[0, 0], [0, 0]]);
  const norm = Math.hypot(...dir);
  assert.ok(Math.abs(norm - 1) < 1e-12, `norm ${norm}`);
});

test('steer: opposite contrast gives opposite direction', () => {
  const a = meanContrastDirection([[1, 0]], [[0, 0]]);
  const b = meanContrastDirection([[0, 0]], [[1, 0]]);
  assert.ok(Math.abs(a[0] + b[0]) < 1e-12);
});

// --------------------------------------------------------------------- rng

test('rng: same seed -> identical stream; different seed -> different', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  let sameAB = true;
  let sameAC = true;
  for (let i = 0; i < 100; i++) {
    const x = a();
    if (x !== b()) sameAB = false;
    if (x === c()) {
      /* extremely unlikely to all match */
    } else {
      sameAC = false;
    }
  }
  assert.ok(sameAB, 'same seed must reproduce');
  assert.ok(!sameAC, 'different seed must diverge');
});

test('rng: outputs are in [0, 1)', () => {
  const r = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

// ------------------------------------------------------------ ledger (tab)

test('ledger dedup: identical rows collapse to one, flagged "already on the tab"', () => {
  const led = createLedger();
  const events = [];
  led.subscribe((ev) => events.push(ev.type));
  const rec = { op: 'plaza.vibe', r: 1, scalar: 'kuramotoR', note: 'vibe check' };
  const first = led.mint(rec, 1);
  const second = led.mint(rec, 2);
  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(led.size(), 1, 'only one distinct row');
  assert.deepEqual(events, ['mint', 'dedupe']);
  // but the occurrence still counts for the board
  assert.equal(led.opTotals().get('plaza.vibe'), 2);
});

test('ledger: distinct content -> distinct rows, newest first', () => {
  const led = createLedger();
  led.mint({ op: 'a', note: 'one' }, 1);
  led.mint({ op: 'a', note: 'two' }, 2);
  assert.equal(led.size(), 2);
  assert.equal(led.rows[0].note, 'two'); // newest first
});

test('ledger: r-history is recorded per op for the graduation board', () => {
  const led = createLedger();
  led.mint({ op: 'g', r: 0.9, scalar: 'kuramotoR', note: 'x' }, 1);
  led.mint({ op: 'g', r: 0.7, scalar: 'kuramotoR', note: 'y' }, 2);
  assert.deepEqual(led.opR('g'), [0.9, 0.7]);
});
