// Playwright regression test for undo/redo vs queued moves.
// Keystrokes are dispatched inside ONE page tick, which is what keeps the queue
// non-empty when Ctrl+Z lands (real key presses arrive 100+ ms apart, too slow
// to stay inside the 260 ms turn animation). Undo must take back exactly one
// APPLIED move and drop the queued ones: the counter may not jump (it must not
// read 5 for 5 taps when only some are applied), mashing undo returns to solved
// with Moves 0, and redosing until the Redo button turns off replays exactly as
// many moves as undo took back. The counts are compared against what the page
// counted before the undo, never against a hard-coded number, so the test does
// not depend on how fast this machine commits moves.
// The old code recorded moves at enqueue time, so one undo read Moves 4 (it
// popped a move that had never been applied) and mashing undo never reached
// solved while the counter claimed moves that never happened.
// Usage: node tests/undo_browser.mjs http://localhost:8311/

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://localhost:8311/';

let n = 0;
function ok(c, msg) { assert.ok(c, msg); n++; console.log('ok:', msg); }

async function read(page) {
  return {
    moves: (await page.locator('#move-count').textContent()).trim(),
    solved: await page.locator('#solved-badge').isVisible(),
  };
}

// keydown events the InputController reads (it only uses key / ctrlKey / shiftKey)
const type = (keys) => `(() => {
  const send = (key, ctrl) => window.dispatchEvent(new KeyboardEvent('keydown', ctrl ? { key, ctrlKey: true } : { key }));
  ${keys}
})()`;

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.EXE || undefined });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  // --- queued moves + undo mid-animation ---------------------------------
  // Five taps in one tick: only a couple commit before Ctrl+Z arrives, the rest
  // are queued. Undo must take back exactly one APPLIED move and drop the queued
  // ones, so the counter may not jump (the old enqueue-time recording counted all
  // 5 taps and read 4 after an undo that popped a never-applied move).
  await page.evaluate(type("send('r'); send('u'); send('f'); send('d'); send('l');"));
  await page.waitForTimeout(300);
  const before = Number((await read(page)).moves.split(' ')[1]);
  let s;
  ok(before < 5, `five taps queued: the counter counted only the ${before} applied moves, not 5`);
  await page.evaluate(type("send('z', true);"));
  await page.waitForTimeout(600);
  s = await read(page);
  const after = Number(s.moves.split(' ')[1]);
  console.log('undo:', before, '->', after, 'solved:', s.solved);
  ok((after === before || after === before - 1) && after < 5,
    'undo took back one applied move and dropped the queued ones');

  for (let i = 0; i < 6; i++) { // more than any plausible applied count; extra undos no-op
    await page.evaluate(type("send('z', true);"));
    await page.waitForTimeout(500);
  }
  s = await read(page);
  ok(s.solved && s.moves === 'Moves 0', 'undoing the applied prefix returns to solved, Moves 0');

  let redone = 0;
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => document.getElementById('btn-redo').disabled)) break;
    await page.evaluate(type("send('y', true);"));
    await page.waitForTimeout(400);
    redone++;
  }
  s = await read(page);
  ok(redone >= 1 && s.moves === `Moves ${redone}` && !s.solved,
    `redo re-applied exactly the ${redone} moves undo took back`);

  // --- undo during a scramble: the not-yet-committed moves are dropped,
  //     history only ever counts applied ones, so repeated undo unwinds to 0 ---
  await page.locator('#btn-reset').click(); // start from a clean cube
  await page.evaluate(type("document.getElementById('btn-scramble').click();"));
  await page.waitForTimeout(300); // ~2 of the 20 scramble moves commit
  await page.evaluate(type("send('z', true);"));
  await page.waitForTimeout(700);
  s = await read(page);
  console.log('scramble+undo:', s.moves, 'solved:', s.solved);
  ok(Number(s.moves.split(' ')[1]) <= 3, 'undo mid-scramble dropped the queued moves from the count');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(type("send('z', true);"));
    await page.waitForTimeout(500);
  }
  s = await read(page);
  ok(s.solved && s.moves === 'Moves 0', 'mashing undo unwinds the applied moves exactly');

  // --- normal flow still works: scramble, settle, then one undo -----------
  await page.locator('#btn-reset').click();
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(4000);
  s = await read(page);
  ok(!s.solved && s.moves === 'Moves 20', 'scramble counted per commit');
  await page.evaluate(type("send('z', true);"));
  await page.waitForTimeout(700);
  s = await read(page);
  ok(!s.solved && s.moves === 'Moves 19', 'undo after a settled scramble takes one move back');

  // --- solve() must abandon a redo chain left over from an undo ------------
  await page.locator('#btn-reset').click();
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(4000);
  await page.evaluate(type("send('z', true);")); // leaves one redoStack entry
  await page.waitForTimeout(700);
  ok(!(await page.evaluate(() => document.getElementById('btn-redo').disabled)), 'undo left a redo entry');
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 60 && !(await page.locator('#solved-badge').isVisible()); i++) await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.getElementById('btn-redo').disabled), 'solve() abandoned it: Redo disabled, no out-of-position replay');

  await browser.close();
  console.log(`undo_browser: ${n} assertions ok`);
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
