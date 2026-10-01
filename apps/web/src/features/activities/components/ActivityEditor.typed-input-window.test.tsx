import type { ActivitySummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';
import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import { assignmentKeys, resourceKeys } from '@/features/resources/api/use-resources';
import { fieldByLabel, nextTask, startProbe, typeNow, type Probe } from '@/test/typed-input-window';

/**
 * **The typed-input window, probed on all four hosts** (docs/specs/activity-editor-seeding, M0
 * task T0.2; mechanism in the spec's §0.1; verdicts in `m0-measurement.md`).
 *
 * Each host seeds its form with a `reset()` inside a passive effect — on open for the editor and
 * New activity, on mount for the Progress and Resources panels a tab click reveals. Text typed
 * before the next render is discarded when that render is a task away.
 * `src/test/typed-input-window.ts` says why no other suite here can see that.
 *
 * **Two hosts are red and two are not, and the difference is the finding.**
 *
 * - The editor and New activity are `it.fails`: they assert the property the epic delivers (typed
 *   text survives), FAIL on this tree, and `it.fails` keeps the suite green while recording it. The
 *   milestone that fixes a host (M2 New activity, M3b the editor) turns its case into a plain `it`;
 *   vitest reports an `it.fails` that starts passing as a failure, so the flip cannot be forgotten.
 * - The Progress and Resources panels are plain `it` and PASS. A panel mounted by a click re-renders
 *   itself again inside the click's own microtask flush (render, effect, render — measured with a
 *   render log), so the field is registered again before any later task can type. The spec's
 *   premise (§0.2 rows 1c and 3: "same window on tab reveal") does not hold in this probe. M1's
 *   Resources reset deletion is then a cleanup, not a fix.
 *
 * **Positive control.** The same keystroke typed one task LATE passes on every host, in a plain
 * `it`. Without it a probe that never reaches the field would look exactly like one that caught the
 * window.
 *
 * **What this does not establish:** whether a real browser's driver ever lands a keystroke inside
 * the window. jsdom lets this probe type before ANY other task runs; a real `fill` arrives over the
 * protocol several milliseconds later. Only a browser measurement can say.
 */

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const ROW = {
  id: 'act-1',
  planId: 'plan-1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  percentComplete: 10,
  version: 1,
} as ActivitySummary;

/** One assignable resource, so the Resources tab renders its assign form rather than an empty state. */
const CREW = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  parentId: null,
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as ResourceSummary;

let probe: Probe;
let client: QueryClient;

beforeEach(() => {
  // `staleTime: Infinity` plus seeded data: the Resources tab reads these three queries and must
  // render its assign form in the SAME task the tab is revealed, which a network round trip would
  // push past the window this probe exists to measure.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(resourceKeys.filtered('acme', { archived: 'include' }), [CREW]);
  client.setQueryData(resourceKeys.search('acme', { q: '' }), {
    pages: [{ resources: [CREW], nextCursor: null, hasMore: false }],
    pageParams: [null],
  });
  client.setQueryData(assignmentKeys.listByActivity('acme', 'act-1'), []);
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response),
    ),
  );
  probe = startProbe();
});

afterEach(() => {
  probe.dispose();
  vi.unstubAllGlobals();
});

function editor(open: boolean): React.ReactElement {
  return (
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => {}}
        activity={ROW}
        gating={GATING}
      />
    </QueryClientProvider>
  );
}

function creator(open: boolean): React.ReactElement {
  return (
    <QueryClientProvider client={client}>
      <ActivityCreateDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => {}}
        planActivities={[]}
      />
    </QueryClientProvider>
  );
}

/**
 * Click a tab the way the browser does: a bubbling click whose sync-lane update — and the passive
 * effects of the panel it mounts — are flushed before the task ends. `flushSync` stands in for the
 * microtask checkpoint React uses for a discrete event; a driver's next keystroke comes after it.
 */
