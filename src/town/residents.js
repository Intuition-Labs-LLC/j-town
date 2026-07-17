// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The residents — 48 agents that hang out in the town. Each carries a phase
// (for the plaza's Kuramoto coupling), a natural frequency ω, a position, and
// a 16-d personality vector (the portrait the gallery folds and the mood bar
// steers). Everything is seeded, so the whole town is reproducible.

import { mulberry32 } from '../physics/rng.js';
import { NAMES } from './names.js';

export const RESIDENT_COUNT = 48;
export const VEC_DIM = 16;

/**
 * @param {number} seed
 * @returns {Array<object>} 48 residents
 */
export function makeResidents(seed) {
  const rng = mulberry32(((Number.isFinite(seed) ? seed : 42) >>> 0) ^ 0x9e3779b9);
  const residents = [];
  for (let i = 0; i < RESIDENT_COUNT; i++) {
    const vec = new Array(VEC_DIM);
    for (let d = 0; d < VEC_DIM; d++) vec[d] = rng() * 2 - 1; // [-1, 1]
    residents.push({
      id: 'res-' + String(i).padStart(2, '0'),
      idx: i,
      name: NAMES[i % NAMES.length],
      phase: rng() * Math.PI * 2,
      omega: (rng() * 2 - 1) * 0.12, // natural frequency spread ±0.12 (a shimmering plateau, not a flat lock)
      pos: { x: 0.12 + rng() * 0.76, y: 0.08 + rng() * 0.58 },
      vel: { x: 0, y: 0 },
      vec,
      state: 'wander', // 'wander' | 'backroom' | 'bench'
      stateT: 0, // ticks left in a transient state
      tint: 0, // render hint: 0 neutral, 1 backroom (blue), -1 bench (rose)
      nloc: 0, // neighbor count (for render)
      mood: null,
    });
  }
  return residents;
}
