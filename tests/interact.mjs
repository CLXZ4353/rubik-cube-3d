// Interactive browser test: boot, scramble, solve, screenshots along the way.
// Usage: node tests/interact.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:9002/';
const outDir = process.argv[3] || 'shots';
const w = Number(process.env.SW || 1200);
const h = Number(process.env.SH || 900);

mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.EXE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (msg) => console.log('[browser]', msg.text));
  page.on('page_error', (err) => console.log('[page_error]', err.message));
  await page.goto(url, { waitUntil: 'networkidle' });

  // Boot scene: wait until the UI says "Solver: ready"
  let ready = false;
  for (let i = 0; i < 200; i++) {
    const t = (await page.locator('#solver-status').textContent()).trim();
    console.log('status:', t);
    if (t.includes('ready')) { ready = true; break; }
    await page.waitForTimeout(700);
  }
  console.log('Ready?', ready);
  await page.screenshot({ path: `${outDir}/01_ready.png` });

  // Click scramble
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${outDir}/02_after_scramble.png` });

  // Press Solve
  await page.locator('#btn-solve').click();
  await page.waitForTimeout(4000);
  console.log('after solve:', (await page.locator('#solver-status').textContent()).trim());
  console.log('move count:', (await page.locator('#move-count').textContent()).trim());
  console.log('badge:', (await page.locator('#solved-badge').textContent()).trim());
  await page.screenshot({ path: `${outDir}/03_solving.png` });

  // Cancel after some solving
  await page.waitForTimeout(3000);
  console.log('cancel visible?', await page.evaluate(() => {
    const el = document.querySelector('#btn-cancel');
    return el && getComputedStyle(el).display !== 'none';
  }));
  try {
    await page.locator('#btn-cancel').click({ timeout: 15000 });
    console.log('cancel clicked');
  } catch (err) {
    console.log('cancel NOT clicked (hidden):', err.message.split('\n')[0]);
  }
  await page.waitForTimeout(2500);
  console.log('after cancel:', (await page.locator('#solver-status').textContent()).trim());
  await page.screenshot({ path: `${outDir}/04_cancelled.png` });

  // Reset
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/05_reset.png` });

  // Keyboard moves: R U R'
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(400);
  await page.keyboard.press('Shift+KeyR');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/06_moves.png` });

  // Undo
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/07_undo.png` });

  // Help overlay
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/08_help.png` });

  // Mobile viewport screenshot (separate page)
  const page2 = await browser.newPage({ viewport: { width: 380, height: 740 } });
  await page2.goto(url, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  await page2.screenshot({ path: `${outDir}/09_mobile.png` });

  await browser.close();
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
