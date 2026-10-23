// The Scramble Analyzer: from a scramble, how far can you get and how many
// ways are there. Every solution is verified by replay — a sequence is kept
// only if applying it to the state leaves the cube solved (up to an AUF turn),
// which is why the counters can never drift from the real cube.
//
// Counters nest like the original's: crosses <= pairs <= ll == total.
// A counter only counts a prefix that actually produced a verified solution,
// so the numbers describe what the list can show rather than raw search noise.
//
//   analyze(scramble, { howfar, colors, maxDepth, timeBudgetMs })

import { CubeState } from '../CubeState.js';
import { parseNotation, notation, makeMove, ALL_MOVES_FULL } from '../moves.js';
import { crossSolutions, pairSolutions, SLOTS } from './projection.js';
import { ollKey, pllKey } from '../cases/hash.js';
import { solveCube } from '../Solver.js';
import { metrics } from '../notation/metrics.js';

/** howfar -> how many F2L pairs the analyzer insists on solving. */
export const HOWFAR = { full: 4, 'cross+3': 3, 'cross+2': 2, 'cross+1': 1, cross: 0 };

const SOLVED = new CubeState(3);
const U_MOVE = makeMove('U');

export const DEFAULTS = {
  howfar: 'full',
  colors: ['white', 'yellow', 'green', 'blue', 'red', 'orange'],
  maxDepth: 7,
  timeBudgetMs: 8000,
};

export function stateOf(scramble) {
  const st = new CubeState(3);
  for (const mv of parseNotation(scramble)) st.applyMove(mv);
  return st;
}

const EMPTY_COUNTERS = { crosses: 0, pairs: 0, ll: 0, total: 0 };

export async function analyze(scramble, opts = {}) {
  const text = String(scramble ?? '').trim();
  // An empty scramble has exactly one solution: nothing. Running the search on
  // a solved cube would otherwise report pretend crosses and an empty last
  // layer, which is what made the UI look broken.
  if (!text) {
    return { scramble: '', counters: { ...EMPTY_COUNTERS }, solutions: [], truncated: false };
  }

  const maxDepth = opts.maxDepth ?? 6; // cross length cap; 7 costs about 4x more
  const colors = opts.colors ?? ['yellow', 'white'];
  const needSlots = HOWFAR[opts.howfar ?? 'cross+2'];
  const budget = opts.timeBudgetMs ?? 0;
  const deadline = budget > 0 ? Date.now() + budget : 0;
  const outOfTime = () => deadline > 0 && Date.now() > deadline;

  const root = stateOf(text);
  const crossKeys = new Set(); // colour + cross that lead to a verified solution
  const pairKeys = new Set(); // colour + cross + slot + pair that do
  const solutions = [];
  const seenSeq = new Set();
  let truncated = false;

  search:
  for (const colour of colors) {
    if (outOfTime()) { truncated = true; break; }
    const found = crossSolutions(root, colour, maxDepth, 3);
    for (const cross of found) {
      if (outOfTime()) { truncated = true; break search; }
      const afterCross = applyMoves(root, cross);
      if (needSlots === 0) {
        const tail = await llPlanner(afterCross);
        if (tail === null) continue;
        const seq = `${cross} ${tail}`.trim();
        if (!seenSeq.has(seq)) {
          seenSeq.add(seq);
          if (await verified(root, seq)) {
            const crossKey = `${colour}|${cross}`;
            crossKeys.add(crossKey);
            pairKeys.add(crossKey); // no pair step at this depth
            solutions.push({ seq, cross: colour, htm: metrics(seq).htm, comments: `${cross} // ${colour} cross`, skips: skipsOf(afterCross) });
          }
        }
        continue;
      }
      for (const slot of Object.keys(SLOTS)) {
        if (outOfTime()) { truncated = true; break search; }
        const pairList = await pairSolutions(afterCross, slot, colour, 3, 1);
        for (const pair of pairList) {
          if (outOfTime()) { truncated = true; break search; }
          const afterPair = applyMoves(afterCross, pair);
          const tail = await llPlanner(afterPair);
          if (tail === null) continue; // unreachable, not "empty because solved"
          const seq = `${cross} ${pair} ${tail}`.trim();
          if (seenSeq.has(seq)) continue;
          seenSeq.add(seq);
          if (!await verified(root, seq)) continue;
          crossKeys.add(`${colour}|${cross}`);
          pairKeys.add(`${colour}|${cross}|${slot}|${pair}`);
          solutions.push({
            seq,
            cross: colour,
            htm: metrics(seq).htm,
            skips: skipsOf(afterPair),
            comments: `${cross} // ${colour} cross\n${pair} // pair ${slot}\n${tail || '(skip)'} // last layer`,
          });
        }
      }
    }
  }

  return {
    scramble: text,
    truncated,
    counters: {
      crosses: crossKeys.size,
      pairs: pairKeys.size,
      ll: solutions.length,
      total: solutions.length,
    },
    solutions: solutions.sort((a, b) => a.htm - b.htm).slice(0, 20),
  };
}

/** The last-layer completion of a state, or null if it is not reachable. */
export async function llPlanner(state) {
  const res = await solveCube(state, { maxTimeMs: 3000, maxNodes: 200000 });
  if (!res || res.error) return null;
  return (res.moves ?? []).map((mi) => notation(ALL_MOVES_FULL[mi])).join(' ');
}

/** A solution survives only if the replay leaves the cube solved (up to AUF). */
export async function verified(root, seq) {
  const st = applyMoves(root, seq);
  for (let k = 0; k < 4; k++) {
    if (st.isSolved()) return true;
    st.applyMove(U_MOVE);
  }
  return false;
}

function applyMoves(state, seq) {
  const st = state.clone();
  for (const mv of parseNotation(seq)) st.applyMove(mv);
  return st;
}

export function skipsOf(state) {
  const st = state.clone();
  return { oll: ollKey(st) === ollKey(SOLVED), pll: pllKey(st) === pllKey(SOLVED) };
}

/** All / Full Step / OLL Skip / PLL Skip / LL Skip. */
export function filterSolutions(list, mode = 'all') {
  if (mode === 'full') return list.filter((s) => s.htm > 0);
  if (mode === 'oll') return list.filter((s) => s.skips.oll);
  if (mode === 'pll') return list.filter((s) => s.skips.pll);
  if (mode === 'll') return list.filter((s) => s.skips.oll && s.skips.pll);
  return list;
}
