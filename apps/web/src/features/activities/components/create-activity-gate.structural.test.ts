import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Every host that mounts the create affordance gates it on the same write right.**
 *
 * `CreateActivityButton` is rendered from two places — `components/layout/workspace/
 * activity-bottom-panel.tsx` (the layout that ships) and `routes/plan-detail.tsx` (the legacy
 * stacked layout, reachable only with `VITE_CANVAS_WORKSPACE` off). Each decides for itself whether
 * a reader may see it, which is the arrangement this repository keeps being bitten by: ADR-0080
 * shipped a bulk bar wired into one host and not the layout its flag selects, ADR-0064 §7 found the
 * same pattern applied to a control and not its neighbour four times over. A gate is only as good as
 * its least careful mount site.
 *
 * The **behaviour** — a Contributor sees no create button — is asserted through the real route
 * composition in `routes/plan-detail.gating.test.tsx`, which exercises the shipped layout with the
 * Planner cases beside it asserting the same control present. That test cannot reach the legacy
 * layout: it lives behind a default-on flag, and pinning it off here would create a new flag-off
 * harness for a branch no shipped bundle can produce (ADR-0088) — one that a Class A retirement
 * would then have to delete. So the second site is held structurally instead, which has the
 * side-benefit of covering a **third** host the day someone adds one.
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

  it('is mounted in more than one place, so a passing scan means something', () => {
    // A floor, not a count: the assertion below says nothing at all if the walker found nothing,
    // and the whole risk here is a second host drifting from the first.
    expect(sites.length).toBeGreaterThanOrEqual(2);
  });

  it('is gated on the plan’s write right at every one of them', () => {
    const ungated = sites.filter((site) => !site.gated).map((site) => site.file);
    // Named individually: the list is the checklist, exactly as `field-gate.structural.test.ts`
    // reports its offenders.
    expect(ungated, `Gate on \`canEditSchedule\`:\n${ungated.join('\n')}`).toEqual([]);
  });
});
