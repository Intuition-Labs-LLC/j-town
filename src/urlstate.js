// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
//
// urlstate — seed-in-URL permalinks, as pure functions so the headless suite
// can falsify them without a browser. The page reads ?seed= on boot, writes it
// on reset, and the copy-link control hands the visitor a URL that replays the
// exact same town (mulberry32 determinism makes the permalink exact).

/** Parse ?seed=N from a location.search string. Returns the seed as a uint32,
 * or null when the parameter is absent or unparseable (degrade closed: the
 * caller falls back to the seed box / 42; nothing throws). */
export function seedFromSearch(search) {
  if (typeof search !== 'string' || search.length === 0) return null;
  const m = /[?&]seed=([^&]*)/.exec(search);
  if (!m) return null;
  const n = Number.parseInt(decodeURIComponent(m[1]), 10);
  return Number.isFinite(n) ? n >>> 0 : null;
}

/** The search string for a seed — the single place the format is defined. */
export function searchForSeed(seed) {
  return `?seed=${seed >>> 0}`;
}
