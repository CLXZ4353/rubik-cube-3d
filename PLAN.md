# PLAN.md — "CubeDB": a speedcubedb.com clone built on top of the Rubik's Cube 3D app

> Implementation plan. Every phase lists concrete tasks (files, responsibilities),
> acceptance criteria and the tests to write. Estimates are in "person-days" and are
> meant only for ordering: the plan is designed to be executed in order.
>
> **Sources**: direct analysis of the local repository + verified inventory of the public
> speedcubedb.com site (pages, markup, JS bundles, AJAX endpoints).

---

## 0. Summary

| Phase | Topic | Estimate | Priority |
| ----- | ----- | -------- | -------- |
| 0 | Foundations: SPA, router, layout, theme, storage, search | 2.5 d | P0 |
| 1 | `/t` Algorithm Trainer: seed datasets + case drill + timer + session | 6 d | P0 |
| 2 | Generalized puzzle engine (N×N) + 2×2 | 5 d | P0 |
| 3 | Algorithm database: datasets, `/a/...` pages, filters, progress | 7 d | P0 |
| 4 | Recognition engine (identifying the current case) | 5 d | P0 |
| 5 | `/t/pllrecog` 2-Sided PLL Recognition + `/cross` Cross Trainer | 4 d | P1 |
| 6 | `/analyze` Scramble Analyzer (cross/F2L/LL coverage) | 4 d | P1 |
| 7 | Accounts + cloud sync (optional) | 4 d | P2 |
| 8 | Advanced sets: ZBLL/CMLL/COLL/ELL/WV/SV, 4×4/5×5 parity, 2×2 Ortega | 7 d | P2 |
| 9 | Stretch: Pyraminx / Megaminx / Skewb / SQ1 | — | out of scope |

**Total estimate: ~44.5 days** for P0–P8 (of which ~16 d are dataset authoring/validation).

### 0.1 Shipped in this implementation pass

| Area | State | Evidence |
| ---- | ----- | -------- |
| Foundations (Phase 0) | **Done** | one shell per paint, real URLs + `pushState`/`popstate`, local-first store, theme, search, 404 page |
| OLL + PLL datasets (Phase 1/3 core) | **Done** | 57 OLL + 21 PLL cases with curated algorithms, verified by `tools/validate_algs.mjs` (0 problems) |
| `/a/:puzzle/:set` database (Phase 3 core) | **Done for OLL/PLL** | group + cross-colour filters, learnt/bookmark state, case pages, print/copy; other sets are explicitly "planned" |
| Recognition engine (Phase 4) | **Done for OLL/PLL** | `src/cases/` hashing + recognizer + case keys (78/78 reachable) |
| Trainers (Phase 1/5) | **Done** | `/t`, `/t/pllrecog` (all 21 answers), `/cross` (1–7 moves, 6 colours), hold-to-start timer, per-set stats |
| Scramble Analyzer (Phase 6) | **Done** | verified-only counters, shareable URLs, six colours, cross depth 3–7, 8 s budget, OLL/PLL/LL-skip filters |
| Beginner/privacy/settings/sheet | **Done** | `/Beginner`, `/privacy`, `/settings`, `/algsheet` |
| N×N engine (Phase 2) | **Engine done, sets not shipped** | 2×2/4×4/5×5 moves and engine tests pass; `/a/2x2` and friends show an honest empty state |
| Accounts/sync (Phase 7) | Not started (optional) | local-only by design |
| Advanced sets (Phase 8), stretch (Phase 9) | Not started | listed as planned in the UI |

**Gates now run:** `npm test` (engine, solver, trainer timer, N×N, analyzer, router, nothree, dataset validator) and
`node tests/spa_browser.mjs http://localhost:9123/` (every SPA route, single shell, scroll, `/3d` isolation, no missing assets).

---

## 1. Analysis of the base repository

### 1.1 What exists today

Repo: `C:\Users\stefa\Desktop\mio_plugin\workspace\rubik` — a **static** app, no build step,
vendored Three.js, deployed on Cloudflare Workers (static assets).

```
index.html            # entry point + import-map for "three"
styles.css            # dark theme UI overlay
server.mjs            # static Node server (COOP/COEP for SharedArrayBuffer)
wrangler.jsonc        # Cloudflare Workers static-assets deploy config
vendor/               # three.module.js + RoundedBoxGeometry.js
src/
  constants.js        # geometry, colors, timing, camera
  moves.js            # Singmaster parser + 24 exact integer rotation matrices
  CubeState.js        # 27 cubies, pos ∈ {-1,0,1}³, exact integer 3×3 rot
  Scrambler.js        # 20-move WCA-style scrambler
  Cube.js             # 3D scene, animation queue, undo/redo, scramble/solve
  Cubie.js            # one cubie (rounded body + stickers)
  CameraRig.js        # orbit/zoom/pinch
  InputController.js  # keyboard + pointer input
  UI.js               # buttons, status, badge, help overlay
  Effects.js          # confetti + "GG"/"TIMEOUT" popups
  Timer.js            # countdown (NOT a speedcubing timer)
  Orientation.js      # view-relative face mapping
  Solver.js           # 2-phase (Kociemba-style) solver + PDB builders
  solver.worker.js    # Web Worker: fetch PDBs + search + SAB-based cancel
data/                 # pre-generated PDBs (~120 MB, git-ignored)
tests/                # unit (node) + E2E (Playwright) + ~90 scratch scripts
```

### 1.2 Strengths to reuse

- **Exact, float-free logical engine**: `CubeState` + `moves.js` use integer 3×3 matrices.
  This is the right foundation for scramblers, recognition, cross/F2L planners and datasets.
- **A real and fast 3×3 solver**: 2-phase with PDBs, ~1–13 ms on 20-move scrambles.
  It is needed to (a) generate scrambles, (b) **validate every algorithm in the datasets**,
  (c) implement the Cross Trainer and Scramble Analyzer planners.
- **High-quality 3D rendering**: 27 rounded cubies, pivot-based animations, confetti, lights.
  It replaces the original site's `cubedb-ftw` (three.js) viewer.
- **No build step**: the "vanilla ESM + import-map" architecture is an advantage when
  replicating a multi-page site without tooling.
- **Robust static server**: `server.mjs` handles ranges, errors, COOP/COEP and streaming.

### 1.3 Gaps versus speedcubedb.com

| Area | Current state | Needed for the clone |
| ---- | ------------- | --------------------- |
| Navigation | single page | multi-route SPA (`/t`, `/a/3x3/OLL`, `/analyze`, `/cross`, …) |
| Trainer | a countdown, not a drill | case selection, scramble generation from the case, stackmat timer, session |
| Datasets | none | hundreds of cases with setup + algs + metadata + previews |
| Recognition | absent | case hashing (OLL/PLL/CLL/EO/EP) and lookup |
| Persistence | none | progress, personal sheets, sessions (localStorage → cloud) |
| Puzzles | 3×3 only | 2×2 (full), 4×4/5×5 (parity), others (out of scope) |
| Notation | 3×3 moves only | wide/slice/rotations for N×N, ETM/STM/HTM metrics, "gen" |
| Previews | 3D only | 2D/SVG case previews (sticker strings) + cache |
| Search | none | global client-side search (~230 entries) |
| Extras | none | dark mode, printing, sharing, deep links with parameters |

### 1.4 Constraints to respect

- No bundler: native ESM, import-map, vendored Three.js.
- `npm test` must stay green and fast (< 30 s).
- Static deploy must keep working; moving to a **Worker with bindings** (KV/D1) is possible
  without breaking it (`assets` + `not_found_handling: "single-page-application"`).
- No new runtime dependencies if avoidable; tests with `node` (assert) + the existing Playwright.

---

## 2. Verified inventory of speedcubedb.com (the target)

> The clone **does not copy code** (the site's bundles are obfuscated with
> `javascript-obfuscator`) nor proprietary datasets: it replicates the *behaviour* and
> rebuilds the datasets from public sources, validated by `tools/validate_algs.mjs`.

### 2.1 Structure, routing, navigation

Server-rendered site (Apache + PHP) with `<base href="/">` everywhere; URL scheme:

| URL | Purpose |
| --- | ------- |
| `/` | Home: search hub + grid of puzzle/tool categories |
| `/a/{Puzzle}` | Dataset index for the puzzle (tiles with cube thumbnail and `0/N` badge) |
| `/a/{Puzzle}/{Set}` | Case listing for the set |
| `/a/{Puzzle}/{Set}/{Case}` | Case permalink (e.g. `/a/3x3/OLL/OLL_1`) |
| `/t` | **Algorithm Trainer** (drill + timer) |
| `/t/pllrecog` | 2 Sided PLL Recognition |
| `/cross` | Cross Trainer |
| `/analyze` | 3x3 Scramble Analyzer |
| `/SQ1/Trace` | SQ1 CSP Tracing Tool |
| `/Beginner` | Beginner's method guide |
| `/algsheet/{userid}` | Personal algorithm sheet |
| `/reviews`, `/reviews/{cube}` | Hardware reviews (**out of scope**) |
| `/privacy` | Privacy policy |
| `/sso.php` | Google OAuth callback |

Navigation: top bar with logo + dark-mode toggle + login button; everything else goes
through a **search box** (≈230 entries in a `searchdata` array injected inline) with
special-case redirects (`pll`/`recog` → `/t/pllrecog`, `cross` → `/cross`,
`practice|train|trainer` → `/trainer`, puzzle aliases `33|3x3` → `/a/3x3`, …). Every page
shows a "search-category" grid (3x3, 2x2, 4x4, 5x5, SQ1, Megaminx, Pyraminx, Skewb,
Practice, Scramble Analyzer, 2 Sided PLL Recognition, Cross Trainer, SQ1 CSP Tracing Tool).

Footer: `Created By … | Privacy Policy | Donate`.

### 2.2 `/t` — Algorithm Trainer (NOT a WCA timer)

**Key point**: on the original site `/t` is an *algorithm drill trainer*, not a
competition timer. There is **no inspection phase** anywhere (grepping `inspect` across
every bundle returns zero hits). The only "inspection-like" behaviour is the 200 ms
space-bar hold gate on the timer.

- **Selectors**: puzzle (`3x3`, `2x2`, `SQ1`, `Pyraminx`) and category
  (3x3: PLL, OLL, F2L, ZBLL, WV, VLS, COLL, CMLL, SBLS, ELL, Anti-PLL, SV;
  2x2: Ortega OLL, Ortega PLL, CLL, EG1, EG2; SQ1: Cube Shape, EO, EP; Pyraminx: L4E).
