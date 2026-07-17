// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// Falsifier suite for the interaction-net reducer and the confluence stunt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeNet,
  addAgent,
  connect,
  seal,
  cloneNet,
  reduce,
  reduceStep,
  canonicalNetHash,
  netStats,
  hashBytes,
} from '../src/physics/inet.js';
import { buildCellarNet } from '../src/town/cellar.js';

// ------------------------------------------------------------- hashBytes

test('hashBytes: deterministic, 16 hex chars, sensitive to input', () => {
  assert.equal(hashBytes('hello'), hashBytes('hello'));
  assert.match(hashBytes('hello'), /^[0-9a-f]{16}$/);
  assert.notEqual(hashBytes('hello'), hashBytes('hellp'));
  assert.equal(hashBytes(''), hashBytes(''));
});

// ------------------------------------------------------- individual rules

function pair(kA, kB) {
  const net = makeNet();
  const a = addAgent(net, kA);
  const b = addAgent(net, kB);
  connect(net, [a, 0], [b, 0]); // principal-principal = active pair
  seal(net);
  return net;
}

test('rule: CON–CON annihilation removes both agents', () => {
  const net = pair('CON', 'CON');
  assert.equal(netStats(net).redexes, 1);
  const r = reduceStep(net, 'asc');
  assert.equal(r.rule, 'annihilate');
  assert.equal(netStats(net).agents, 0);
});

test('rule: DUP–DUP annihilation removes both agents', () => {
  const net = pair('DUP', 'DUP');
  reduceStep(net, 'asc');
  assert.equal(netStats(net).agents, 0);
});

test('rule: ERA–ERA vanishes', () => {
  const net = pair('ERA', 'ERA');
  const r = reduceStep(net, 'asc');
  assert.equal(r.rule, 'annihilate-era');
  assert.equal(netStats(net).agents, 0);
});

test('rule: ERA–CON erasure leaves two ERAs on the aux peers', () => {
  const net = pair('ERA', 'CON');
  const r = reduceStep(net, 'asc');
  assert.equal(r.rule, 'erase');
  const s = netStats(net);
  assert.equal(s.agents, 2);
  assert.equal(s.byKind.ERA, 2);
});

test('rule: CON–DUP commutation yields the Lafont square (2 CON + 2 DUP)', () => {
  const net = pair('CON', 'DUP');
  const r = reduceStep(net, 'asc');
  assert.equal(r.rule, 'commute');
  const s = netStats(net);
  assert.equal(s.agents, 4);
  assert.equal(s.byKind.CON, 2);
  assert.equal(s.byKind.DUP, 2);
  // the four new agents face free ports -> no new active pair -> normal form
  assert.equal(s.redexes, 0);
});

// -------------------------------------------------------- confluence stunt

test('confluence: the cellar gadget reduces in 6 steps to normal form', () => {
  const net = cloneNet(buildCellarNet());
  const res = reduce(net, { order: 'asc', maxSteps: 1000 });
  assert.equal(res.normal, true);
  assert.equal(res.steps, 6);
});

test('confluence: reducing changes the net (hash moves off the initial)', () => {
  const orig = buildCellarNet();
  const before = canonicalNetHash(orig);
  const net = cloneNet(orig);
  reduce(net, { order: 'asc', maxSteps: 1000 });
  const after = canonicalNetHash(net);
  assert.notEqual(before, after, 'reduction must change the canonical hash');
});

test('confluence STUNT: asc and desc reach the SAME normal form (equal hashes)', () => {
  const orig = buildCellarNet();
  const asc = cloneNet(orig);
  const desc = cloneNet(orig);
  reduce(asc, { order: 'asc', maxSteps: 1000 });
  reduce(desc, { order: 'desc', maxSteps: 1000 });
  const hA = canonicalNetHash(asc);
  const hD = canonicalNetHash(desc);
  assert.equal(hA, hD, `asc ${hA} != desc ${hD}`);
});

test('confluence FALSIFIER: asc and desc actually take DIFFERENT first steps', () => {
  // if the scheduler order were ignored, the stunt would be trivial — prove
  // the two orders diverge on the very first interaction, then reconverge.
  const asc = cloneNet(buildCellarNet());
  const desc = cloneNet(buildCellarNet());
  const a = reduceStep(asc, 'asc');
  const d = reduceStep(desc, 'desc');
  assert.notDeepEqual(a.pair, d.pair, 'asc and desc should pick different first redexes');
  // ...yet the fully-reduced hashes still match (confluence)
  reduce(asc, { order: 'asc' });
  reduce(desc, { order: 'desc' });
  assert.equal(canonicalNetHash(asc), canonicalNetHash(desc));
});

test('canonicalNetHash is invariant to agent-id relabeling (fixed interface)', () => {
  // This is the exact property the confluence stunt relies on: two nets with
  // the SAME free-endpoint interface but different agent ids hash the same.
  // (Reduction preserves the interface but assigns fresh ids in a different
  // order for asc vs desc — this pins that those relabelings don't matter.)
  const shiftIds = (net, off) => {
    const kind = new Map();
    for (const [id, k] of net.kind) kind.set(id + off, k);
    const remap = (key) => {
      if (key[0] === 'F') return key;
      const [i, s] = key.split(':');
      return `${Number(i) + off}:${s}`;
    };
    const link = new Map();
    for (const [a, b] of net.link) link.set(remap(a), remap(b));
    return { seq: net.seq + off, freeSeq: net.freeSeq, kind, link };
  };

  const net = cloneNet(buildCellarNet());
  reduce(net, { order: 'asc', maxSteps: 1000 }); // a real, nontrivial normal form
  const shifted = shiftIds(net, 1000);
  assert.equal(canonicalNetHash(net), canonicalNetHash(shifted));
});

test('reduce: maxSteps bounds the work (normal:false when capped)', () => {
  const net = cloneNet(buildCellarNet());
  const res = reduce(net, { order: 'asc', maxSteps: 1 });
  assert.equal(res.steps, 1);
  assert.equal(res.normal, false);
});
