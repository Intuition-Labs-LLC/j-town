// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The plaza — Kuramoto coupling in space. Residents wander and drift toward
// the plaza; neighbors within a radius couple their phases:
//   dθ_i = ω_i + (K / N_local) · Σ_j sin(θ_j − θ_i).
// As they gather, N_local grows, coupling wins over the natural spread, and
// the town-wide R = orderParameter(phases) climbs — the vibe meter. This is
// kuramotoR (L1).

import { orderParameter } from '../physics/kuramoto.js';

export const PLAZA_CENTER = { x: 0.5, y: 0.3 };
export const NEIGHBOR_RADIUS = 0.1; // small: residents start sparse, so R starts low and climbs as they gather
export const COUPLING = 0.68; // K base — above the critical coupling for the ω spread
export const GATHER = 0.0028; // firm pull toward the plaza center (keeps the cluster from dispersing)
export const DAMPING = 0.83;
export const WANDER = 0.0008; // seeded jitter magnitude
export const VEC_DRIFT = 0.00016; // vec-biased lean (steering shows up as movement)
export const BOUND_X = [0.04, 0.96];
export const BOUND_Y = [0.04, 0.7];

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Advance the plaza one tick. Mutates residents (position, velocity, phase,
 * neighbor count). Consumes exactly 2 rng draws per resident (deterministic).
 *
 * @param {Array<object>} residents
 * @param {() => number} rng
 * @returns {number} the town-wide R after this tick
 */
export function stepPlaza(residents, rng) {
  const N = residents.length;

  // 1. movement: damped velocity + gather pull + seeded wander + vec lean
  for (const r of residents) {
    const dx = PLAZA_CENTER.x - r.pos.x;
    const dy = PLAZA_CENTER.y - r.pos.y;
    const bx = Math.tanh(r.vec[0]);
    const by = Math.tanh(r.vec[1]);
    r.vel.x = r.vel.x * DAMPING + dx * GATHER + (rng() * 2 - 1) * WANDER + bx * VEC_DRIFT;
    r.vel.y = r.vel.y * DAMPING + dy * GATHER + (rng() * 2 - 1) * WANDER + by * VEC_DRIFT;
    r.pos.x = clamp(r.pos.x + r.vel.x, BOUND_X[0], BOUND_X[1]);
    r.pos.y = clamp(r.pos.y + r.vel.y, BOUND_Y[0], BOUND_Y[1]);
  }

  // 2. Kuramoto phase coupling over spatial neighbors (synchronous update)
  const r2 = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;
  const nextPhase = new Array(N);
  for (let i = 0; i < N; i++) {
    const ri = residents[i];
    let sum = 0;
    let nloc = 0;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const rj = residents[j];
      const ddx = ri.pos.x - rj.pos.x;
      const ddy = ri.pos.y - rj.pos.y;
      if (ddx * ddx + ddy * ddy <= r2) {
        sum += Math.sin(rj.phase - ri.phase);
        nloc++;
      }
    }
    ri.nloc = nloc;
    const coupling = nloc > 0 ? (COUPLING / nloc) * sum : 0;
    nextPhase[i] = ri.phase + ri.omega + coupling;
  }
  for (let i = 0; i < N; i++) residents[i].phase = nextPhase[i];

  return orderParameter(residents.map((r) => r.phase));
}
