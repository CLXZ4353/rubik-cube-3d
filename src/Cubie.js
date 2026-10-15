// A single 3D cubie: a rounded dark body plus coloured stickers on its
// outward faces (in the cubie's LOCAL frame). The whole mesh is a THREE.Group
// whose transform is driven by the authoritative logical state.

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';
import {
  CUBIE_SIZE, BEVEL_RADIUS, BEVEL_SEGMENTS,
  STICKER_SIZE, STICKER_RADIUS, STICKER_OFFSET,
  PITCH, COLORS,
} from './constants.js';

const _z = new THREE.Vector3(0, 0, 1);

// Dark grey the highlighted cubie fades to at glow level 0.
const GLOW_DARK = new THREE.Color('#12151a');

function roundedRectGeometry(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 4);
}

// Shared geometry + materials (built once).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c0f, roughness: 0.42, metalness: 0.25,
  });
  const stickerMats = {};
  for (const [name, hex] of Object.entries(COLORS)) {
    stickerMats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.3, metalness: 0.05,
    });
  }
  SHARED = {
    bodyGeo: new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, BEVEL_SEGMENTS, BEVEL_RADIUS),
    bodyMat,
    stickerGeo: roundedRectGeometry(STICKER_SIZE, STICKER_SIZE, STICKER_RADIUS),
    stickerMats,
  };
  return SHARED;
}

export class Cubie {
  /**
   * @param {object} logical  the CubeState cubie ({id, home, pos, rot, stickers})
   */
  constructor(logical) {
    this.logical = logical;
    const s = shared();
    this.group = new THREE.Group();
    this.group.name = `cubie-${logical.id}`;

    const body = new THREE.Mesh(s.bodyGeo, s.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Stickers live in the cubie's local frame on its outward faces.
    this.stickers = [];
    const half = CUBIE_SIZE / 2 + STICKER_OFFSET;
    for (const st of logical.stickers) {
      const m = new THREE.Mesh(s.stickerGeo, s.stickerMats[st.color]);
      m.position.set(st.n.x * half, st.n.y * half, st.n.z * half);
      m.quaternion.setFromUnitVectors(_z, new THREE.Vector3(st.n.x, st.n.y, st.n.z));
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      this.stickers.push(m);
    }
    this._glowMats = null;   // per-cubie material clones, built on first setGlow(true)
    this._glowBase = null;   // their original sticker colours, for the dark blink
    this._glowLevel = 0;
    this.syncFromLogical();
  }

  /**
   * Blink highlight for the centre cubie of the face in view.
   * Sticker materials are SHARED across all cubies of a colour, so we clone
   * them per cubie instead of touching the shared ones.
   */
  setGlow(on) {
    if (on) {
      if (!this._glowMats) {
        // Remember each sticker's own colour: the blink lerps from it to dark.
        this._glowBase = this.stickers.map((m) => m.material.color.clone());
        this._glowMats = this.stickers.map((m) => {
          const clone = m.material.clone();
          clone.emissiveIntensity = 0;
          return clone;
        });
      }
      this.stickers.forEach((m, i) => { m.material = this._glowMats[i]; });
    } else if (this._glowMats) {
      // Restore the original shared materials.
      this.stickers.forEach((m, i) => { m.material = shared().stickerMats[this.logical.stickers[i].color]; });
      this._glowLevel = 0;
    }
    this._glowing = !!on;
  }

  /**
   * Blink amount in 0..1: 0 = near-black, 1 = the sticker's normal colour.
   * (no-op when glow was never enabled)
   */
  setGlowLevel(v) {
    if (!this._glowMats) return;
    const lv = Math.max(0, Math.min(1, v));
    this._glowLevel = lv;
    for (let i = 0; i < this._glowMats.length; i++) {
      this._glowMats[i].color.copy(this._glowBase[i]).lerp(GLOW_DARK, 1 - lv);
    }
  }

  /** Copy the exact transform of the logical cubie onto this group. */
  syncFromLogical() {
    const c = this.logical;
    this.group.position.set(c.pos.x * PITCH, c.pos.y * PITCH, c.pos.z * PITCH);
    const m4 = new THREE.Matrix4().set(
      c.rot[0], c.rot[1], c.rot[2], 0,
      c.rot[3], c.rot[4], c.rot[5], 0,
      c.rot[6], c.rot[7], c.rot[8], 0,
      0, 0, 0, 1,
    );
    this.group.quaternion.setFromRotationMatrix(m4);
  }
}
