# CubeDB — Rubik's Cube algorithms and trainers

[![Live demo](https://img.shields.io/badge/live%20demo-rubik--cube--3d.rubik--cube--3d.workers.dev-007acc?style=for-the-badge)](https://rubik-cube-3d.rubik-cube-3d.workers.dev/)

**Try it live → https://rubik-cube-3d.rubik-cube-3d.workers.dev/**

A local-first speedcubing site: 57 OLL and 21 PLL cases with the algorithms
people actually use, timed trainers, two-sided PLL recognition, a cross
trainer, and a replay-verified scramble analyzer. The original 3D cube with a
**real two-phase solver** (no faked algorithms) still lives at `/3d`. Everything
is plain HTML/CSS/ES modules — no build step and no tracking.

![cube preview](shots/02_after_scramble.png)

## Run it

```
node server.mjs          # or npm start
# →  http://localhost:8000
```

Open in a modern desktop or mobile browser. No build step, no bundler, no
`node_modules`. Three.js is vendored in `vendor/`.

For the fastest first-run startup, generate the solver's pre-computed
PDB tables once:

```
npm run pregen      # phase-1 pairwise PDBs + CS + ES (~8 MB, ~1 s)
npm run pregenCE    # joint corner-class x edge PDB (111 MB, ~15 min, once)
```

The worker needs `data/jointCE.pdb` + `data/jointCE_qsym.pdb` for the fast
path. Without them it still solves exactly, but with a weaker phase-2
heuristic: **a few seconds per solve instead of milliseconds** — that fallback
is the only noticeably slow path, so keep those two files if you can.

The PDB tables in `data/` are generated output (git-ignored), and both pregen
scripts rewrite `data/pdb_meta.json`: size + FNV-1a hash + the `tablesVersion()`
that the file was built for. The worker fetches that manifest first, then fetches
`/data/<name>.pdb?v=<v>` and drops any file whose stamped `v` is stale for the
current code or whose bytes hash differently — it rebuilds those tables locally
instead of pruning with wrong distances. `/data/*.pdb` is served with a year of
immutable caching (only `?v=` busts it), `data/pdb_meta.json` stays `no-cache`
because it carries the version. If you change the move table, the coordinates,
or a pregen script, re-run **both** pregen scripts so every file gets the new
`v`.

The PDB tables are git-ignored. A fresh clone still works: the browser builds
the exact fallback tables on first use. Self-hosted deployments that want the
fast path can run `npm run pregen && npm run pregenCE` on the host, or ship
`data/` out-of-band. The small curated JSON in `data/algdb/` and
`data/cases/keys/` is checked in, so the database and trainers work everywhere.

Cloudflare Workers cap one static asset at **25 MiB**, so `.assetsignore` omits
the 111 MB `jointCE.pdb` from that deployment; the 3D page detects the missing
table and uses the exact fallback. Put `npm run check` in CI for the
full-table/self-hosted path — it exits 1 when `jointCE.pdb` is missing, stamped
for another code version, or hashed differently.

```
node tests/pregen_two_phase.mjs   # phase-1 pairwise PDBs + CS + ES (~8 MB)
node tests/pregen_jointCE.mjs     # joint corner-class x edge PDB (111 MB, once)
node tests/pdb_manifest.mjs       # re-stamp data/pdb_meta.json for files on disk
```

## Deploy

The Worker `rubik-cube-3d` serves the built `dist/` tree:

```
npm run dist
npx wrangler deploy
```

Live: **https://rubik-cube-3d.rubik-cube-3d.workers.dev/**

`.assetsignore` excludes only `data/jointCE.pdb` so the upload fits Cloudflare's
25 MiB per-asset limit. Everything else — the SPA, curated datasets, styles,
and the smaller pre-computed tables — is deployed normally.

## Controls

| Input                | Action                                                          |
| -------------------- | --------------------------------------------------------------- |
| Click `Scramble`     | New WCA-style 20-move scramble; also freezes the clock          |
| Click `Solve`        | Ask the solver worker (waits if the cube is mid-animation)      |
| Click `Cancel`       | Aborts the solve via shared memory (hidden when SAB is denied)  |
| Click `Undo` / `Redo`| Step through history / redo stack (undo takes back the last applied move, queued moves are dropped) |
| Click `Reset`        | Snap back to solved (clears history)                            |
| Click `Start`        | Timer mode: count down from the time you set                     |
| Click `Stop`         | Freeze the running countdown (button hidden until it runs)       |
| Click `− 5s` / `+ 5s`| Change the time in the timer — 1s…10min, works mid-run too       |
| Click `?` / press `H`| Toggle the in-app help overlay                                  |
| Drag / pinch         | Orbit / zoom the camera — unlimited 360° in any direction (mouse or touch) |
| `U D L R F B`        | Turn the face **relative to your current point of view** — they follow the camera, so no `y` rotation is needed first; shift = inverse; hold `2` = double |
| `M E S`              | Middle-slice turns, always absolute; shift = inverse; hold `2` = double |
| `x y z`              | Whole-cube rotations, always absolute (same inverse / double rules) |
| `Ctrl+Z` / `Ctrl+Y`  | Undo / Redo                                                      |
| `Esc`                | Reset                                                            |

Holding a face key is capped: the queue keeps at most 24 queued moves, so key
repeat cannot build an unbounded queue (dropped moves never enter history). The
help card owns the screen: while it is open, face keys and `Esc` do nothing and
only `H` toggles it.

The centre cubie of the face you are looking at blinks, and the status bar
shows the current front face. Solving the cube fires a confetti burst and a
"GG" popup, and freezes the countdown; clicking `Solve` freezes it too (letting
the solver work is not a timed run). Running the countdown out to 0:00 pops a
red "TIMEOUT" with the same animation as "GG".

All input is queued; you can hold keys down and rapid inputs do not corrupt
the animation state.

## Architecture

```
index.html                # entry point, import-map for `three`
styles.css                # base tokens + the 3D view
styles/                   # SPA chrome, database and trainer styles
vendor/                   # three.module.js + RoundedBoxGeometry.js, vendored
data/algdb/               # curated OLL/PLL datasets (tracked)
data/cases/keys/          # recognition keys (tracked)
src/
  constants.js            # geometry, colours, timing, camera defaults
  moves.js                # Singmaster parser + 24 exact integer rotation
                          # matrices + face/slice/whole-cube move tables
  CubeState.js            # 27 cubies, integer pos ∈ {-1,0,1}³, exact 3×3
                          # rot matrix; applyMove, isSolved, fingerprint, clone
  Scrambler.js            # 20-move WCA-style scrambler
  Solver.js               # two-phase (Kociemba-style) solver + PDB builders
  solver.worker.js        # Web Worker: fetch prebuilt PDBs (or rebuild),
                          # run two-phase search, post progress + cancellation
  Cubie.js                # one rounded cubie ( RoundedBoxGeometry body
                          # + offset sticker quads)
  Cube.js                 # 27-cubie scene, animation queue, undo/redo
                          # history, snap-to-logical after each turn
  Timer.js                # countdown: user-set time, Start/Stop, readout
  CameraRig.js            # orbit / zoom / pinch on a fixed-radius arc
  InputController.js      # keyboard + pointer input, queues moves to Cube
  UI.js                   # DOM buttons, status line, solved badge, help
  main.js                 # wires everything; owns the worker; SAB cancel
data/                     # curated JSON (tracked) + generated PDB files (ignored)
tests/
  logic.test.mjs          # 11 assertions across moves, states, solver
  solvecheck.mjs          # 34 two-phase solved-state checks (face, slice,
                          # whole-cube-prefix, solved-input cases)
  solvecheck2.mjs         # 18 seeded 20-move scrambles, replay-verified
  solver_e2e.mjs          # verify v1 optimal solver for len 2..10 (legacy)
  pregen_two_phase.mjs    # writes phase-1 pairwise + CS + ES PDBs
  pregen_jointCE.mjs      # writes the 111 MB joint PDB + qsym table
  pdb_manifest.mjs        # stamps data/pdb_meta.json (v + hash) the worker checks
  validate_jointCE.mjs    # independent BFS check of data/jointCE.pdb
  undo_browser.mjs        # Playwright: undo/redo against queued moves
  ux_browser.mjs          # Playwright: Solve-while-busy, key cap, help card, clock
  pdbvalidate.mjs         # Playwright: manifest v/hash gates the fetched PDBs
  interact.mjs            # Playwright browser interaction test
  solvebrowser2.mjs       # Playwright: scramble → Solve → badge checks
  scratch/                # ~90 exploratory one-off scripts (not part of npm test)
```

### Logical state (authoritative)

Every cubie carries an **exact 3×3 integer orientation matrix** and a
**discrete position** in `{-1,0,1}³`. Moves are applied by integer matrix
multiplication. Floating-point rotations are only for animation; every
commit snaps visuals back from the logical state.

### Rendering

- 27 individual rounded-box cubies (dark body, six coloured sticker quads
  offset from the body).
- Turn animation uses a temporary pivot group: affected cubies are
  attached → tweened with `smootherstep` → detached → snapped from
  logical state.
- Camera: perspective, fov 40°, fixed target, quaternion orbit (no poles),
  pinch-zoom clamped to 4.6–13 units.

### Solver

The solver is a real two-phase (Kociemba-style) search, run in a Web
Worker:

**Phase 1** — IDA\* over three coordinates (twist 3⁷, std-Gauge flip 2¹¹,
ud-slice C(12,4)=495) pruned by **three pairwise PDBs**:

| PDB (phase 1)        | Size        | Key                                   |
| -------------------- | ----------- | ------------------------------------- |
| twist × flip         | 4,478,976   | exact distance, 18 face moves         |
| twist × ud-slice     | 1,082,565   | "which 4 edges live in the E slice"   |
| flip × ud-slice      | 1,013,760   | pairwise exact                      |

Phase 1 iterates bounds and collects up to 12 candidate prefixes (one per
bound), sorted by `L + h2`.

**Phase 2** — IDA\* in the phase-2 subgroup (G1 = U U' U2 D D' D2 L2 R2
F2 B2) over corner-permutation rank (8!), edge-permutation rank (8!) and
E-slice 4! ranks, pruned by:

| PDB (phase 2)                | Size      | Key                                        |
| ---------------------------- | --------- | ------------------------------------------ |
| joint corner-class × edge    | 111,605,760 | 2768 D4h corner classes × 8! edge perms (exact, ≤18) |
| corner-perm × slice          | 967,680   | exact                                      |
| edge-perm × slice            | 967,680   | exact                                      |

Because the phase-1 flip coordinate uses the standard UD gauge, the phase-1
goal set (tw=0, flip=0, ud solved) is closed under G1, so the phase-2 search
is exact rank arithmetic (no per-node state tracking) and every returned
sequence is replay-verified against the authoritative logical state before
being sent to the UI.

The solver:

- Detects real whole-cube rotation from the **center positions** (not center
  rotations — face turns rotate face centers locally) and canonicalises the
  state with a shortest `x/y/z` prefix before searching.
- Never relies on memorised OLL / PLL: everything is PDB lookups + IDA\*.
- Returns near-optimal sequences (`optimal: false`; total is usually
  optimum +0–3). The v1 optimal-IDA* solver is kept in git history only.
- Cancellation is via a **SharedArrayBuffer** (`Int32Array(1)`) that both
  DFS loops poll every 131,072 nodes.

### Measured performance

| State                             | Time / notes                                    |
| --------------------------------- | ----------------------------------------------- |
| All PDBs built from scratch       | ~1s (without the 111MB joint PDB)               |
| jointCE PDB precompute (Node)     | ~15 min, one-time                               |
| PDB fetch (browser, `data/` pre-generated) | ~1s                                        |
| 2-move scrambles (all 243+ states) | ≤ 1 ms                                          |
| ≤10-move scrambles                | ≤ 100 ms                                        |
| 20-move scrambles (38 tested)     | **1–13 ms**, avg solution 23.3 moves, all replay-verified |

The 20-move cost is no longer fundamental: with the exact joint PDB the
phase-2 heuristic is within 0–2 of the true distance, so 20-movers solve in
single-digit milliseconds.

## Cross-thread cancellation

Web Worker `onmessage` cannot interrupt a tight synchronous DFS, so the
Cancel button uses `SharedArrayBuffer`. The main thread writes `flag[0]=1`;
the worker's DFS polls `cancelRef[0]` every 131,072 nodes. **`SharedArrayBuffer`
is only enabled when the page is cross-origin-isolated**, so `server.mjs`
sends:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

which sets `crossOriginIsolated = true`. Without those headers (any other static
host) there is no way to interrupt the search: the Cancel button stays hidden and
the status line says "cannot be cancelled here", so the solve runs to completion.

`server.mjs` also answers `400` for a malformed URL (`/%zz` used to throw inside
the handler and Node exited, taking the whole server down) and `500` when a file
cannot be opened after the stat; `HEAD` and `416` never open the file at all, so
the probes every CDN/updater sends cannot leak descriptors until the process
dies with `EMFILE`. A stream that fails mid-read just ends the response, so the
`Content-Length` mismatch tells the client the transfer was truncated.

## The multi-page app (router, datasets, trainers)

The site is one document plus a router: `src/app/app.js` resolves the path in
`src/app/router.js`, loads that route's page module through
`src/app/routes.js`, and paints the shell (`src/app/shell.js`). A page module
is imported only for the route you opened, so `/t`, `/cross`, `/analyze` and
the case pages never touch Three.js — the gate is
`tests/nothree.test.mjs`, which reads the import graph from the source.

| Path | Page |
| --- | --- |
| `/` | CubeDB home: trainer tiles, set tiles, featured cases, search |
| `/3d` | the cube (the only route that loads `vendor/three.module.js`) |
| `/a`, `/a/:puzzle`, `/a/:puzzle/:set`, `/a/:puzzle/:set/:case` | index → sets → cases → card |
| `/t` | algorithm trainer (case picker, 200 ms Stackmat gate, times in the store) |
| `/t/pllrecog` | 2-sided PLL recognition drill (masked nets, scored) |
| `/cross` | cross trainer, difficulty 1–7 (length is proved by the BFS) |
| `/analyze` | scramble analyzer (counters + verified solutions) |
| `/Beginner`, `/algsheet`, `/settings`, `/privacy` | guide, personal sheet, theme, privacy |
| anything else | in-app Not Found page, inside the shell |

Unknown paths are answered by the server with `index.html` (`server.mjs`, for
extension-less paths only) and by Cloudflare with
`"not_found_handling": "single-page-application"` in `wrangler.jsonc`, so the
router — not the browser — decides what an unknown URL means. `tools/build_dist.mjs`
copies `index.html`, `styles.css`, `styles/`, `favicon.svg`, `_headers`, `src/`,
`vendor/` and `data/` (JSON + any prebuilt PDB tables) into `dist/` and writes
`dist/manifest.json` with the sizes and hashes.

**Datasets** live in `data/algdb/3x3/{OLL,PLL}.json` plus
`data/algdb/3x3/index.json`, built by `npm run dataset` (`tools/gen_dataset.mjs`).
OLL is the 57 orientations; PLL is stored as **21** named speedcubing classes
(under pre- and post-AUF equivalence, `q = Uᵃ · p · Uᵇ`).
Each case stores `setup` (the inverse of its standard algorithm), the sticker
net, and every algorithm with htm/qtm/etm/stm/gen. `tools/validate_algs.mjs`
re-checks all of it — setup against the stored stickers, each algorithm by
solving the case it is attached to, the four metrics recomputed, and no two
cases in a set sharing a recognition hash — and exits non-zero if any is wrong.
Recognition keys live in `data/cases/keys/{OLL,PLL}.json` (`npm run keys`).

**Nothing is sent anywhere.** Times, sessions, progress and the personal sheet
live in `localStorage`, keyed by namespace (`session:3x3/OLL`, `progress:3x3/OLL`,
`sheet:3x3/OLL`, `history:3x3/PLL`, plus the theme in `settings:*`). The privacy
page (`/privacy`) lists those stores and says so; there is no analytics, no
advertising, no tracking scripts and no cookies.

## Tests

```
npm test                        # orientation, logic, solvecheck, timer, nxn, analyze,
                                # router, nothree, dataset validator
node tools/validate_algs.mjs    # 78 cases, 78 algorithms, 0 problems
node tests/nxn.test.mjs         # 2x2..5x5 engine: layers, states, scramble+inverse
node tests/spa_browser.mjs http://localhost:9123/ spa_shots
                                # Playwright: 17 routes render in the shell, and the
                                # non-3D routes never request three.module.js
```

## Notes on Windows

`package.json` sets `"type": "module"` so Node can resolve the relative ESM
imports (`import { CubeState } from './src/CubeState.js'`). All browser code
uses `script type="module"` and the import-map in `index.html` maps
`"three"` → `./vendor/three.module.js`.

## References

- Singmaster notation. Face moves U/D/L/R/F/B with prime and double.
  Slice M/E/S. Whole-cube x/y/z.
- Colours: +Y white, −Y yellow, +X red, −X orange, +Z green, −Z blue.
- `R24` = 24 rotation matrices generated from R24 generators using
  integer 3×3 matrices with determinant +1.