- **Buttons**: `Start Training`, `Select Algs`, `New Case`.
- **Case selection**: per set a `.settopractice` block with "Select Set"; for
  super-categories also `.catstopractice` blocks with "Select Cases"; per case a checkbox
  with a thumbnail. A case becomes `practiced` once solved, and practised cases are
  **excluded from the random draw** (`.algscheckbox:checked:not(.practiced)`).
- **Data**: `POST /timerdata.ajax.php?d=5` with `cat={category}&supercat={true|false}` →
  a JSON array of rows:
  `[algid, setName, caseName, [alts…], subgroup, imageHTML, puzzle, casePath]`
  where the last array element is the user's **"learnt" map** (removed client-side with
  `algdata.pop()`). Verified: `cat=OLL` → 58 rows (57 cases + map), `cat=PLL` → 22,
  `cat=ZBLL&supercat=true` → 473, `cat=VLS&supercat=true` → 190.
  For SQ1 the `[3]` payload is a coordinate string (`"0,-4 / -2,-5 / 6,-3 …"`).
- **Case/scramble generation**:
  - PLL/OLL-style cases → a random alternative of the case is picked; for **PLL** a random
    PLL is appended plus a random `U/U2/U'` (AUF);
  - F2L/VLS-style cases → a random F2L/VLS alg is prepended;
  - the displayed "Scramble" is the **inverse** of the chosen algorithm (`InverseMoves`);
  - 2×2/Pyraminx → a 3×3 state is built, the alg is applied, the U layer is randomized and
    the job is delegated to the `falcor.js` worker
    (`{type:'solve', cube, maxDepth:20, maxTime:15}`);
  - case identification uses hashes (`getKHash`, `getReidHash`, `getNormalizedHash`,
    `getOLLHash`, `getCMLLHash`, `getCOLLHash`) plus `PLLDictionary`/`OLLDictionary`.
- **Timer**: `keydown Space` → `startTime = Date.now() + 200`, overlay shows `0.00`;
  `keyup Space` → if a run is in progress the result is recorded and the next case is
  generated; otherwise, **if the bar was held for ≥ 200 ms the timer starts**, if not the
  press is cancelled. Display format `seconds.milliseconds` (`0.00`, `12.34`).
  Touch equivalents on `#stopwatch-display`.
- **Result**: a `.stopwatch-result` div carrying `data-result`, `data-curralg`,
  `data-algid`, `data-algname`, `data-scramble`, `data-type`.
- **Statistics panels**: `#singlestat-panel` (Result, Case, Scramble, Solution) and a
  `Statistics` panel listing the **raw results** with a trash button
  (`#timer-clear-session`). **No aggregate statistics** (no best/average/ao5) and **no
  session persistence** (memory only).
- **Persistence**: `localStorage` is used in exactly one place on the whole site, key
  `"<puzzle>,<category>"` (e.g. `"3x3,PLL"`) → a comma-separated list of
  practised/learnt case indices. The per-algorithm "learnt" status is **server-side**
  (`uservote.ajax.php`).

### 2.3 `/a/{Puzzle}/{Set}` — anatomy of a set page

Toolbar:
- print button (`.no-print` + a print footer);
- **Cross Color** (`[data-cross-orientation]`): White `z2`, Yellow ``, Green `x'`, Blue `x`,
  Red `z`, Orange `z'`;
- **Related Sets** (e.g. OLL → COLL, WV, SV);
- **filters** `a[data-filter]`: chips with a cube thumbnail + `0/N` badge + label.
  For OLL: All Corners Oriented 2, Awkward Shapes 4, C Shapes 2, Dot Case 8, Fish 4,
  Knight Move 4, L 6, Lightning 6, Line 4, OCLL 7, P 4, Square 2, T 2, W 2 → **57**.

Case blocks `.row.singlealgorithm` with `data-subgroup` and `data-alg`:
- preview `<div class="jcube" data-width="75" data-height="75" data-rank="3" data-us=… data-ub=… data-uf=… data-ul=… data-ur=…>` (for SQ1 `.sqcube` with `data-tr/br/t/b`, for Pyraminx `.pcube`, for Skewb `.scube`);
- title linking to the permalink, plus a share button;
- breadcrumb `3x3 - OLL - Dot Case`;
- **setup** line (absent for 2×2/Ortega);
- **Standard Alg** panel;
- **orientation tabs** `div[data-ori='0'|'1'|…]` holding the alternatives.

Each alternative (`li.list-group-item`):
- show/hide toggle;
- `.formatted-alg` text;
- **Learnt Status** widget (3 states: 0/1/2) and **Bookmark** (star);
- expandable `.alg-details` panel with: the 3D viewer (`cubedb-ftw`, three.js, with
  `data-alg`, `data-stickering`, `data-setup`, `data-crosscolor`), an optional YouTube
  thumbnail, **Community Votes** (counter), **Movecount** (`11 ETM`, `11 STM`) and
  **Face Moves** (`3GEN (R U F)`);
- a **"More Algorithms"** button → `GET category.algs.php?algname=…&cat=…` appending more HTML.

Community actions (all via `POST uservote.ajax.php` with `userid`, `algid`,
`alternativeid`, `sessid` + `learnt|bookmark|hide|vote`): "learnt", "bookmark", "hide",
"community vote", and submitting an alternative algorithm (`addalternative.ajax.php`).

### 2.4 `/t/pllrecog` — 2 Sided PLL Recognition

- Embedded YouTube explainer; options `Show Hints` (on) and `Show Timer` (on);
- **Cross Colors**: 6 checkboxes with `data-ori` (White `z2`, Yellow ``, Blue `x`,
  Green `x'`, Red `z'`, Orange `z`);
- **Select Cases**: 21 cases (Aa, Ab, E, F, Ga, Gb, Gc, Gd, H, Ja, Jb, Na, Nb, Ra, Rb, T, Ua,
  Ub, V, Y, Z) with thumbnails, plus `Select All`, `Select None`, `Show/Hide`;
- central area: `#practice_img` (150×150) + `Start!`/`Stop` + stopwatch `0.00`;
- **answer buttons**: one per case, each with a 150×150 thumbnail, initially disabled;
- **Performance History** (`#timerstats`): columns *Case | Results (Seconds) | Average
  (Seconds) | Successful Recognition | False Recognition*; wrong answers take the
  `btn-danger` class;
- the "2-sided" recognition is implemented by masking the last layer and comparing
  normalized hashes (`getNewPLLHash`, `getMaskedHash`, `getNormalizedHash`);
- **no persistence**: the history is in memory and lost on reload.

### 2.5 `/cross` — Cross Trainer

- `Cross Color` (6 options with a rotation), `Difficulty`: **1..7 Move Cross**;
- the list of cases to drill (`#algstopractice`);
- **Scramble** panel with `#scramble`, a `New Scramble` button and a link to a 3D viewer;
- **Suggested Cross Solutions** (`#suggested-solutions`, Show/Hide toggle): candidate
  solutions, each with copy / rotate / view buttons;
- the JS embeds solution tables named **F2L 1…41** and **AF2L 1…41** (standard F2L and
  Advanced F2L) with sticker strings and algorithms, plus the "xcross" case;
- the engine is an F2L search (`getF2LPairs`, `encodeF2LPair`, `maskFRPair`,
  `F2L_FL_HashTable` etc., `crossesFound`, `poststage`, `maxDepth`).

### 2.6 `/analyze` — 3x3 Scramble Analyzer

- `#scrambleinput` + an `Analyze` button;
- `#howfar`: **Full Solve** (default), `Cross+3`, `Cross+2`, `Cross+1`;
- 6 cross-colour checkboxes (all enabled by default);
- **four counters**: *Crosses covered*, *F2L pair solutions covered*,
  *Last layer solutions covered*, *Total solutions covered*;
- results with **filters**: `All Solves`, `Full Step`, `OLL Skip`, `PLL Skip`, `LL Skip`;
- each solution is a `.singleSolution` block with the sequence in a `<pre>` and inline
  comments (`// Inspection`, `// Pair 1`, `// OLL`, `// PLL`, `U // AUF`, `y`);
- implementation: the `earphones/ear.js` worker with
  `importScripts("hs.js","zbh.js","boohoo.js")`, a `BinaryHeap` with a score function,
  `NxNCrossPlanner` (IDA*/best-first per cross colour, with
  `sides = {Yellow:'', White:'z2', Blue:'x', Green:"x'", Red:'z', Orange:"z'"}` and
  `maxDepth = 7` per colour), `F2LPlanner`, `LLPlanner`; the **20 best** results per
  cross are kept.

### 2.7 `/SQ1/Trace` — SQ1 CSP Tracing Tool

Set scramble, counting positions Top/Bottom with `+`/`-`, Top/Bottom colours with presets,
and 7 outputs: scramble, B/W Corners, B/W Edges, White Corners, Black Corners, White Edges,
Black Edges. SVG rendering with per-piece polygons and dedicated colour maps.
Shareable URL: `/SQ1/Trace?scramble=…&topcolor=…&botcolor=…&top=…`.

### 2.8 Sets per puzzle (verified via sitemap + index)

- **3x3**: F2L (41), AdvancedF2L (41), OLL (57), PLL (21), COLL (40), WV (27), CMLL (42),
  SBLS (65), EO4A (9), AntiPLL (22), SV (27), ELL (25), FRUF (42), CLS (97), 1LLL, OLLCP,
  VLS (189), ZBLL (472) + variants ZBLLT/U/L/Pi/H/S/AS, Beginner Method.
- **2x2**: OrtegaOLL, OrtegaPBL, CLL, EG1, EG2.
- **4x4**: OLLParity, PLLParity. **5x5**: L2E, L2C. **6x6**: 6x6L2E, 6x6L2C.
- **SQ1**: SQ1CS, SQ1CO, SQ1EO, SQ1CP, SQ1Parity, SQ1EP, Lin.
- **Megaminx**: EO, CO, EP, CP, MegaminxOLL (37 named shapes), MegaminxPLL (A–Z).
- **Pyraminx**: L3E, L4E. **Skewb**: SarahsAdvanced.

### 2.9 Technical stack of the original site

- **Apache + PHP**, hand-written templates, no framework; `<?php echo fa-regular ?>` even
  leaks into the served markup (a template bug).
- **Server-side image rendering with an on-disk cache**:
  `/template/renderers/cache/<renderer>/<size>/<stickerstring>.png`; on the client there is
  `/includes/puzzleGen.min.js` (a **puzzle-gen** bundle: PNG/SVG/Canvas renderers,
  Simulator, Masks).
