/**
 * Apply the persisted theme before first paint, to avoid a flash of the wrong one
 * (docs/FRONTEND_ARCHITECTURE.md → Theme management).
 *
 * **This lives in `public/` rather than inline in `index.html` for a security reason**
 * (ADR-0074): an inline script forces `script-src` to carry either `'unsafe-inline'` or a
 * `sha256-` hash of these bytes. The hash is worse than it sounds — a mismatch **fails closed and
 * silently**, before first paint, in enforce mode only, on the deployed origin only, across two
 * files (`index.html` and `nginx.conf`) with no compiler relationship. The symptom is a stuck or
 * flashing wrong theme, which nobody connects to an HTTP header, and the obvious "fix" is to add
 * `'unsafe-inline'`. As a served file it needs no relaxation at all.
 *
 * `public/` specifically, because Vite copies that directory verbatim — a fingerprinted name
 * would not match the fixed `<script src>` path in `index.html`. It is therefore **not**
 * immutably cacheable, and `nginx.conf` gives it its own short-`max-age` location.
 *
 * Keep it dependency-free, synchronous and small. It is parser-blocking by design: that is what
 * makes the anti-flash guarantee hold, and it is the whole reason the file exists.
 */
(function () {
  try {
    var stored = localStorage.getItem('schedulepoint-theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var corporate = stored === 'corporate';
    var dark = !corporate && (stored === 'dark' || ((stored === 'system' || !stored) && system));
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('corporate', corporate);
  } catch (_) {
    /* localStorage unavailable — fall back to light. */
  }
})();
