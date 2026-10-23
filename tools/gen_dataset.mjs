// Dataset generator: builds the algorithm sets from first principles.
//
//   node tools/gen_dataset.mjs            # all sets (OLL PLL)
//   node tools/gen_dataset.mjs OLL        # one set
//
// Nothing is scraped or copied: every case is constructed as an exact logical
// state (integer matrices), solved with the real two-phase solver in src/Solver.js,
// and written out as { stickers, setup, algs }. The SETUP is the inverse of the
// standard alg, so "the setup produces the case" and "the alg solves the case"
// hold by construction — tools/validate_algs.mjs re-checks both, plus metrics
// and hash uniqueness.
//
// Case counts: OLL 57 (as on the original site). PLL 22 — the AUF-canonical
// last-layer permutation classes, which is the 21 standard named PLLs plus the
// diagonal-corner-swap x edge-4-cycle class the named sets fold away. Case NAMES are our own
// canonical enumeration order (<SET>_<n>), not speedcubedb's numbering; the
// `group` field is a computed classification, so the set page's group filters
// carry real counts that sum to the case total.

import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { R24_INDEX, matKey } from '../src/moves.js';

import { CubeState } from '../src/CubeState.js';
import { ALL_MOVES_FULL, ALL_MOVES, notation, inverseMove, parseNotation, matMul, matApply, ID3, makeMove } from '../src/moves.js';
import { solveCube, buildPDBs, tablesVersion, fnvBytes, twistVec, flipCodeOf, setStateFromCube, makeState } from '../src/Solver.js';
import { readFile } from 'node:fs/promises';

/** Load the pre-computed solver tables from data/ (same files the browser worker
 * fetches) so dataset generation runs at browser speed instead of seconds/solve. */
async function loadPrebuilt() {
  const metaPath = 'data/pdb_meta.json';
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    const v = tablesVersion();
    const get = async (name) => {
      const want = meta?.files?.[name];
      if (!want || want.v !== v) return null;
      const buf = await readFile(`data/${name}`);
      if (buf.length !== want.size || fnvBytes(new Uint8Array(buf)) !== want.hash) return null;
      return new Uint8Array(buf);
    };
    const JCE = await get('jointCE.pdb');
    const JQSY = await get('jointCE_qsym.pdb');
    if (!JCE || !JQSY) return null;
    const CS = await get('cornslice.pdb');
    const ES = await get('es.pdb');
    const p1 = {
      co_eo: await get('p1_co_eo.pdb'),
      co_ud: await get('p1_co_ud.pdb'),
      eo_ud: await get('p1_eo_ud.pdb'),
    };
    return { JCE, JQSY, CS, ES, p1 };
  } catch (err) {
    console.log('loadPrebuilt failed:', err?.message ?? err);
    return null;
  }
}
import { stateToStickerString } from '../src/render/stickerString.js';
import { metrics, gen, inverseStr, format } from '../src/notation/metrics.js';

// ---- U-layer piece homes, clockwise from the front --------------------------
const U_CORNERS = [{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 }];
const U_EDGES = [{ x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: -1 }, { x: -1, y: 1, z: 0 }];

/** Matrix that twists the corner at `home` in place: it cycles the corner's
 * three sticker normals (a 120° turn about the diagonal through `home`). */
function cornerTwist(home) {
  const sx = Math.sign(home.x), sy = Math.sign(home.y), sz = Math.sign(home.z);
  return [0, 0, sx * sz, sx * sy, 0, 0, 0, sy * sz, 0];
}

/** Matrix that flips the U-layer edge at `home` in place (swaps its 2 normals). */
function edgeFlip(home) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const set = (to, from, sign) => { m[to * 3 + from] = sign; }; // col `from` -> row `to`
  const up = 1;
  const side = home.x !== 0 ? 0 : 2;
  const sideSign = home.x !== 0 ? Math.sign(home.x) : Math.sign(home.z);
  const tangent = side === 0 ? 2 : 0;
  set(side, up, sideSign);   // up normal -> the edge's own side normal
  set(up, side, sideSign);   // side normal -> up
  set(tangent, tangent, -1); // the tangent normal flips
  return m;
}

/** Sanity: the in-place twist/flip matrices must be genuine cube rotations. */
function assertRotation(m, where) {
  assert.ok(R24_INDEX.has(matKey(m)), `${where}: not one of the 24 rotations`);
}