- **Client**: jQuery 3.6.1, Bootstrap 5.0.1, Font Awesome 6.5.1, svg.js 3.1.2,
  Swiper 9.4.1, Summernote 0.20, three.js 0.167 via import map + es-module-shims,
  the `twisty` player from cubing.net, lz-string, GA4, AdSense.
- **First-party scripts** (all obfuscated): `index.js` (search, dark mode, login),
  `trainer.js` (trainer), `category.js` (set pages), `crosstrainer.js` (137 KB),
  `twosidedpll.js` (47 KB), `csptrace.js` (50 KB), `earphones/*` (analyzer),
  `falcor.js` (scramble worker), `includes/ijsm.js` (**SVG cube previews**),
  `basketball.js` (201 KB, three.js 3D viewer).
- **API**: see §2.10.

**In the clone**: same structure/URLs, but a modern implementation:
- client-side routing (SPA) with identical URLs;
- case previews generated **by our renderer** (SVG/Canvas) from the **sticker strings**
  (same format as `data-us/ub/uf/ul/ur`), not from server-side PNGs;
- optional backend (Phase 7) on Cloudflare Workers + D1/KV + Google OAuth;
- no ads, no analytics, no obfuscated code reused.

### 2.10 API surface of the original site (to be re-implemented as the clone's internal API)

| Endpoint | Method | Parameters | Response |
| -------- | ------ | ---------- | -------- |
| `/timerdata.ajax.php` | POST | `cat`, `supercat` | array of case rows + the learnt map |
| `/uservote.ajax.php` | POST | `userid`, `algid`, `alternativeid`, `sessid`, `learnt\|bookmark\|hide\|vote` | `"success"` / `"fail"` |
| `/category.algs.php` | GET | `algname`, `cat` | HTML fragment with more alternatives |
| `/addalternative.ajax.php` | POST | `sugg`, `algid` | textual message |
| `/sso.php` | GET | `code` (OAuth) | redirect to `localStorage("comeback")` or `/` |
| `falcor.js` (worker) | postMessage | `{type:'solve', cube, maxDepth, maxTime}` | `{type:'solve', result}` |
| `earphones/ear.js` (worker) | postMessage | `{type:'analyze_scramble', data:{scramble, howfar, crosscolors}}` | `{finalSolutions:[…]}` |

### 2.11 Auth, progress, privacy

- Login = a **lightbox** with **Google OAuth** (code flow, scope `email profile`);
  "Sign In with WCA Login" is **struck through and disabled**, with the author's note.
- For a logged-in user the server computes the `0/N` progress badges, the "learnt" votes
  (3 states), bookmarks, hidden algorithms, community votes and the personal sheet
  `/algsheet/{userid}`.
- Client-side only: the `darkmode` cookie and the `"<puzzle>,<category>"` localStorage key.
- Privacy policy (20 August 2020): it does **not** mention GA, AdSense, cookies/localStorage
  nor Google OAuth data retention → **the clone must do better**: an explicit policy about
  what is stored locally versus server-side, and the fact that data never leaves the
  browser unless the user signs in.

---

## 3. Vision for the clone

### 3.1 Feature map: original → clone

| speedcubedb | Clone (CubeDB) | Reused from the base |
| ---------- | -------------- | --------------------- |
| `/` home with search + categories | Home with global search + category grid + 3D cube | `index.html`, `styles.css`, `Cube.js` |
| `/t` Algorithm Trainer | `/t`: case selection per puzzle/category, scramble generated from the case, stackmat timer, session | `Solver.js`, `Scrambler.js` |
| `/a/{puzzle}` | `/a/{puzzle}` grid of sets with `0/N` badges | new |
| `/a/{puzzle}/{set}` | `/a/{puzzle}/{set}` cases + group filters + cross colour + orientation tabs | new |
| `/a/{puzzle}/{set}/{case}` | case permalink: setup, standard alg, alternatives, "More Algorithms" | new |
| "More Algorithms" | lazy-loaded alternatives (analogous to the `?d=` chunking) | new |
| "Community Votes" / "Learnt" / "Bookmark" | static counters in the dataset + **local personal sheet** (learnt 0/1/2, star) | `store.js` |
| Movecount ETM/STM + `3GEN (R U F)` | `src/notation/metrics.js` | `moves.js` |
| Group filters with `0/N` badges | `group` field in the dataset + filters + progress badges | new |
| Cross Color (`z2`, `x`, …) | selector applying the setup rotation to the case | `CubeState.js` |
| 3D viewer per algorithm (`cubedb-ftw`) | **our own `Cube.js`** loading the case state | `Cube.js`, `Cubie.js` |
| `.jcube` previews (SVG, sticker strings) | `src/render/CubeNet.js` from sticker strings | new |
| `/t/pllrecog` | `/t/pllrecog`: 21 cases, hints, timer, success/false history | `Solver.js` + recognition |
| `/cross` | `/cross`: cross colour, difficulty 1–7, suggested solutions | `Solver.js` |
| `/analyze` | `/analyze`: coverage counters + commented solutions + filters | `Solver.js` + planners |
| Dark mode (cookie) | light/dark theme, persisted preference | `styles/app.css` |
| Printing | `@media print` for set pages | `styles/cases.css` |
| Sharing | deep links with parameters (`?case=`, `?scramble=`, `?color=`) | new |
| Google login + server progress | Phase 7 (Worker + D1 + OAuth) | — |
| Server-side PNGs | client-side renderer + IndexedDB cache | new |
| Global search box | `src/app/search.js` with a static index (~230 entries) | new |

### 3.2 Non-goals (explicit)

- **No WCA login** (the original dropped it: stay aligned).
- **No copying proprietary code/datasets**: datasets are rebuilt and validated; no
  obfuscated bundle is reused.
- **Hardware reviews** (`/reviews`) → out of scope.
- **Ads, Google Analytics, Funding Choices** → not reproduced (no tracking).
- **Multiplayer / live competition** → out of scope.
- **4×4/5×5 solvers** → out of scope (huge PDBs); for those puzzles: practice + parity sets.
- **Pyraminx, Megaminx, Skewb, SQ1** → out of scope for v1 (see Phase 9): they need
  completely different state models.
- **`/SQ1/Trace`** (CSP tracing) → part of Phase 9, not v1.
- **6×6/7×7** → out of scope: only 2×2–5×5 are modelled.

### 3.3 Where the clone improves on the original

1. **Local-first**: progress, personal sheets and sessions live in the browser
   (localStorage/IndexedDB) even without an account; the account is optional and syncs.
2. **Real statistics**: the original trainer aggregates nothing → the clone adds
   best/worst/mean/ao3/ao5/ao12 and session persistence.
3. **Optional competition timer**: WCA inspection 15 s (+30 s grace on 3×3), `+2`, `DNF`,
   1 s minimum, centisecond display.
4. **Client-side search and filters** over large datasets (ZBLL 472, VLS 189).
5. **No ads**, explicit privacy policy, light theme.
6. **Accessibility**: keyboard navigation, `aria-label`, visible focus, contrast.

---

## 4. Target architecture

### 4.1 Target file layout

```
index.html                     # SPA shell: header, nav, <main id="app">
styles.css                     # base theme (existing) + variables
styles/app.css                 # SPA layout: header/nav/footer/cards/tables
styles/cases.css               # case grids, filters, badges, @media print
styles/trainer.css             # PLL/cross trainers, timer display
src/
  main.js                      # bootstrap: router + shell + home
  app/
    router.js                  # History API, route table, params, 404
    routes.js                  # routes → lazy loader
    shell.js                   # header, nav, breadcrumb, footer, theme, login
    store.js                   # storage facade (localStorage + IndexedDB)
    search.js                  # search index + result routing
    theme.js                   # dark mode (persisted)
    i18n.js                    # string table (en; it later) — see §11.5
    pages/
      home.js                  # /
      settings.js              # /settings (theme, defaults, export/import)
      algsheet.js              # /algsheet (local personal sheet)
      beginner.js              # /Beginner (Phase 8)
      privacy.js               # /privacy (Phase 7)
  cube/                        # generalized cube engine (from src/)
    moves.js                   # (from src/moves.js) + layer/wide/slice
    CubeState.js               # (from src/CubeState.js) generalized to N
    Cube.js  Cubie.js  CameraRig.js  Orientation.js  Effects.js
  puzzle/
    Puzzle.js                  # common interface (id, size, colors, solver)
    cube3x3.js  cube2x2.js  cube4x4.js  cube5x5.js
    schemes.js                 # colors per puzzle
  notation/
    parser.js                  # extended parser: Rw, 3Rw, M/E/S, x/y/z, 2Rw'
    metrics.js                 # HTM, QTM, ETM, STM, "gen", inverse
    format.js                  # pretty-print, click-to-copy
  scramble/
    moveScrambler.js           # move-based scrambler (20 moves, WCA-style)
    randomState.js             # random-state scrambler (3x3/2x2) via the solver
    generator.js               # factory: puzzle × mode → scramble
  cases/
    registry.js                # set catalogue (id, puzzle, name, group, count)
    sets.js                    # per-set metadata: kind (OLL/PLL/F2L/…), symmetry group, hash fn
    hash.js                    # normalized case hashes (OLL/PLL/CLL/EO/EP)
    recognizer.js              # recognize(state, setId) → caseId | null
  algdb/
    loader.js                  # dataset loading (lazy) + cache
    page.js                    # /a/:puzzle and /a/:puzzle/:set
    caseCard.js                # a single case card
    detail.js                  # /a/:puzzle/:set/:case
    progress.js                # learnt 0/1/2, bookmark, personal sheet
    moreAlgs.js                # lazy loading of alternatives
  trainer/
    page.js                    # /t
    casePicker.js              # set/category/case selection
    caseGenerator.js           # scramble from the case (per-category rules)
    StackmatTimer.js           # state machine (hold ≥ 200 ms)
    compTimer.js               # optional WCA competition mode (inspection/+2/DNF)
    session.js                 # session + persistence + export/import
    stats.js                   # best/worst/mean/ao3/5/12/50/100
  trainers/
    pllTrainer.js              # /t/pllrecog
    crossTrainer.js            # /cross
    page.js
  analyze/
    analyzer.js                # cross/F2L/LL coverage + commented solutions
    analyzer.worker.js         # heavy search in a worker (terminate-able)
    crossPlanner.js            # IDA* over the cross (maxDepth 7)
    f2lPlanner.js              # F2L pair coverage (created in Phase 5, reused in 6)
    llPlanner.js               # OLL/PLL skip
    page.js
  render/
    CubeNet.js                 # 2D/SVG renderer from sticker strings
    stickerString.js           # sticker string ↔ state (de)serialization
    thumbnailer.js             # PNG/SVG cache in IndexedDB
  solver/
    Solver.js  solver.worker.js  twoPhase2x2.js
  store/
    local.js  idb.js  schema.js  sync.js
data/
  algdb/3x3/oll57.json  pll21.json  f2l41.json …
  algdb/2x2/cll42.json …
  cases/keys/3x3_oll57.json …
server.mjs                     # dev server: SPA fallback + /api stub
worker/index.js                # (Phase 7) API + OAuth + D1
tools/
  validate_algs.mjs            # QA: every alg in the dataset solves its case
  gen_case_keys.mjs            # generates the recognition tables
  render_cases.mjs             # exports the preview of every case
  build_dist.mjs               # copies assets into dist/ for wrangler
tests/ …                       # see §9
```

