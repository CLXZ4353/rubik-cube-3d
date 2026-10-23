// One page at a time: a page module can register what must be torn down when
// the router paints the next route (timers, document-level key listeners).
// Without this the SPA leaks a trainer's interval and Space handler onto every
// later page.

let cleanup = null;

/** Register (or clear, with null) the current page's teardown. */
export function onPageLeave(fn) {
  cleanup = typeof fn === 'function' ? fn : null;
}

/** Run and forget the current teardown. Safe to call at any time. */
export function leavePage() {
  const fn = cleanup;
  cleanup = null;
  if (!fn) return;
  try {
    fn();
  } catch {
    // A broken teardown must not stop the next page from painting.
  }
}
