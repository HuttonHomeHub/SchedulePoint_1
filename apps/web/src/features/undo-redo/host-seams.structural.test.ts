import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Every host of a surface that reports a write passes the seam on** (undo-redo M3, review C6).
 *
 * The surfaces that make the plan's writes — the bulk-assign bar, the Members tab, the Resources panel
 * and dialog, the cross-plan section and its add dialog, the steps save — do not know the undo history
 * exists. Each says what landed through an optional callback, and each host must hand that callback on
 * to the next surface down, or the write below it is silently one Undo skips. A seam wired in one host
 * and not its neighbour is the failure this repository keeps recording (ADR-0080, ADR-0064 §7), and
 * every unit suite mounts one host and passes the prop by hand, so none of them can see it.
 * `activities/components/create-seam.structural.test.ts` does the same for the create dialog.
 *
 * It reads the JSX of every mount site in non-test source: the element must carry each prop its
 * component reports through. A tripwire for a host that forgets, not a classifier — it cannot tell a
 * recorder from an unrelated callback of the same name, and the model's own tests own what each
 * callback records.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** What each reporting component's mount sites must pass, by prop name. */
const SEAMS: readonly { component: string; props: readonly string[] }[] = [
  { component: 'WbsBulkAssignBar', props: ['onReparented'] },
  { component: 'ActivityMembersPanel', props: ['onReparented'] },
  { component: 'ActivitiesTable', props: ['onReparented', 'onAssignmentEdited'] },
  { component: 'ActivityResourcesPanel', props: ['onAssignmentEdited'] },
  { component: 'ActivityResourcesDialog', props: ['onAssignmentEdited'] },
  { component: 'AssignmentRow', props: ['onEdited'] },
  { component: 'CrossPlanLinksSection', props: ['onAdded', 'onRemoved'] },
  { component: 'AddCrossPlanLinkDialog', props: ['onAdded'] },
  {
    component: 'ActivityEditorDialog',
    props: ['onStepsSaved', 'onAssignmentEdited', 'onReparented'],
  },
];

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * The JSX opening element that starts at `start`, through its closing `>` — brace-aware, so a prop
 * that itself holds JSX (`crossPlanSlot={<CrossPlanLinksSection … />}`) does not end the outer element
 * at the inner one's `/>`.
 */
function openingElement(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (depth === 0 && char === '"') i = source.indexOf('"', i + 1);
    else if (depth === 0 && char === '>' && source[i - 1] !== '=')
      return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Every `<Name` mount in a non-test source file other than the component's own. */
function mountSites(name: string): { file: string; element: string }[] {
  const sites: { file: string; element: string }[] = [];
  for (const file of sourceFiles()) {
    if (file.endsWith(`/${name}.tsx`)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
      sites.push({ file: relative(SRC, file), element: openingElement(source, match.index) });
    }
  }
  return sites;
}

const carries = (element: string, prop: string): boolean =>
  new RegExp(`\\b${prop}\\b`).test(element);

describe('host seams', () => {
  it.each(SEAMS)('every mount of $component passes $props', ({ component, props }) => {
    const sites = mountSites(component);
    // A scan that finds nothing passes everything.
    expect(sites.length).toBeGreaterThanOrEqual(1);
    const missing = sites.flatMap((site) =>
      props.filter((prop) => !carries(site.element, prop)).map((prop) => `${site.file}: ${prop}`),
    );
    expect(missing).toEqual([]);
  });

  it('reads an element whose prop holds JSX as one element', () => {
    const source = '<Outer a={<Inner b="x" />}\n  onSeam={fn}\n/>\n<Other onSeam={fn} />';
    expect(openingElement(source, 0)).toContain('onSeam');
    expect(openingElement(source, 0)).not.toContain('<Other');
  });

  it('pinned positive case: a host without the prop is reported', () => {
    expect(carries('<WbsBulkAssignBar orgSlug="a" planId="b" />', 'onReparented')).toBe(false);
  });
});
