// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// The tab — an in-memory trace ledger. Every event in the town mints a row;
// identical rows dedupe by content hash ("already on the tab"). The receipt
// stream IS the town record. Receipts carry the scalar name (which R this is)
// so the never-alias law (L1) lives in the data, not just in prose.
//
// Provenance: the trace -> loop -> workflow graduation ladder is the lab's
// trace-foundry (named by function; "foundry" is bound to Foundry-Intake).

import { hashBytes } from './inet.js';

/**
 * createLedger() -> a live ledger.
 *
 * - rows: newest-first array of DISTINCT rows (live reference).
 * - mint(receipt, t): add a row (or flag a dedupe). Always records the op
 *   occurrence and any finite r for the graduation board, even on dedupe.
 * - subscribe(fn): fn({type:'mint'|'dedupe', row, sha}) on every mint attempt.
 * - opTotals()/opR(op): recurrence + r-history for the board.
 */
export function createLedger() {
  const rows = [];
  const seen = new Map(); // sha -> { row, count }
  const subs = new Set();
  const totals = new Map(); // op -> occurrence count (incl. dedupes)
  const rByOp = new Map(); // op -> number[]
  let seq = 0;

  function notify(ev) {
    for (const fn of subs) {
      try {
        fn(ev);
      } catch {
        // a bad subscriber never breaks the town
      }
    }
  }

  function shaOf(rec) {
    return hashBytes(
      [
        rec.op ?? '',
        rec.scalar ?? '',
        rec.r ?? '',
        rec.note ?? '',
        rec.witness ?? '',
        (rec.refs ?? []).join(','),
      ].join('|'),
    );
  }

  function mint(rec, t) {
    if (!rec || typeof rec !== 'object') return { deduped: false, ignored: true };
    const op = String(rec.op ?? '');
    if (!op) return { deduped: false, ignored: true };

    // record the occurrence + r-history regardless of dedupe (the board needs
    // recurrence even when the visible feed collapses identical rows)
    totals.set(op, (totals.get(op) || 0) + 1);
    if (Number.isFinite(rec.r)) {
      const hist = rByOp.get(op) || [];
      hist.push(rec.r);
      rByOp.set(op, hist);
    }

    const sha = rec.sha || shaOf(rec);
    const row = {
      op,
      r: Number.isFinite(rec.r) ? rec.r : undefined,
      scalar: rec.scalar,
      note: rec.note ?? '',
      witness: rec.witness,
      refs: rec.refs,
      sha,
      t: Number.isFinite(t) ? t : seq,
      count: 1,
    };
    seq++;

    if (seen.has(sha)) {
      const entry = seen.get(sha);
      entry.count += 1;
      entry.row.count = entry.count;
      notify({ type: 'dedupe', row: entry.row, sha, note: 'already on the tab' });
      return { deduped: true, row: entry.row, sha };
    }

    rows.unshift(row);
    seen.set(sha, { row, count: 1 });
    notify({ type: 'mint', row, sha });
    return { deduped: false, row, sha };
  }

  return {
    rows,
    mint,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    clear() {
      rows.length = 0;
      seen.clear();
      totals.clear();
      rByOp.clear();
      seq = 0;
    },
    size() {
      return rows.length;
    },
    opTotals() {
      return new Map(totals);
    },
    opR(op) {
      return (rByOp.get(op) || []).slice();
    },
  };
}
