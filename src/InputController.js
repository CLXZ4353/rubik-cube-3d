// All user input: mouse/touch orbit + zoom on the canvas, and keyboard
// controls for moves, undo/redo, reset and help.

import { makeMove } from './moves.js';

// The six face keys are resolved against the CURRENT view, so they always
// turn the face you can actually see (orbit the camera and they follow it).
const VIEW_KEYS = {
  u: 'up', d: 'down', l: 'left', r: 'right', f: 'front', b: 'back',
};
// Slices and whole-cube rotations stay absolute: they have no meaningful
// view-relative interpretation (a middle slice is the same slice from any side).
const ABSOLUTE_KEYS = {
  m: 'M', e: 'E', s: 'S', x: 'x', y: 'y', z: 'z',
};
// Used only if cb.getView is missing or throws, so input never breaks.
const FALLBACK_VIEW = { up: 'U', down: 'D', left: 'L', right: 'R', front: 'F', back: 'B' };
const ORBIT_SENS = 0.0052;   // radians per pixel of drag
const ZOOM_SENS = 0.0012;   // per wheel delta unit

export class InputController {
  /**
   * @param {HTMLElement} el  element to attach pointer listeners to
   * @param {object} cb { onOrbit(dTheta,dPhi), onZoom(delta), onMove(move),
   *                        onUndo(), onRedo(), onReset(), onHelp(),
   *                        getView() -> {front,up,right,left,down,back} }
   */
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.held = new Set();
    this.pointers = new Map();
    this.dragging = false;
    this._last = { x: 0, y: 0 };
    this._pinch = 0;
    this._bind();
  }

  _bind() {
    const el = this.el;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- mouse ----
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this._last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last = { x: e.clientX, y: e.clientY };
      this.cb.onOrbit(-dx * ORBIT_SENS, -dy * ORBIT_SENS);
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cb.onZoom(e.deltaY * ZOOM_SENS);
    }, { passive: false });

    // ---- touch ----
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        this._last = { x: p.x, y: p.y };
      } else if (this.pointers.size >= 2) {
        this._pinch = this._twoFingerDist();
      }
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.pointers.has(t.identifier)) this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        const dx = p.x - this._last.x, dy = p.y - this._last.y;
        this._last = { x: p.x, y: p.y };
        this.cb.onOrbit(-dx * ORBIT_SENS, -dy * ORBIT_SENS);
      } else if (this.pointers.size >= 2) {
        const d = this._twoFingerDist();
        if (this._pinch > 0 && d > 0) this.cb.onZoom(Math.log(this._pinch / d) * 0.9);
        this._pinch = d;
      }
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) this.pointers.delete(t.identifier);
      if (this.pointers.size < 2) this._pinch = 0;
    });
    el.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) this.pointers.delete(t.identifier);
      this._pinch = 0;
    });

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      // The help card owns the screen: moves/undo/reset behind it are invisible
      // input that only confuses the move counter, so only its own toggle works.
      if (this.cb.modalOpen && this.cb.modalOpen()) {
        if (key === 'h' && !e.repeat) { e.preventDefault(); this.cb.onHelp(); }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') { e.preventDefault(); this.cb.onUndo(); return; }
        if (key === 'y') { e.preventDefault(); this.cb.onRedo(); return; }
        return;
      }
      if (e.key === 'Escape') { this.cb.onReset(); return; }
      if (key === 'h' && !e.repeat) { this.cb.onHelp(); return; }
      const face = this._resolveFace(key);
      if (face) {
        e.preventDefault();
        const mod = e.shiftKey ? "'" : (this.held.has('2') ? '2' : '');
        this.cb.onMove(makeMove(face, mod));
      }
      if (!e.repeat) this.held.add(key);
    });
    window.addEventListener('keyup', (e) => { this.held.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => { this.held.clear(); this.dragging = false; });
  }

  /** Face letter for a key: view-relative for u/d/l/r/f/b, absolute otherwise. */
  _resolveFace(key) {
    const slot = VIEW_KEYS[key];
    if (slot) {
      let view = FALLBACK_VIEW;
      try {
        if (typeof this.cb.getView === 'function') view = this.cb.getView() || FALLBACK_VIEW;
      } catch {
        return key.toUpperCase(); // absolute fallback
      }
      return view[slot] || key.toUpperCase();
    }
    return ABSOLUTE_KEYS[key] || null;
  }

  _twoFingerDist() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  dispose() { /* listeners are on el/window; kept for API symmetry */ }
}
