---
name: j-town
description: Boot the j-town multi-agent showcase headless, run visitor actions, and read the receipt ledger — the foundry mechanisms (kuramoto/agreement/fold/inet/steer) applied to each other in one seeded, DOM-free town.
---

# J-Town

j-town is a small multi-agent town that runs the foundry's mechanisms on each
other. The whole simulation is pure, seeded, and DOM-free, so an agent can drive
it entirely from Node — boot it, act on it, and read the receipts — without a
browser. `createTown({ seed })` returns `{ state, tick(), act(action),
subscribe(fn), hash() }`.

## Execution Steps

1. **Import and boot a deterministic town.**
   ```js
   import { createTown } from './src/town/index.js';
   const town = createTown({ seed: 42 });   // same seed ⇒ same town, always
   ```

2. **Advance j-time.** Each `tick()` is one τ. The plaza couples phases, the door
   petitions every 200 τ, the cellar reduces every 3 τ, the board scans for
   recurring signatures.
   ```js
   for (let i = 0; i < 300; i++) town.tick();
   console.log(town.state.R, town.state.tau);   // the vibe meter + j-time
   ```

3. **Act as the visitor.** `act(action)` returns `{ ok, ... }`.
   - `{ type: 'tapResident', id }` — kick a resident's phase by +π/2 (watch R dip).
   - `{ type: 'orderMood', id, mood }` — steer a resident toward `calm|ember|nova|quill`.
   - `{ type: 'signoff', candidateId }` — promote a board candidate one rung
     (needs `gammaSys` true; this is the Γ_ext half of the double gate).
   - `{ type: 'setFeatured', id }` — choose whose portrait the gallery folds.
   - `{ type: 'pause' | 'resume' | 'step' }` — playback control.
   - `{ type: 'reset', seed }` — re-seed the whole town.
   `id` accepts an index (`0`), an id (`'res-00'`), or a name (`'ember'`).

4. **Read the tab (the receipt ledger).** Newest first. Every receipt names the
   op and, when it computed one, which R it was.
   ```js
   for (const row of town.state.ledger.rows.slice(0, 10)) {
     console.log(row.op, row.scalar ?? '', row.r ?? '', row.note);
   }
   ```

5. **Subscribe for live events** (optional).
   ```js
   const off = town.subscribe((ev, state) => {
     if (ev.type === 'receipt') console.log('receipt', ev.rec.op, ev.deduped ? '(already on the tab)' : '');
   });
   // ... later: off();
   ```

6. **Inspect the board (graduation candidates).**
   ```js
   for (const c of town.state.candidates.values())
     console.log(c.op, c.state, 'rung', c.rung, 'Γ_sys', c.gammaSys, c.rHistory);
   ```

7. **Snapshot for reproducibility.** `town.hash()` is a stable fingerprint of the
   load-bearing state — two towns with the same seed and tick count hash equal.

## Failure modes

- **Missing / bad action** → `act` returns `{ ok: false, note }`; it never throws.
- **`signoff` with `Γ_sys` false** → `{ ok: false, reason: 'Γ_sys not met …' }`;
  the candidate stays at its rung. Detection never promotes (L8).
- **`orderMood` with an unknown mood** → `{ ok: false, note: 'unknown mood' }`.
- **The door on disagreement** → the receipt says *talk it out*; it is escalated,
  never committed. The visitor cannot override this.
- **A throwing subscriber** → swallowed; a bad subscriber never breaks the town.
- **Determinism** depends on driving with `tick()` only — the town uses no
  wall-clock and no unseeded randomness. Introducing either breaks `hash()` parity.