/** The state with the U-layer pieces twisted/flipped in place. */
function llState(tw, fl) {
  const st = new CubeState();
  for (const c of st.cubies) {
    if (c.home.y !== 1) continue;
    const ci = U_CORNERS.findIndex((h) => h.x === c.home.x && h.z === c.home.z);
    if (ci >= 0) {
      const T = cornerTwist(c.home);
      assertRotation(T, `cornerTwist ${c.home}`);
      let rot = [...ID3];
      for (let k = 0; k < tw[ci]; k++) rot = matMul(T, rot);
      c.rot = rot;
      assert.ok(matApply(rot, c.home).x === c.pos.x && matApply(rot, c.home).y === c.pos.y && matApply(rot, c.home).z === c.pos.z, `cornerTwist moved ${c.home}`);
      continue;
    }
    const ei = U_EDGES.findIndex((h) => h.x === c.home.x && h.z === c.home.z);
    if (ei >= 0) {
      const F = edgeFlip(c.home);
      assertRotation(F, `edgeFlip ${c.home}`);
      let rot = [...ID3];
      for (let k = 0; k < fl[ei]; k++) rot = matMul(F, rot);
      c.rot = rot;
    }
  }
  return st;
}

/** The state whose U-layer pieces are permuted by pi (corners) / pe (edges). */
function permState(pi, pe) {
  const st = new CubeState();
  for (let i = 0; i < 4; i++) {
    assign(st, U_CORNERS, pi, i);
    assign(st, U_EDGES, pe, i);
  }
  return st;
}
function assign(st, homes, perm, i) {
  const home = homes[i];
  const target = homes[perm[i]];
  const Yp = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  let rot = [...ID3];
  for (let k = 0; k < 4; k++) {
    const p = matApply(rot, home);
    if (p.x === target.x && p.y === target.y && p.z === target.z) break;
    rot = matMul(Yp, rot);
  }
  for (const c of st.cubies) {
    if (c.home.x !== home.x || c.home.y !== home.y || c.home.z !== home.z) continue;
    const p = matApply(rot, home);
    c.pos = { x: p.x, y: p.y, z: p.z };
    c.rot = [...rot];
  }
}

/** AUF canonical key: the four simultaneous U-turns, lexicographically least.
 * Value arrays (twists/flips) shift with the turn; permutations conjugate. */
function rot4(a) { return [a[3], a[0], a[1], a[2]]; }
function conjugate(p) { const out = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) out[(i + 1) % 4] = (p[i] + 1) % 4; return out; }
function canonKey(...arrays) { return canonKind(arrays, 'value'); }
function canonPerm(...arrays) { return canonKind(arrays, 'perm'); }
function canonKind(arrays, kind) {
  let best = null;
  const cur = arrays.map((a) => [...a]);
  for (let k = 0; k < 4; k++) {
    const s = cur.map((a) => a.join('')).join('/');
    if (best === null || s < best) best = s;
    for (let i = 0; i < cur.length; i++) cur[i] = kind === 'perm' ? conjugate(cur[i]) : rot4(cur[i]);
  }
  return best;
}
function isPerm(a) { return new Set(a).size === 4 && a.every((v) => v >= 0 && v < 4); }

/** Parity of a 4-permutation. */
function permSign(p) {
  let s = 1;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) s = -s;
  return s;
}

// ---- group classification (computed, so filter counts are always true) ------
function groupOfOLL(tw, fl) {
  const twisted = tw.filter((t) => t !== 0).length;
  const flipped = fl.filter((f) => f !== 0).length;
  const pairDist = (idx) => { // which two of four slots: adjacent or diagonal
    const [a, b] = idx;
    return (b - a === 1 || b - a === 3) ? 'adjacent' : 'diagonal';
  };
  const tDesc = twisted === 0 ? 'all corners oriented'
    : twisted === 2 ? `2 corners twisted (${pairDist(tw.map((t, i) => t ? i : -1).filter((i) => i >= 0))})`
    : '3 corners twisted';
  const eDesc = flipped === 0 ? 'no edges flipped'
    : flipped === 2 ? `2 edges flipped (${pairDist(fl.map((f, i) => f ? i : -1).filter((i) => i >= 0))})`
    : 'all four edges flipped';
  return `${tDesc} / ${eDesc}`;
}

