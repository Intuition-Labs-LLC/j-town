// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// Kuramoto phase coherence — the vibe meter. A population of values maps to
// phases on a circle; the order parameter R measures how aligned they are.
// R near 1 = consensus, R near 0 = scattered. This is kuramotoR (L1): phase
// coherence, never routed into any other gate.
//
// Provenance: Y. Kuramoto (1975), R = |mean(e^{iθ})|.

/** The sync threshold: R at or above this is "consensus". */
export const KURAMOTO_SYNC = 0.9;

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * kuramotoConsensus: turn a list of scalar readings into a coherence R.
 *
 * Empty  -> {R:0, consensus:false}
 * Single -> {R:1, consensus:true}
 * Else: each value's deviation from the mean is measured in tolerance units,
 * clamped to [-1,1], mapped to an angle in [-π/2, π/2], and the order
 * parameter R = |Σ e^{iθ}| / N is returned (rounded to 6dp).
 *
 * The π/2 law: two values that both saturate the tolerance in opposite
 * directions land at +π/2 and -π/2 — antipodal — so R = 0.
 *
 * @param {number[]} values
 * @param {number} [tolerance=0.1]
 * @returns {{R:number, consensus:boolean}}
 */
export function kuramotoConsensus(values, tolerance = 0.1) {
  const arr = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  const N = arr.length;
  if (N === 0) return { R: 0, consensus: false };
  if (N === 1) return { R: 1, consensus: true };

  const mean = arr.reduce((a, b) => a + b, 0) / N;
  const tolRaw = (Number.isFinite(tolerance) ? tolerance : 0.1) * Math.max(Math.abs(mean), 1e-9);
  const denom = tolRaw > 0 ? tolRaw : 1e-12;

  let sumCos = 0;
  let sumSin = 0;
  for (const v of arr) {
    const devUnits = clamp((v - mean) / denom, -1, 1);
    const theta = (Math.PI / 2) * devUnits;
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  const R = Math.round((Math.hypot(sumCos, sumSin) / N) * 1e6) / 1e6;
  return { R, consensus: R >= KURAMOTO_SYNC };
}

/**
 * orderParameter: the raw |mean e^{iθ}| over a list of phases (angles in
 * radians). No rounding, no threshold — this is what the plaza reads every
 * tick as the town-wide vibe.
 *
 * @param {number[]} phases
 * @returns {number} R in [0, 1]
 */
export function orderParameter(phases) {
  const arr = Array.isArray(phases) ? phases.filter((v) => Number.isFinite(v)) : [];
  const N = arr.length;
  if (N === 0) return 0;
  let sumCos = 0;
  let sumSin = 0;
  for (const theta of arr) {
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  return Math.hypot(sumCos, sumSin) / N;
}
