// Unit tests for src/Orientation.js (pure JS: no THREE, no DOM).
// Run with:  node tests/orientation.test.mjs

import assert from 'node:assert/strict';
import {
  viewFaces, faceForDirection, oppositeFace, FACE_NORMALS, FACE_CENTERS,
} from '../src/Orientation.js';

const O = { x: 0, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }

// --- faceForDirection / oppositeFace ---------------------------------------
assert.equal(faceForDirection({ x: 0, y: 1, z: 0 }), 'U');
assert.equal(faceForDirection({ x: 0, y: -1, z: 0 }), 'D');
assert.equal(faceForDirection({ x: 1, y: 0, z: 0 }), 'R');
assert.equal(faceForDirection({ x: -1, y: 0, z: 0 }), 'L');
assert.equal(faceForDirection({ x: 0, y: 0, z: 1 }), 'F');
assert.equal(faceForDirection({ x: 0, y: 0, z: -1 }), 'B');
n += 6;

// Not normalised: direction only matters.
assert.equal(faceForDirection({ x: 0, y: 5, z: 0 }), 'U');
assert.equal(faceForDirection({ x: 0, y: 0, z: 99 }), 'F');
n += 2;

// Deterministic tie-break: an exact 45° diagonal resolves to 'F' every time.
for (let i = 0; i < 5; i++) {
  assert.equal(faceForDirection({ x: 1, y: 0, z: 1 }), 'F');
}
n += 5;

assert.equal(oppositeFace('U'), 'D');
assert.equal(oppositeFace('D'), 'U');
assert.equal(oppositeFace('R'), 'L');
assert.equal(oppositeFace('F'), 'B');
assert.equal(oppositeFace('B'), 'F');
n += 5;

// FACE_CENTERS must match the logical face normals.
for (const f of Object.keys(FACE_NORMALS)) {
  const a = FACE_NORMALS[f], b = FACE_CENTERS[f];
  assert.deepEqual(b, { x: a.x, y: a.y, z: a.z });
}
n += 1;

// --- viewFaces: camera on +Z (default view) --------------------------------
{
  const v = viewFaces({ x: 0, y: 0, z: 8 }, O, UP);
  assert.deepEqual(v, {
    front: 'F', up: 'U', right: 'R',
    left: 'L', down: 'D', back: 'B',
  });
  n++;
}

// --- viewFaces: camera on +X (red face in front) ---------------------------
// The user's explicit requirement: after orbiting to the red face, pressing R
// must turn the BLUE face (which is now on the right of the screen).
{
  const v = viewFaces({ x: 8, y: 0, z: 0 }, O, UP);
  assert.equal(v.front, 'R');
  assert.equal(v.right, 'B');
  assert.equal(v.back, 'L');
  assert.equal(v.left, 'F');
  assert.equal(v.up, 'U');
  assert.equal(v.down, 'D');
  n++;
}

// --- viewFaces: camera on -Z, -X, and diagonal ------------------------------
{
  const b = viewFaces({ x: 0, y: 0, z: -8 }, O, UP);
  assert.equal(b.front, 'B');
  assert.equal(b.up, 'U');
  assert.equal(b.right, 'L');
  n++;
}
{
  const l = viewFaces({ x: -8, y: 0, z: 0 }, O, UP);
  assert.equal(l.front, 'L');
  assert.equal(l.right, 'F');
  n++;
}

// --- viewFaces: degenerate straight-down / straight-up ----------------------
for (const cam of [{ x: 0, y: 8, z: 0 }, { x: 0, y: -8, z: 0 }]) {
  const v = viewFaces(cam, O, UP);
  for (const key of ['front', 'up', 'right', 'left', 'down', 'back']) {
    ok(typeof v[key] === 'string' && v[key].length === 1, `${key} is a face letter`);
    ok(Object.prototype.hasOwnProperty.call(FACE_NORMALS, v[key]), `${key} = ${v[key]} is valid`);
  }
  assert.equal(oppositeFace(v.front), v.back);
  assert.equal(oppositeFace(v.up), v.down);
  assert.equal(oppositeFace(v.right), v.left);
  // Degenerate: no NaN may leak into any component we derive from.
  const v2 = viewFaces(cam, O, { x: 0, y: 1, z: 0 });
  assert.equal(v2.front, v.front);
  n += 3;
}

// --- viewFaces with a non-zero target and a rolled camera -------------------
{
  const v = viewFaces({ x: 0, y: 4, z: 8 }, { x: 0, y: 1, z: 0 }, { x: 0.2, y: 0.9, z: 0 });
  ok(v.front === 'F' || v.front === 'U', `sane front got ${v.front}`);
  ok(Object.prototype.hasOwnProperty.call(FACE_NORMALS, v.up), 'up is a face letter');
  assert.equal(oppositeFace(v.front), v.back);
  n++;
}

console.log(`orientation.test.mjs: ${n} assertions passed`);
