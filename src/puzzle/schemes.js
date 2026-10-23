// Colour schemes: direction normal (solved orientation) -> sticker colour name.
// Keys are the outward normal of a sticker in the SOLVED cube, "x,y,z".
// Kept separate from src/constants.js (which owns the 3D palette) so a puzzle
// can pick its own scheme without touching geometry.

import { DIRECTION_COLORS } from '../constants.js';

export const PUZZLES = {
  '3x3': { size: 3, scheme: 'classic' },
  '2x2': { size: 2, scheme: 'classic' },
  '4x4': { size: 4, scheme: 'classic' },
  '5x5': { size: 5, scheme: 'classic' },
};

export const SCHEMES = {
  // +Y white / -Y yellow / +X red / -X orange / +Z green / -Z blue.
  classic: DIRECTION_COLORS,
};

export function schemeColors(name = 'classic') {
  const s = SCHEMES[name];
  if (!s) throw new Error(`Unknown scheme: ${name}`);
  return s;
}

export function puzzleSpec(id = '3x3') {
  const p = PUZZLES[id];
  if (!p) throw new Error(`Unknown puzzle: ${id}`);
  return p;
}
