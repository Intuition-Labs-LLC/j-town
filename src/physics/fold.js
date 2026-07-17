// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// Matryoshka fold — keep the first `dim` coordinates, drop the tail. The
// fidelity is how much of the vector's length survives: ||prefix|| / ||v||.
// This is glueR (L1): fold fidelity, never routed into any other gate.
//
// Provenance: Matryoshka Representation Learning (Kusupati et al.,
// arXiv:2205.13147); the sheaf reading of the retained-length ratio is
// The Matryoshka Sheaf (Tej Desai, Intuition Labs).

/** The default full width of a portrait vector. */
export const MATRYOSHKA_K_DEFAULT = 16;

function norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (Number.isFinite(x)) s += x * x;
  }
  return Math.sqrt(s);
}

/**
 * foldVec: fold a vector to its first `dim` coordinates.
 *
 * @param {number[]|Float32Array} v
 * @param {number} dim
 * @returns {{v:number[], fidelity:number}} fidelity in [0, 1]; a zero vector
 *   folds with fidelity 1 (nothing was there to lose).
 */
export function foldVec(v, dim) {
  const src = v instanceof Float32Array || Array.isArray(v) ? v : [];
  const n = src.length;
  const d = Math.max(0, Math.min(Number.isInteger(dim) ? dim : n, n));
  const prefix = Array.from({ length: d }, (_, i) => (Number.isFinite(src[i]) ? src[i] : 0));
  const full = norm(src);
  const fidelity = full === 0 ? 1 : norm(prefix) / full;
  return { v: prefix, fidelity };
}
