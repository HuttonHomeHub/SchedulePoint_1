/**
 * Read the persisted theme before first paint.
 *
 * **It deliberately paints nothing, and that is the anti-flash guarantee rather than a
 * gap in it** (ADR-0097). SchedulePoint has one theme and `:root` **is** its block, so
 * there is no class to stamp — which means there is no window in which the wrong one
 * could be stamped, and no way for this file and `hooks/use-theme.tsx` to disagree.
 * Every stored value resolves the same way: `dark`, `light`, `system`, a string nobody
 * ever wrote, or a `localStorage` that throws.
 *
 * **The mechanism is kept live rather than deleted.** It runs on every load, it reads,
 * it validates, and it keeps its test — so adding a second theme back is a block of
 * values and one branch here, not the rediscovery of why a parser-blocking script in
 * `public/` was the right shape.
 *
 * **It lives in `public/` rather than inline in `index.html` for a security reason**
 * (ADR-0074): an inline script forces `script-src` to carry either `'unsafe-inline'` or
 * a `sha256-` hash of these bytes. The hash is worse than it sounds — a mismatch **fails
 * closed and silently**, before first paint, in enforce mode only, on the deployed origin
 * only, across two files (`index.html` and `nginx.conf`) with no compiler relationship.
 * As a served file it needs no relaxation at all.
 *
 * `public/` specifically, because Vite copies that directory verbatim — a fingerprinted
 * name would not match the fixed `<script src>` path in `index.html`. It is therefore
 * **not** immutably cacheable, and `nginx.conf` gives it its own short-`max-age`
 * location.
 *
 * Keep it dependency-free, synchronous and small.
 */
(function () {
  var THEMES = ['corporate'];
  try {
    var stored = localStorage.getItem('schedulepoint-theme');
    var theme = THEMES.indexOf(stored) === -1 ? 'corporate' : stored;
    // One theme, declared at `:root` — so the resolved theme needs no class. The
    // assignment is kept so the resolution above is not dead code a minifier drops, and
    // so a second theme has an obvious place to be applied.
    if (theme !== 'corporate') {
      document.documentElement.classList.add(theme);
    }
  } catch (_) {
    /* localStorage unavailable — nothing to apply in either case. */
  }
})();
