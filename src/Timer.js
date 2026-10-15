// Timer mode: a countdown the user can set and start. Pure numbers; main.js
// drives it with the rAF timestamp and UI.js shows timer.display().

export class Timer {
  constructor(limitSec = 60) {
    this.limit = limitSec;   // the time the user set, in seconds
    this.left = limitSec;    // seconds still to go
    this.running = false;
    this._last = null;       // previous tick timestamp (ms), null = needs resync
    this.onTimeout = null;   // () => void, fired once when the clock hits 0:00
  }

  /** Set the time (and therefore restart the countdown at that value). */
  setTime(sec) {
    this.limit = Math.min(600, Math.max(1, Math.round(sec)));
    this.left = this.limit;
    this._last = null;
  }

  start() { this.left = this.limit; this._last = null; this.running = true; }
  stop() { this.running = false; }

  /** Advance the countdown. `now` is the same clock as the render loop. */
  tick(now) {
    if (!this.running) { this._last = null; return; }
    if (this._last !== null) this.left = Math.max(0, this.left - (now - this._last) / 1000);
    this._last = now;
    if (this.left <= 0) {
      this.running = false; // time is up: stop at 0:00
      if (this.onTimeout) this.onTimeout();
    }
  }

  display() {
    const s = Math.ceil(this.left);
    return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  }

  urgent() { return this.running && this.left <= 10; }
}
