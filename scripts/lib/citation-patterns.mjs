// @ts-check
/**
 * **What counts as a citation, and whose file it is** — the pure half of `check-claims.mjs`
 * (`docs/TECH_DEBT.md` #240).
 *
 * Extracted so the derivation can be asserted rather than described. The gate's central rule is
 * that ONE extension class feeds both the citation patterns and the `git ls-files` argument list;
 * a rule that lives only in a docblock is one careless edit from being two lists again, which is
 * the defect this module exists because of. `citation-patterns.test.mjs` pins the derivation.
 *
 * The `scripts/lib/doc-register.mjs` precedent: a plain `.mjs` module with a sibling
 * `node`-runnable test, chained into the `check:*` script it serves.
 */

/**
 * **The file extensions a citation may carry — ONE class, feeding both halves of this gate**
 * (`docs/TECH_DEBT.md` #240).
 *
 * Both patterns below used to end in `\.m?js`, written twice, so a citation was recognised only if
 * its file ended `.js` or `.mjs`. For anything else the gate was silent in **both** directions: not
 * demanded when unregistered, and a register entry for one reading as uncited. Both halves failed
 * towards green, which is why CI never noticed — the seventh hole in this scan, after the two
 * `docs/TECH_DEBT.md` #101 records, the dotted-basename one below, the case-sensitivity one (#183),
 * the unscanned journey directories, and the unscanned `packages/`.
 *
 * It was never a CSS hole. `\.m?js` does not match **`.cjs`** either, while the own-file exclusion
 * has always run `git ls-files '*.js' '*.mjs' '*.cjs'` — so the matcher and the exclusion disagreed
 * about what JavaScript is. That is why this constant now feeds both, and why nothing below should
 * ever spell an extension a second time.
 *
 * **Admission test** (D2): a dependency in this tree ships files with it, a citation exists or is
 * imminent, and the first-run cost has been measured. Deliberately excluded, with reasons:
 *
 * - **`.ts` / `.tsx`** — 3,801 matching lines across 315 files, essentially all this repository
 *   citing itself. No dependency here is cited by a `.ts` path.
 * - **`.json`** — all repo-owned today, and the only plausible dependency `.json` is
 *   `package.json`, whose basename **every** package shares with ours. It would be structurally
 *   guaranteed to be skipped by the own-file filter while reading as coverage, which is
 *   `docs/TECH_DEBT.md` #124's defect exactly.
 * - **`.map`, `.html`, `.yml`, `.sh`, `.sql`** — no citation exists or is plausible.
 * - **no extension** — refused on shape: `word:123` is indistinguishable from ordinary prose.
 */
export const CITED_EXTENSIONS = ['js', 'mjs', 'cjs', 'css', 'd.ts'];

/**
 * The alternation both patterns share. Each member is regex-escaped (`d.ts`'s dot is a
 * metacharacter and would otherwise match `dXts`), and members are sorted longest-first so `d\.ts`
 * cannot be shadowed by a shorter alternative that prefix-matches it.
 */
export const EXTENSION_ALTERNATION = [...CITED_EXTENSIONS]
  .sort((a, b) => b.length - a.length)
  .map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

export const CITATIONS = [
  // `sign-in.mjs:264` / `dist/api/routes/sign-in.mjs:234-240` / `dist/throttler.guard.js:148-150`
  // …and `useBlocker.js:35`. **The class carries `A-Z` because dependencies are increasingly
  // camelCase module files**, and a case-sensitive class made those citations invisible in BOTH
  // directions: not demanded when unregistered, and a registered entry for one reading as uncited
  // (`docs/TECH_DEBT.md` #183). The prose form below always carried an `i` flag, so the two halves
  // of one gate disagreed about which citations existed. Measured before widening: 15 occurrences
  // across the unsaved-work-guard artefacts, resolving to FIVE load-bearing claims that had never
  // been version-pinned — into `useBlocker.js` and `Transitioner.js`, which is the exact behaviour
  // ADR-0108's design rests on.
  //
  // The case asymmetry between the two forms is deliberate and predates #240; only the extension
  // class changed.
  new RegExp(String.raw`\b([a-zA-Z0-9.-]+\.(?:${EXTENSION_ALTERNATION})):(\d+(?:-\d+)?)\b`, 'g'),
  // `` `dist/api/routes/sign-in.mjs`, lines **234** `` — also "line", "on lines", ``234``, 234–240
  new RegExp(
    String.raw`\`[^\`\n]*?([a-z0-9.-]+\.(?:${EXTENSION_ALTERNATION}))\`[,;]?\s*(?:on\s+)?lines?\s*\**\`?(\d+(?:\s*[-–]\s*\d+)?)`,
    'gi',
  ),
];

/**
 * **Neither ours nor an installed dependency's** — a third ownership category the gate has never
 * had (`docs/TECH_DEBT.md` #240).
 *
 * `static/css/auth.css` belongs to the **previous Flask application**, in a different repository.
 * `resolve()` would report it "not installed", and `git ls-files` will never list it, so no register
 * entry for it can ever exist — yet three of its line ranges are load-bearing evidence:
 * `docs/adr/0077-public-screens-brand-surface.md` §9.3 and `docs/DESIGN_SYSTEM.md` cite it for the
 * alert geometry this product reproduces, and `apps/web/src/components/ui/alert.tsx` and its test
 * cite it at the call site.
 *
 * **The single admission rule**, so this cannot become a bin for citations nobody could be bothered
 * to register: no installed package can resolve it, AND it is not in `git ls-files`. Anything that
 * fails either half is a claim, and claims go in the register.
 */
export const FOREIGN_UNVERIFIABLE = new Set(['auth.css']);

/**
 * The `git ls-files` arguments for this repository's own cited files — derived from the same
 * constant as the patterns, which is the whole point (see `ownBasenames()` in `check-claims.mjs`).
 */
export function ownGlobs() {
  return CITED_EXTENSIONS.map((ext) => `*.${ext}`);
}