function clickTab(name: string): void {
  const tab = [...probe.container.ownerDocument.querySelectorAll('[role="tab"]')].find((el) =>
    (el.textContent ?? '').trim().startsWith(name),
  );
  if (!tab) throw new Error(`no ${name} tab`);
  flushSync(() => tab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('the typed-input window — editor (Name)', () => {
  it.fails('keeps text typed in the task the editor opens', async () => {
    probe.renderNow(editor(false));
    probe.renderNow(editor(true));
    const name = fieldByLabel(probe.container, 'Name');
    expect(name).not.toBeNull();
    typeNow(name!, 'Typed at once');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Name')?.value).toBe('Typed at once');
  });

  it('keeps text typed one task after the editor opens (control)', async () => {
    probe.renderNow(editor(false));
    probe.renderNow(editor(true));
    await nextTask();
    typeNow(fieldByLabel(probe.container, 'Name')!, 'Typed late');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Name')?.value).toBe('Typed late');
  });
});

describe('the typed-input window — New activity (Name)', () => {
  it.fails('keeps text typed in the task the dialog opens', async () => {
    probe.renderNow(creator(false));
    probe.renderNow(creator(true));
    const name = fieldByLabel(probe.container, 'Name');
    expect(name).not.toBeNull();
    typeNow(name!, 'Typed at once');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Name')?.value).toBe('Typed at once');
  });

  it('keeps text typed one task after the dialog opens (control)', async () => {
    probe.renderNow(creator(false));
    probe.renderNow(creator(true));
    await nextTask();
    typeNow(fieldByLabel(probe.container, 'Name')!, 'Typed late');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Name')?.value).toBe('Typed late');
  });
});

describe('the typed-input window — Progress tab (% complete)', () => {
  it('keeps text typed in the task the tab is revealed (NOT red — see the docblock)', async () => {
    probe.renderNow(editor(true));
    await nextTask();
    clickTab('Progress');
    const percent = fieldByLabel(probe.container, 'Percent complete');
    expect(percent).not.toBeNull();
    typeNow(percent!, '55');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Percent complete')?.value).toBe('55');
  });

  it('keeps text typed one task after the tab is revealed (control)', async () => {
    probe.renderNow(editor(true));
    await nextTask();
    clickTab('Progress');
    await nextTask();
    typeNow(fieldByLabel(probe.container, 'Percent complete')!, '55');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Percent complete')?.value).toBe('55');
  });
});

describe('the typed-input window — Resources tab (Budgeted units)', () => {
  it('keeps text typed in the task the tab is revealed (NOT red — see the docblock)', async () => {
    probe.renderNow(editor(true));
    await nextTask();
    clickTab('Resources');
    const units = fieldByLabel(probe.container, 'Budgeted units');
    expect(units).not.toBeNull();
    typeNow(units!, '12');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Budgeted units')?.value).toBe('12');
  });

  it('keeps text typed one task after the tab is revealed (control)', async () => {
    probe.renderNow(editor(true));
    await nextTask();
    clickTab('Resources');
    await nextTask();
    typeNow(fieldByLabel(probe.container, 'Budgeted units')!, '12');
    await nextTask();
    expect(fieldByLabel(probe.container, 'Budgeted units')?.value).toBe('12');
  });
});

/**
 * The same two hosts opened the way the product opens them: a click on a button whose handler sets
 * the host's state, not a bare `flushSync(root.render)`. Corroborates the red above — the window is
 * a property of how the effect's update is scheduled, not of how the probe rendered.
 */
function ClickHost({ kind }: { kind: 'editor' | 'create' }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>go</button>
      {kind === 'editor' ? editor(open) : creator(open)}
    </>
  );
}

describe('the typed-input window — opened by a click', () => {
  it.fails.each(['editor', 'create'] as const)(
    'keeps text typed in the task the %s opens',
    async (kind) => {
      probe.renderNow(<ClickHost kind={kind} />);
      await nextTask();
      probe.container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The microtask checkpoint that flushes the click's sync-lane commit and its passive effects.
      await Promise.resolve();
      const name = fieldByLabel(probe.container, 'Name');
      expect(name).not.toBeNull();
      typeNow(name!, 'Typed at once');
      await nextTask();
      expect(fieldByLabel(probe.container, 'Name')?.value).toBe('Typed at once');
    },
  );
});
