import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Every host of the create dialog passes the undo seam** (undo-redo M3, ADR-0176 D6).
 *
 * `ActivityCreateDialog` has two hosts — the workspace's "Insert activity below"
 * (`activity-crud-dialogs.tsx`) and the panel's "New activity" (`CreateActivityButton`, mounted by
 * `activity-bottom-panel.tsx`) — and **before this milestone neither passed a recorder**, so an
 * activity added from either was the one edit in the plan that Undo silently skipped. A seam wired in
 * one host and not its neighbour is the failure this repository keeps recording (ADR-0080, ADR-0064
 * §7, `create-activity-gate.structural.test.ts`'s own history), and the unit suites cannot see it:
 * each mounts one host and passes the prop by hand.
 *
 * What this reads is the JSX of every mount site: the element must carry `onCreated`. It is a
 * tripwire for the ARRIVAL of a third host, not a classifier — it cannot tell a recorder from an
 * unrelated callback of the same name, and `use-plan-workspace-model`'s own tests own what the
 * callback records.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Every `<Name … />` element in a non-test source file, as its source text up to the closing `/>`. */
function mountSites(name: string): { file: string; element: string }[] {
  const sites: { file: string; element: string }[] = [];
  for (const file of sourceFiles()) {
    // The component's own definition is a declaration, not a mount site.
    if (file.endsWith(`${name}.tsx`)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?\\n\\s*/>`, 'g'))) {
      sites.push({ file: relative(SRC, file), element: match[0] });
    }
  }
  return sites;
}

/** Whether a mount site's JSX carries the seam. */
const carriesSeam = (element: string): boolean => /\bonCreated\b/.test(element);

describe('the create dialog undo seam', () => {
  // `CreateActivityButton` renders the dialog itself, so it is a host in its own right: its own mount
  // sites (the panel) must pass the seam, and it must forward it to the dialog it renders — which is
  // the one mount the scan skips, because it is the component's own file.
  const hosts = [...mountSites('ActivityCreateDialog'), ...mountSites('CreateActivityButton')];

  it('finds the hosts it exists to check — a scan that finds nothing passes everything', () => {
    // The workspace's insert dialog and the panel's button, at the time of writing.
    expect(hosts.length).toBeGreaterThanOrEqual(2);
  });

  it('every host passes onCreated', () => {
    expect(hosts.filter((site) => !carriesSeam(site.element)).map((site) => site.file)).toEqual([]);
  });

  it('the button forwards it to the dialog it renders', () => {
    const source = readFileSync(
      join(SRC, 'features/activities/components/CreateActivityButton.tsx'),
      'utf8',
    );
    expect(carriesSeam(/<ActivityCreateDialog\b[\s\S]*?\n\s*\/>/.exec(source)?.[0] ?? '')).toBe(
      true,
    );
  });

  it('pinned positive case: a host without it is reported', () => {
    expect(carriesSeam('<ActivityCreateDialog\n  orgSlug="acme"\n  planId="p1"\n/>')).toBe(false);
  });
});
