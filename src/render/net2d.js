// CubeNet: a 2D net of a state, drawn as SVG squares from a sticker string.
// Used by the case cards, the trainers and the analyzer — no WebGL involved.

import { FACE_ORDER, cellPos } from './stickerString.js';

const COLOR = {
  U: '#f4f4f4', D: '#ffd500', F: '#1e85ff', B: '#ff5c00', R: '#00994d', L: '#c40000',
  x: '#20242b', // face centre of an N>3 cube, and unknown stickers
};

/** Net layout: which face sits where, in cell units of a (2N) x (3N+1) grid. */
const NET_FACE_ORIGIN = { U: [1, 0], F: [1, 1], R: [2, 1], B: [3, 1], L: [0, 1], D: [1, 2] };

/** Sticker string -> SVG markup for the net (also usable as a preview). */
export function netSvg(str, size = 3, cell = 8) {
  const faces = {};
  for (let f = 0; f < 6; f++) faces[FACE_ORDER[f]] = str.slice(f * size * size, (f + 1) * size * size);
  const w = 4 * size * cell;
  const h = 3 * size * cell;
  const parts = [];
  for (const [face, grid] of Object.entries(faces)) {
    const [ox, oy] = NET_FACE_ORIGIN[face];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const ch = grid[row * size + col] ?? 'x';
        const fill = COLOR[ch] ?? COLOR.x;
        const x = (ox * size + col) * cell;
        const y = (oy * size + row) * cell;
        parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="#0b0d12" stroke-width="1"/>`);
      }
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('')}</svg>`;
}

/** The stickers of one face as letters, top-left first (for hints and tests). */
export function faceStickers(str, face, size = 3) {
  const i = FACE_ORDER.indexOf(face);
  if (i < 0) throw new Error(`Unknown face ${face}`);
  return str.slice(i * size * size, (i + 1) * size * size);
}

/** Rotate the whole-cube view so a different colour is U (the Cross Color UI). */
export function crossColorFaces(str, size) {
  const out = {};
  for (const face of FACE_ORDER) out[face] = faceStickers(str, face, size);
  return out;
}
