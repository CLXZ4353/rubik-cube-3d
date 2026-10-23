// 404: a page, not a dead end. It links to the places a typo could have meant.

import { el, NAV_LIST } from '../dom.js';

export function render(container, route) {
  const p = el('p');
  p.textContent = `Nothing here answers ${route.path}. It may have been one of these:`;
  container.appendChild(p);
  const list = el('ul', 'suggest');
  for (const [label, path] of NAV_LIST) {
    const li = el('li');
    const a = el('a');
    a.setAttribute('href', path);
    a.textContent = label;
    li.appendChild(a);
    list.appendChild(li);
  }
  container.appendChild(list);
  return container;
}
