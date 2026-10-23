// /3d — the 3D cube page. The cube itself is the untouched app in src/CubeApp.js
// (its Three.js import happens there, and app.js only loads that module on this
// route). This module just puts the 3D view inside the shell so the page keeps
// the nav, the title and the breadcrumbs like every other page.

import { el } from '../dom.js';

export async function render(container, route) {
  const note = el('p', 'cube-note');
  note.textContent = 'Keyboard turns, mouse drag to orbit. Solver loads on first use.';
  container.appendChild(note);
  const link = el('a', 'back-link');
  link.setAttribute('href', '/');
  link.textContent = 'back to the database';
  container.appendChild(link);
  return container;
}
