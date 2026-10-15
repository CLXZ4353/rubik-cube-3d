// Logic tests for the pure (non-Three.js) modules.
// Run with:  node tests/logic.test.mjs

import assert from 'node:assert/strict';
import { CubeState } from '../src/CubeState.js';
import { parseNotation, inverseMove, matApply, R24, ID3, ALL_MOVES_FULL } from '../src/moves.js';
import { generateScramble, scrambleString } from '../src/Scrambler.js';
import { solveCube } from '../src/Solver.js';

// Canonical = every cubie exactly home (position and orientation identity),
// except that face-center cubies may carry an invisible in-plane rotation
// (their sticker is a single colour, so rot is unobservable).
function isCanonical(s) {
  for (const c of s.cubies) {
    if (c.pos.x !== c.home.x || c.pos.y !== c.home.y || c.pos.z !== c.home.z) return false;
    const man = Math.abs(c.home.x) + Math.abs(c.home.y) + Math.abs(c.home.z);
    if (man === 1) continue; // center rot unobservable
    for (let i = 0; i < 9; i++) if (c.rot[i] !== ID3[i]) return false;
  }
  return true;
}
// Solve a CubeState and verify the solution canonicalises a clone.
async function solveAndCheck(state) {
  const res = await solveCube(state);
  if (res.error) throw new Error('solver error: ' + res.error);
  const v = state.clone();
  for (const mi of res.moves) v.applyMove(ALL_MOVES_FULL[mi]);
  assert.ok(isCanonical(v), 'solution must canonicalise the state');
  return res;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log('  ok  ' + name);
    passed++;
  } catch (e) {
    console.error('FAIL  ' + name);
    console.error('      ' + (e.stack || e.message).split('\n').join('\n      '));
    failed++;
  }
};

const solved = () => new CubeState();
const fp = (s) => s.fingerprint();
const apply = (s, ...tokens) => {
  for (const t of tokens) s.applyMove(parseNotation(t)[0]);
};

// ---------------------------------------------------------------------------

await test('R24 has 24 unique rotations', () => {
  assert.equal(R24.length, 24);
  assert.equal(new Set(R24.map((m) => m.join(''))).size, 24);
});

await test('inverse moves restore state (R, F, U, M, S, x)', () => {
  for (const t of ['R', 'F', 'U', "L'", 'D2', 'M', "S'", 'x', "y2", 'z']) {
    const s = solved();
    apply(s, t);
    apply(s, inverseNotation(t));
    assert.ok(s.isSolved(), `inverse of ${t} does not restore state`);
  }
});
function inverseNotation(t) {
  const face = t[0];
  const mod = t.slice(1);
  if (mod === '') return face + "'";
  if (mod === "'") return face;
  return face + '2'; // 2 inverse is 2
}

await test('double of a double is identity (R2 R2, U2 U2, M2 M2)', () => {
  for (const t of ['R2', 'U2', 'M2', 'x2']) {
    const s = solved();
    apply(s, t, t);
    assert.ok(s.isSolved(), `${t} ${t} should restore state`);
  }
});

await test('four quarter turns is identity (R, U, F, D, L, B)', () => {
  for (const t of ['R', 'U', 'F', 'D', 'L', 'B']) {
    const s = solved();
    apply(s, t, t, t, t);
    assert.ok(s.isSolved(), `${t}x4 should restore state`);
  }
});

await test('R U R\' U\' moves UFR corner to DFR (verified trace)', () => {
  const s = solved();
  apply(s, 'R', 'U', "R'", "U'");
  const cubie = s.cubies.find((c) => c.home.x === 1 && c.home.y === 1 && c.home.z === 1);
  assert.deepEqual(cubie.pos, { x: 1, y: -1, z: 1 });
});

await test('R U R\' U\' is a 6-cycle on the full state', () => {
  const base = solved();
  const s = solved();
  const seq = ['R', 'U', "R'", "U'"];
  for (let i = 0; i < 6; i++) {
    apply(s, ...seq);
    if (i < 5) assert.notEqual(fp(s), fp(base), `after ${i + 1} applications should differ`);
  }
  assert.equal(fp(s), fp(base), 'after 6 applications state must return home');
});

await test('scramble + exact inverse restores the solved state', () => {
  const s = solved();
  const sc = generateScramble(20, mulberry32(42));
  sc.forEach((m) => s.applyMove(m));
  assert.ok(!s.isSolved(), 'scramble should unsolve the cube');
  assert.equal(scrambleString(sc).split(' ').length, 20);
  for (const m of [...sc].reverse()) s.applyMove(inverseMove(m));
  assert.ok(isCanonical(s), 'inverse scramble must return to canonical state');
});

await test('700 random moves: invariants hold (slot uniqueness, pos = rot ∘ home)', () => {
  const s = solved();
  const rng = mulberry32(7);
  const faces = 'UDLRFBMESxyz';
  const mods = ['', "'", '2'];
  for (let i = 0; i < 700; i++) {
    const f = faces[(rng() * faces.length) | 0];
    const mod = mods[(rng() * mods.length) | 0];
    s.applyMove(parseNotation(f + mod)[0]);
    const seen = new Set();
    for (const c of s.cubies) {
      const k = `${c.pos.x},${c.pos.y},${c.pos.z}`;
      assert.ok(!seen.has(k), 'two cubies share a slot');
      seen.add(k);
      const expected = matApply(c.rot, c.home);
      assert.deepEqual(c.pos, expected, 'pos must equal rot ∘ home');
    }
  }
});

await test('solver: whole-cube-rotated solved state (x\' y) canonicalises', async () => {
  const s = solved();
  apply(s, "x'", 'y');
  assert.ok(s.isSolved(), 'should still be "solved" (uniform faces)');
  assert.ok(!isCanonical(s), 'but not canonical');
  await solveAndCheck(s);
});

await test('solver: short scrambles (<=10 moves) all solve', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = solved();
    generateScramble(10, mulberry32(seed)).forEach((m) => s.applyMove(m));
    const res = await solveAndCheck(s);
    if (seed === 1) console.log(`      (seed 1: ${res.moves.length} moves, ${res.time} ms)`);
  }
});

await test('solver: single move / partial states', async () => {
  for (const t of ['R', "U'", 'F2', 'L', 'U', "B'"]) {
    const s = solved();
    apply(s, t);
    await solveAndCheck(s);
  }
  // a small sequence
  const s = solved();
  apply(s, 'R', 'U', "R'", "U'", 'R');
  await solveAndCheck(s);
});

await test('parseNotation: suffix is none, \' or 2 only', async () => {
  for (const t of ['R', "R'", 'R2', 'M2', "x'", 'y2', 'z']) parseNotation(t);
  for (const bad of ["R'2", 'R22', 'R2\'', 'RR', 'E3', 'W']) {
    let threw = false;
    try {
      parseNotation(bad);
    } catch {
      threw = true;
    }
    assert.ok(threw, `Invalid move token: ${bad} must be rejected`);
  }
});

await test('progress records always carry nodes + time', async () => {
  const seen = [];
  const s = solved();
  generateScramble(12, mulberry32(7)).forEach((m) => s.applyMove(m));
  await solveCube(s, { onProgress: (info) => seen.push(info) });
  assert.ok(seen.length > 0, 'phase1/phase2/done records posted');
  for (const r of seen) {
    assert.ok(Number.isInteger(r.nodes) && Number.isInteger(r.time), `progress ${r.phase} must carry nodes+time`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
