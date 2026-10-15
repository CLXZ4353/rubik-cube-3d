// Unit tests for src/Timer.js (pure numbers: no THREE, no DOM).
// Run with:  node tests/timer.test.mjs

import assert from 'node:assert/strict';
import { Timer } from '../src/Timer.js';

let n = 0;
function eq(a, b, msg) { assert.equal(a, b, msg); n++; }

const t = new Timer(60);
eq(t.display(), '1:00', 'default readout');

// --- setLimit / setTime clamping ------------------------------------------
t.setTime(0);     eq(t.display(), '0:01', 'clamped to 1s minimum');
t.setTime(9999);  eq(t.display(), '10:00', 'clamped to 10min maximum');
t.setTime(65);    eq(t.display(), '1:05', 'seconds past a minute');
eq(t.limit, 65, 'limit is what the user set');

// --- ticking ---------------------------------------------------------------
t.start();
assert.ok(t.running, 'start begins the countdown'); n++;
eq(t.left, 65, 'start runs from the set time');

t.tick(1000);          eq(t.display(), '1:05', 'first tick only resyncs the clock');
t.tick(7000);          eq(t.left, 59, '6s of render-loop time consumed');
eq(t.display(), '0:59', 'readout follows left');
assert.ok(!t.urgent(), 'not urgent at 0:59'); n++;

t.tick(66_000);        eq(t.left, 0, 'clamps at zero');
eq(t.display(), '0:00', "time's up");
assert.ok(!t.running, 'stops itself at zero'); n++;

// --- stopping freezes, starting restarts -----------------------------------
t.tick(1_000_000);     eq(t.left, 0, 'a stopped timer never moves');
t.start();             eq(t.left, 65, 'start begins a fresh round');
t.stop();
assert.ok(!t.running, 'stop pauses the countdown'); n++;
t.tick(2_000_000);     eq(t.left, 65, 'still frozen');

// --- changing the time mid-run moves the readout ---------------------------
t.setTime(5);
eq(t.left, 5, 'setting the time sets the readout');
t.start();
assert.ok(t.urgent(), 'urgent under 10s'); n++;
eq(t.display(), '0:05', 'sub-minute format');

// --- the timeout callback fires once, at zero -----------------------------
let fired = 0;
t.onTimeout = () => fired++;
t.setTime(2);
t.start();
t.tick(1000);              eq(fired, 0, 'no timeout before time is up');
t.tick(3000);              eq(fired, 1, 'timeout fired at 0:00');
t.tick(9000);              eq(fired, 1, 'only once per round');
assert.ok(t.left === 0 && !t.running, 'clock frozen at zero'); n++; 

console.log(`timer: ${n} assertions ok`);
