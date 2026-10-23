// /Beginner — a beginner's method guide, written here rather than copied: the
// steps are the plain layer-by-layer route, each with the cube state shown as
// a net so the reader can compare against what they hold.

import { el, link } from '../dom.js';
import { netSvg } from '../../render/net2d.js';
import { stateToStickerString } from '../../render/stickerString.js';
import { CubeState } from '../../CubeState.js';
import { parseNotation } from '../../moves.js';

export const STEPS = [
  ['1. The cross', 'Pick one colour, usually white. Put the four white edges under it, one at a time; do not worry about the corners yet.', 'D'],
  ['2. The first-layer corners', 'Take a corner that carries white out of the bottom, then put it back above its own two centres.', "R U R' U'"],
  ['3. The middle layer', 'Find a corner-less edge up front, move it aside with U until it is over its own centre, then drop it with the R and L families.', "R U R' U' R' F R F'"],
  ['4. The last layer', 'Orient the top with the two-flip and two-twist cases, then permute with the small corner cycle.', "R U R' U' R' F R' F'"],
];

export function render(container, route) {
  container.appendChild(el('p', 'muted', 'A plain layer-by-layer route. Each step shows the state after the example sequence; the full case lists live in the database.'));

  for (const [title, text, example] of STEPS) {
    const sec = el('section', 'step');
    sec.appendChild(el('h2', null, title));
    sec.appendChild(el('p', null, text));
    const demo = el('div', 'step-net');
    demo.innerHTML = netSvg(stateToStickerString(apply(example)), 3, 8);
    sec.appendChild(demo);
    sec.appendChild(el('div', 'step-alg', `one sequence that does it: ${example}`));
    container.appendChild(sec);
  }

  const tail = el('p');
  tail.appendChild(link('/t?set=OLL', 'btn btn-primary', 'Drill the OLL cases'));
  tail.appendChild(document.createTextNode(' '));
  tail.appendChild(link('/a/3x3', 'btn btn-ghost', 'Browse the database'));
  container.appendChild(tail);
  return container;
}

function apply(seq) {
  const st = new CubeState(3);
  for (const mv of parseNotation(seq)) st.applyMove(mv);
  return st;
}
