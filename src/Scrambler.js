// Scramble generator (WCA-style: 20 moves, no same-face repeats in a row
// when that face also matches the one before).

import { makeMove, notation } from './moves.js';

const SCRAMBLE_FACES = ['U', 'D', 'L', 'R', 'F', 'B'];

/**
 * Generate `count` random face moves as move objects.
 * @param {number} count
 * @param {() => number} rng uniform [0,1) generator
 */
export function generateScramble(count = 20, rng = Math.random) {
  const moves = [];
  let prev1 = null;
  let prev2 = null;
  for (let i = 0; i < count; i++) {
    let face;
    do {
      face = SCRAMBLE_FACES[Math.floor(rng() * SCRAMBLE_FACES.length)];
    } while (face === prev1 || face === prev2);
    const mod = ['', '2', "'"][Math.floor(rng() * 3)];
    moves.push(makeMove(face, mod));
    prev2 = prev1;
    prev1 = face;
  }
  return moves;
}

/** Human-readable scramble string, e.g. "U R2 F' L ...". */
export function scrambleString(moves) {
  return moves.map((m) => notation(m)).join(' ');
}
