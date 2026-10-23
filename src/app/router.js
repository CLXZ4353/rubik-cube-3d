// Route table. Pure: no DOM, no imports of page modules — pages are pulled in
// lazily by routes.js, so /t never touches Three.js.

const PUZZLE_ALIAS = { '33': '3x3', '3': '3x3', '22': '2x2', '2': '2x2', '44': '4x4', '4': '4x4' };
const SET_ALIAS = { oll: 'OLL', pll: 'PLL', f2l: 'F2L', cll: 'CLL', coll: 'COLL', cross: 'cross' };

/** Named routes, in match order. `params` are filled from the URL. */
const ROUTES = [
  { page: 'home', path: '/' },
  { page: 'trainer', path: '/t' },
  { page: 'pllrecog', path: '/t/pllrecog' },
  { page: 'cross', path: '/cross' },
  { page: 'analyze', path: '/analyze' },
  { page: 'sets', path: '/a' },
  { page: 'sets', path: '/a/:puzzle' },
  { page: 'cases', path: '/a/:puzzle/:set' },
  { page: 'case', path: '/a/:puzzle/:set/:case' },
  { page: 'beginner', path: '/Beginner' },
  { page: 'algsheet', path: '/algsheet' },
  { page: 'settings', path: '/settings' },
  { page: 'privacy', path: '/privacy' },
  { page: 'cube3d', path: '/3d' },
];

/** Nav shown in the shell (label -> path). */
export const NAV = [
  ['Home', '/'],
  ['Database', '/a'],
  ['Trainer', '/t'],
  ['Recognition', '/t/pllrecog'],
  ['Cross', '/cross'],
  ['Analyzer', '/analyze'],
  ['Beginner', '/Beginner'],
];

export function resolve(pathname, search = '') {
  const path = normalize(pathname);
  const query = parseQuery(search);
  for (const route of ROUTES) {
    const params = match(route.path, path);
    if (params === null) continue;
    const out = { page: route.page, params: params, query: query, path: path };
    return fixAliases(out);
  }
  return { page: 'notfound', params: {}, query: query, path: path };
}

/** '/' keeps its form; anything else loses a trailing slash. */
function normalize(pathname) {
  const p = String(pathname || '/');
  if (!p.startsWith('/')) return '/' + p;
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

/** Route pattern vs concrete path: null = no match, object = params. */
function match(pattern, path) {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      if (b[i] === '') return null;
      out[a[i].slice(1)] = b[i];
    } else if (a[i] !== b[i]) {
      return null;
    }
  }
  return out;
}

function parseQuery(search) {
  const out = {};
  const s = String(search || '').replace(/^\?/, '');
  if (!s) return out;
  // URLSearchParams understands `+` as a space, which is what URLSearchParams
  // itself writes; decodeURIComponent alone would leave the plus in the value.
  for (const [k, v] of new URLSearchParams(s)) out[k] = v;
  return out;
}

/** Puzzle and set names are forgiving: 33, 3x3 and 3X3 all mean 3x3. */
function fixAliases(out) {
  const p = out.params;
  if (p.puzzle) {
    const key = p.puzzle.toLowerCase();
    p.puzzle = PUZZLE_ALIAS[key] ?? (key === '4x4' ? '4x4' : key);
  }
  if (p.set) {
    const key = p.set.toLowerCase();
    p.set = SET_ALIAS[key] ?? p.set;
  }
  if (out.page === 'sets' && !p.puzzle && out.path === '/a') out.redirect = '/a/3x3';
  return out;
}

/** Breadcrumb words for a resolved route ("3x3 - OLL - Dot Case"). */
export function title(route) {
  switch (route.page) {
    case 'home': return 'Rubik’s Cube';
    case 'trainer': return 'Algorithm Trainer';
    case 'pllrecog': return '2 Sided PLL Recognition';
    case 'cross': return 'Cross Trainer';
    case 'analyze': return '3x3 Scramble Analyzer';
    case 'sets': return 'Puzzle Index';
    case 'cases': return `${route.params.set} (${route.params.puzzle})`;
    case 'case': return route.params.case;
    case 'beginner': return 'Beginner’s Method';
    case 'algsheet': return 'My Algorithms Sheet';
    case 'settings': return 'Settings';
    case 'privacy': return 'Privacy';
    case 'cube3d': return 'Rubik’s Cube 3D';
    default: return 'Not found';
  }
}

export function breadcrumb(route) {
  const p = route.params;
  if (!p.puzzle) return [title(route)];
  const out = [p.puzzle];
  if (p.set) out.push(p.set);
  if (p.case) out.push(p.case);
  return out;
}
