/**
 * **Which gates are declared ADVISORY, read out of `scripts/prepush.sh` — the one place that says
 * so.** Advisory is a DECLARATION, not a number any tool can reach (ADR-0124 D4), so the list lives
 * beside the code that honours it and every consumer reads it from there.
 *
 * Extracted from `check-advisory-agreement.mjs` in `docs/specs/delivery-gates/` M5, when the devops
 * review found `check:ci-roster` had silently dropped the spec's D2 ("the advisory set is read out
 * of `prepush.sh`, never restated"). A second copy of this parse is exactly the duplication
 * `docs/TECH_DEBT.md` #244 exists to remove — and this one has been hardened twice already, so a
 * copy would be a copy of the WEAK version.
 *
 * It is a module rather than an import from the gate because that gate calls `process.exit` at
 * module scope: importing it would run it.
 *
 * Two hardenings are load-bearing and are kept verbatim from the original, each recorded because it
 * shipped wrong once (ADR-0124's devops review found both):
 *
 *   - **Comments are stripped first.** The array body may carry `#` comments, and a `)` inside one
 *     truncated the capture and silently dropped every gate named on a later line.
 *   - **Both quote styles are accepted.** The first version matched double quotes only, so
 *     rewriting the array with single quotes — a cosmetic edit that changes nothing in bash —
 *     produced an EMPTY declared set, and the gate then accused a correctly-declared gate of being
 *     unlisted.
 *
 * It throws rather than returning an empty set, for the reason the original exits on: **an empty
 * list is indistinguishable from a parse failure**, and every assertion downstream is over the list.
 */

/**
 * @param {string} prepushSource the contents of `scripts/prepush.sh`
 * @returns {Set<string>} the declared advisory gate names, e.g. `check:reconcile-due`
 * @throws if the array is absent or parses to nothing — never a silent empty set
 */
export function parseAdvisoryGates(prepushSource) {
  const block = /^ADVISORY_GATES=\(([\s\S]*?)\)\s*$/m.exec(prepushSource);
  if (!block) {
    throw new Error(
      'no ADVISORY_GATES=( … ) array found in scripts/prepush.sh. If the advisory mechanism was ' +
        'redesigned, update the readers — do not delete them.',
    );
  }
  const arrayBody = block[1].replace(/#[^\n]*/g, '');
  const declared = new Set(
    [...arrayBody.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]),
  );
  if (declared.size === 0) {
    throw new Error(
      'ADVISORY_GATES parsed to an EMPTY list. An empty list is indistinguishable from a parse ' +
        'failure, and every assertion over it would then pass vacuously.',
    );
  }
  return declared;
}
