// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The board — the graduation ladder. A recurring event signature (the same op
// at least RECUR_MIN times on the tab) shows up as a candidate at the 'trace'
// rung. Promotion is a DOUBLE gate (L6):
//   Γ_sys : the candidate's r-history is all ≥ ADMIT_TAU (0.6), AND
//   Γ_ext : the visitor clicks signoff.
// Detection never promotes (L8) — the town alone can only surface a
// candidate, never advance it.

export const ADMIT_TAU = 0.6;
export const RECUR_MIN = 3;
export const GRADUATION_STATES = ['trace', 'loop', 'workflow', 'optimization_target', 'skill'];

/**
 * Refresh candidates from the ledger, preserving rung across ticks.
 *
 * @param {object} ledger   from createLedger()
 * @param {Map<string,object>} [existing]
 * @returns {Map<string,object>} op -> candidate
 */
export function scanCandidates(ledger, existing) {
  const out = existing instanceof Map ? existing : new Map();
  const totals = ledger.opTotals();
  for (const [op, count] of totals) {
    if (count < RECUR_MIN) continue;
    const rHist = ledger.opR(op);
    const gammaSys = rHist.length > 0 && rHist.every((r) => r >= ADMIT_TAU);
    if (!out.has(op)) {
      out.set(op, {
        op,
        rung: 0,
        state: GRADUATION_STATES[0],
        count,
        rHistory: rHist.slice(-8),
        gammaSys,
      });
    } else {
      const c = out.get(op);
      c.count = count;
      c.rHistory = rHist.slice(-8);
      c.gammaSys = gammaSys;
    }
  }
  return out;
}

/**
 * Sign off a candidate — the Γ_ext half of the gate. Requires Γ_sys too.
 * Mutates the candidate on success.
 *
 * @param {object} candidate
 * @returns {{ok:boolean, rung?:number, state?:string, reason?:string}}
 */
export function signoff(candidate) {
  if (!candidate) return { ok: false, reason: 'no such candidate' };
  if (!candidate.gammaSys) return { ok: false, reason: 'Γ_sys not met — r-history below 0.6' };
  if (candidate.rung >= GRADUATION_STATES.length - 1) {
    return { ok: false, reason: 'already at the top rung' };
  }
  candidate.rung += 1;
  candidate.state = GRADUATION_STATES[candidate.rung];
  return { ok: true, rung: candidate.rung, state: candidate.state };
}
