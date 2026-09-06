import { readdirSync } from 'node:fs';

/**
 * **The roster of pure revision-comparison sources, DERIVED rather than listed.**
 *
 * Two structural gates guard this family — `revision-delta-engine-free.structural.spec.ts` (the
 * delta never imports the CPM engine, which is what makes the ADR-0034 parity argument structural)
 * and `revision-delta-no-cause.structural.spec.ts` (it never names a cause, which is what keeps
 * ADR-0125's measured refusal of Tier 3 from being undone by a contributor being helpful). Both
 * shipped with the roster written as the literal `['revision-delta.ts']`.
 *
 * That was correct for one module and **silently stops covering the family the moment a second one
 * lands** — which is exactly what the changes epic does. Nothing would have gone red; the gates
 * would have kept passing while guarding a shrinking fraction of what they are for. That is this
 * repository's most-recorded failure shape: a check that is green because it is not looking.
 *
 * ## Why derived AND floored, rather than one or the other
 *
 * The original docblocks pin the list deliberately, and their reason is good: an assertion that
 * runs over an empty set passes perfectly, so a glob that matches nothing reads as a clean bill of
 * health (ADR-0093; ADR-0108's own census gate caught itself on precisely this). Swapping the pin
 * for a glob would fix the coverage hole by opening the vacuity one.
 *
 * So this does both. The roster is **derived by convention** — every `revision-*.ts` in the module
 * that is not a test — so a new pure module is covered on the day it is written; and
 * {@link REVISION_SOURCE_FLOOR} names the members that must always be present, so a convention
 * change, a rename or a bad directory cannot quietly empty it. A derived set that has lost a known
 * member fails, and so does one that is empty.
 */
export const REVISION_SOURCE_FLOOR = ['revision-delta.ts'] as const;

/** Suffixes that are tests or gates about the sources rather than sources themselves. */
const NOT_A_SOURCE = /\.(spec|test)\.ts$/;

/**
 * Every pure revision-comparison source in `dir`.
 *
 * Deliberately NOT every file in the module: the service and the repository legitimately live
 * beside the engine and legitimately talk about causes in prose, so sweeping them would make both
 * gates fire on correct code — and a gate that cries wolf gets deleted rather than fixed
 * (ADR-0058). The `revision-` prefix is the convention that separates the pure family from its
 * persisting neighbours.
 */
export function revisionSources(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith('revision-') && f.endsWith('.ts') && !NOT_A_SOURCE.test(f))
    .sort();
}

/**
 * The roster, with both protections applied. Throws rather than returning a short list, because a
 * gate calling this wants to fail loudly on a broken roster and not to quietly guard less.
 */
export function assertedRevisionSources(dir: string): string[] {
  const found = revisionSources(dir);
  const missing = REVISION_SOURCE_FLOOR.filter((f) => !found.includes(f));
  if (missing.length > 0) {
    throw new Error(
      `The revision source roster lost a known member: ${missing.join(', ')}. ` +
        `Found: ${found.join(', ') || '(nothing)'}. Either the convention changed or the ` +
        `directory is wrong — do not "fix" this by shortening the floor.`,
    );
  }
  if (found.length === 0) {
    throw new Error('The revision source roster is empty. A gate over nothing is not a gate.');
  }
  return found;
}
