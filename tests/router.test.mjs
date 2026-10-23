// Router gate: 20 URLs map to the right page/params, aliases fold, and the
// History-API style navigation keeps a stack that pops back.
//
//   node tests/router.test.mjs

import { resolve, title, breadcrumb } from '../src/app/router.js';
import { PAGES } from '../src/app/routes.js';
import { visit, back, history } from '../src/app/app.js';

const EXPECT = [
  ['/', 'home'],
  ['/t', 'trainer'],
  ['/t?set=OLL', 'trainer'],
  ['/t/pllrecog', 'pllrecog'],
  ['/cross', 'cross'],
  ['/cross?difficulty=7', 'cross'],
  ['/analyze', 'analyze'],
  ['/analyze?scramble=R%20U%20R', 'analyze'],
  ['/a', 'sets'],
  ['/a/', 'sets'],
  ['/a/3x3', 'sets'],
  ['/a/4x4', 'sets'],
  ['/a/3x3/OLL', 'cases'],
  ['/a/3x3/oll', 'cases'],
  ['/a/3x3/OLL/OLL_7', 'case'],
  ['/a/33/OLL', 'cases'],
  ['/Beginner', 'beginner'],
  ['/algsheet', 'algsheet'],
  ['/privacy', 'privacy'],
  ['/settings', 'settings'],
  ['/nope', 'notfound'],
  ['/t/nope/deep', 'notfound'],
  ['/3d', 'cube3d'],
];

let fails = 0;
for (const [url, want] of EXPECT) {
  const parts = url.split('?', 2);
  const pathname = parts[0];
  const search = parts[1] ?? '';
  const route = resolve(pathname, search ?? '');
  if (route.page !== want) {
    fails++;
    console.log(`FAIL ${url} -> ${route.page} (want ${want})`);
  }
  if (want === 'sets' && route.params.puzzle === undefined && url !== '/a' && url !== '/a/') {
    fails++;
    console.log(`FAIL ${url} lost its puzzle param`);
  }
}

// Alias folding: 33 and 3X3 land on 3x3, oll lands on OLL.
const alias = resolve('/a/33/oll/oll_7');
if (alias.params.puzzle !== '3x3' || alias.params.set !== 'OLL') {
  fails++;
  console.log(`FAIL aliases: ${JSON.stringify(alias.params)}`);
}

// URLSearchParams writes spaces as '+', so the router has to read them back.
const plus = resolve('/a/3x3/OLL', '?group=3+corners+twisted&howfar=cross%2B1');
if (plus.query.group !== '3 corners twisted' || plus.query.howfar !== 'cross+1') {
  fails++;
  console.log(`FAIL query decoding: ${JSON.stringify(plus.query)}`);
}

// Title and breadcrumb come out of the route, not the URL text.
const card = resolve('/a/3x3/PLL/PLL_1');
if (breadcrumb(card).join(' ') !== '3x3 PLL PLL_1') {
  fails++;
  console.log(`FAIL breadcrumb: ${breadcrumb(card).join(' ')}`);
}
if (!title(card)) {
  fails++;
  console.log('FAIL title empty');
}

// Every route page has a page module in the table.
for (const [, want] of EXPECT) {
  if (!PAGES[want]) {
    fails++;
    console.log(`FAIL no page module for ${want}`);
  }
}

// Navigation: two hops push one entry, back pops it. The browser does the same
// through pushState(); the stack here is what the entry module keeps.
void visit('/a/3x3');
void visit('/t');
const popped = back();
if (!popped || popped.pathname !== '/a/3x3') {
  fails++;
  console.log(`FAIL back() did not return /a/3x3: ${JSON.stringify(popped)}`);
}
if (history.length !== 0) {
  fails++;
  console.log(`FAIL history length ${history.length} after popping the only entry`);
}

console.log(`router: ${fails} fails`);
process.exit(fails ? 1 : 0);
