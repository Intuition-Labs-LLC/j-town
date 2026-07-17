// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The cellar — an interaction net reducing one step at a time. When it hits
// normal form, the town "deals the same hand backwards": it re-reduces the
// ORIGINAL net with the opposite scheduler order and compares canonical
// hashes. They match — that is confluence, live.
//
// The gadget is a fixed, guaranteed-terminating net (10 agents: 4 initial
// active pairs + 2 erasure cascades). Every aux either goes to a free port or
// feeds a downstream principal that is only ever ERASED, so it cannot loop.

import {
  makeNet,
  addAgent,
  connect,
  seal,
  cloneNet,
  reduceStep,
  reduce,
  canonicalNetHash,
  netStats,
} from '../physics/inet.js';

/** Build the cellar gadget. Deterministic; the same net every time. */
export function buildCellarNet() {
  const net = makeNet();
  const a0 = addAgent(net, 'CON');
  const a1 = addAgent(net, 'DUP'); // CON–DUP commutation
  const a2 = addAgent(net, 'ERA');
  const a3 = addAgent(net, 'CON');
  const a4 = addAgent(net, 'DUP'); // ERA erases CON3, then the new ERA erases DUP4
  const a5 = addAgent(net, 'CON');
  const a6 = addAgent(net, 'CON'); // CON–CON annihilation
  const a7 = addAgent(net, 'ERA');
  const a8 = addAgent(net, 'CON');
  const a9 = addAgent(net, 'DUP'); // ERA erases CON8, then the new ERA erases DUP9

  connect(net, [a0, 0], [a1, 0]);
  connect(net, [a2, 0], [a3, 0]);
  connect(net, [a5, 0], [a6, 0]);
  connect(net, [a7, 0], [a8, 0]);
  connect(net, [a3, 1], [a4, 0]); // cascade 1
  connect(net, [a8, 1], [a9, 0]); // cascade 2
  seal(net);
  return net;
}

/** Fresh cellar state (original kept for the backward run). */
export function makeCellar() {
  const original = buildCellarNet();
  const net = cloneNet(original);
  return {
    original,
    net,
    steps: 0,
    forwardHash: null,
    backwardHash: null,
    matched: null,
    done: false,
    hash: canonicalNetHash(net),
    stats: netStats(net),
  };
}

/**
 * Advance the cellar. On a normal-form tick, runs the backward confluence
 * check and returns a 'confluence' event; otherwise a 'step' event (or null
 * if already finished).
 */
export function cellarTick(cellar) {
  if (!cellar || cellar.done) return null;
  const r = reduceStep(cellar.net, 'asc');
  if (r.did) {
    cellar.steps++;
    cellar.hash = canonicalNetHash(cellar.net);
    cellar.stats = netStats(cellar.net);
    return { type: 'step', pair: r.pair, rule: r.rule, hash: cellar.hash, steps: cellar.steps };
  }
  // reached normal form — deal the same hand backwards
  cellar.forwardHash = canonicalNetHash(cellar.net);
  const back = cloneNet(cellar.original);
  const rb = reduce(back, { order: 'desc', maxSteps: 100000 });
  cellar.backwardHash = canonicalNetHash(back);
  cellar.matched = cellar.forwardHash === cellar.backwardHash;
  cellar.done = true;
  return {
    type: 'confluence',
    forwardHash: cellar.forwardHash,
    backwardHash: cellar.backwardHash,
    matched: cellar.matched,
    steps: cellar.steps,
    backSteps: rb.steps,
  };
}
