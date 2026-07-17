// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// agreementR — how many independent readings agree with the modal answer.
// R = exp(-(n - n_modal) / scale). This is agreementR (L1): verdict
// agreement, distinct from kuramotoR (phase) and glueR (fold). The gate
// commits only on real agreement; disagreement is escalated ("talk it out"),
// never fused. This is a faithful twin of the lab's reading-agreement gate.
//
// Provenance: R = exp(-d_tail/scale) is the degree-0 section obstruction of
// The Matryoshka Sheaf (Tej Desai, Intuition Labs).

/** The disagreement length scale. */
export const AGREEMENT_SCALE = 1.5;

/** The default commit threshold: exp(-0.5/1.5) ≈ 0.7165313105737893.
 *  Unanimous readings (d_tail=0 -> R=1) clear it; one dissenter
 *  (d_tail=1 -> R≈0.5134) does not. Pinned exactly. */
export const AGREEMENT_TAU = Math.exp(-0.5 / AGREEMENT_SCALE);

/**
 * agreementR: R = exp(-(n - n_modal) / scale).
 *
 * n = 0 -> 0  (no evidence, no agreement)
 * n = 1 -> 1  (a single reading trivially agrees with itself)
 *
 * @param {string[]} readings
 * @param {number} [scale=AGREEMENT_SCALE]
 * @returns {number} R in [0, 1]
 */
export function agreementR(readings, scale = AGREEMENT_SCALE) {
  const arr = Array.isArray(readings) ? readings : [];
  const n = arr.length;
  if (n === 0) return 0;
  const counts = new Map();
  for (const r of arr) {
    const key = String(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let nModal = 0;
  for (const c of counts.values()) if (c > nModal) nModal = c;
  const s = Number.isFinite(scale) && scale > 0 ? scale : AGREEMENT_SCALE;
  return Math.exp(-(n - nModal) / s);
}

/**
 * gateDecision: the commit / escalate / skip verdict.
 *
 * policy 'dry_run'        -> always 'skip'   (measure without acting)
 * policy 'always_escalate'-> always 'escalate'
 * policy 'gate' (default) -> 'commit' iff r >= tau, else 'escalate'
 *
 * The house rule (L-agree): the visitor cannot override this. Disagreement
 * is never fused into a commit.
 *
 * @param {number} r
 * @param {number} [tau=AGREEMENT_TAU]
 * @param {'gate'|'dry_run'|'always_escalate'} [policy='gate']
 * @returns {'commit'|'escalate'|'skip'}
 */
export function gateDecision(r, tau = AGREEMENT_TAU, policy = 'gate') {
  if (policy === 'dry_run') return 'skip';
  if (policy === 'always_escalate') return 'escalate';
  const rr = Number.isFinite(r) ? r : 0;
  const t = Number.isFinite(tau) ? tau : AGREEMENT_TAU;
  return rr >= t ? 'commit' : 'escalate';
}
