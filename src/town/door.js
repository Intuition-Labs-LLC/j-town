// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The door — the agreement gate as a bouncer. Every DOOR_PERIOD ticks, two
// residents petition the back room, each with one reading drawn from their
// vec-biased vocab. The bouncer computes agreementR and the gate verdict:
//   commit   -> they agree, the door opens (✓)
//   escalate -> they disagree, sent to the bench to talk it out (never fused)
// House rule L-agree: the visitor cannot override this.

import { agreementR, gateDecision, AGREEMENT_TAU } from '../physics/agreement.js';
import { drawReading } from './moods.js';

export const DOOR_PERIOD = 200;

/**
 * Maybe run a petition this tick. Consumes rng only on a petition tick (2
 * picks + 2 reading draws), so it stays deterministic.
 *
 * @param {object} state  town state ({ tau, rng, residents })
 * @returns {null | {a, b, readings:[string,string], r:number, decision:string}}
 */
export function maybePetition(state) {
  const { tau, rng, residents } = state;
  if (tau === 0 || tau % DOOR_PERIOD !== 0) return null;
  if (!Array.isArray(residents) || residents.length < 2) return null;

  const i = Math.floor(rng() * residents.length) % residents.length;
  let j = Math.floor(rng() * residents.length) % residents.length;
  if (j === i) j = (j + 1) % residents.length;

  const a = residents[i];
  const b = residents[j];
  const readings = [drawReading(a, rng), drawReading(b, rng)];
  const r = agreementR(readings);
  const decision = gateDecision(r, AGREEMENT_TAU, 'gate');
  return { a, b, readings, r, decision };
}