function cyclesOf(perm) {
  const seen = [false, false, false, false];
  const cycles = [];
  for (let i = 0; i < 4; i++) {
    if (seen[i]) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
    if (len > 1) cycles.push(len);
  }
  return cycles;
}
function permDesc(perm) {
  const c = cyclesOf(perm);
  if (!c.length) return 'solved';
  if (c.length === 2) return 'two swaps';
  if (c.length === 1 && c[0] === 3) return '3-cycle';
  if (c.length === 1 && c[0] === 4) return '4-cycle';
  const moved = perm.flatMap((v, i) => v === i ? [] : [i]);
  const [a, b] = moved;
  return 'swap ' + ((b - a === 1 || a - b === 1) ? 'adjacent' : 'diagonal');
}
function groupOfPLL(pi, pe) {
  return `${permDesc(pe)} edges + ${permDesc(pi)} corners`;
}

/** Independent legality check with the solver's own slot conventions: corner
 * twist sum ≡ 0 (mod 3), edge flip parity even, permutation parities equal. */
async function legalState(st) {
  const s = makeState();
  setStateFromCube(s, st.clone());
  const tw = twistVec(s);
  if (tw.reduce((a, b) => a + b, 0) % 3 !== 0) return false;
  const fl = flipCodeOf(s);
  if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((i) => (fl >> i) & 1).length % 2 !== 0) return false;
  const parity = (slot) => {
    let inv = 0;
    for (let i = 0; i < slot.length; i++) for (let j = i + 1; j < slot.length; j++) if (slot[i] > slot[j]) inv++;
    return inv % 2;
  };
  return parity(s.cSlot) === parity(s.eSlot);
}

/** Canonical AUF key of a state: least sticker string over the four U turns. */
async function canonStateKey(st) {
  const keys = [];
  const c = st.clone();
  for (let k = 0; k < 4; k++) {
    keys.push(stateToStickerString(c));
    c.applyMove(makeMove('U'));
  }
  keys.sort();
  return keys[0];
}

// ---- algs -------------------------------------------------------------------
// The algorithm must fix the stored case, not merely the rotated one, or the
// trainer would hand the user an alg that does not solve what it showed.
function solvesCase(state, str) {
  const st = state.clone();
  for (const t of parseNotation(str)) st.applyMove(t);
  for (let xi = 0; xi < 4; xi++) {
    let s2 = st.clone();
    for (let yi = 0; yi < 4; yi++) {
      let s3 = s2.clone();
      for (let ui = 0; ui < 4; ui++) {
        if (s3.isSolved()) return true;
        s3.applyMove(U_MOVE);
      }
      s2.applyMove(Y_MOVE);
    }
    st.applyMove(X_MOVE);
  }
  return false;
}

const U_MOVE = makeMove('U');
const X_MOVE = makeMove('x');
const Y_MOVE = makeMove('y');

async function algsFor(state, setKind) {
  const seen = new Set();
  const out = [];
  const variants = [state, ...ufRotations(state)];
  for (const v of variants) {
    const res = await solveCube(v.clone(), { maxTimeMs: 0 });
    if (res.error) {
      const s = stateToStickerString(v);
      console.log('solve error:', res.error, ...[0, 1, 2, 3, 4, 5].map((f) => s.slice(f * 9, f * 9 + 9)));
      continue;
    }
    const seq = res.moves.map((mi) => notation(ALL_MOVES_FULL[mi]));
    if (seq.length === 0) continue;
    const str = seq.join(' ');
    if (seen.has(str)) continue;
    seen.add(str);
    if (!solvesCase(state, str)) continue;
    out.push(str);
  }
  return out;
}

/** The four AUF turns of a last-layer-only state. */
function ufRotations(state) {
  const out = [];
  const st = state.clone();
  for (let k = 0; k < 3; k++) {
    st.applyMove(makeMove('U'));
    out.push(st.clone());
  }
  return out;
}

function algObject(str) {
  const moves = parseNotation(str);
  const m = metrics(moves);
  return { seq: format(moves), htm: m.htm, qtm: m.qtm, etm: m.etm, stm: m.stm, gen: gen(moves) };
}

