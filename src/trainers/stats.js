// Session aggregates. Times are milliseconds; an "average of N" is the WCA
// mean of the best N of the run — for ao3/ao5/ao12 the best (N-2)/2 dropped
// scheme only applies at N>=12, so here it is a plain mean of N consecutive
// times, which is what the trainers' panels show.

export function summarise(msList) {
  const n = msList.length;
  const out = { count: n };
  if (!n) return out;
  const sorted = [...msList].sort((a, b) => a - b);
  out.best = sorted[0];
  out.worst = sorted[n - 1];
  out.mean = Math.round(msList.reduce((a, b) => a + b, 0) / n);
  out.median = sorted[n >> 1];
  for (const k of [3, 5, 12]) {
    out[`ao${k}`] = n >= k ? bestAverage(msList, k) : null;
  }
  return out;
}

/** Mean of the best `k` consecutive times. */
function bestAverage(msList, k) {
  let bestSum = null;
  let sum = 0;
  for (let i = 0; i < msList.length; i++) {
    sum += msList[i];
    if (i >= k) sum -= msList[i - k];
    if (i >= k - 1) bestSum = bestSum === null ? sum : Math.min(bestSum, sum);
  }
  return bestSum === null ? null : Math.round(bestSum / k);
}

export function formatMs(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  if (s >= 60) return `${(s / 60) | 0}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return s.toFixed(2);
}
