// A small custom orbit camera built on quaternions instead of spherical
// (theta, phi) coordinates: quaternion orbits have no poles, so the view can
// rotate a full 360° in every direction with no clamping and no gimbal flip.
// Exponential damping toward target values. No OrbitControls dependency.

import * as THREE from 'three';
import { CAMERA } from './constants.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
// Scratch: orbit() runs per pointer-move and update() per frame, so neither may
// allocate.
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Orientation quaternion for a spherical (theta, phi) preset. */
function quatFromThetaPhi(theta, phi, out) {
  out.setFromAxisAngle(Y_AXIS, theta);
  Q.setFromAxisAngle(X_AXIS, phi - Math.PI / 2);
  out.multiply(Q);
  return out;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);

    this.radius = CAMERA.default.radius;

    // Current (rendered) orientation and its damped target.
    this.quat = quatFromThetaPhi(CAMERA.default.theta, CAMERA.default.phi, new THREE.Quaternion());
    this.tQuat = this.quat.clone();

    // Targets (input writes these; update() damps current toward them)
    this.tRadius = this.radius;

    this.minDist = CAMERA.minDist;
    this.maxDist = CAMERA.maxDist;
    this.damping = 0.16; // 0..1, higher = snappier
    this.moved = true;   // did the orientation change in the last update()?
  }

  /** dTheta/dPhi in radians from a drag delta. Unclamped: no poles. */
  orbit(dTheta, dPhi) {
    Q.setFromAxisAngle(Y_AXIS, dTheta);
    this.tQuat.premultiply(Q);
    // Pitch around the camera's own right axis, so yaw/pitch never interfere.
    V.copy(X_AXIS).applyQuaternion(this.tQuat);
    Q.setFromAxisAngle(V, dPhi);
    this.tQuat.premultiply(Q);
  }

  /** Multiplicative zoom (delta>0 zooms out). */
  zoom(delta) {
    this.tRadius = clamp(this.tRadius * Math.exp(delta), this.minDist, this.maxDist);
  }

  /**
   * Nudge to a preset (e.g. reset view). `immediate` also snaps the current
   * orientation, used at construction so the first frame is already correct.
   */
  setView(theta, phi, radius, immediate = false) {
    quatFromThetaPhi(theta, phi, this.tQuat);
    this.tRadius = clamp(radius, this.minDist, this.maxDist);
    if (immediate) {
      this.quat.copy(this.tQuat);
      this.radius = this.tRadius;
    }
  }

  update() {
    const px = this.quat.x, py = this.quat.y, pz = this.quat.z, pw = this.quat.w;
    this.quat.slerp(this.tQuat, this.damping);
    this.radius += (this.tRadius - this.radius) * this.damping;
    // Zoom alone keeps the view direction, so only an orientation change makes
    // the view-relative face mapping dirty.
    this.moved = px !== this.quat.x || py !== this.quat.y || pz !== this.quat.z || pw !== this.quat.w;

    V.set(0, 0, 1).applyQuaternion(this.quat).multiplyScalar(this.radius);
    this.camera.position.copy(this.target).add(V);
    // Assign up before lookAt: the view-relative key mapping reads camera.up.
    this.camera.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.camera.lookAt(this.target);
  }
}
