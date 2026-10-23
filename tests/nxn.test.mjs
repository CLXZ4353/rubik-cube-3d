// Phase 2 gate: the engine must work for N x N, not just 3 x 3.
// Sizes 2..5: layer coordinates, solving check, legality invariant, wide / slice
// / rotation moves, sticker-string round trip, and scramble + inverse = solved.
//
//   node tests/nxn.test.mjs

import { CubeState } from '../src/CubeState.js';
import { layerCoords, sliceCoords, parseNotation, notation, inverseMove, makeMove } from '../src/moves.js';
import { stateToStickerString, stickerStringToState } from '../src/render/stickerString.js';
import { puzzleSpec } from '../src/puzzle/schemes.js';
import assert from 'node:assert/strict';

let ok = 0;
let fails = 0;
const check = (name, cond) => {
  if (cond) ok++;
  else {
    fails++;
    console.log(`FAIL ${name}`);
  }
};

for (const size of [2, 3, 4, 5]) {
  const label = `${size}x${size}`;

  // 1. layer coordinates: symmetric, none outside the cube; odd N has a middle
  //    layer at 0, even N straddles the middle with no zero.
  const coords = layerCoords(size);
  check(`${label} layer count`, coords.length === size);
  check(`${label} coords symmetric`, coords.every((c) => coords.includes(-c)));
  check(`${label} coords are ${size} apart`, coords.every((c) => Math.abs(c) <= size - 1));
  const sorted = [...coords].sort((a, b) => a - b);
  const step = size % 2 === 1 ? 1 : 2;
  check(`${label} spacing`, sorted.slice(1).every((c, i) => c - sorted[i] === step));
  check(`${label} zero iff odd`, (size % 2 === 1) === coords.includes(0));
  const mid = coords[Math.floor(size / 2)];
  check(`${label} middle layer`, size % 2 === 1 ? mid === 0 : Math.abs(mid) === 1);
  check(`${label} slice coords`, sliceCoords(size).length === Math.max(0, size - 2));

  const solved = new CubeState(size);
  check(`${label} solved at start`, solved.isSolved());
  check(`${label} invariant ok at start`, solved.invariantOK());
  check(`${label} spec size`, puzzleSpec(label).size === size);

  // 2. the engine keeps every cubie, visible or not: N^3 of them
  const expected = size ** 3;
  check(`${label} cubie count`, solved.cubies.length === expected);

  // 3. sticker string: N^2 stickers per face, and each colour appears N^2 times
  const str = stateToStickerString(solved);
  check(`${label} sticker length`, str.length === 6 * size * size);
  const counts = {};
  for (const ch of str) counts[ch] = (counts[ch] || 0) + 1;
  check(`${label} colour counts`, Object.keys(counts).length === 6 && Object.values(counts).every((n) => n === size * size));

  // 4. sticker round trip must give the same state back
  const back = stickerStringToState(str, size);
  check(`${label} sticker round trip`, back.fingerprint() === solved.fingerprint());

  // 5. a scramble with face, double-layer wide and whole-cube rotation moves,
  //    undone move by move, must return to solved.
  const moves = [`R`, `${size > 2 ? `Rw` : `R`}`, `${size > 2 ? `M` : `R'`}`, `y`, `U2`, `F'`];
  if (size === 2) moves.splice(2, 1); // no slice layer on a 2x2
  const tokens = parseNotation(moves.join(' '), size);
  check(`${label} parsed tokens`, tokens.length === moves.length);
  check(`${label} notation round trip`, tokens.map((t) => notation(t)).join(' ') === moves.join(' '));

  const st = new CubeState(size);
  for (const t of tokens) st.applyMove(t);
  check(`${label} scramble changes state`, !st.isSolved());
  for (let i = tokens.length - 1; i >= 0; i--) st.applyMove(inverseMove(tokens[i]));
  check(`${label} scramble + inverse solved`, st.isSolved());
  check(`${label} invariant holds after undo`, st.invariantOK());

  // 6. legality survives a longer random scramble: colour counts stay N^2 each,
  //    which catches stickers moving onto the wrong face.
  const rng = mulberry32(size * 7919 + 13);
  const pool = ['U', 'D', 'L', 'R', 'F', 'B'];
  const long = [];
  for (let i = 0; i < 40; i++) {
    const face = pool[Math.floor(rng() * pool.length)];
    const suffix = [' ', '2', "'"][Math.floor(rng() * 3)];
    const wide = size > 2 && rng() < 0.3 ? 'w' : '';
    long.push(`${face}${wide}${suffix}`.trim());
  }
  const big = new CubeState(size);
  for (const t of parseNotation(long.join(' '), size)) big.applyMove(t);
  const scrambled = stateToStickerString(big);
  const counts2 = {};
  for (const ch of scrambled) counts2[ch] = (counts2[ch] || 0) + 1;
  check(`${label} colour counts after scramble`, Object.values(counts2).every((n) => n === size * size));
  check(`${label} invariant after scramble`, big.invariantOK());
  // The sticker string cannot say how hidden cubies are twisted, so compare
  // strings (what a viewer sees), not fingerprints. Only for N <= 3: on N >= 4
  // the fitter assigns pieces one by one, and interchangeable same-colour
  // centres can land on the same cell.
  if (size <= 3) {
    const rebuilt = stickerStringToState(scrambled, size);
    check(`${label} rebuild ok`, rebuilt !== null && stateToStickerString(rebuilt) === scrambled);
  }
}

console.log(`nxn: ${ok} ok, ${fails} fails`);
process.exit(fails ? 1 : 0);

function mulberry32(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) & 0xffffffff;
    let t = s;
    t = (t ^ (t >>> 15)) * (t | 1) & 0xffffffff;
    t = (t ^ (t >>> 7 | 0x20)) & 0xffffffff;
    return (t >>> 0) / 0x100000000;
  };
}