// ---- writing ----------------------------------------------------------------
const SETS = {
  OLL: {
    file: 'OLL',
    name: 'OLL',
    kind: 'OLL',
    cases: async () => {
      const out = [];
      const seen = new Set();
      for (const tw of combos4((a) => a.every((v) => v < 3))) {
        for (const fl of combos4((a) => a.every((v) => v < 2))) {
          const st = llState(tw, fl);
          if (!await legalState(st)) continue; // legality decides, not my twist sums
          if (st.isSolved()) continue;
          const key = ollKey(st); // AUF-canonical: identical cases collapse here
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ st, tw, fl });
        }
      }
      return out.map(({ st, tw, fl }) => ({ state: st, group: groupOfOLL(tw, fl) }));
    },
  },
  PLL: {
    file: 'PLL',
    name: 'PLL',
    kind: 'PLL',
    cases: async () => {
      const out = [];
      const seen = new Set();
      const ps = perms4();
      const solvedKey = pllKey(new CubeState());
      for (const pi of ps) for (const pe of ps) {
        if (isId(pi) && isId(pe)) continue;
        const st = permState(pi, pe);
        if (!await legalState(st)) continue;
        const key = pllKey(st); // pre+post AUF canonical: the 288 collapse to 22
        if (key === solvedKey) continue; // the AUF/solved class is not a PLL
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ state: st, group: groupOfPLL(pi, pe) });
      }
      return out.map((c) => ({ state: c.state, group: c.group }));
    },
  },
};

import { ollKey, pllKey } from '../src/cases/hash.js';
import { OLL as CURATED_OLL, PLL as CURATED_PLL } from './oll_pll_algs.mjs';

function combos4(pred) {
  const out = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
    const v = [a, b, c, d];
    if (pred(v)) out.push(v);
  }
  return out;
}
function sumOf(a) { return a.reduce((x, y) => x + y, 0); }
function perms4() {
  const out = [];
  for (const v of combos4(() => true)) if (new Set(v).size === 4) out.push(v);
  return out;
}
function isId(p) { return p.join('') === '0123'; }

// ---- curated algorithms -> cases -------------------------------------------
// A curated alg is verified against the enumerated cases, not trusted: an OLL
// alg must leave the last layer oriented with the first two layers intact, and
// a PLL alg must solve the cube up to an AUF. Trying the four pre-AUFs makes
// the check independent of the grip the alg sheet assumes.

const STICKERS_SOLVED = stateToStickerString(new CubeState());

function lastLayerOriented(st) {
  const s = stateToStickerString(st);
  if (s.slice(0, 9) !== 'UUUUUUUUU') return false;
  for (const f of [1, 2, 3, 4]) {
    if (s.slice(f * 9 + 3, f * 9 + 9) !== STICKERS_SOLVED.slice(f * 9 + 3, f * 9 + 9)) return false;
  }
  return s.slice(45) === STICKERS_SOLVED.slice(45);
}

function solvedUpToAUF(st) {
  if (st.isSolved()) return true;
  const s = st.clone();
  for (let i = 0; i < 4; i++) { s.applyMove(U_MOVE); if (s.isSolved()) return true; }
  return false;
}

/** The pre-AUF k that makes `alg` work on `state`, or -1. */
function curatedHit(kind, state, alg) {
  for (let k = 0; k < 4; k++) {
    const st = state.clone();
    for (let i = 0; i < k; i++) st.applyMove(U_MOVE);
    for (const mv of parseNotation(alg)) st.applyMove(mv);
    if (kind === 'OLL' ? lastLayerOriented(st) : solvedUpToAUF(st)) return k;
  }
  return -1;
}

function curatedList(kind) {
  if (kind === 'OLL') return CURATED_OLL.map((alg, i) => ({ num: i + 1, name: `OLL ${i + 1}`, alg }));
  return CURATED_PLL.map((p, i) => ({ num: i + 1, name: `${p.name}-Perm`, alg: p.alg }));
}

function curatedFor(kind, cases) {
  const out = new Map();
  for (const entry of curatedList(kind)) {
    let hit = -1;
    let k = -1;
    for (let i = 0; i < cases.length; i++) {
      const kk = curatedHit(kind, cases[i].state, entry.alg);
      if (kk >= 0) { hit = i; k = kk; break; }
    }
    if (hit < 0) {
      console.log(`curated ${entry.name}: no ${kind} case matches (skipped)`);
      continue;
    }
    if (!out.has(hit)) out.set(hit, []);
    out.get(hit).push({ ...entry, k });
  }
  return out;
}

