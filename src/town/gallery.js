// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The gallery — one resident's 16-d portrait folded 16 -> 8 -> 4, with the
// fidelity (glueR, L1) at each stage. The portrait survives the fold: the
// prefix keeps most of the vector's length.

import { foldVec } from '../physics/fold.js';

/**
 * @param {number[]} vec  a 16-d portrait
 * @returns {{stages:Array<{dim:number,fidelity:number}>, glueR:number, v8:number[], v4:number[]}}
 */
export function foldPortrait(vec) {
  const f8 = foldVec(vec, 8); // 16 -> 8
  const f4 = foldVec(vec, 4); // 16 -> 4 (overall)
  return {
    stages: [
      { dim: 16, fidelity: 1 },
      { dim: 8, fidelity: f8.fidelity },
      { dim: 4, fidelity: f4.fidelity },
    ],
    glueR: f4.fidelity,
    v8: f8.v,
    v4: f4.v,
  };
}
