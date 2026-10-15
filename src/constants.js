// Central constants: geometry, colors, animation timing, camera limits.

// --- Cubie geometry -------------------------------------------------------
export const CUBIE_SIZE = 1.0;                    // side length of one cubie
export const CUBIE_GAP = 0.06;                    // clear gap between neighbours
export const PITCH = CUBIE_SIZE + CUBIE_GAP;      // world distance between cubie centres
export const BEVEL_RADIUS = 0.07;                 // rounded-edge radius
export const BEVEL_SEGMENTS = 3;                  // RoundedBoxGeometry smoothness

// --- Stickers -------------------------------------------------------------
export const STICKER_SIZE = 0.86;                 // sticker edge length
export const STICKER_RADIUS = 0.12;               // sticker corner radius
export const STICKER_OFFSET = 0.012;              // distance above the cubie face

// --- Scene -----------------------------------------------------------------
// Far enough below the cube that the contact shadow stays clear of it,
// so the underside (yellow) face is not lost in its own shadow.
export const FLOOR_Y = -5.5;

// Classic colour scheme.
// Opposite faces: white/yellow, red/orange, blue/green.
export const COLORS = {
  white:  '#f4f5f7',
  yellow: '#ffd60a',
  red:    '#c41e3a',
  orange: '#ff7a00',
  blue:   '#0046ad',
  green:  '#009b48',
};

// World direction -> sticker colour in the solved reference orientation.
// +Y = U (white)   -Y = D (yellow)   +X = R (red)
// -X = L (orange)  +Z = F (green)    -Z = B (blue)
export const DIRECTION_COLORS = {
  '0,1,0':  'white',
  '0,-1,0': 'yellow',
  '1,0,0':  'red',
  '-1,0,0': 'orange',
  '0,0,1':  'green',
  '0,0,-1': 'blue',
};

// --- Animation timing (ms) -------------------------------------------------
export const DUR_TURN_90 = 260;
export const DUR_TURN_180 = 390;
export const DUR_SCRAMBLE = 130;
export const DUR_SOLVE = 170;

// --- Camera -----------------------------------------------------------------
// The rig orbits with quaternions, so there is deliberately no min/max polar
// angle: rotation is unlimited in every direction. Only zoom is clamped.
export const CAMERA = {
  fov: 40,
  minDist: 4.6,
  maxDist: 13,
  // Default three-quarter view showing top (+Y), front (+Z) and right (+X).
  // theta/phi are only used to seed the initial orientation quaternion.
  default: { theta: 0.687, phi: 1.13, radius: 8 },
  target: { x: 0, y: 0, z: 0 },
};
