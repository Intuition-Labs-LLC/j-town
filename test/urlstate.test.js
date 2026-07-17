// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
//
// urlstate falsifiers — the seed permalink must parse exactly what it writes,
// agree with the seed box's clamp behaviour, and degrade closed on garbage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedFromSearch, searchForSeed } from '../src/urlstate.js';
import { createTown } from '../src/town/index.js';

test('round trip: searchForSeed → seedFromSearch is identity on uint32', () => {
  for (const s of [0, 1, 42, 7_777, 4_294_967_295]) {
    assert.equal(seedFromSearch(searchForSeed(s)), s);
  }
});

test('degrade closed: absent or garbage seed params return null, never throw', () => {
  assert.equal(seedFromSearch(''), null);
  assert.equal(seedFromSearch('?'), null);
  assert.equal(seedFromSearch('?paused=1'), null);
  assert.equal(seedFromSearch('?seed='), null);
  assert.equal(seedFromSearch('?seed=abc'), null);
  assert.equal(seedFromSearch(undefined), null);
  assert.equal(seedFromSearch(null), null);
});

test('clamp parity: negative and float inputs land on the same uint32 the seed box would use', () => {
  // render.js clampSeed: Number.parseInt(v, 10) >>> 0
  assert.equal(seedFromSearch('?seed=-1'), 4_294_967_295);
  assert.equal(seedFromSearch('?seed=7.9'), 7);
  assert.equal(seedFromSearch('?seed=%2042'), 42); // url-encoded leading space
});

test('the permalink replays the identical town', () => {
  const seed = seedFromSearch('?seed=1234');
  const a = createTown({ seed });
  const b = createTown({ seed });
  for (let i = 0; i < 300; i++) {
    a.tick();
    b.tick();
  }
  assert.equal(a.hash(), b.hash());
});
