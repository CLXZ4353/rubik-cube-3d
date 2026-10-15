// Small targeted browser test for solver correctness after scramble/keyboard.
// Usage: node tests/solvebrowser.mjs [url] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:9101/';
const outDir = process.argv[3] || 'solve_shots';
mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.EXE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('console', (msg) => console.log('[console]', msg.type, msg.text));
  page.on('page_error', (err) => console.log('[page_error]', err.message));
  await page.goto(url, { waitUntil: 'networkidle' });

  async function status() { return (await page.locator('#solver-status').textContent()).trim(); }
  async function count() { return (await page.locator('#move-count').textContent()).trim(); }
  async function badge() { return (await page.locator('#solved-badge').textContent()).trim(); }
  async function badgeVisible() { return await page.evaluate(() => {
    const el = document.querySelector('#solved-badge');
    return el && getComputedStyle(el).display !== 'none';
  }); }

  for (let i = 0; i < 30; i++) {
    const t = await status();
    if (t.includes('ready')) { console.log('ready:', t); break; }
    await page.waitForTimeout(700);
  }

  // --- case 1: keyboard R U R' U' then Solve
  for (const k of ['KeyR', 'KeyU', 'Shift+KeyR', 'Shift+KeyU']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(900);
  console.log('case1 pre:', await status(), 'moves:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1500);
    const s = await status();
    console.log('case1 tick:', s);
    if (s.includes('Solved in') || s.includes('already solved') || s.includes('cancelled') || s.includes('no solution') || s.includes('budget exceeded')) break;
  }
  console.log('case1 post:', await status(), 'moves:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.screenshot({ path: `${outDir}/c1_solved.png` });

  // --- case 2: keyboard scramble then Solve
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  for (const k of ['KeyR', 'KeyU', 'KeyF', 'Shift+KeyD', 'KeyL', 'Shift+KeyB', 'KeyU', 'Shift+KeyR', 'KeyF', 'KeyD', 'Shift+KeyL', 'KeyB']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  console.log('case2 pre:', await status(), 'moves:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const s = await status();
    console.log('case2 tick:', s);
    if (s.includes('Solved in') || s.includes('already solved') || s.includes('cancelled') || s.includes('no solution') || s.includes('budget exceeded')) break;
  }
  await page.waitForTimeout(3500);
  console.log('case2 post:', await status(), 'moves:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.screenshot({ path: `${outDir}/c2_solved.png` });

  // --- case 3: whole-cube x' from solved: should already be solved
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(800);
  console.log('case3 badge (should be SOLVED):', await badge(), 'moves:', await count(), 'badgeVisible:', await badgeVisible());

  // --- case 4: Scramble + Solve with wait 60s (no cancel)
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(6000);
  console.log('case4 pre:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.locator('#btn-solve').click();
  await page.waitForTimeout(10000);
  try { await page.locator('#btn-cancel').click({ timeout: 5000 }); } catch {}
  await page.waitForTimeout(3000);
  console.log('case4 post:', await status(), 'moves:', await count(), 'badge:', await badge(), 'badgeVisible:', await badgeVisible());
  await page.screenshot({ path: `${outDir}/c4_solved.png` });

  await browser.close();
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
