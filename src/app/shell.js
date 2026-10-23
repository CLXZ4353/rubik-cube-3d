// The frame every page shares: header with logo, nav and theme switch, the
// breadcrumb + page title, and the footer. One shell is built per paint inside
// #app, so old headers can never accumulate.

import { NAV, title as pageTitle, breadcrumb } from './router.js';
import { get, set } from './store.js';

export const THEMES = ['dark', 'light'];

/** Where the theme comes from: the store wins, then the OS preference. */
export function themeValue() {
  const saved = get('theme');
  if (THEMES.includes(saved)) return saved;
  if (globalThis.matchMedia && globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches) return 'light';
  return 'dark';
}

/** Persist a theme choice (the /settings page and the header icon call this). */
export function setTheme(value) {
  if (!THEMES.includes(value)) return themeValue();
  return set('theme', value);
}

/** Apply it to the document; CSS keys off html[data-theme]. */
export function applyTheme() {
  const value = themeValue();
  if (document.documentElement) document.documentElement.dataset.theme = value;
  return value;
}

/** Pure: the nav as (label, path) pairs, for the test and the search index. */
export function navLinks() {
  return NAV.map((p) => ({ label: p[0], path: p[1] }));
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function link(path, cls, text) {
  const a = el('a', cls, text);
  a.setAttribute('href', path);
  return a;
}

/** Build the shell inside #app and return the element pages paint into. */
export function buildShell(route) {
  const app = document.getElementById('app');
  if (!app) return null;

  const shell = el('div', 'shell');

  // Skip link first, so keyboard users land in the page body.
  shell.appendChild(link('#content', 'skip-link', 'Skip to content'));

  const header = el('header', 'site-header');
  const inner = el('div', 'header-inner');

  const logo = link('/', 'logo');
  logo.appendChild(el('span', 'logo-mark'));
  const word = el('span', 'logo-word');
  word.innerHTML = 'Cube<strong>DB</strong>';
  logo.appendChild(word);
  inner.appendChild(logo);

  const nav = el('nav', 'site-nav');
  nav.setAttribute('aria-label', 'Main');
  for (const [label, path] of NAV) {
    const a = link(path, null, label);
    if (isActive(path, route)) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  inner.appendChild(nav);

  const actions = el('div', 'header-actions');
  const theme = el('button', 'theme-toggle');
  theme.type = 'button';
  theme.title = 'Switch between dark and light';
  theme.setAttribute('aria-label', 'Switch theme');
  theme.textContent = document.documentElement?.dataset.theme === 'light' ? '☾' : '☀';
  theme.addEventListener('click', () => {
    const next = themeValue() === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    theme.textContent = next === 'light' ? '☾' : '☀';
  });
  actions.appendChild(theme);
  inner.appendChild(actions);
  header.appendChild(inner);
  shell.appendChild(header);

  const main = el('main', 'site-main');
  main.id = 'content';

  const head = el('div', 'page-head');
  const crumbs = el('nav', 'breadcrumb');
  crumbs.setAttribute('aria-label', 'Breadcrumb');
  const parts = breadcrumb(route);
  parts.forEach((part, i) => {
    if (i) crumbs.appendChild(el('span', 'crumb-sep', '/'));
    const href = crumbHref(route, i, parts.length);
    if (href && i < parts.length - 1) crumbs.appendChild(link(href, null, part));
    else crumbs.appendChild(el('span', 'crumb-here', part));
  });
  head.appendChild(crumbs);

  const h1 = el('h1', 'page-title', pageTitle(route));
  head.appendChild(h1);
  main.appendChild(head);

  const body = el('div', 'page-body');
  main.appendChild(body);
  shell.appendChild(main);

  const foot = el('footer', 'site-footer');
  const footInner = el('div', 'footer-inner');
  const brand = el('div', 'footer-brand');
  brand.innerHTML = '<strong>CubeDB</strong><span>Cubes, cases and algorithms. No account, no tracking.</span>';
  footInner.appendChild(brand);
  const footNav = el('nav', 'footer-nav');
  footNav.setAttribute('aria-label', 'Footer');
  for (const [label, path] of [
    ['Algorithm database', '/a/3x3'],
    ['My sheet', '/algsheet'],
    ['Trainer', '/t'],
    ['PLL recognition', '/t/pllrecog'],
    ['Analyzer', '/analyze'],
    ['Settings', '/settings'],
    ['Privacy', '/privacy'],
  ]) footNav.appendChild(link(path, null, label));
  footInner.appendChild(footNav);
  foot.appendChild(footInner);
  shell.appendChild(foot);

  app.appendChild(shell);
  return body;
}

function crumbHref(route, index, total) {
  const p = route.params ?? {};
  if (index === 0 && p.puzzle) return `/a/${p.puzzle}`;
  if (index === 1 && p.puzzle && p.set) return `/a/${p.puzzle}/${p.set}`;
  if (index === total - 1 && p.puzzle && p.set && p.case) return `/a/${p.puzzle}/${p.set}/${p.case}`;
  return null;
}

function isActive(path, route) {
  if (path === '/') return route.page === 'home';
  if (path === '/t') return route.page === 'trainer';
  if (path === '/t/pllrecog') return route.page === 'pllrecog';
  if (path === '/cross') return route.page === 'cross';
  if (path === '/a') return ['sets', 'cases', 'case'].includes(route.page);
  if (path === '/analyze') return route.page === 'analyze';
  if (path === '/Beginner') return route.page === 'beginner';
  if (path === '/3d') return route.page === 'cube3d';
  if (path === '/privacy') return route.page === 'privacy';
  return false;
}
