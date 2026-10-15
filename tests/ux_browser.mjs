// Playwright: UX regressions around the Solve/scramble/timer/help paths.
//   node tests/ux_browser.mjs [url]
//
// Asserts:
//  - Solve clicked while the cube is busy solves the state it settles on
//    (the worker snapshot used to miss queued/in-flight moves, so the cube ended
//    up scrambled while the UI claimed "Solved in N moves")
//  - the help card swallows cube input (keys and Esc) while it is open
//  - key repeat cannot build an unbounded move queue
//  - Scramble freezes the clock, like Solve does

import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8000/';
const errors = [];
const ok = (cond, msg) => { if (!cond) { errors.push(msg); console.log('FAIL: ' + msg); } else console.log('ok: ' + msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('console', (m) => { if (m.type === 'error' || m.type === 'warning') console.log(`[${m.type}] ` + m.text); });
await page.goto(url, { waitUntil: 'networkidle' });
for (let i = 0; i < 90; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => document.getElementById('solver-status').textContent.startsWith('Solver: ready'))) break; }

const moves = async () => Number(/(\d+)/.exec((await page.locator('#move-count').textContent()).trim())[1]);
const readout = async () => (await page.locator('#timer').textContent()).trim();
const send = (keys) => page.evaluate(`(() => { const s = (k, c) => window.dispatchEvent(new KeyboardEvent('keydown', c ? { key: k, ctrlKey: true } : { key: k })); ${keys} })()`);

// --- Solve pressed during a scramble: waits for the cube, then solves it ------
await page.locator('#btn-scramble').click();
await page.locator('#btn-solve').click(); // busy here: must defer, not snapshot a stale state
for (let i = 0; i < 90; i++) { await page.waitForTimeout(500); if (await page.locator('#solved-badge').isVisible()) break; }
const badge = await page.locator('#solved-badge').isVisible();
ok(badge, 'cube really is solved after a Solve pressed mid-scramble');
const result = await page.evaluate(() => document.getElementById('solver-status').textContent);
const m = /Solved in (\d+) moves/.exec(result);
ok(m !== null, 'solve result present: ' + result);
if (m) {
  const total = 20 + Number(m[1]);
  const seen = await moves();
  ok(seen === total, `move counter kept every move: ${seen} = 20 scramble + ${m[1]} solution`);
}

// --- key repeat must not build an unbounded queue ----------------------------
await page.locator('#btn-reset').click();
await send("for (let i = 0; i < 300; i++) s('r');");
await page.waitForTimeout(9000); // 25 queued moves x 260ms each
const burst = await moves();
ok(burst >= 20, `the burst applied moves: ${burst}`);
ok(burst <= 25, `queue capped: ${burst} applied, not 300 (24 queued + 1 animating)`);

// --- the help card owns the screen ------------------------------------------
await page.locator('#btn-reset').click();
await page.locator('#btn-help').click();
await send(`s('r'); s('u'); s('f'); s('Escape');`);
await page.waitForTimeout(600);
ok(await moves() === 0, 'face keys and Esc did nothing while the help card was open');
await page.keyboard.press('h'); // H also closes the card; the open card blocks the buttons
await send(`s('r');`);
await page.waitForTimeout(600);
ok(await moves() === 1, 'the same key works once the card is closed');

// --- changing the cube while a search is in flight must not corrupt the reply -
// (the narrow window the reporter measured: the worker replies with moves for
//  the state it was given, so a Reset during the search used to apply them to a
//  solved cube and leave it scrambled under a "Solved in N moves" status.)
await page.locator('#btn-reset').click();
await page.locator('#btn-scramble').click();
await page.waitForTimeout(5000); // let the scramble land so the search starts right away
await page.locator('#btn-solve').click();
await send(`s('Escape');`); // as close to the search start as Playwright allows
for (let i = 0; i < 90; i++) { await page.waitForTimeout(500); if (await page.locator('#solved-badge').isVisible()) break; }
const status = await page.evaluate(() => document.getElementById('solver-status').textContent);
const mm = /Solved in (\d+) moves/.exec(status);
ok(mm !== null, 'solve result present: ' + status);
if (mm) {
  const n = Number(mm[1]);
  const settled = await moves();
  ok((await page.locator('#solved-badge').isVisible()) && (settled === 20 + n || settled === 0),
    `reply consistent: ${settled} moves with the badge showing, never ${n} moves on a scrambled cube`);
}

// --- Scramble freezes the clock --------------------------------------------
// Only the frozen value is compared: 'before' was read 300 ms after Start, when
// the readout still showed the ceiled 1:00 while left had already crossed 59.0,
// so a legitimate freeze legitimately shows 0:59 here.
await page.locator('#btn-start').click();
await page.locator('#btn-scramble').click();
await page.waitForTimeout(400);
const during = await readout();
ok(await moves() > 0, 'the scramble click landed');
ok(await page.evaluate(() => document.getElementById('btn-stop').classList.contains('hidden')), 'clock is not running after the scramble');
await page.waitForTimeout(2000);
const after = await readout();
ok(during === after, `scramble froze the clock: ${during} = ${after}`);

await browser.close();
console.log(errors.length ? `\nux_browser: ${errors.length} failures` : `\nux_browser: all assertions ok`);
process.exitCode = errors.length ? 1 : 0;
