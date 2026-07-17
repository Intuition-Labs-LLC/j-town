# j-town

**jspace is the physics. j-town is the town built on it.**

A tiny multi-agent town where the foundry's mechanisms hang out and apply
themselves to each other. Forty-eight resident agents wander a plaza, sync up,
petition a door, reduce a net in the cellar, sit for a portrait in the gallery,
and get their mood steered — and every one of those is the *same* underlying
mechanism wearing a different hat.

It runs **entirely in your browser**. No server. No external requests. It also
runs **headless under Node**, so the whole town can be driven and tested without
a screen. It is both a live demo and a clonable starter.

> **Live:** https://intuition-labs-llc.github.io/j-town/

---

## What is going on (ELI5)

There is one idea here, repeated everywhere:

> Take a bunch of readings. Boil them down to a single number, some **R**.
> Compare **R** to a threshold. Decide: commit, escalate, skip, or vent.
> Leave a receipt. That's it.

Each venue in the town is that one idea in a different costume:

- **The plaza** turns everyone's *phase* into an R — the town's mood, its "vibe
  meter". When the vibe holds, the town *crystallizes*.
- **The door** turns two petitioners' *readings* into an R. Agree and it opens;
  disagree and they go talk it out. It never splits the difference.
- **The cellar** reduces a little interaction net to its simplest form, then
  *deals the same hand backwards* and shows you the answer is the same either way.
- **The gallery** folds a resident's 16-number portrait down to 4 and shows how
  much survives.
- **The mood bar** nudges a resident toward a mood — and you watch their
  vocabulary and their wander drift with it.
- **The tab** is the town's memory: every event above lands here as a receipt.
- **The board** notices when something keeps happening and asks *you* to sign off
  before it graduates. The town can spot a pattern; only you can promote it.

## Run it

It is a static page. Any of these work:

```bash
# 1. just open it
open index.html                 # (or double-click it)

# 2. or serve the folder with anything
python3 -m http.server 8000     # then visit http://localhost:8000
npx serve .                     # or any static file server

# 3. or use the live copy
# https://intuition-labs-llc.github.io/j-town/
```

Drive it headless (no browser needed):

```bash
node --test "test/*.test.js"    # the falsifier suite (50 tests)
node selftest.mjs               # no-external-requests grep + boot + R curve + confluence
```

```js
import { createTown } from './src/town/index.js';
const town = createTown({ seed: 42 });
for (let i = 0; i < 200; i++) town.tick();     // advance 200 j-time τ
town.act({ type: 'orderMood', id: 'res-00', mood: 'ember' });
town.act({ type: 'tapResident', id: 'res-05' });
console.log(town.state.R, town.state.ledger.rows[0]);   // the vibe + the newest receipt
```

Controls in the browser: **PAUSE / STEP / RESET**, a **seed** box, the **mood**
buttons (steer the featured resident), **TAP** (knock a resident out of phase),
and a **signoff** button on each board candidate. Click a resident to tap it;
arrow keys cycle the featured resident; every control is keyboard-reachable.
With `prefers-reduced-motion` the town starts paused — use **STEP**.

## The map: venue → mechanism → package → law

| venue | mechanism | which R | package | the law it embodies |
|---|---|---|---|---|
| **The Plaza** | phase coupling → order parameter | `kuramotoR` | `@intuitionlabs/jspace` · kuramoto | L1 — kuramotoR is phase coherence, never another gate |
| **The Door** | agreement of readings → commit gate | `agreementR` | `@intuitionlabs/jspace` · agreement | L-agree / L6 — disagreement is escalated, never fused |
| **The Cellar** | interaction-net reduction to normal form | — | `@intuitionlabs/jspace` · inet | confluence — order is a lever, not the answer |
| **The Gallery** | Matryoshka fold 16 → 8 → 4 | `glueR` | `@intuitionlabs/sheaf` · fold | L1 — glueR is fold fidelity, never another gate |
| **The Mood Bar** | contrast-set steering `h + αv` | — | `@intuitionlabs/jspace` · steer | honesty — a concept vector is a property of the contrast, not the model |
| **The Tab** | trace ledger, dedupe | — | `@intuitionlabs/jspace` · trace | receipts speak for themselves |
| **The Board** | trace → loop → … → skill | Γ_sys | `trace-foundry` · graduation | L8 — detection never promotes; your signoff is Γ_ext |

"The interaction is the object." The four R's are kept strictly apart — that's
L1, and it lives in the receipt data (every receipt names *which* R it carries),
not just in prose.

## Clone your own town

Everything you'd change lives in `src/town/`. The physics in `src/physics/` are
vendored twins of the foundry packages — leave them be (edit the package, not the
twin). To make it yours:

```
src/town/
  names.js      # the 48 resident handles
  residents.js  # how residents are seeded (phase, ω, position, 16-d portrait)
  plaza.js      # the gathering + coupling constants (tune the vibe)
  door.js       # who petitions, and how often
  cellar.js     # the interaction-net gadget the cellar reduces
  gallery.js    # which fold stages the portrait passes through
  moods.js      # the moods, their vocab, and the steering strength
  board.js      # the graduation ladder + the double gate
  index.js      # createTown — the tick loop that wires it all together
```

Add a venue by following the pattern any existing one already sets: read a
population, compute an R, gate it, mint a receipt with the right scalar name. The
headless test suite (`test/`) will hold your town to the same laws this one keeps.

Two rules keep a clone honest:

1. **It boots deterministically.** Same seed, same town — the whole thing is
   driven by one seeded PRNG (`mulberry32`). No `Date.now`, no `Math.random`.
2. **It makes no external requests.** `node selftest.mjs` greps for that and
   fails if you slip one in.

## Repo layout

```
index.html            the shell (canvas + DOM), full-bleed town map
src/render.js         the Canvas-2D + DOM driver (browser-only; imports the town)
src/physics/*.js      vendored twins of the foundry math (kuramoto, agreement,
                      fold, inet, steer, trace, rng) — DOM-free, browser-safe
src/town/*.js         the town itself — pure, seeded, tick-based, DOM-free
test/*.test.js        node:test falsifier suite (drives the same modules)
selftest.mjs          no-external-requests grep + boot + R curve + confluence
```

The load-bearing design: the **entire** town is pure, seeded, and DOM-free, so
`node --test` drives exactly the code the browser renders. The page is a thin
shell; the town is a library.

## Credits

- **steeropathy** — the resident roster is led by `ember`, `nova`, `quill`, and
  `atlas`, a quiet homage; and the mood bar's honesty line, *"a concept vector is
  a property of the contrast you chose, not of the model"*, is steeropathy's.
  (github.com/moudrkat/steeropathy, MIT.)
- **//ZERO design language** — the near-monochrome mono aesthetic, the dashed
  |ψ⟩ circle, the concentric crystallization rings, the `//FIG` captions.
- **the foundry** — jspace (the physics), the sheaf (the fold), and the one
  mechanism they all instance. See `github.com/Intuition-Labs-LLC/jspace`.
- **the ideas cited, never copied**: interaction nets (Lafont; HVM2, Higher
  Order Company), the Kuramoto model (Y. Kuramoto, 1975), Matryoshka
  Representation Learning (Kusupati et al.), and the global-workspace reading of
  interpretable directions (Transformer Circuits Thread, 2026).

## License

AGPL-3.0-or-later · © 2026 Intuition Labs LLC. See [LICENSE](./LICENSE).

The dashed |ψ⟩ circle and the concentric rings are a visual language, not a claim
about quantum states. The physics here is classical: phase coupling, agreement,
folding, and net reduction.
