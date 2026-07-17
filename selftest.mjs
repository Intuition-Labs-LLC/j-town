// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// selftest — the one-command "is this town sound?" check:
//   1. grep every source file for external-request APIs (there must be none:
//      j-town runs entirely in the visitor's browser, no server, no calls);
//   2. boot the town headless for 2000 τ and print the R curve summary;
//   3. run the confluence stunt and report the hash-equality result.
// Exits non-zero on any failure. No network, no DOM.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { createTown } from './src/town/index.js';
import { buildCellarNet } from './src/town/cellar.js';
import { cloneNet, reduce, canonicalNetHash } from './src/physics/inet.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const line = () => console.log('─'.repeat(64));

function fail(msg) {
  failures += 1;
  console.log('  ✖ ' + msg);
}
function ok(msg) {
  console.log('  ✔ ' + msg);
}

// ---- 1. no external requests --------------------------------------------
// Runtime request APIs that would reach off the page. Anchor links
// (<a href="http…">) are navigations, not requests, and are allowed.
const FORBIDDEN = [
  { re: /\bfetch\s*\(/, name: 'fetch()' },
  { re: /XMLHttpRequest/, name: 'XMLHttpRequest' },
  { re: /\bWebSocket\b/, name: 'WebSocket' },
  { re: /\bEventSource\b/, name: 'EventSource' },
  { re: /importScripts/, name: 'importScripts' },
  { re: /sendBeacon/, name: 'navigator.sendBeacon' },
  { re: /from\s+["']https?:\/\//, name: 'remote static import' },
  { re: /import\s*\(\s*["']https?:\/\//, name: 'remote dynamic import' },
  { re: /@import\s+(url\s*\()?["']?https?:/, name: 'remote CSS @import' },
  { re: /<script[^>]*\bsrc\s*=\s*["']https?:/i, name: 'external <script src>' },
  { re: /<link[^>]*\bhref\s*=\s*["']https?:/i, name: 'external <link href>' },
  { re: /url\(\s*["']?https?:/i, name: 'external CSS url()' },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.git')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|html|css)$/.test(entry)) out.push(full);
  }
  return out;
}

console.log('\nj-town selftest');
line();
console.log('1. no external requests');
const files = walk(join(ROOT, 'src')).concat([join(ROOT, 'index.html')]);
let scanClean = true;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const { re, name } of FORBIDDEN) {
    if (re.test(src)) {
      fail(`${relative(ROOT, f)} references ${name}`);
      scanClean = false;
    }
  }
}
if (scanClean) ok(`${files.length} source files scanned — zero external-request APIs`);

// ---- 2. boot 2000 ticks, R curve ----------------------------------------
line();
console.log('2. boot 2000 τ (seed 42)');
const town = createTown({ seed: 42 });
let firstCross = -1;
let maxR = 0;
const samples = [];
for (let i = 1; i <= 2000; i++) {
  town.tick();
  const R = town.state.R;
  if (R > maxR) maxR = R;
  if (firstCross < 0 && R >= 0.9) firstCross = i;
  if (i % 200 === 0) samples.push(R);
}
const blocks = '▁▂▃▄▅▆▇█';
const spark = samples.map((r) => blocks[Math.min(7, Math.max(0, Math.floor(r * 8)))]).join('');
console.log('  R @ 200τ intervals: ' + spark + '   (' + samples.map((r) => r.toFixed(2)).join(' ') + ')');
console.log(`  first R≥0.9 at τ=${firstCross}   maxR=${maxR.toFixed(4)}   crystallizations=${town.state.crystallized}`);
console.log(`  ledger rows=${town.state.ledger.size()}   candidates=${town.state.candidates.size}`);
if (firstCross > 0 && firstCross < 5000) ok(`R crossed 0.9 within budget (τ=${firstCross})`);
else fail(`R never crossed 0.9 (firstCross=${firstCross})`);
if (town.state.crystallized >= 1) ok(`crystallized ${town.state.crystallized}×`);
else fail('no crystallization moment');

// ---- 3. confluence stunt ------------------------------------------------
line();
console.log('3. confluence stunt (deal the same hand backwards)');
const orig = buildCellarNet();
const asc = cloneNet(orig);
const desc = cloneNet(orig);
const ra = reduce(asc, { order: 'asc', maxSteps: 1000 });
const rd = reduce(desc, { order: 'desc', maxSteps: 1000 });
const hA = canonicalNetHash(asc);
const hD = canonicalNetHash(desc);
console.log(`  asc : ${ra.steps} steps -> ${hA}`);
console.log(`  desc: ${rd.steps} steps -> ${hD}`);
if (hA === hD) ok(`hashes match — confluence holds (${hA})`);
else fail(`hashes DIFFER: ${hA} vs ${hD}`);

// ---- verdict ------------------------------------------------------------
line();
if (failures === 0) {
  console.log('SELFTEST PASSED\n');
  process.exit(0);
} else {
  console.log(`SELFTEST FAILED — ${failures} problem(s)\n`);
  process.exit(1);
}
