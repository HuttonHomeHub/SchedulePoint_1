import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Every host that mounts the create affordance gates it on the same write right.**
 *
 * `CreateActivityButton` is rendered from `components/layout/workspace/activity-bottom-panel.tsx`.
 * It was rendered from `routes/plan-detail.tsx` too until the legacy stacked layout was deleted with
 * `VITE_CANVAS_WORKSPACE` (ADR-0088 D3), and **two hosts is the arrangement this file was written
 * for**: each decided for itself whether a reader may see the control, which is what this repository
 * keeps being bitten by — ADR-0080 shipped a bulk bar wired into one host and not the layout its
 * flag selects, ADR-0064 §7 found the same pattern applied to a control and not its neighbour four
 * times over. A gate is only as good as its least careful mount site.
 *
 * The **behaviour** — a Contributor sees no create button — is asserted through the real route
 * composition in `routes/plan-detail.gating.test.tsx`, which exercises the shipped layout with the
 * Planner cases beside it asserting the same control present.
 *
 * **So why keep this now that there is one host?** Because the risk it guards is the SECOND one
 * arriving, not the second one existing: the file it was written about is gone, and the next host
 * anybody adds is exactly the case the register's own history says goes ungated. The floor below is
 * therefore 1 rather than 2 — enough to prove the walker found something, which is the other thing
 * it was doing — and the gate assertion covers every site there turns out to be.
 *
 * Source text rather than types, for the `field-gate.structural.test.ts` reason: the compiler cannot
 * tell a permission conditional from any other conditional. Only the expression distinguishes them.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The write right every host must consult — the one boolean that has already fused role and pen. */
const GATE = /canEditSchedule\s*(\?|&&)/;

/** How much of the text before the mount site the gate may sit in — a JSX conditional is close. */
const LOOKBACK = 400;

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Every `<CreateActivityButton` in a non-test source file, with the text leading up to it. */
function mountSites(): { file: string; gated: boolean }[] {
  const sites: { file: string; gated: boolean }[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    // The component's own definition and its barrel re-export are declarations, not mount sites.
    if (file.endsWith('CreateActivityButton.tsx')) continue;
    for (const match of source.matchAll(/<CreateActivityButton\b/g)) {
      const before = source.slice(Math.max(0, match.index - LOOKBACK), match.index);
      sites.push({ file: relative(SRC, file), gated: GATE.test(before) });
    }
  }
  return sites;
}

describe('the create-activity affordance', () => {
  const sites = mountSites();

  it('is mounted somewhere, so a passing scan means something', () => {
    // A floor, not a count: the assertion below says nothing at all if the walker found nothing —
    // a broken regex or a moved directory would otherwise read as "every site is gated".
    //
    // It was 2 until `VITE_CANVAS_WORKSPACE` retired and took the legacy layout's mount site with
    // it. Lowering it is the honest move rather than a concession: the floor existed because there
    // were two hosts to drift apart, and now there is one. What this file still guards is the next
    // host arriving ungated, and the gate assertion below does that for however many there are.
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });

  it('is gated on the plan’s write right at every one of them', () => {
    const ungated = sites.filter((site) => !site.gated).map((site) => site.file);
    // Named individually: the list is the checklist, exactly as `field-gate.structural.test.ts`
    // reports its offenders.
    expect(ungated, `Gate on \`canEditSchedule\`:\n${ungated.join('\n')}`).toEqual([]);
  });
});
