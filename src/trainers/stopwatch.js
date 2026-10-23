// Stackmat-style stopwatch for the trainers. Pure numbers: the page feeds it
// timestamps, this decides what counts as a legitimate press.
//
// The gate: a real Stackmat needs the hands to hold the pads for ~200 ms before
// the timer starts, which is what kills the accidental start when a cuber taps
// the pads on their way to the cube.

export const HOLD_MS = 200;

/** One clock for every method: performance.now when the browser has it. */
function clock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class Stopwatch {
  constructor(holdMs = HOLD_MS) {
    this.holdMs = holdMs;
    this.state = 'idle'; // idle | pressing | running | stopped
    this.pressedAt = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.heldFor = 0;
    this.reject = null; // why the last press was refused
  }

  /** Fingers went down. */
  press(now) {
    this.reject = null;
    if (this.state === 'running') return;
    this.state = 'pressing';
    this.pressedAt = now;
  }

  /** Fingers left the pads before the gate: nothing started. */
  release(now) {
    if (this.state === 'pressing') {
      this.heldFor = now - this.pressedAt;
      if (this.heldFor < this.holdMs) {
        this.reject = `held ${Math.round(this.heldFor)}ms, under the ${this.holdMs}ms gate`;
        this.state = 'idle';
        return;
      }
      this.startedAt = now;
      this.state = 'running';
    } else if (this.state === 'running') {
      this.stop(now);
    }
  }

  /** Stop the clock (the hands are off the cube). */
  stop(now = null) {
    if (this.state !== 'running') return null;
    this.stoppedAt = now ?? clock();
    this.state = 'stopped';
    return this.ms();
  }

  /** Milliseconds elapsed so far (0 before a start). */
  ms(now = null) {
    if (this.state === 'idle' || this.state === 'pressing') return 0;
    const end = this.stoppedAt ?? (now ?? clock());
    return Math.max(0, Math.round(end - this.startedAt));
  }

  /** Keep the clock moving while it runs. */
  tick(now) {
    if (this.state === 'running') this.ms(now);
    return this;
  }

  reset() {
    this.state = 'idle';
    this.pressedAt = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.heldFor = 0;
    this.reject = null;
  }

  display(now = null) {
    const t = this.ms(now) / 1000;
    return t.toFixed(2);
  }
}