function aufSuffix(k) {
  return k === 0 ? '' : k === 1 ? 'U' : k === 2 ? 'U2' : "U'";
}

async function main() {
  const pre = await loadPrebuilt();
  console.log('prebuilt tables:', pre ? 'loaded from data/' : 'REBUILT (slower solves)');
  if (pre) {
    buildPDBs(null, pre);
    console.log('using the pre-computed PDBs from data/');
  }
  const want = process.argv.slice(2);
  const names = (want.length ? want : Object.keys(SETS)).filter((n) => SETS[n]);
  for (const unknown of want.filter((n) => !SETS[n])) console.log('unknown set:', unknown);
  for (const name of names) {
    const cfg = SETS[name];
    const cases = await cfg.cases();
    const curated = curatedFor(cfg.kind, cases);
    const rows = cases.map((c, i) => ({ ...c, i, curated: (curated.get(i) ?? []).sort((a, b) => a.num - b.num) }));
    rows.sort((a, b) => {
      const na = a.curated.length ? a.curated[0].num : 1000 + a.i;
      const nb = b.curated.length ? b.curated[0].num : 1000 + b.i;
      return na - nb;
    });

    const entries = [];
    const groupsSeen = {};
    for (const row of rows) {
      const { state, group } = row;
      const num = row.curated.length ? row.curated[0].num : 1000 + row.i;
      assert.ok(state.invariantOK(), 'case state must satisfy pos = rot . home');
      const solving = await algsFor(state, cfg.kind);
      assert.ok(solving.length, `${name} case ${row.i} unsolvable`);

      // The shown state is the case at the AUF the algorithm expects, so the
      // alg on the card solves exactly what the trainer shows.
      const k = row.curated.length ? row.curated[0].k : 0;
      const shown = state.clone();
      for (let i = 0; i < k; i++) shown.applyMove(U_MOVE);
      const stickers = stateToStickerString(shown);

      let setup = inverseStr(solving[0]);
      const auf = aufSuffix(k);
      if (auf) setup = `${setup} ${auf}`;
      const rebuilt = new CubeState();
      for (const mv of parseNotation(setup)) rebuilt.applyMove(mv);
      assert.ok(stateToStickerString(rebuilt) === stickers, `${name} setup/sticker mismatch in case ${row.i}`);

      const curatedAlgs = row.curated.map((c) => algObject(c.alg));
      const algs = curatedAlgs.length ? curatedAlgs : solving.map(algObject);
      const primary = algs.sort((a, b) => a.htm - b.htm)[0];
      const idNum = num < 1000 ? num : entries.length + 1;
      const displayName = row.curated.length ? row.curated[0].name : `${name} ${idNum}`;

      groupsSeen[group] = (groupsSeen[group] ?? 0) + 1;
      entries.push({
        id: `${name}_${idNum}`,
        name: displayName,
        group,
        setup,
        stickers,
        algs,
        primary: primary.seq,
      });
    }

    const doc = {
      id: name,
      puzzle: '3x3',
      name,
      kind: cfg.kind,
      count: entries.length,
      groupField: 'group',
      groups: [...new Set(Object.keys(groupsSeen))],
      crossOrientations: { white: 'z2', yellow: '', green: "x'", blue: 'x', red: 'z', orange: "z'" },
      cases: entries,
    };
    const out = `data/algdb/3x3/${cfg.file}.json`;
    await mkdir('data/algdb/3x3', { recursive: true });
    await writeFile(out, JSON.stringify(doc, null, 1));
    console.log(`${name}: ${entries.length} cases -> data/algdb/3x3/${cfg.file}.json`);
    console.log(`   curated coverage: ${curated.size}/${cases.length}`);
    for (const [g, n] of Object.entries(groupsSeen)) console.log(`   ${g}: ${n}`);
  }
  // The browser cannot list a directory, so the puzzle gets an index file.
  for (const puzzle of ['3x3', '2x2', '4x4']) {
    try {
      const names = await readdir(`data/algdb/${puzzle}`);
      const sets = names.filter((n) => n.endsWith('.json') && n !== 'index.json').map((n) => n.slice(0, -5));
      await writeFile(`data/algdb/${puzzle}/index.json`, JSON.stringify({ puzzle, sets }, null, 1));
      console.log(`index: ${puzzle} -> ${sets.join(', ')}`);
    } catch {
      void 0;
    }
  }
}

main();
