// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC
// Vendored twin of @intuitionlabs/jspace (github.com/Intuition-Labs-LLC/jspace). Byte-parity is enforced at integration; edit the package, not this twin.

// A minimal Lafont interaction-combinator reducer. Three cell kinds:
//   ERA (0 aux), CON (2 aux), DUP (2 aux).
// An "active pair" is two principal ports wired together. Reduction rewrites
// the active pair per the interaction rule and never touches anything else,
// so the net is strongly confluent: reduce in any order, reach the same
// normal form. The scheduler order flag ('asc'|'desc') only changes the path,
// not the destination — that is the confluence stunt in the cellar.
//
// Provenance: interaction nets — Y. Lafont; HVM2 — Victor Taelin, Higher
// Order Company (Apache-2.0). No code copied; original implementation.

export const KINDS = ['ERA', 'CON', 'DUP'];

// --- hashBytes: FNV-1a 64-bit, synchronous, no node:crypto -----------------
// The canonical net hash and the ledger dedupe both use this ONE function so
// hashes match byte-for-byte in node AND the browser (browser has no
// synchronous SHA-256). This is a DISPLAY hash, not a cryptographic one.
/**
 * @param {string} str
 * @returns {string} 16 lowercase hex chars (64-bit digest)
 */
export function hashBytes(str) {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK = (1n << 64n) - 1n;
  let h = OFFSET;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h ^ BigInt(c & 0xff)) & MASK;
    h = (h * PRIME) & MASK;
    if (c > 0xff) {
      h = (h ^ BigInt((c >> 8) & 0xff)) & MASK;
      h = (h * PRIME) & MASK;
    }
  }
  return h.toString(16).padStart(16, '0');
}

// --- net model -------------------------------------------------------------
// net = { seq, freeSeq, kind: Map<id,kind>, link: Map<portKey,portKey> }
// portKey for an agent port: `${id}:${slot}` (slot 0 = principal, 1/2 = aux).
// portKey for a free endpoint: `F${n}` (the net's stable interface, invariant
// under reduction). link is symmetric.

function arityOfKind(k) {
  return k === 'ERA' ? 0 : 2;
}

function pk(port) {
  return Array.isArray(port) ? `${port[0]}:${port[1]}` : String(port);
}

/** Fresh empty net. */
export function makeNet() {
  return { seq: 0, freeSeq: 0, kind: new Map(), link: new Map() };
}

/** Add an agent of a given kind; returns its numeric id. Ports are wired lazily. */
export function addAgent(net, k) {
  if (!KINDS.includes(k)) throw new Error(`inet: unknown kind ${k}`);
  const id = net.seq++;
  net.kind.set(id, k);
  return id;
}

function wire(net, k1, k2) {
  const a = k1 == null ? freeEnd(net) : k1;
  const b = k2 == null ? freeEnd(net) : k2;
  net.link.set(a, b);
  net.link.set(b, a);
}

function freeEnd(net) {
  return `F${net.freeSeq++}`;
}

/** Connect two ports (each `[id, slot]` or a raw key). */
export function connect(net, portA, portB) {
  wire(net, pk(portA), pk(portB));
}

/** Attach a port to a fresh free endpoint (the net's interface). */
export function connectFree(net, port) {
  wire(net, pk(port), freeEnd(net));
}

/** Give every unconnected agent port a fresh free endpoint. Call after build. */
export function seal(net) {
  for (const [id, k] of net.kind) {
    const ar = arityOfKind(k);
    for (let slot = 0; slot <= ar; slot++) {
      const key = `${id}:${slot}`;
      if (!net.link.has(key)) connectFree(net, [id, slot]);
    }
  }
  return net;
}

/** Deep clone a net (ids and free-endpoint names preserved). */
export function cloneNet(net) {
  return {
    seq: net.seq,
    freeSeq: net.freeSeq,
    kind: new Map(net.kind),
    link: new Map(net.link),
  };
}

// --- reduction -------------------------------------------------------------

