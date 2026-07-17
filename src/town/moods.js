// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Intuition Labs LLC

// The mood bar. Four moods, each defined by contrast lines built from its own
// vocabulary. meanContrastDirection over seeded per-word pseudo-embeddings
// gives a steering direction; ordering a mood moves a resident's vec along it
// (h + α·v). Their door-petition vocab and wander bias then visibly shift.
//
// Honesty (steeropathy): a concept vector is a property of the contrast you
// chose, not of the model.

import { hashBytes } from '../physics/inet.js';
import { mulberry32 } from '../physics/rng.js';
import { meanContrastDirection, steer } from '../physics/steer.js';

export const EMB_DIM = 16;
export const STEER_ALPHA = 0.35;
const BETA = 6; // draw temperature (sharpens the vec-biased draw; steer α is fixed at 0.35)

export const MOOD_NAMES = ['calm', 'ember', 'nova', 'quill'];

export const MOODS = {
  calm: { vocab: ['still', 'slow', 'quiet', 'soft', 'calm', 'easy'] },
  ember: { vocab: ['ember', 'warm', 'glow', 'heat', 'burn', 'coal'] },
  nova: { vocab: ['nova', 'bright', 'burst', 'flare', 'peak', 'fast'] },
  quill: { vocab: ['quill', 'fine', 'sharp', 'thin', 'mark', 'edge'] },
};

// contrast lines are phrases made from each mood's OWN vocab, so steering
// toward the line-direction is the same as raising those words' draw weight.
export const MOOD_LINES = {
  calm: [['still', 'slow'], ['quiet', 'soft'], ['calm', 'easy'], ['still', 'soft']],
  ember: [['ember', 'warm'], ['glow', 'heat'], ['burn', 'coal'], ['warm', 'glow']],
  nova: [['nova', 'bright'], ['burst', 'flare'], ['peak', 'fast'], ['bright', 'burst']],
  quill: [['quill', 'fine'], ['sharp', 'thin'], ['mark', 'edge'], ['fine', 'sharp']],
};

export const NEUTRAL_LINES = [
  ['grey', 'plain'],
  ['some', 'place'],
  ['the', 'day'],
  ['one', 'step'],
];

/** The union door vocabulary (24 distinct words). */
export const VOCAB = [...new Set(Object.values(MOODS).flatMap((m) => m.vocab))];

const embCache = new Map();

/** A deterministic 16-d pseudo-embedding for a word (seeded by its hash). */
export function embed(word) {
  const key = String(word);
  const hit = embCache.get(key);
  if (hit) return hit;
  const seed = Number.parseInt(hashBytes(key).slice(0, 8), 16) >>> 0;
  const rng = mulberry32(seed);
  const v = new Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i++) v[i] = rng() * 2 - 1;
  embCache.set(key, v);
  return v;
}

function lineEmb(words) {
  const embs = (Array.isArray(words) ? words : []).map(embed);
  const out = new Array(EMB_DIM).fill(0);
  if (embs.length === 0) return out;
  for (const e of embs) for (let i = 0; i < EMB_DIM; i++) out[i] += e[i];
  for (let i = 0; i < EMB_DIM; i++) out[i] /= embs.length;
  return out;
}

/** The unit steering direction for a mood. */
export function moodDirection(mood) {
  const lines = (MOOD_LINES[mood] || []).map(lineEmb);
  const neutral = NEUTRAL_LINES.map(lineEmb);
  return meanContrastDirection(lines, neutral);
}

/** Steer a resident's vec toward a mood. Mutates resident.vec; returns the direction. */
export function applyMood(resident, mood) {
  if (!resident || !MOOD_NAMES.includes(mood)) return null;
  const dir = moodDirection(mood);
  resident.vec = steer(resident.vec, dir, STEER_ALPHA);
  resident.mood = mood;
  return dir;
}

/** Draw a door reading from a resident's vec-biased distribution over VOCAB. */
export function drawReading(resident, rng) {
  const vec = resident && Array.isArray(resident.vec) ? resident.vec : new Array(EMB_DIM).fill(0);
  const weights = new Array(VOCAB.length);
  let total = 0;
  let nv = 0;
  for (let i = 0; i < EMB_DIM; i++) nv += vec[i] * vec[i];
  const nvRoot = Math.sqrt(nv) + 1e-9;
  for (let k = 0; k < VOCAB.length; k++) {
    const e = embed(VOCAB[k]);
    let dot = 0;
    let ne = 0;
    for (let i = 0; i < EMB_DIM; i++) {
      dot += vec[i] * e[i];
      ne += e[i] * e[i];
    }
    const sim = dot / (nvRoot * (Math.sqrt(ne) + 1e-9));
    const w = Math.exp(BETA * sim);
    weights[k] = w;
    total += w;
  }
  let x = (typeof rng === 'function' ? rng() : 0.5) * total;
  for (let k = 0; k < VOCAB.length; k++) {
    x -= weights[k];
    if (x <= 0) return VOCAB[k];
  }
  return VOCAB[VOCAB.length - 1];
}

/** Which mood a vocab word belongs to (for measuring the distribution shift). */
export function moodOfWord(word) {
  for (const m of MOOD_NAMES) if (MOODS[m].vocab.includes(word)) return m;
  return null;
}
