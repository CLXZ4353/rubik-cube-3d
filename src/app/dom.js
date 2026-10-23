// Small DOM helpers shared by the page modules. Kept tiny on purpose: the
// pages are lists of cards, not a widget framework.
// shortcut: no event delegation, one click handler per card; revisit if the
// case lists grow past a few hundred clickable rows.

import { resolve, NAV, title as pageTitle, breadcrumb } from './router.js';

export const doc = globalThis.document; // undefined under node (tests)

export function el(tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

export function link(path, cls, text) {
  const a = el('a', cls, text);
  a.setAttribute('href', path);
  return a;
}

/** A row of chips: label + value, used for metrics and counters. */
export function chips(items, cls = 'chip') {
  const wrap = el('div', cls);
  for (const [label, value] of items) {
    const s = el('span', 'chip-label');
    s.textContent = `${label}: ${value}`;
    wrap.appendChild(s);
  }
  return wrap;
}

/** Turn a server-side path into a live link the SPA can route.
 * History API: a pushState here would reload, so we only set the href and let
 * the entry module route it when the user actually clicks. */
export function route(path) {
  return resolve(path).page;
}

/** Click-through helper: the shell installs one listener on the document. */
export function navigate(path) {
  const a = doc.createElement('a');
  a.href = path;
  a.className = 'nav-jump';
  return a;
}

/** Re-exports so a page module needs exactly one import for the shell parts. */
export const NAV_LIST = NAV;
export function titleFor(route) {
  return pageTitle(route);
}
export function crumbFor(route) {
  return breadcrumb(route);
}
