// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// Contrast-set steering — a direction is the (unit) difference between the
// mean of a "contrast" set of examples and the mean of a "neutral" set. You
// then move a vector along it: h + α·v. Honesty line (steeropathy): a concept
// vector is a property of the contrast you chose, not of the model.
//
// Provenance: steeropathy (github.com/moudrkat/steeropathy, MIT) — contrast
// direction extraction, band injection, before/after at T=0.

function meanVec(lines) {
  const rows = Array.isArray(lines)
    ? lines.filter((a) => Array.isArray(a) || a instanceof Float32Array)
    : [];
  if (rows.length === 0) return [];
  let dim = 0;
  for (const r of rows) dim = Math.max(dim, r.length);
  const out = new Array(dim).fill(0);
  for (const r of rows) {
    for (let i = 0; i < dim; i++) {
      const x = r[i];
      out[i] += Number.isFinite(x) ? x : 0;
    }
  }
  for (let i = 0; i < dim; i++) out[i] /= rows.length;
  return out;
}

function unit(v) {
  let s = 0;
  for (const x of v) s += (Number.isFinite(x) ? x : 0) ** 2;
  const nrm = Math.sqrt(s);
  if (nrm === 0) return v.map(() => 0);
  return v.map((x) => (Number.isFinite(x) ? x : 0) / nrm);
}

/**
 * meanContrastDirection: unit( mean(lines) - mean(neutral) ).
 *
 * @param {number[][]} lines    contrast examples (each a vector)
 * @param {number[][]} neutral  neutral examples (each a vector)
 * @returns {number[]} a unit direction
 */
export function meanContrastDirection(lines, neutral) {
  const a = meanVec(lines);
  const b = meanVec(neutral);
  const dim = Math.max(a.length, b.length);
  const diff = new Array(dim).fill(0);
  for (let i = 0; i < dim; i++) diff[i] = (a[i] || 0) - (b[i] || 0);
  return unit(diff);
}

/**
 * steer: h + α·v (elementwise). Returns a new array.
 *
 * @param {number[]|Float32Array} h  the vector to move
 * @param {number[]|Float32Array} v  the direction
 * @param {number} alpha            the step size
 * @returns {number[]}
 */
export function steer(h, v, alpha) {
  const hh = h instanceof Float32Array || Array.isArray(h) ? h : [];
  const vv = v instanceof Float32Array || Array.isArray(v) ? v : [];
  const a = Number.isFinite(alpha) ? alpha : 0;
  const dim = Math.max(hh.length, vv.length);
  const out = new Array(dim).fill(0);
  for (let i = 0; i < dim; i++) {
    out[i] = (Number.isFinite(hh[i]) ? hh[i] : 0) + a * (Number.isFinite(vv[i]) ? vv[i] : 0);
  }
  return out;
}