### 4.2 Routing

- **History API** + `wrangler.jsonc` → `assets.not_found_handling = "single-page-application"`.
  Clean URLs **identical to the original**: `/t`, `/t/pllrecog`, `/cross`, `/analyze`,
  `/a/3x3`, `/a/3x3/OLL`, `/a/3x3/OLL/OLL_1`, `/Beginner`, `/privacy`.
- `server.mjs`: unknown path → `index.html` (SPA fallback), **without** breaking
  `/data/*.pdb` (still 404 when missing) and without touching the COOP/COEP headers.

| Route | Page |
| ----- | ---- |
| `/` | Home: search, category grid, 3D cube |
| `/t` | Algorithm Trainer (with `?set=`, `?case=`) |
| `/t/pllrecog` | 2 Sided PLL Recognition |
| `/cross` | Cross Trainer (`?difficulty=`) |
| `/analyze` | Scramble Analyzer |
| `/a` | puzzle index |
| `/a/:puzzle` | set index for the puzzle |
| `/a/:puzzle/:set` | case list |
| `/a/:puzzle/:set/:case` | case detail |
| `/Beginner` | beginner's method guide (static content) |
| `/algsheet` | personal sheet (local) |
| `/settings` | preferences, theme, export/import |
| `/privacy` | privacy policy |

- Deep links: the trainer state and the current selection live in **query parameters**;
  progress lives in the store, not in the URL.

### 4.3 Generalized puzzle engine (3×3 → N×N)

**Problem**: `CubeState` is hard-coded to 27 cubies and `moves.js` to 6 faces + 3 slices.

**Solution**: generalize without losing integer exactness.

- `CubeState({ size, scheme })`:
  - coordinate layers `-(N-1)/2 … +(N-1)/2` for odd N; for even N the layers are
    `±1, ±3, …` (no central layer);
  - each cubie: `home`, `pos` (integers), `rot` (exact 3×3 matrix), `stickers`;
  - colors come from the **scheme** (`schemes.js`): 3×3 classic, 2×2 four colors,
    4×4/5×5 six colors;
  - for even N the faces have no centre sticker → the generator skips them.
- `moves.js`: a move becomes `{ axis, layers[], amount }`:
  - `U` → `{axis:'Y', layers:[+1], amount:-90}`, `U2` → `amount:180`;
  - `M` → layer 0 (odd N) or the central slice (even N);
  - `Rw` → `[+1,+2]`, `3Rw` (5×5) → `[+1,+2,+3]`, `Lw`, `2Lw`, …
  - `x/y/z` → whole-cube rotation;
  - `moveMatrix` still returns an integer matrix: logic and animation are unchanged;
  - **backwards compatibility**: `makeMove('R')` keeps working; the parser accepts the old
    `{face, axis, layer, whole, angle}` shape and emits the new one.
- `Cube.js` (rendering): it already iterates over the state's cubies → it adapts; it just
  needs `size` passed in.
- `solver/`: the 3×3 solver stays untouched. **2×2**:
  - phase 1 = corners only (3^6 × 7! = 3,674,160 states) with a 1-byte-per-state PDB
    (3.7 MB);
  - phase 2 = the 3×3 phase 2 restricted to 4 corners / 4 edges (reusing existing code);
  - cost ≈ 2 d of code + 1 d of PDB generation.
- 4×4/5×5: **no solver**; practice + parity sets (OLL/PLL parity, L2E, L2C).

### 4.4 Notation and metrics

`src/notation/parser.js` — supported tokens:

```
U U' U2 | r R  (alias, wide = 2 layers) | 3Rw 3Rw' | M M' M2 | E S | x y z | 2Rw
```

Rules: `R` = outer layer; `r`/`Rw` = 2 outer layers; `3Rw` = 3 outer layers (5×5);
`M` = middle layer/central slice; `E` = equatorial slice; `S` = front slice; `x/y/z` = rotation.

`src/notation/metrics.js`:

| Metric | Rule |
| ------ | ---- |
| **HTM** | every token = 1 |
| **QTM** | 90° = 1, 180° = 2, wide = 2, slice = 1, rotation = 2 |
| **ETM** | WCA: face move = 1, outer block move = 1, rotation = 1, **slice = 0** |
| **STM** | slice = 0, wide = 2, rotation = 0 |
| **gen** | set of faces used, e.g. `3GEN (R U F)` |

> Verified on the original site: algorithms containing slice moves show `ETM`/`STM` lower
> than the token count (e.g. `M R U R' U r U2 r' U M'` → 10 tokens, ETM 8). Parity must be
> re-verified on a 100-algorithm sample (acceptance criterion for Phase 3); if the
> convention differs, the dataset keeps the **recomputed** metric at runtime.

### 4.5 Storage

- **localStorage** (`cubedb.v1.*`): preferences, theme, progress, personal sheets, trainer
  sessions, practised cases. Access only through `src/app/store.js` (namespace + version +
  migrations).
- **IndexedDB** (`cubedb-cache`): case previews (serialized SVG/PNG).
- **Phase 7**: D1 for users/progress + last-write-wins sync on timestamps.

### 4.6 Case rendering (the key piece of the clone)

The original site draws cases in two ways: **client-side SVG** (`.jcube` with sticker
strings `data-us/ub/uf/ul/ur`) and **server-side PNG** with an on-disk cache. In the clone:

- **Dataset format**: each case carries both the **sticker string** (a 9-character string
  per face, six faces — see the grammar in §5.1) and the **setup** in notation. The sticker
  string makes the preview O(1) and puzzle-agnostic; the setup allows rebuilding the logical
  state for the 3D view and for validation. The original's `data-us/ub/uf/ul/ur` attributes
  are *not* reverse-engineered: our format is fully specified and self-consistent, which is
  required for the round-trip test `state → stickers → state`.
- `src/render/stickerString.js`: `stateToStickerString(state)` and
  `stickerStringToState(s)` (exact inverses, unit-tested).
