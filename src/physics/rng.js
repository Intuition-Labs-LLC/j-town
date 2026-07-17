// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// mulberry32 — a small, fast, seedable PRNG. Deterministic: same seed, same
// stream, everywhere (node and browser). The whole town is driven by this so
// two towns with the same seed evolve identically.

/**
 * @param {number} seed  any 32-bit-coercible number
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = (Number.isFinite(seed) ? seed : 0) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [lo, hi). */
export function range(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

/** Uniform integer in [0, n). */
export function int(rng, n) {
  const m = Math.max(1, Math.floor(n));
  return Math.floor(rng() * m) % m;
}

/** Pick one element of a non-empty array; null on empty. */
export function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[int(rng, arr.length)];
}

/** Standard-normal draw (Box-Muller), deterministic given rng. */
export function gaussian(rng) {
  let u = 0;
  let v = 0;
  // avoid log(0)
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
