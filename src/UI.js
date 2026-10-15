// DOM UI: buttons, status, solved badge, help overlay.
// main.js assigns ui.actions.* to wire the actual behaviour.

function $(id) { return document.getElementById(id); }

export class UI {
  constructor() {
    this.el = {
      badge: $('solved-badge'),
      moveCount: $('move-count'),
      faceCurrent: $('face-current'),
      solver: $('solver-status'),
      btnScramble: $('btn-scramble'),
      btnSolve: $('btn-solve'),
      btnCancel: $('btn-cancel'),
      btnUndo: $('btn-undo'),
      btnRedo: $('btn-redo'),
      btnReset: $('btn-reset'),
      btnHelp: $('btn-help'),
      btnTimeDown: $('btn-time-down'),
      btnTimeUp: $('btn-time-up'),
      btnStart: $('btn-start'),
      btnStop: $('btn-stop'),
      timer: $('timer'),
      help: $('help'),
    };
    // Populated by main.js.
    this.actions = {
      scramble: () => {}, solve: () => {}, undo: () => {},
      redo: () => {}, reset: () => {}, help: () => {}, cancel: () => {},
      start: () => {}, stop: () => {}, time: (stepSec) => {},
    };
    this._solveEnabled = false;
    this._helpOpen = false;
    this._timerText = null;
    this._timerUrgent = false;
    this._showStop = false;
    this._bind();
  }

  _bind() {
    const e = this.el;
    e.btnScramble.addEventListener('click', () => this.actions.scramble());
    e.btnSolve.addEventListener('click', () => this.actions.solve());
    e.btnUndo.addEventListener('click', () => this.actions.undo());
    e.btnRedo.addEventListener('click', () => this.actions.redo());
    e.btnReset.addEventListener('click', () => this.actions.reset());
    e.btnHelp.addEventListener('click', () => this.actions.help());
    e.btnCancel.addEventListener('click', () => this.actions.cancel());
    e.btnStart.addEventListener('click', () => this.actions.start());
    e.btnStop.addEventListener('click', () => this.actions.stop());
    e.btnTimeDown.addEventListener('click', () => this.actions.time(-5));
    e.btnTimeUp.addEventListener('click', () => this.actions.time(5));
    e.help.addEventListener('click', (ev) => {
      // clicking the backdrop (not the card) closes help
      if (ev.target === e.help) this.setHelp(false);
    });
  }

  setMoveCount(n) { this.el.moveCount.textContent = `Moves ${n}`; }
  setSolved(s) { this.el.badge.classList.toggle('hidden', !s); }

  /** Face letter currently facing the camera (view-relative moves). */
  setCurrentFace(face) {
    if (this.el.faceCurrent) this.el.faceCurrent.textContent = face;
  }

  setSolver(status, text) {
    this.el.solver.textContent = text;
    this._lastStatus = status;
  }

  setSolveEnabled(enabled) {
    this._solveEnabled = enabled;
    this._refreshButtons();
  }

  setUndoRedo(canUndo, canRedo) {
    this._canUndo = !!canUndo;
    this._canRedo = !!canRedo;
    this._refreshButtons();
  }

  _refreshButtons() {
    const e = this.el;
    e.btnSolve.disabled = !this._solveEnabled;
    e.btnUndo.disabled = !this._canUndo;
    e.btnRedo.disabled = !this._canRedo;
  }

  showCancel(show) { this.el.btnCancel.classList.toggle('hidden', !show); }
  showStop(show) {
    if (show === this._showStop) return;
    this._showStop = show;
    this.el.btnStop.classList.toggle('hidden', !show);
  }

  /** Countdown readout, e.g. "Timer 0:45"; urgent turns it red under 10s. */
  setTimer(text, urgent = false) {
    if (text === this._timerText && urgent === this._timerUrgent) return;
    this._timerText = text;
    this._timerUrgent = urgent;
    this.el.timer.textContent = text;
    this.el.timer.classList.toggle('low', urgent);
  }

  setHelp(open) {
    this._helpOpen = !!open;
    this.el.help.classList.toggle('hidden', !this._helpOpen);
  }
  toggleHelp() { this.setHelp(!this._helpOpen); }
  isHelpOpen() { return this._helpOpen; }
}