- `src/render/CubeNet.js`: SVG (or Canvas) cube renderer from a sticker string, with:
  - selectable cross colour (rotation `z2`, `x`, `x'`, `z`, `z'` applied to both the
    rendering and the setup, exactly like the original);
  - highlighting of a subset of pieces (for the trainer: the "2-sided" mask);
  - sizes 40/75/100/150 px (matching the original's `data-width`).
- **3D**: `Cube.js` mounts the case (state rebuilt from the sticker string) with the same
  vocabulary as the `cubedb-ftw` viewer, but with no external dependencies.

### 4.7 Worker / API (Phase 7, optional)

```
GET  /api/me            → profile (null when anonymous)
POST /api/progress      → upsert progress / personal sheet
GET  /api/progress      → progress
POST /api/session       → save a trainer session
GET  /api/algdb/:set    → (optional) dataset served from the edge with ETags
```
A Worker with an `assets` binding (the site stays static) + Google OAuth (code + PKCE) +
a session cookie (HttpOnly) + D1.

---

## 5. Data model

### 5.1 Algorithm datasets — `data/algdb/<puzzle>/<set>.json`

```jsonc
{
  "id": "3x3/OLL57",
  "puzzle": "3x3",
  "name": "OLL",
  "variant": "57",
  "groupField": "group",
  "groups": ["All Corners Oriented", "Awkward Shapes", "..."],
  "crossOrientations": { "white": "z2", "yellow": "", "green": "x'", "blue": "x", "red": "z", "orange": "z'" },
  "cases": [
    {
      "id": "OLL_1",
      "name": "OLL 1",
      "group": "Dot Case",
      "setup": "F R' F' R U2' F R' F' R2' U2' R'",
      "stickers": {
        "u": "bbbbybbbb",
        "f": "ggggggggg",
        "r": "rrrrrrrrr",
        "b": "bbbbbbbbb",
        "l": "ooooooooo",
        "d": "wwwwwwwww"
      },
      "algs": [
        {
          "seq": "R U2 R' F R F' U2 R' F R F'",
          "metrics": { "htm": 11, "etm": 11, "stm": 11 },
          "gen": "3GEN (R U F)",
          "votes": 143,
          "video": "https://www.youtube.com/watch?v=Krt5t5X9gTo",
          "note": ""
        }
      ],
      "recognition": { "tags": ["dot"], "difficulty": 1 }
    }
  ]
}
```

Requirements (guaranteed by `tools/validate_algs.mjs`):
- the **setup** produces exactly the case, and the **sticker string** matches the setup's
  state: `stateToStickerString(stateFromSetup(case.setup)) === case.stickers`;
- every **alg** solves the case starting from the setup;
- `metrics` are recomputed at runtime (in the JSON only as a fallback; the tool reports
  mismatches);
- `id`, `name` and `setup` are unique inside a set (recognition-hash uniqueness is checked
  from Phase 4 on, once `src/cases/hash.js` exists).

**Sticker grammar (`cube3-v1`, documented once and unit-tested)**
- Six keys, always all present: `u f r b l d`, in **URFDLB** order.
- Each value is exactly **9 characters**, row-major, top-left → bottom-right **as seen when
  looking directly at that face** (for `d` the net is read as if the cube were tipped back).
- Characters: `w` white, `y` yellow, `g` green, `b` blue, `r` red, `o` orange; `-` means
  "not visible / masked" (used by the 2-sided PLL trainer, never in the datasets).
- A case with a `-` is *rendering-only*: the validator rejects it in `data/algdb/**`.
- Total 54 characters. `CubeNet` draws it as a net (`u` on top, `f` in the middle,
  `l`/`f`/`r`/`b` in a row, `d` below); the 3D view rebuilds the state by matching the
  colours, so the scheme is derived, not hard-coded.

### 5.1.1 Dataset example sanity

The snippet above is **schema-only**: the six sticker strings are placeholders chosen to
satisfy the grammar (the U face is a dot case — only its centre is oriented). Real sticker
strings are produced by `tools/render_cases.mjs` from the validated setup, never typed by
hand. `docs/metrics.md` holds the reference table used by `--compare` (see 3.13).

### 5.2 Recognition tables — `data/cases/keys/<setId>.json`

```jsonc
{
  "setId": "3x3/OLL57",
  "algo": "hash-v1",
  "map": { "<normalized hash>": "OLL_1", ... }
}
```
Generated by `tools/gen_case_keys.mjs` from the setups (Phase 4).

### 5.3 Progress, personal sheets, sessions — `localStorage`

```jsonc
{
  "version": 1,
  "progress": {
    "3x3/OLL57": {
      "OLL_1": { "learnt": 2, "bookmarked": true, "alg": "R U2 R' F R F' U2 R' F R F'", "updatedAt": 1712345678901 }
    }
  },
  "practiced": { "3x3,PLL": [12, 5, 30] },
  "sessions": { "3x3/PLL": [ { "time": 12345, "caseId": "PLL_T", "scramble": "...", "ts": 0 } ] },
  "prefs": { "crossColor": "white", "theme": "dark", "difficulty": 3 }
}
```

Note the two key styles, both deliberate: `practiced` uses `"<puzzle>,<category>"` because it
is the exact key the original site writes, so a user's existing state stays compatible;
new data uses the `"<puzzle>/<setId>"` form. `src/app/store.js` migrates the first into the
second on first load and keeps writing both for one release.

---

## 6. Implementation phases

### 6.0 Ordering and cross-phase dependencies

Phases are ordered by value, not strictly by dependency. These are the **hard** dependencies:

| Phase | Needs | Why |
| ----- | ----- | --- |
| 0 | — | foundations only |
| 1 | 0 + **seed datasets** (1.0) | `/t` draws from the datasets and needs the validator |
| 2 | 0 | engine only; unlocks the 2×2 branch of 1.3 and the 2×2 categories of the trainer |
| 3 | 0 | datasets; the N×N engine (Phase 2) is only needed for the 4×4/5×5 sets |
| 4 | 3 | hashes are generated from the validated setups |
| 5 | 4 (+ 5.8) | the PLL trainer needs recognition; `/cross` needs the F2L planner |
| 6 | 5.6–5.8 | `/analyze` reuses the cross/F2L planners and their solution format |
| 7 | 3, 4 | it syncs the progress produced by 3 and 4 |
| 8 | 3, 4 | new sets are validated and recognized like the others |

Consequences, made explicit in the tasks:

- **Phase 1 starts with OLL57 + PLL21 and the validator** (task 1.0). Without a seed dataset
  the trainer has nothing to draw from; the rest of the catalogue is authored in 3.10.
- **2×2 in the trainer** is hidden until Phase 2 lands (1.3's `2x2` branch calls the 2×2
  solver; 1.1 shows the puzzle only when `registry` marks it `solver: true`).
- **`src/cases/hash.js` is a Phase 4 deliverable.** The Phase 3 gate therefore checks
  `id`/`setup` uniqueness, not recognition hashes; 4.4 adds the hash-uniqueness check.
- **`src/analyze/f2lPlanner.js` is created in 5.8**, not in Phase 6, because the cross
  trainer needs it first.

### Phase 0 — Foundations (2.5 d) — P0

**Goal**: turn the current single page into an SPA with navigation, layout, theme,
search and storage, without breaking anything that exists.

| # | Task | File | Notes |
| - | ---- | ---- | ---- |
| 0.1 | Extract the 3D into a reusable component | `src/cube/CubeApp.js` | Scene/rig/input/effects setup moves out of `main.js` into a class with `mount(el)`/`unmount()`/`loadCase(state)`; `main.js` becomes the SPA bootstrap |
| 0.2 | SPA router (History API) | `src/app/router.js`, `src/app/routes.js` | Static matching + params (`/a/:puzzle/:set/:case`), `popstate`, query params, 404, **lazy import** of pages (Three.js only where needed) |
| 0.3 | Shell: header, nav, breadcrumb, footer | `src/app/shell.js`, `index.html` | Logo, nav (Practice, Database, Analyzer, Trainers, Beginner), theme/login icons, skip-link |
| 0.4 | CSS: theme tokens + page layout | `styles/app.css`, `styles/cases.css` | Keeps the dark theme; adds `--radius`, `--space`, `--panel`, visible focus, light theme |
| 0.5 | Dark mode | `src/app/theme.js` | `data-theme` on `<html>`, persisted; defaults to the system preference |
| 0.6 | Store with namespace/version/migrations | `src/app/store.js`, `src/store/{schema,local,idb}.js` | `get/set/patch/clear`, `localStorage` with an in-memory fallback, IndexedDB helper for previews |
| 0.7 | Global search | `src/app/search.js` | Static index (~230 entries: sets, aliases, puzzles, tools) with fuzzy matching and the special redirects (`pll`→`/t/pllrecog`, `cross`→`/cross`, `33`→`/a/3x3`, …) |
| 0.8 | SPA fallback in the dev server | `server.mjs` | Unknown path → `index.html` (200); `/data/*.pdb` still 404s when missing; COOP/COEP unchanged |
| 0.9 | SPA deploy | `wrangler.jsonc` | `assets.not_found_handling = "single-page-application"` |
| 0.10 | Home page | `src/app/pages/home.js` | Search + category grid (puzzles + "New": Practice, Analyzer, PLL trainer, Cross trainer) + 3D embed |
| 0.11 | Settings page + i18n stub | `src/app/pages/settings.js`, `src/app/i18n.js` | Theme, default cross colour, difficulty, **export/import** of the whole store (JSON); UI strings already go through `t()` so a second language is a data change |

**Acceptance criteria**
- `/` → `/a/3x3` → back: no reload, 404 routes with useful links.
- The existing 3D cube behaves exactly as before (input, solve, undo, help), including the
  existing countdown `Timer.js`; the shell must **unmount** `CubeApp` on route change (only
  one timer component may be live at a time).
- No page module imports Three.js directly: only `CubeApp` does, and the router lazy-loads
  it. (Checked on `/a/3x3` here; re-checked on `/t` from Phase 1.)
- `npm test` green + a new `tests/router.test.mjs` (routes, params, 404, query).
- Deploy preview: the deep link `/a/3x3` resolves the index.

---

### Phase 1 — `/t` Algorithm Trainer (6 d) — P0

**Goal**: replicate the original drill trainer (cases with a timer) and add the missing
statistics.

| # | Task | File | Details |
| - | ---- | ---- | ---- |
| 1.0 | **Seed datasets + validator** (enables the phase) | `data/algdb/3x3/{oll57,pll21}.json`, `tools/validate_algs.mjs` | 78 hand-checked cases + the checks of 3.9 (a)–(d); the full catalogue and the hash check come in Phase 3/4. This is the minimal slice of Phase 3 that Phase 1 depends on |
| 1.1 | Puzzle/category/set picker | `src/trainer/casePicker.js`, `src/app/pages/trainer.js` | Puzzles 3×3/2×2 (+ SQ1/Pyraminx when available); categories = catalogue sets; "Select Set"/"Select Cases" blocks; per-case checkbox with a `CubeNet` preview; **2×2 entries are hidden until Phase 2** (`registry` flag) |
| 1.2 | Dataset loading for the trainer | `src/algdb/loader.js` | `fetch('data/algdb/<puzzle>/<set>.json')`, in-memory + IndexedDB cache |
| 1.3 | Case/scramble generator | `src/trainer/caseGenerator.js` | Original rules: PLL → random alg of the case + random PLL + AUF; OLL → random alg; F2L/VLS → random F2L/VLS alg prepended; **scramble = inverse of the chosen alg** |
| 1.4 | Stackmat timer | `src/trainer/StackmatTimer.js` | `keydown Space` → `startTime = now + 200`; `keyup Space` → if a run is in progress record it, else if held ≥ 200 ms start the timer; display `s.mmm` (`0.00`, `12.34`); touch support |
| 1.5 | Single-result panel | `src/trainer/page.js` | Result, link to the case, scramble, solution — like `#singlestat-panel` |
| 1.6 | Session + persistence | `src/trainer/session.js` | Result list (removable), trash button, JSON export/import, persistence per puzzle/set |
| 1.7 | Aggregate statistics (improvement) | `src/trainer/stats.js` | Count, best, worst, mean, ao3/ao5/ao12, splits; added over the original |
| 1.8 | "practiced" state in localStorage | `src/trainer/session.js` | Key `"<puzzle>,<category>"` as on the original; practised cases are excluded from the draw |
| 1.9 | Extension: **competition timer** (optional) | `src/trainer/compTimer.js` | WCA inspection 15 s (+30 s grace on 3×3), `+2`, `DNF`, 1 s minimum, centisecond display — behind a "Competition mode" toggle |
| 1.10 | Extension: random-state scrambler | `src/scramble/randomState.js` | Legal random state → solved by the solver → WCA-style scramble (used by competition mode) |

**Acceptance criteria**
- The drill works end-to-end on 3×3 (OLL/PLL/F2L): case generated → scramble shown → timer
  → result recorded → next case.
- 2×2 categories appear only after Phase 2 and then drill correctly.
- **Practised cases are excluded from the draw** (checked over 50 draws).
- The timer does not start for presses shorter than 200 ms (Playwright test: quick tap → no
  timer).
- The `/t` page does **not** load Three.js (Network tab), and it never instantiates the
  countdown `Timer.js` (it uses `StackmatTimer`; in competition mode `compTimer.js`).
- Statistics are correct on a synthetic dataset (ao3/ao5/ao12).
- In competition mode: inspection, `+2`, `DNF` and the minimum time follow the rules.

---

### Phase 2 — Generalized puzzle engine + 2×2 (5 d) — P0

**Goal**: the engine supports N×N; 2×2 becomes complete (practice + solver).

| # | Task | File | Details |
| - | ---- | ---- | ---- |
| 2.1 | Generalized `CubeState` | `src/cube/CubeState.js` | `size`, schemes, even-N layers, no centre stickers for even N; the `pos = rot ∘ home` invariant holds |
| 2.2 | Extended `moves.js` | `src/cube/moves.js` | `{axis, layers[], amount}`; `Rw`, `3Rw`, `M`, `E`, `S`, `x/y/z`; backwards compatibility |
| 2.3 | Non-regression | `tests/logic.test.mjs` | The existing tests must pass **without modification** (or with minimal, justified changes) |
| 2.4 | N×N rendering | `src/cube/Cube.js`, `Cubie.js` | The loop is already generic; cubie size derives from `size` |
| 2.5 | Color schemes + puzzle adapters | `src/puzzle/{Puzzle,schemes,cube3x3,cube2x2,cube4x4,cube5x5}.js` | 3×3 classic; 2×2 (four colors); 4×4/5×5 (six colors); one adapter per puzzle exposing `{ id, size, colors, solver }` |
| 2.6 | 2×2 solver | `src/solver/twoPhase2x2.js` | Phase 1 corners only (3.7 MB PDB), phase 2 reusing the 3×3 code |
| 2.7 | 2×2 PDBs | `tools/pregen_2x2.mjs` | Extends the `data/pdb_meta.json` manifest |
| 2.8 | Multi-puzzle worker | `src/solver/solver.worker.js` | `{type:'solve', puzzle:'3x3' \| '2x2'}` → loads the right PDBs |
| 2.9 | 4×4/5×5 in the trainer | `src/trainer/page.js` | Practice without a solver (Solve disabled with a reason) |
| 2.10 | Scramble factory | `src/scramble/{moveScrambler,generator}.js` | Wraps the existing `Scrambler.js` for any N and selects move-based vs random-state per puzzle/mode |

**Acceptance criteria**
- Existing suite green with no regressions.
- `tests/nxn.test.mjs`: for size ∈ {2,3,4,5}, 1000 random moves → the invariant always
  holds and `isSolved()` is correct.
- 2×2 solver: 200 random-state scrambles → all solved and replay-verified, average < 30 ms.
- `npm run check` covers the new tables too.

---

### Phase 3 — Algorithm database (7 d) — P0

**Goal**: the `/a/...` pages with verified datasets.

| # | Task | File | Details |
| - | ---- | ---- | ---- |
| 3.0 | Notation + metrics modules | `src/notation/{parser,metrics,format}.js` | The extended parser and the HTM/QTM/ETM/STM/`gen` counters described in §4.4, plus `format.js` (pretty-print, click-to-copy). Needed by 3.5 before any dataset is rendered; unit-tested by `tests/notation.test.mjs` |
| 3.1 | Set catalogue | `src/cases/registry.js` | 3×3: OLL57, PLL21, F2L41, AdvancedF2L41, COLL40, CMLL42, ELL25, WV27, SV27, SBLS65, EO4A9, AntiPLL22, FRUF42, CLS97, VLS189, ZBLL472 (+ variants), 1LLL, OLLCP; 2×2: CLL42, OrtegaOLL, OrtegaPBL, EG1, EG2; 4×4: OLLParity, PLLParity; 5×5: L2E, L2C |
| 3.2 | Dataset loader | `src/algdb/loader.js` | Lazy `fetch` + cache; ETag/`?v=` for invalidation |
| 3.3 | `/a/:puzzle` index | `src/algdb/page.js`, `src/render/thumbnailer.js` | Tiles per set with a 3D/2D preview and an `0/N` progress badge; previews cached in IndexedDB |
| 3.4 | `/a/:puzzle/:set` list | idem | Toolbar: print, **Cross Color**, **Related Sets**, **group filters** with `0/N` badges; text search; sorting (name, votes, metrics) |
| 3.5 | Case card | `src/algdb/caseCard.js` | `CubeNet` preview, title + breadcrumb, setup, Standard Alg, orientation tabs, collapsed alternatives with metrics/gen/votes/video, **learnt** widget (3 states) and **bookmark** |
| 3.6 | Case detail | `src/algdb/detail.js` | All alternatives + "More Algorithms" (lazy loaded) + notes + history |
| 3.7 | Cross Color | `src/algdb/page.js` | Applies the rotation (`z2`, `x`, `x'`, `z`, `z'`) to the sticker string and the setup, like the original |
| 3.8 | 3D viewer per case/alg | `src/cube/CubeApp.js` | Mounts the case state with our renderer (replacing `cubedb-ftw`) |
| 3.9 | **Validation tool** (full version) | `tools/validate_algs.mjs` | Per case: (a) the setup produces the case; (b) the sticker string matches the setup (`stateToStickerString`); (c) every alg solves the case; (d) metrics recomputed; (e) `id`/`setup` unique. Exit 1 on any failure. Hash uniqueness is added in Phase 4 |
| 3.10 | **Dataset authoring** (P0 part) | `data/algdb/**` | OLL57/PLL21 already exist from 1.0; add F2L41 → AdvancedF2L41 → COLL40 → CMLL42 → ELL25 (≈ 4 d). ZBLL, WV/SV, SBLS/FRUF/CLS, VLS/1LLL/OLLCP are Phase 8. Every set validated by 3.9 |
| 3.11 | Progress + personal sheet | `src/algdb/progress.js` | learnt 0/1/2, bookmark, personal alg per case, `/algsheet` |
| 3.12 | Printing | `styles/cases.css` | `@media print`: hide the toolbar/filters, keep the case + algs |
| 3.13 | Metric parity (reference table) | `tools/validate_algs.mjs --compare` | Compares recomputed ETM/STM against the **hand-curated table in `docs/metrics.md`** (~100 published algs with known movecounts). No network access, no scraping; discrepancies are documented, not silently accepted |

**Acceptance criteria**
- `node tools/validate_algs.mjs` → exit 0 on every dataset present.
- Progress badges are consistent (`0/57` → `57/57`), per set and per group.
- OLL filters: Dot Case 8, L 6, Lightning 6, OCLL 7, T 2, W 2, … → 57.
- The displayed metrics match the recomputation.
- Switching the Cross Color changes both the preview and the setup coherently.
- Manual review of at least 20 cases per set (preview matches the known standard).

---

### Phase 4 — Recognition engine (5 d) — P0

**Goal**: given the cube's position, say which case it is (OLL 27, T-perm, …).

**Approach (robust, generic, verifiable)**

1. For each set define a **canonical hash** `hashOf(state, setId)`:
   - **OLL57**: orientation of the 4 U corners × orientation/position of the 4 U edges,
     normalized over AUF (4 variants) and `y` (2 variants);
   - **PLL21**: permutation of the 4 U corners × permutation of the 4 U edges (as cycles)
     + chirality;
   - **F2L41**: the pair (corner, edge) of the block + the block's state (5 states) + U state;
   - **CLL42** (2×2): the state of the 4 corners (twist + permutation), normalized;
   - **EO/EP** (4×4/5×5): orientation/position of the U edges, normalized.
2. `tools/gen_case_keys.mjs` applies every setup to the solved cube, computes the hash and
   generates `data/cases/keys/<setId>.json` (hash → caseId map).
3. `recognizer.js` computes the hash of the current state and looks it up; if it is missing
   → "unknown case".
4. Normalizations (AUF, `y`) are applied to the **cubies**, not to pixels: every element of
   the set's symmetry group is tried and the one whose hash is in the table is used.

| # | Task | File |
| - | ---- | ---- |
| 4.1 | Hashes per set | `src/cases/hash.js` |
| 4.2 | Table generation tool | `tools/gen_case_keys.mjs` — writes `data/cases/keys/<setId>.json` and **fails on hash collisions** (this closes the gap left open by 3.9) |
| 4.3 | Recognizer | `src/cases/recognizer.js` |
| 4.4 | Coverage | `tests/cases.test.mjs` — every setup → its own case; every case recognized from ≥ 8 AUF variants |
| 4.5 | "Current case" UI | Badge in the 3D cube + a panel with the recognized case and its algs |
| 4.6 | DB ↔ recognition | `src/algdb/page.js` — highlights the current case, adds a "my case" filter |
| 4.7 | "2-sided" hash (for the PLL trainer) | `src/cases/hash.js` — masked variant, like the original |

**Acceptance criteria**
- 100% coverage: every case of every set is recognized from its own setup and its variants.
- No false positives: a random sequence applied to a recognized case yields "unknown".
- Recognition takes < 5 ms per case.

---

### Phase 5 — PLL and Cross trainers (4 d) — P1

| # | Task | File | Details |
| - | ---- | ---- | ---- |
| 5.1 | `/t/pllrecog` cases | `src/trainers/pllTrainer.js` | 21 PLL cases generated from the set (alg + AUF), rendered "2-sided" (masked) |
| 5.2 | Options | idem | `Show Hints`, `Show Timer`, Cross Colors (6), Select Cases with Select All/None/Show-Hide |
| 5.3 | Interface | `src/trainers/pllTrainer.js`, `styles/trainer.css` | 150×150 preview, `Start!`/`Stop`, stopwatch `0.00`, 21 answer buttons with previews |
| 5.4 | Progressive hints | idem | Suggest which corner to look at (like the original) |
| 5.5 | Performance history | idem | *Case \| Results \| Average \| Successful Recognition \| False Recognition*; wrong answers → `btn-danger` |
| 5.6 | `/cross` generator | `src/trainers/crossTrainer.js` | Cross colour (6), **difficulty 1–7 moves**, scramble, "New Scramble" |
| 5.7 | Suggested solutions | idem | Candidate solutions with copy/rotate/view (reusing the cross planner) |
| 5.8 | F2L search planner | `src/analyze/f2lPlanner.js` | **Created here** (Phase 5) because the cross trainer needs it; returns the F2L pairs solvable after a given cross. Phase 6 reuses it |
| 5.9 | History persistence | `src/store/local.js` | Unlike the original (memory only), the clone persists the history |

**Acceptance criteria**
- 1000 PLL generations → 21 distinct cases, uniform distribution.
- Correct answer → the timer stops and the time is recorded; wrong answer → "false
  recognition" and the counter updates.
- The history table shows consistent averages.
- The cross trainer generates crosses of difficulty 1–7, verifying that the requested
  solution exists (difficulty = shortest length found).

---

### Phase 6 — `/analyze` Scramble Analyzer (4 d) — P1

**Goal**: replicate the original's coverage analysis — the most interesting piece of the
site: it searches for *how many* solutions exist for each cross/F2L/LL within a depth limit.

| # | Task | File | Details |
| - | ---- | ---- | ---- |
| 6.1 | UI | `src/analyze/page.js` | Scramble input, "how far" (Full Solve / Cross+3 / Cross+2 / Cross+1), 6 cross-colour checkboxes, 4 counters, results list with filters |
| 6.2 | Cross planner | `src/analyze/crossPlanner.js` | Per cross colour: IDA*/best-first over the cross with `maxDepth = 7`, using `sides = {Yellow:'', White:'z2', Blue:'x', Green:"x'", Red:'z', Orange:"z'"}` → **"Crosses covered"** |
| 6.3 | F2L planner | `src/analyze/f2lPlanner.js` | For each cross found, how many F2L pairs are solvable → **"F2L pair solutions covered"** |
| 6.4 | LL planner | `src/analyze/llPlanner.js` | OLL/PLL skip → **"Last layer solutions covered"** and **"Total solutions covered"** |
| 6.5 | Commented solutions | `src/analyze/analyzer.js` | Sequences with inline comments (`// Inspection`, `// Pair 1`, `// OLL`, `// PLL`, `U // AUF`, `y`) and the *All / Full Step / OLL Skip / PLL Skip / LL Skip* filters |
| 6.6 | Worker | `src/analyze/analyzer.worker.js` | The search is heavy → a dedicated worker with `terminate` (like `earphones/ear.js`) |
| 6.7 | Deep link | idem | `/analyze?scramble=…&howfar=…&colors=…` |

**Acceptance criteria**
- The parsed and applied scramble produces the same state as the 3D cube (parity test).
- The 4 counters are mutually consistent (total ≥ ll ≥ f2l ≥ crosses) and reproduce the
  expected proportions on known scrambles.
- The proposed solutions are **verified** (applied and replay-checked against the state).

---

### Phase 7 — Accounts + sync (4 d) — P2, optional

| # | Task | File |
| - | ---- | ---- |
| 7.1 | Worker with an `assets` binding + API | `worker/index.js`, `wrangler.jsonc` |
| 7.2 | D1 schema | `worker/schema.sql` (users, progress, sessions) |
| 7.3 | Google OAuth (code + PKCE) | `worker/auth.js`; login lightbox like the original |
| 7.4 | Progress sync (last-write-wins) | `src/store/sync.js` |
| 7.5 | Login/logout UI + sync status | `src/app/shell.js` |
| 7.6 | Explicit privacy policy | `src/app/pages/privacy.js` (what is stored where: local vs server) |

**Acceptance criteria**: login works in dev; progress syncs across two browsers; logout
revokes the session; the privacy policy lists the data collected.

---

### Phase 8 — Advanced sets (7 d) — P2

| # | Task | File | Notes |
| - | ---- | ---- | ---- |
| 8.1 | Advanced 3×3 datasets | `data/algdb/3x3/{zbll472,cmll42,coll40,ell25,wv27,sv27,sbls65,fruf42,cls97,vls189}.json` | Validated by `tools/validate_algs.mjs`; lazy loading + pagination |
| 8.2 | 2×2 sets | `data/algdb/2x2/{cll42,ortegaOLL,ortegaPBL,eg1,eg2}.json` + recognition | Ortega = cases without a setup (corner state) |
| 8.3 | 4×4/5×5 sets | `data/algdb/4x4/{ollParity,pllParity}.json`, `5x5/{l2e,l2c}.json` | Parity/L2 only: no full solver required |
| 8.4 | 4×4/5×5 practice | `src/trainer/page.js` | Move-based scrambler (random-state 4×4/5×5 deferred: centre parity) |
| 8.5 | `1LLL`/`OLLCP` | `data/algdb/3x3/*` | Very large datasets: on-demand loading + search |
| 8.6 | Beginner's guide | `src/app/pages/beginner.js` | Original static content (not copied), with interactive steps on the 3D cube |

**Acceptance criteria**: every new dataset passes `tools/validate_algs.mjs`; recognition
covers 100% of the cases of the new sets.

---

### Phase 9 — Stretch (out of scope)

Pyraminx, Megaminx, Skewb and SQ1 need **completely different state models** (non-cubic:
pyramid, dodecahedron, Meccano, cylinder). They require `src/puzzle/pyraminx/` etc. with
state, parser, renderer and, for SQ1, the CSP tracing (7 views, colour maps, presets).
Estimate: 3–5 d per puzzle. To be planned only after P0–P8.

---

## 7. Critical parts in detail (pseudo-code)

### 7.1 Trainer timer (identical to the original)

```js
// keydown Space
startTime = now + 200;          // 200 ms threshold
display = '0.00';
// keyup Space
if (running) { record(); nextCase(); running = false; }
else if (now >= startTime) { running = true; tick(); }   // held >= 200 ms -> start
else { cancel(); }                                       // short tap -> cancelled
```

### 7.2 Drill case generation (original rules)

```js
switch (set.kind) {
  case 'PLL':  alg = random(pick(case.algs)); scramble = inverse(alg + randomPLL() + randomAUF()); break;
  case 'OLL':  alg = random(pick(case.algs)); scramble = inverse(alg); break;
  case 'F2L':  alg = random(pick(case.algs)); scramble = inverse(randomF2LAlg() + alg); break;
  case '2x2':  state = applyTo3x3(case.alg); state = randomizeU(state);
               scramble = worker.solve(state); break;   // maxDepth 20, maxTime 15
}
```

### 7.3 Random-state scrambler (3×3, for competition mode)

```js
twist[8] = -(sum(twist[0..6])) mod 3;    // corner orientations
flip[11]  = xor(flip[0..9]);              // edge orientations
permCorners = randomEven();  permEdges = randomSameParity();
state = buildState(twist, flip, permCorners, permEdges);
scramble = solver.solve(state);           // = the inverse of the random state
assert(apply(scramble) === state);        // replay-check is mandatory
```

### 7.4 Canonical case hash

```js
hashOf(state, setId):
  best = null
  for g in symmetryGroup(setId):          // AUF x y (x U2 for 2x2)
     h = canonical(state ∘ g)
     best = min(best, h)                 // lexicographic min: canonical
  return best
lookup(state, setId): return keys[setId][hashOf(state, setId)] ?? null
```

### 7.5 Coverage (Scramble Analyzer)

```js
for crossColor in selectedColors:
  for cross in crossPlanner(state, crossColor, maxDepth = 7):   // IDA* with a cross PDB
     crosses.add(cross)
     for pair in f2lPlanner(cross):                             // solvable F2L pairs
        pairs.add(pair)
        for ll in llPlanner(pair):                              // OLL/PLL skip
           solutions.push(formatWithComments(cross, pair, ll))
sort by score; keep the top 20
counters = { crosses: crosses.size, pairs: pairs.size, ll: llCount, total: solutions.length }
```

---

## 8. Test strategy

### 8.1 Unit tests (Node, assert — current pattern)

| File | Coverage |
| ---- | -------- |
| `tests/notation.test.mjs` | parser (`R`, `R'`, `R2`, `Rw`, `3Rw`, `M`, `E`, `S`, `x`, `y`, `z`, errors); HTM/QTM/ETM/STM metrics; `gen`; `inverse` |
| `tests/logic.test.mjs` | existing + the `pos = rot ∘ home` invariant for size ∈ {2,3,4,5} |
| `tests/nxn.test.mjs` | layers, wide moves, `isSolved`, parity, centres without stickers |
| `tests/sticker.test.mjs` | `stateToStickerString` ⇄ `stickerStringToState` (exact round-trip over 1000 states) |
| `tests/timer.test.mjs` | existing (countdown) |
| `tests/stackmat.test.mjs` | 200 ms threshold, start/stop, result, `+2`, `DNF`, 1 s minimum |
| `tests/stats.test.mjs` | ao3/5/12/50/100 on a synthetic dataset, best/worst, DNF excluded |
| `tests/cases.test.mjs` | 100% recognition coverage per set + no false positives |
| `tests/scramble.test.mjs` | random-state scramble legality, replay-check, uniformity |
| `tests/solver2x2.test.mjs` | 200 2×2 scrambles solved and replay-verified |
| `tests/trainer.test.mjs` | case generation per category (PLL/OLL/F2L), exclusion of practised cases |
| `tests/algs.validate.test.mjs` | invokes `tools/validate_algs.mjs` on the datasets present |

### 8.2 E2E (Playwright, already available)

| File | Scenario |
| ---- | -------- |
| `tests/e2e/nav.mjs` | SPA navigation, deep links, back/forward, 404, lazy loading of Three.js |
| `tests/e2e/trainer.mjs` | full drill: case selection → scramble → space → result → next case |
| `tests/e2e/algdb.mjs` | open a set, filters, cross colour, "mark as learnt", progress badge, "More Algorithms" |
| `tests/e2e/plltrainer.mjs` | correct/wrong answer, history, false recognition |
| `tests/e2e/crosstrainer.mjs` | cross generation, difficulty, suggested solutions |
| `tests/e2e/analyze.mjs` | scramble → counters → solutions with filters |
| `tests/e2e/cube3d.mjs` | the existing `tests/ux_browser.mjs` scenario, kept in place and referenced from `npm run e2e`; only moved if the script path is updated at the same time |

### 8.3 Data quality tools

- `tools/validate_algs.mjs` — **gate** for the datasets (exit 1 on failure).
- `tools/gen_case_keys.mjs` — regenerates the recognition tables.
- `tools/render_cases.mjs` — exports the preview of every case (visual review + static fallback).
- `tools/build_dist.mjs` — copies the assets into `dist/` for `wrangler deploy` (manual today).

### 8.4 CI

```
npm ci
npm run pregen && npm run pregenCE && npm run pregen2x2   # pregen2x2 exists from Phase 2
npm test          # unit + validate_algs + PDB check
npm run e2e       # Playwright (requires the server running)
```

`npm run check` (PDB manifest) must keep failing loudly when the tables do not match the
code. Until Phase 2 lands, CI runs only the existing `pregen`/`pregenCE`.

---

## 9. Deploy and devops

- `wrangler.jsonc`: `assets.not_found_handling = "single-page-application"`,
  `_headers` with COOP/COEP (required for `SharedArrayBuffer`/solver cancel) and
  `Cache-Control`:
  - `data/*.pdb` → immutable, 1 year (already in place);
  - `data/algdb/**` → `no-cache` + strong ETag (the datasets change);
  - `index.html` → `no-cache`; `assets/**` → `max-age=3600`.
- Large datasets (ZBLL 472, VLS 189) are served **Brotli/gzip-compressed** by the Workers
  runtime; `tools/build_dist.mjs` also writes a `.json.gz`/`.json.br` pair as a fallback for
  hosts that do not compress JSON. Target: OLL57 + PLL21 < 150 KB uncompressed, any single
  set < 1 MB.
- The SPA fallback is configured **only** through `not_found_handling`; `_headers` keeps the
  COOP/COEP pair, so `/data/*.pdb` (fetched by the solver worker) still gets
  `Cross-Origin-Opener-Policy`/`Embedder-Policy` and `SharedArrayBuffer` keeps working.
- `dist/` = copy of `index.html`, `styles/`, `src/`, `vendor/`, `data/` via
  `tools/build_dist.mjs`.
- Domain: keep `*.workers.dev`; add a custom domain for Phase 7.
- HTTPS is required for OAuth: `workers.dev` is fine.
- **Browser support**: latest Chrome/Edge/Firefox and Safari ≥ 16.4 (needed for native
  import maps). No polyfills; features used: ESM, import maps, History API, IndexedDB,
  Web Workers, `SharedArrayBuffer` when COOP/COEP are present.
- **SEO** (the original lives on search traffic): `tools/build_dist.mjs` also emits a static
  `sitemap.xml` and `robots.txt` from `registry.js`, plus per-page `<title>`/`og:title`/
  `og:description` set by `shell.js` on route change (no server-side rendering).

---

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ----------- |
| Huge, tedious algorithm datasets (ZBLL 472, VLS 189…) | High | Prioritize OLL57/PLL21/F2L41; automatic validation; semi-automatic generation (setup→alg aligned with the solver) |
| Dataset errors (an alg that does not solve its case) | High | `tools/validate_algs.mjs` in CI: the build fails |
| Copying speedcubedb's content/code (copyright + obfuscated code) | Medium | Datasets rebuilt from public sources; structure/UI inspired; no bundle reused; no scraping |
| Generalizing the 3×3 engine to N×N breaks the solver | High | The 3×3 solver lives in dedicated code; non-regression tests at every step |
| Imperfect recognition (false positives) | Medium | Canonical hashes + generated tables + coverage and non-regression tests |
| The Analyzer is expensive (IDA* over 6 colours × depth 7) | Medium | Dedicated worker + cancellation + time limits + per-colour progress |
| 3D performance on mobile | Medium | Lazy import of Three.js: `/t` and `/a/...` never load it |
| Static deploy without a backend for accounts | Low | Phase 7 is optional; the product is complete without login |
| Phase 7 (OAuth/D1) timeline | Medium | Keep it isolated; everything else works offline/local |
| Host without COOP/COEP headers → no `SharedArrayBuffer` → solver **cancel** unavailable | Low | The solver already degrades gracefully; document it in the README and in the UI (Cancel disabled with a tooltip). Cloudflare and `server.mjs` both send the headers |
| Dataset payload too large for slow mobile links | Medium | One JSON per set (lazy), Brotli, split `algs` into `<set>.algs.json` if a set exceeds 1 MB, IndexedDB cache |
| Two timers on one page (countdown `Timer.js` vs `StackmatTimer`) | Low | `CubeApp` owns the countdown and is unmounted by the router on route change; `/t` only mounts the stackmat. Guarded by an E2E assertion |
| Breaking the existing Playwright tests | Medium | The existing tests stay; new ones go into `tests/e2e/` |

---

## 11. Open decisions (before Phase 1 — items 1 and 4 block task 1.0)

1. **Dataset scope**: stop at OLL57/PLL21/F2L41 or continue with ZBLL/CMLL/COLL?
   *Proposal*: OLL57, PLL21, F2L41 are mandatory; the large ones move to Phase 8.
2. **2×2/4×4/5×5**: include a solver for 2×2 only?
   *Proposal*: 2×2 yes, 4×4/5×5 no (practice + parity sets only).
3. **Accounts**: Phase 7 within this plan or a separate project?
   *Proposal*: separate project (the product works without it).
4. **Competition mode**: include it in the trainer right away or as a toggle?
   *Proposal*: a toggle in Phase 1 (cheap: it reuses the stackmat timer + the random-state
   scrambler).
5. **Interface language**: English only, or Italian as well?
   *Proposal*: English, with strings in `src/app/i18n.js` (created as a stub in Phase 0,
   filled while writing the pages) so Italian can come later without a refactor.
6. **Community features** (votes, community alternative algs): replicate them?
   *Proposal*: no locally; with Phase 7 the backend can accept submissions (with moderation).

---

## 12. Definition of done

- [ ] `npm test` green: new unit tests + `validate_algs` on every dataset + PDB check.
- [ ] `npm run e2e` green: navigation, trainer, database, PLL trainer, cross trainer, analyzer.
- [ ] `/t` completes a full drill: case selection → scramble → timer → result → next case,
      and practised cases are excluded from the draw.
- [ ] `/a/3x3/OLL` shows 57 cases with correct previews, group filters, cross colour,
      progress, alternatives and the 3D viewer.
- [ ] `/a/3x3/PLL` shows 21 cases and the recognizer identifies all of them (100%).
- [ ] `/analyze` produces the 4 counters and verified solutions.
- [ ] `/t/pllrecog` and `/cross` work and keep their performance history.
- [ ] `/settings` exports the whole store to JSON and re-imports it without data loss.
- [ ] Only one timer is live per page: the home cube keeps the countdown, `/t` uses the
      stackmat (asserted in E2E).
- [ ] Every dataset is valid, unique per set, and each set stays < 1 MB (Brotli in prod).
- [ ] Deep links to any public URL work after deploy (SPA fallback).
- [ ] No regressions on the existing 3D cube.
- [ ] Explicit privacy policy; no tracking/ads.
- [ ] Keyboard-only path works for the trainer (space hold), the set filters and the 3D
      cube; focus is visible and every icon has an `aria-label`.
- [ ] README updated: new pages, included datasets, how to regenerate and validate them,
      how to run the tests.

---

## 13. Appendix A — URL map (clone ↔ original)

| Clone | Original | Content |
| ----- | -------- | ------- |
| `/` | `/` | Home: search + category grid |
| `/t` | `/t` | Algorithm Trainer (drill + timer) |
| `/t/pllrecog` | `/t/pllrecog` | 2 Sided PLL Recognition |
| `/cross` | `/cross` | Cross Trainer (difficulty 1–7) |
| `/analyze` | `/analyze` | 3x3 Scramble Analyzer |
| `/a` | `/a/3x3` | Puzzle index |
| `/a/3x3` | `/a/3x3` | 3×3 set index (`0/N` badges) |
| `/a/3x3/OLL` | `/a/3x3/OLL` | 57 cases + filters + cross colour |
| `/a/3x3/OLL/OLL_1` | idem | Case detail + alternatives |
| `/a/3x3/PLL` | `/a/3x3/PLL` | 21 PLL cases |
| `/a/2x2/CLL` | `/a/2x2/CLL` | 2×2 set |
| `/a/4x4/OLLParity` | `/a/4x4/OLLParity` | 4×4 parity |
| `/Beginner` | `/Beginner` | Beginner's guide |
| `/algsheet` | `/algsheet/{userid}` | Personal sheet |
| `/settings` | — | Preferences + export/import |
| `/privacy` | `/privacy` | Privacy policy |

## 14. Appendix B — Datasets to produce (with priority)

| # | Set | Puzzle | Cases | Priority | Effort |
| - | --- | ------ | ----- | -------- | ------ |
| 1 | OLL | 3×3 | 57 | P0 | 1.5 d |
| 2 | PLL | 3×3 | 21 | P0 | 1 d |
| 3 | F2L | 3×3 | 41 | P0 | 1.5 d |
| 4 | Advanced F2L | 3×3 | 41 | P1 | 1 d |
| 5 | COLL | 3×3 | 40 | P1 | 0.5 d |
| 6 | CMLL | 3×3 | 42 | P1 | 0.5 d |
| 7 | ELL | 3×3 | 25 | P1 | 0.5 d |
| 8 | WV / SV | 3×3 | 54 | P2 | 0.5 d |
| 9 | EO4A | 3×3 | 9 | P2 | 0.3 d |
| 10 | AntiPLL | 3×3 | 22 | P2 | 0.5 d |
| 11 | ZBLL (+ variants) | 3×3 | 472+ | P2 | 2 d |
| 12 | SBLS / FRUF / CLS | 3×3 | 204 | P3 | 1.5 d |
| 13 | VLS / 1LLL / OLLCP | 3×3 | 189+ | P3 | 2 d |
| 14 | CLL / Ortega OLL / Ortega PBL / EG1 / EG2 | 2×2 | 42+ | P2 | 2 d |
| 15 | OLL Parity / PLL Parity | 4×4 | — | P2 | 0.5 d |
| 16 | L2E / L2C | 5×5 | — | P3 | 0.5 d |

A dataset enters the product only if `tools/validate_algs.mjs` passes: **correct setup,
consistent sticker string, solving algs, recomputed metrics, unique hashes**.

## 15. Appendix C — Glossary

- **HTM / QTM / ETM / STM**: move-count metrics (§4.4). ETM = *execution turn metric* (WCA):
  face move, outer block move and rotation = 1; slice = 0.
- **AUF**: "Adjust Upper Face" — the final U-turn that returns the cube to its canonical
  orientation.
- **gen**: the set of faces used by an algorithm ("3GEN (R U F)").
- **random-state scramble**: a scramble generated from a random state (WCA method).
- **case**: a recognizable situation (e.g. "OLL 27", "T-perm", "F2L 41").
- **setup**: the sequence that, applied to the solved cube, produces the case.
- **Crosses covered / F2L pair solutions covered / Last layer solutions covered**: the four
  Analyzer counters, telling how many distinct solutions exist for the scramble.
- **2-sided PLL recognition**: recognizing a PLL while looking at only two sides (mask).
- **xcross**: cross + one F2L pair solved in one go.
- **learnt 0/1/2**: study state of an algorithm (not learnt / learnt / consolidated).

## 16. Appendix D — What to replicate exactly and what to improve

| Original element | Replicated | Improvement in the clone |
| ---------------- | ---------- | ------------------------ |
| `/t` drill with scramble = inverse of the alg | yes | + aggregate statistics, + persistence, + competition mode |
| 200 ms space-bar hold threshold | yes | — |
| Display `0.00` / `12.34` | yes | — |
| Puzzle/category selectors + "Select Algs"/"New Case" | yes | + persisted selections |
| Practised cases excluded from the draw | yes | — |
| `0/N` progress badges per set and group | yes | + computed locally without login |
| Group filters with previews | yes | + counts and sorting |
| Cross Color with `z2/x/x'/z/z'` rotations | yes | — |
| ETM/STM movecount + gen | yes | + recomputed metrics + QTM/HTM |
| Alternatives per case + "More Algorithms" | yes | + lazy loading |
| 3D viewer per algorithm | yes | + our own renderer (no external dependency) |
| Learnt / Bookmark / Hide | partial | + local personal sheet (learnt 0/1/2, star) |
| Community Votes | static | (behind login, Phase 7) |
| 2 Sided PLL Recognition + history + false recognition | yes | + persisted history |
| Cross Trainer with difficulty 1–7 and suggested solutions | yes | + verified solutions |
| Scramble Analyzer with 4 counters and filters | yes | + verified solutions |
| Dark mode | yes | + light theme, system preference |
| Set page printing | yes | — |
| Share links | yes | + deep links carrying state |
| Google OAuth | Phase 7 | + explicit privacy policy |
| Community alg submission, `/reviews`, SQ1 Trace | no | out of scope |
