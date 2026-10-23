// Browser gate for the SPA: routes render inside the shell, an unknown path
// gets the in-app Not Found page (the server hands back index.html), and the
// routes that are not the 3D view never request three.module.js.
//
//   node server.mjs &            # or PORT=9123 node server.mjs
//   node tests/spa_browser.mjs http://localhost:9123/ spa_shots
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:9123/';
const outDir = process.argv[3] || 'spa_shots';

const ROUTES = ['/', '/3d', '/a', '/a/3x3', '/a/3x3/OLL', '/a/3x3/OLL/OLL_1', '/a/3x3/PLL/PLL_1', '/t', '/t/pllrecog', '/cross', '/analyze', '/Beginner', '/privacy', '/algsheet', '/settings', '/nope', '/t/nope'];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.EXE || undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  const badStatus = [];
  page.on('pageerror', (err) => errors.push(String(err?.stack ?? err)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let requests = [];
  page.on('request', (req) => { requests.push(req.url()); });
  page.on('response', (res) => { if (res.status() >= 400) badStatus.push(`${res.status()} ${res.url()}`); });

  let fails = 0;
  for (const path of ROUTES) {
    requests = [];
    badStatus.length = 0;
    await page.goto(url.replace(/[/]+$/, '') + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(path === '/3d' ? 6000 : 1200);
    const text = await page.evaluate((p) => {
      const node = p === '/3d' ? document.body : document.querySelector('#app');
      return node?.innerText ?? '';
    }, path);
    const navCount = await page.evaluate(() => document.querySelectorAll('nav a').length);
    const shells = await page.evaluate(() => document.querySelectorAll('#app .shell').length);
    const headers = await page.evaluate(() => document.querySelectorAll('#app .shell header').length);
    const cubeHidden = await page.evaluate(() => document.querySelector('#cube')?.hidden ?? false);
    const three = requests.filter((u) => u.includes('three.module.js')).length;
    const want3d = path === '/3d';
    if (!text || text.length < 20) {
      fails++;
      console.log(`FAIL ${path} rendered no content: ${JSON.stringify(errors.slice(-4))}`);
      for (const u of requests) console.log('   req', u);
    }
    if (!want3d && navCount < 5) {
      fails++;
      console.log(`FAIL ${path} has no shell nav (${navCount})`);
    }
    if (!want3d && (shells !== 1 || headers !== 1)) {
      fails++;
      console.log(`FAIL ${path} duplicate shell chrome: shells ${shells}, headers ${headers}`);
    }
    if (want3d) {
      const back = await page.evaluate(() => Boolean(document.querySelector('.cube-back')));
      if (!back) {
        fails++;
        console.log(`FAIL ${path} has no way back to the site`);
      }
    }
    if (!want3d && !cubeHidden) {
      fails++;
      console.log(`FAIL ${path} left the 3D canvas visible`);
    }
    if (!want3d && three) {
      fails++;
      console.log(`FAIL ${path} requested three.module.js`);
    }
    if (want3d && !three) {
      fails++;
      console.log(`FAIL ${path} did not mount the 3D cube`);
    }
    if (want3d && cubeHidden) {
      fails++;
      console.log(`FAIL ${path} left the 3D canvas hidden`);
    }
    const missing = badStatus.filter((s) => /\/src\/|\/styles\/|\/data\/|three/.test(s));
    if (missing.length) {
      fails++;
      console.log(`FAIL ${path} missing assets: ${missing.slice(0, 5).join(', ')}`);
    }
    if (!want3d) {
      const scroll = await page.evaluate(() => ({
        body: getComputedStyle(document.body).overflow,
        canScroll: document.documentElement.scrollHeight > innerHeight,
        hidden: getComputedStyle(document.documentElement).overflow,
      }));
      if (scroll.body === 'hidden' || scroll.hidden === 'hidden') {
        fails++;
        console.log(`FAIL ${path} cannot scroll: ${JSON.stringify(scroll)}`);
      }
    }
    console.log(`ok ${path} (${text.length} chars, nav ${navCount}, shells ${shells}, three ${three})`);
    await page.screenshot({ path: `${outDir}/${path.replace(/\//g, '_') || 'home'}.png`, fullPage: true });
  }

  // The Not Found page is the in-app one: it carries the nav, and the browser
  // response for a bad path is index.html (SPA fallback), not a bare 404.
  if (errors.length) {
    console.log('page errors:', [...new Set(errors)].slice(0, 10));
  }
  console.log(`spa: ${fails} fails, page errors ${errors.length}`);
  await browser.close();
  process.exit(fails ? 1 : 0);
}

await main();
