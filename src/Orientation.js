// Pure-JS view orientation helpers: which cube face is currently facing the
// camera. Deliberately free of any THREE/DOM import so it can be unit tested
// in plain Node (see tests/orientation.test.mjs).
//
// World convention (see constants.js): +Y = U (white), -Y = D (yellow),
// +X = R (red), -X = L (orange), +Z = F (green), -Z = B (blue).

export const FACE_NORMALS = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
};

// Physical centre-cubie position of each face. Also used to find the centre
// cubie that should blink for the face currently in view.
export const FACE_CENTERS = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
};

const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

// Fixed scan order so ties (diagonal views) always resolve the same way.
const TIE_ORDER = ['F', 'R', 'U', 'L', 'D', 'B'];

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 1, z: 0 };
}

/** Face letter whose normal has the largest dot product with v. */
export function faceForDirection(v) {
  let best = TIE_ORDER[0];
  let bestDot = -Infinity;
  for (const f of TIE_ORDER) {
    const d = dot(FACE_NORMALS[f], v);
    if (d > bestDot) { bestDot = d; best = f; }
  }
  return best;
}

export function oppositeFace(f) { return OPPOSITE[f] || f; }

/**
 * Map a camera placement onto the six cube faces it is looking at.
 * @param {{x,y,z}} camPos  camera world position
 * @param {{x,y,z}} target  orbit target (cube centre)
 * @param {{x,y,z}} camUp   camera up vector
 */
export function viewFaces(camPos, target, camUp) {
  const out = norm({ x: camPos.x - target.x, y: camPos.y - target.y, z: camPos.z - target.z });

  // When looking straight down/up the real up vector is parallel to the view
  // direction and cross() degenerates; fall back to another axis.
  let up = norm(camUp);
  if (!Number.isFinite(up.x) || Math.abs(dot(up, out)) > 0.999) {
    up = Math.abs(out.y) < 0.999 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  }

  const forward = { x: -out.x, y: -out.y, z: -out.z };
  const right = norm(cross(up, out));
  const up2 = norm(cross(right, forward));

  return {
    front: faceForDirection(out),
    up: faceForDirection(up2),
    right: faceForDirection(right),
    left: oppositeFace(faceForDirection(right)),
    down: oppositeFace(faceForDirection(up2)),
    back: oppositeFace(faceForDirection(out)),
  };
}
