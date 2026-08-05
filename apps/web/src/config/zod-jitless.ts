import { z } from 'zod';

/**
 * Turn off Zod's JIT validator compilation, because this origin serves a CSP without
 * `'unsafe-eval'` (ADR-0074 M1).
 *
 * **This changes no behaviour — it stops a spurious violation report.** Zod 4 compiles validators
 * with `new Function` when it can, and decides whether it can by *probing*: `allowsEval()` runs
 * `new Function('')` inside a `try`/`catch` (`zod/v4/core/util.js:145-163`). Under our
 * `script-src 'self'` the probe throws, Zod swallows it and falls back to the interpreted path — so
 * validation already works. But **the browser still fires `securitypolicyviolation` for the
 * attempt**, which is why the console shows "Evaluating a string as JavaScript violates the
 * following Content Security Policy directive" pointing at `auth-schemas.ts`. Zod's own source
 * says so in a comment above the probe, and provides this flag for exactly this case.
 *
 * Setting `jitless` makes Zod skip the probe entirely. The alternative — adding `'unsafe-eval'` to
 * `script-src` — was rejected without much thought: it would re-open string-to-code execution
 * across the whole origin to buy back JIT speed on a handful of small login forms.
 *
 * **Import order is load-bearing.** `allowsEval` is memoised by `cached()`, so the first schema
 * evaluation freezes the answer. This module is therefore imported at the top of `main.tsx`,
 * before anything that touches a schema.
 *
 * Found in the browser console on the deployed origin during the report-only observation window —
 * which is the window's entire purpose, and an argument for having had one.
 */
z.config({ jitless: true });
