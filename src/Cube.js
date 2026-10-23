// The interactive 3D cube: owns the authoritative CubeState, the 27 visual
// cubies, a move queue with a single in-flight animation, and undo/redo/
// scramble/reset/solve actions.

import * as THREE from 'three';
import { CubeState } from './CubeState.js';
import { Cubie } from './Cubie.js';
import { inverseMove, AXES, ALL_MOVES, ALL_MOVES_FULL, moveIncludesLayer } from './moves.js';
import { generateScramble } from './Scrambler.js';
import { FACE_CENTERS } from './Orientation.js';
import { DUR_TURN_90, DUR_TURN_180, DUR_SCRAMBLE, DUR_SOLVE } from './constants.js';

function smootherstep(t) { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); }
function axisVector(axis) {
  if (axis === 'X') return new THREE.Vector3(1, 0, 0);
  if (axis === 'Y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

// Key repeat is ~30 events/s, so a held face key must not build an unbounded
// queue; doMove drops anything past this (dropped moves never enter history).
const MAX_QUEUED_MOVES = 24;

export class Cube {
  constructor(scene) {
    this.scene = scene;
    this.state = new CubeState();
    this.group = new THREE.Group();
    this.group.name = 'cube';
    scene.add(this.group);

    this.cubies = this.state.cubies.map((c) => new Cubie(c));
    for (const cb of this.cubies) this.group.add(cb.group);

    this.queue = [];      // pending { move, speed }
    this.anim = null;     // in-flight animation
    this.history = [];    // applied moves (for undo)
    this.redoStack = [];  // undone moves (for redo)
    this.solved = true;

    // Callbacks (set by main.js / UI).
    this.onSolveChange = null;   // (solved:boolean) => void
    this.onBusyChange = null;    // (busy:boolean)  => void
    this.onMoveDone = null;      // (move)         => void
  }

  isAnimating() { return this.anim !== null; }
  isBusy() { return this.anim !== null || this.queue.length > 0; }

  /**
   * The centre cubie of a face ('U','D','L','R','F','B'), or null.
   * Uses logical.pos, which tracks physical position even after whole-cube
   * rotations, so this stays correct while the user spins the cube.
   */
  centerCubie(face) {
    const t = FACE_CENTERS[face];
    if (!t) return null;
    return this.cubies.find((cb) =>
      cb.logical.pos.x === t.x && cb.logical.pos.y === t.y && cb.logical.pos.z === t.z) || null;
  }

  _durFor(move, speed) {
    if (speed === 'scramble') return DUR_SCRAMBLE;
    if (speed === 'solve') return DUR_SOLVE;
    return Math.abs(move.angle) === 180 ? DUR_TURN_180 : DUR_TURN_90;
  }

  /** Queue a move for animation. `record` adds it to undo history at COMMIT time,
   * never at enqueue time: undo()/redo()/reset() call clearQueue(), which throws
   * queued moves away, and a history entry for a move that never gets committed
   * would desync the stacks from the logical state.
   * Note the two responsibilities the old enqueue() used to carry: recording AND
   * abandoning the redo chain. Recording moved to _record(), so every caller that
   * starts a NEW move (doMove, scramble, solve) must clear redoStack itself -
   * undo() and redo() are the only ones that must not. */
  enqueue(move, speed = 'normal', record = false) {
    this.queue.push({ move, speed, record });
    if (this.onBusyChange) this.onBusyChange(true);
    this._pump();
  }

  _pump() {
    if (this.anim) return;
    const item = this.queue.shift();
    if (!item) {
      if (this.onBusyChange) this.onBusyChange(false);
      return;
    }
    const { move, speed, record } = item;
    const affected = this.cubies.filter((cb) => {
      const c = cb.logical;
      return move.whole || moveIncludesLayer(move, c.pos[AXES[move.axis]]);
    });
    const pivot = new THREE.Object3D();
    this.group.add(pivot);
    for (const cb of affected) pivot.attach(cb.group);
    this.anim = {
      pivot, affected, axisVec: axisVector(move.axis),
      to: move.angle, t0: performance.now(), dur: this._durFor(move, speed), move, record,
    };
  }

  /** Advance the in-flight animation. Called every frame. */
  update(now) {
    if (!this.anim) return;
    const a = this.anim;
    let t = (now - a.t0) / a.dur;
    if (t > 1) t = 1;
    const e = smootherstep(t);
    a.pivot.quaternion.setFromAxisAngle(a.axisVec, THREE.MathUtils.degToRad(a.to * e));
    if (t >= 1) {
      this._commit(a);
    }
  }

  _commit(a) {
    this.state.applyMove(a.move);
    for (const cb of a.affected) this.group.attach(cb.group);
    this.group.remove(a.pivot);
    for (const cb of a.affected) cb.syncFromLogical();
    this.anim = null;
    this._record(a);
    this._refreshSolved();
    if (this.onMoveDone) this.onMoveDone(a.move);
    this._pump();
  }

  /** History grows when a move is actually applied, so the undo/redo stacks and
   * the move counter always describe the committed state, never queued moves. */
  _record(a) {
    if (!a.record) return;
    this.history.push(a.move);
  }

  /** Immediately finish any in-flight animation (commit + snap). */
  _flush() {
    if (!this.anim) return;
    const a = this.anim;
    this.state.applyMove(a.move);
    for (const cb of a.affected) this.group.attach(cb.group);
    this.group.remove(a.pivot);
    for (const cb of a.affected) cb.syncFromLogical();
    this.anim = null;
    this._record(a);
    this._refreshSolved();
  }

  clearQueue() { this.queue.length = 0; }

  /** Apply a user move (animated): recorded in history, abandons the redo chain.
   * Key repeat fires ~30 events/s while a face key is held, so the queue is capped
   * here; dropped moves never enter history, so the move counter stays honest.
   * scramble()/solve() enqueue whole sequences and are not capped. */
  doMove(move, speed = 'normal') {
    if (this.queue.length >= MAX_QUEUED_MOVES) return;
    this.redoStack.length = 0;
    this.enqueue(move, speed, true);
  }

  /** Reset to the solved state instantly. */
  reset() {
    this.clearQueue();
    this._flush();
    this.state.reset();
    this.history.length = 0;
    this.redoStack.length = 0;
    for (const cb of this.cubies) cb.syncFromLogical();
    this._refreshSolved();
    if (this.onBusyChange) this.onBusyChange(false);
  }

  /** Undo the last applied move (animated). Returns true if an undo happened. */
  undo() {
    if (!this.history.length) return false;
    this.clearQueue();
    this._flush();
    const m = this.history.pop();
    this.redoStack.push(m);
    this.enqueue(inverseMove(m), 'normal', false);
    return true;
  }

  /** Redo the last undone move (animated). Returns true if a redo happened. */
  redo() {
    if (!this.redoStack.length) return false;
    this.clearQueue();
    this._flush();
    const m = this.redoStack.pop();
    this.enqueue(m, 'normal', true);
    return true;
  }

  /** Queue a 20-move WCA-style scramble. Returns the scramble move list. */
  scramble() {
    this.clearQueue();
    this._flush();
    this.history.length = 0;
    this.redoStack.length = 0;
    const scr = generateScramble(20);
    for (const mv of scr) this.enqueue(mv, 'scramble', true);
    return scr;
  }

  /** Queue a solution (array of move indices into ALL_MOVES). Like scramble() and
   * doMove() it abandons the redo chain: these moves are new, so a redoStack entry
   * left over from an earlier undo must not be replayable out of position. */
  solve(moves, speed = 'solve') {
    this.clearQueue();
    this._flush();
    this.redoStack.length = 0;
    for (const mi of moves) this.enqueue(ALL_MOVES_FULL[mi], 'solve', true);
    return moves.length;
  }

  _refreshSolved() {
    const s = this.state.isSolved();
    if (s !== this.solved) {
      this.solved = s;
      if (this.onSolveChange) this.onSolveChange(s);
    }
  }
}
