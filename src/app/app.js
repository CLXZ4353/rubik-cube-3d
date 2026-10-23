// SPA entry: resolve the route, paint the shell, run one page module.
//
// The URL is real: clicks on internal links call visit(), which repaints in
// place and pushes the new path with pushState, so a reload (or a shared link)
// opens the same page. The custom `history` array below is the small back
// stack the tests use; the browser's own back button is handled by popstate.

import { resolve } from './router.js';
import { load } from './routes.js';
import { applyTheme, buildShell } from './shell.js';
import { doc, el } from './dom.js';
import { leavePage } from './lifecycle.js';

/** Pages that show the 3D cube: the only routes allowed to load Three.js. */
const CUBE_ROUTES = new Set(['cube3d']);

export const history = [];

let cubeMounted = false;

export async function open(pathname, search = '') {
  const app = doc && doc.getElementById('app') ? doc.getElementById('app') : null;
  return renderInto(app, pathname, search);
}

async function renderInto(container, pathname, search) {
  const route = resolvePath(pathname, search);
  return paint(container, route);
}

async function paint(container, route) {
  if (!container) return null;
  leavePage();
  container.textContent = '';
  applyTheme();

  const cubeRoute = CUBE_ROUTES.has(route.page);
  document.body.classList.toggle('cube-open', cubeRoute);
  const host = doc && doc.getElementById('cube');

  if (cubeRoute) {
    container.hidden = true;
    if (host) {
      host.hidden = false;
      if (!host.querySelector('.cube-back')) {
        const back = el('a', 'cube-back', '← Back to the site');
        back.setAttribute('href', '/');
        host.appendChild(back);
      }
      if (!cubeMounted) {
        cubeMounted = true;
        const cube = await import('../CubeApp.js'); // lazy: only here
        await cube.mount();
      }
    }
    return null;
  }

  if (host) host.hidden = true;
  container.hidden = false;
  const body = buildShell(route);
  try {
    const entry = await load(route.page);
    await entry(body, route);
  } catch (err) {
    // A page that throws would otherwise leave a blank route with no clue.
    const p = el('p', 'page-error');
    p.textContent = `page error: ${err?.message ?? err}`;
    body.appendChild(p);
    console.error(`page ${route.page} threw`, err?.message ?? err);
  }
  globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
  return body;
}

/** The router allows a redirect (e.g. /a -> /a/3x3). */
function resolvePath(pathname, search) {
  let route = resolve(pathname, search);
  if (route.redirect) route = resolve(route.redirect, search);
  return route;
}

export function back() {
  const prev = history.pop();
  if (!prev) return null;
  lastPathname = prev.pathname;
  lastSearch = prev.search;
  return prev;
}

let painted = false;

export async function visit(pathname, search = '') {
  if (painted) history.push({ pathname: lastPathname, search: lastSearch });
  painted = true;
  const container = doc && doc.getElementById('app') ? doc.getElementById('app') : null;
  const route = resolvePath(pathname, search);
  lastPathname = route.path ?? pathname;
  lastSearch = search;
  if (container) pushUrl(lastPathname, search);
  return paint(container, route);
}

function pushUrl(pathname, search) {
  if (!globalThis.window || !globalThis.history?.pushState) return;
  const url = `${pathname}${search ? (search.startsWith('?') ? search : `?${search}`) : ''}`;
  if (`${location.pathname}${location.search}` === url) return;
  try {
    globalThis.history.pushState({ path: url }, '', url);
  } catch {
    // file:// or a sandboxed frame: keeping the SPA state is enough.
  }
}

let lastPathname = '/';
let lastSearch = '';

/** One document-level listener turns clicks on shell links into visits. */
export function installClicks() {
  if (!doc) return;
  doc.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest?.('a');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('/')) return;
    ev.preventDefault();
    const url = new URL(href, location.origin);
    void visit(url.pathname, url.search);
  });
}

if (doc) {
  void installClicks();
  globalThis.addEventListener?.('popstate', () => {
    const url = new URL(globalThis.location.href);
    void resolvePath(url.pathname, url.search).then((route) => paint(doc.getElementById('app'), route));
  });
  const url = new URL(doc.location.href);
  void visit(url.pathname, url.search);
}