/** All active pairs, each `[a, b]` with a < b, deduped. */
export function activePairs(net) {
  const seen = new Set();
  const out = [];
  for (const id of net.kind.keys()) {
    const partner = net.link.get(`${id}:0`);
    if (partner === undefined || partner[0] === 'F') continue;
    const [oidStr, oslot] = partner.split(':');
    if (oslot !== '0') continue; // partner must also be a principal
    const oid = Number(oidStr);
    if (!net.kind.has(oid)) continue;
    const a = Math.min(id, oid);
    const b = Math.max(id, oid);
    const key = `${a}:${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function auxExternals(net, id) {
  const k = net.kind.get(id);
  if (arityOfKind(k) === 0) return [];
  return [net.link.get(`${id}:1`), net.link.get(`${id}:2`)];
}

function detach(net, id) {
  const k = net.kind.get(id);
  const ar = arityOfKind(k);
  for (let slot = 0; slot <= ar; slot++) {
    const key = `${id}:${slot}`;
    const p = net.link.get(key);
    if (p !== undefined) {
      net.link.delete(key);
      net.link.delete(p);
    }
  }
}

// An external endpoint that names a port on a removed agent (a redex-internal
// wire) can't be reconnected to a surviving agent — degrade to a fresh free
// endpoint so the net stays well-formed. Our designed nets never hit this.
function safeExt(net, ext, deadIds) {
  if (ext === undefined) return freeEnd(net);
  if (ext[0] === 'F') return ext;
  const owner = Number(ext.split(':')[0]);
  if (deadIds.has(owner)) return freeEnd(net);
  return ext;
}

function applyRule(net, A, B) {
  const kA = net.kind.get(A);
  const kB = net.kind.get(B);
  const dead = new Set([A, B]);
  const rawA = auxExternals(net, A);
  const rawB = auxExternals(net, B);

  detach(net, A);
  detach(net, B);
  net.kind.delete(A);
  net.kind.delete(B);

  const eA = rawA.map((e) => safeExt(net, e, dead));
  const eB = rawB.map((e) => safeExt(net, e, dead));

  // ERA - ERA: both vanish, nothing to rewire.
  if (kA === 'ERA' && kB === 'ERA') return 'annihilate-era';

  // ERA - binary: erase the binary, drop two ERAs onto its aux peers.
  if (kA === 'ERA' || kB === 'ERA') {
    const extG = kA === 'ERA' ? eB : eA;
    const e1 = addAgent(net, 'ERA');
    const e2 = addAgent(net, 'ERA');
    wire(net, `${e1}:0`, extG[0]);
    wire(net, `${e2}:0`, extG[1]);
    return 'erase';
  }

  // same-kind binary: annihilation — aux1↔aux1, aux2↔aux2.
  if (kA === kB) {
    wire(net, eA[0], eB[0]);
    wire(net, eA[1], eB[1]);
    return 'annihilate';
  }

  // CON - DUP: commutation (the Lafont square) — 2 of each kind cross-wired.
  const yb1 = addAgent(net, kB);
  const yb2 = addAgent(net, kB);
  const xa1 = addAgent(net, kA);
  const xa2 = addAgent(net, kA);
  wire(net, `${yb1}:0`, eA[0]);
  wire(net, `${yb2}:0`, eA[1]);
  wire(net, `${xa1}:0`, eB[0]);
  wire(net, `${xa2}:0`, eB[1]);
  wire(net, `${yb1}:1`, `${xa1}:1`);
  wire(net, `${yb1}:2`, `${xa2}:1`);
  wire(net, `${yb2}:1`, `${xa1}:2`);
  wire(net, `${yb2}:2`, `${xa2}:2`);
  return 'commute';
}

function comparePairs(p, q) {
  if (p[0] !== q[0]) return p[0] - q[0];
  return p[1] - q[1];
}

/**
 * Apply ONE interaction, chosen by scheduler order. Returns whether it did
 * work (and which pair). No active pair -> {did:false}.
 * @param {object} net
 * @param {'asc'|'desc'} [order='asc']
 */
export function reduceStep(net, order = 'asc') {
  const pairs = activePairs(net);
  if (pairs.length === 0) return { did: false };
  pairs.sort(comparePairs);
  const chosen = order === 'desc' ? pairs[pairs.length - 1] : pairs[0];
  const rule = applyRule(net, chosen[0], chosen[1]);
  return { did: true, pair: chosen, rule };
}

/**
 * Reduce to normal form (or until maxSteps).
 * @returns {{steps:number, normal:boolean}}
 */
export function reduce(net, opts = {}) {
  const order = opts.order === 'desc' ? 'desc' : 'asc';
  const maxSteps = Number.isInteger(opts.maxSteps) && opts.maxSteps > 0 ? opts.maxSteps : 100000;
  let steps = 0;
  let normal = false;
  while (steps < maxSteps) {
    const r = reduceStep(net, order);
    if (!r.did) {
      normal = true;
      break;
    }
    steps++;
  }
  return { steps, normal };
}

// --- canonical hash --------------------------------------------------------

/**
 * canonicalNetHash: a relabeling-invariant fingerprint. BFS from the net's
 * free endpoints (in stable name order) assigns canonical labels to agents;
 * the structure is then serialized and hashed with hashBytes. Two nets that
 * are isomorphic and share the same free-endpoint interface (e.g. the same
 * original net reduced two different ways) hash identically.
 *
 * @param {object} net
 * @returns {string} 16 hex chars
 */
export function canonicalNetHash(net) {
  const label = new Map(); // agentId -> canonical index
  const queue = [];
  let nextLabel = 0;

  const freeKeys = [];
  for (const k of net.link.keys()) if (k[0] === 'F') freeKeys.push(k);
  freeKeys.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const freeIndex = new Map();
  freeKeys.forEach((fk, i) => freeIndex.set(fk, i));

  const enqueueAgent = (portKey) => {
    if (portKey === undefined || portKey[0] === 'F') return;
    const id = Number(portKey.split(':')[0]);
    if (net.kind.has(id) && !label.has(id)) queue.push(id);
  };

  // seed the BFS from the interface, in canonical free-endpoint order
  for (const fk of freeKeys) enqueueAgent(net.link.get(fk));

  while (queue.length) {
    const id = queue.shift();
    if (label.has(id)) continue;
    label.set(id, nextLabel++);
    const ar = arityOfKind(net.kind.get(id));
    for (let slot = 0; slot <= ar; slot++) {
      enqueueAgent(net.link.get(`${id}:${slot}`));
    }
  }

  // fallback for any component not reachable from a free port (deterministic)
  const remaining = [...net.kind.keys()].filter((id) => !label.has(id)).sort((a, b) => a - b);
  for (const id of remaining) label.set(id, nextLabel++);

  const inv = new Map();
  for (const [id, l] of label) inv.set(l, id);

  const descOf = (portKey) => {
    if (portKey === undefined) return '_';
    if (portKey[0] === 'F') return 'F' + (freeIndex.has(portKey) ? freeIndex.get(portKey) : portKey.slice(1));
    const [pid, ps] = portKey.split(':');
    const l = label.get(Number(pid));
    return (l === undefined ? '?' : l) + ':' + ps;
  };

  const parts = [];
  for (let l = 0; l < nextLabel; l++) {
    const id = inv.get(l);
    const k = net.kind.get(id);
    const ar = arityOfKind(k);
    const slots = [];
    for (let slot = 0; slot <= ar; slot++) slots.push(descOf(net.link.get(`${id}:${slot}`)));
    parts.push(`${k}[${slots.join(',')}]`);
  }
  // include the interface wiring so the fingerprint is complete
  const iface = freeKeys.map((fk) => `${freeIndex.get(fk)}>${descOf(net.link.get(fk))}`);
  return hashBytes(parts.join('|') + '#' + iface.join(','));
}

/** Small summary for display: agent count, redex count, per-kind tally. */
export function netStats(net) {
  const byKind = { ERA: 0, CON: 0, DUP: 0 };
  for (const k of net.kind.values()) byKind[k] = (byKind[k] || 0) + 1;
  return { agents: net.kind.size, redexes: activePairs(net).length, byKind };
}
