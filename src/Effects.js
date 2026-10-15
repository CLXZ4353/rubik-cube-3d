// Celebration effects: a THREE.Points confetti burst plus a DOM "GG" pop,
// shown when the cube becomes solved. Everything created here is disposed
// again so repeated celebrations don't leak GPU memory.

import * as THREE from 'three';
import { COLORS, PITCH } from './constants.js';

const COUNT = 260;        // particles per burst
const LIFETIME = 2.6;     // seconds before the points are removed
const POP_MS = 2400;      // on-screen life of a text popup (matches the CSS animation)
const GRAVITY = -7.5;     // units / s^2

/** Small procedural radial-gradient dot, used as the point sprite. */
function dotTexture() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.points = null;
    this.vel = null;
    this.startTime = 0;
    this._popTimers = {};  // cls -> pending removal setTimeout, so two pops don't clobber each other
  }

  /** Fire a confetti burst (replacing any running one) and pop the "GG". */
  celebrate(now = performance.now()) {
    this._clearPoints();
    this._pop('GG', 'gg-pop');

    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const palette = Object.values(COLORS).map((hex) => new THREE.Color(hex));
    const c = new THREE.Color();

    for (let i = 0; i < COUNT; i++) {
      // Start just above the cube centre, scattered a little.
      positions[i * 3 + 0] = (Math.random() - 0.5) * PITCH * 1.2;
      positions[i * 3 + 1] = PITCH * 0.5 + Math.random() * 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * PITCH * 1.2;

      // Spherical direction, biased upward so the burst arcs outwards.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 1.35 * Math.random()); // 0..~1.17 rad from +Y
      const speed = 2.6 + Math.random() * 3.4;
      const sy = Math.sin(phi);
      vel[i * 3 + 0] = Math.sin(theta) * sy * speed;
      vel[i * 3 + 1] = Math.cos(phi) * speed + 1.6;      // upward bias
      vel[i * 3 + 2] = Math.cos(theta) * sy * speed;

      c.copy(palette[(Math.random() * palette.length) | 0]);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.vel = vel;
    this.startTime = now;
    this.scene.add(this.points);
  }

  /** Integrate the burst (gravity + fade) and retire it after LIFETIME. */
  update(now) {
    if (!this.points) return;
    const t = (now - this.startTime) / 1000;
    if (t >= LIFETIME) { this._clearPoints(); return; }

    const dt = this._last === undefined ? 1 / 60 : Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    const pos = this.points.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < COUNT; i++) {
      this.vel[i * 3 + 1] += GRAVITY * dt;
      arr[i * 3 + 0] += this.vel[i * 3 + 0] * dt;
      arr[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    pos.needsUpdate = true;
    // Fade out over the last third so it doesn't just vanish.
    const fade = Math.min(1, Math.max(0, (LIFETIME - t) / 0.9));
    this.points.material.opacity = fade;
  }

  _clearPoints() {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    const m = this.points.material;
    if (m.map) m.map.dispose();
    m.dispose();
    this.points = null;
    this.vel = null;
    this._last = undefined;
  }

  /** Big transient text popup, same pop animation as the solve "GG". */
  timeout() { this._pop('TIMEOUT', 'timeout-pop'); }

  _pop(text, cls) {
    // At most one popup of a kind on screen; each kind keeps its own timer.
    const pending = this._popTimers[cls];
    if (pending) clearTimeout(pending);
    document.querySelectorAll('.' + cls).forEach((el) => el.remove());

    const el = document.createElement('div');
    el.className = cls;
    // The text sits in a child span: styles.css clips the gradient to the
    // span, which must be separate from the animated element (the element's
    // own background layer would paint under its children).
    const span = el.appendChild(document.createElement('span'));
    span.textContent = text;
    document.body.appendChild(el);

    this._popTimers[cls] = setTimeout(() => {
      el.remove();
      delete this._popTimers[cls];
    }, POP_MS);
  }
}
