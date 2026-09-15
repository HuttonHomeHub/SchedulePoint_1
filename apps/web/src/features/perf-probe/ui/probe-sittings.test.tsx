import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';

import { ProbeSittings } from './probe-sittings';

import { AnnouncerProvider } from '@/components/ui/announcer';

/**
 * The sittings view, which replaces a flat twelve-column table of rows.
 *
 * **What these cases are about is the grouping, not the columns.** The predecessor's suite proved
 * that each stored fact reached a cell; those facts still reach the screen and are asserted here
 * where they now live. What is new — and what could not exist before, because
 * `probe-history.tsx:197` called `sittingsFromRows([row])` one row at a time — is that a sitting
 * holds several readings, states what they share exactly once, and says so when they do not share
 * it.
 */

/**
 * The incompleteness notice, located by the wiring rather than by a live role.
 *
 * These two cases read `screen.getByRole('status')` until ADR-0132. That was never quite what they
 * meant: the notice is a **standing condition** — "this sitting has 2 of 6 readings" is as true for
 * a reader who arrives an hour later and does nothing — so it now carries no live role at all, and a
 * role query would report zero and read as the notice having been lost.
 *
 * The replacement is stronger than the thing it replaces, because it asserts the notice is actually
 * WIRED: the `Alert` carries an id and the readings table names it in `aria-describedby`, so this
 * resolves the table's own description rather than trusting that some region on the page happens to
 * hold the sentence. Matched on whole text for the reason the cases already recorded — the sentence
 * is assembled from interpolated counts, so it is split across elements.
 */
function describedText(): string {
  const table = screen.getByRole('region', { name: /readings/i });
  const ids = (table.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

const row = (over: Partial<ProbeResultRow> = {}): ProbeResultRow => ({
  id: 'r1',
  runId: 'run-1',
  sweepId: null,
  framesPerPhase: 180,
  recordedAt: '2026-09-08T18:00:00.000Z',
  recordedByLabel: 'owner',
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'absolute',
  preset: 'week',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars',
  samples: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }],
  counts: { visibleBars: 243 },
  thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  idleIntervalMs: 16.7,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel Arc Pro',
  userAgent: 'test',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.125.0',
  apiVersion: '0.61.0',
  ...over,
});

const view = (rows: ProbeResultRow[]): ReturnType<typeof render> =>
  render(
    // **Wrapped, because the route is.** `staff.tsx:137` mounts an `AnnouncerProvider`, and
    // `useAnnounce()` outside one is a silent no-op — so a suite that omits it reports an
    // announcement as absent when the product makes it, and would equally report one as present
    // if the provider were later removed from the route. That exact no-op shipped once
    // (`/staff` had no provider at all until the console redesign).
    <AnnouncerProvider>
      <ProbeSittings
        query={
          {
            isPending: false,
            isError: false,
            data: rows,
            refetch: () => undefined,
          } as never
        }
      />
    </AnnouncerProvider>,
  );

/** A complete sweep: two scenarios at two framings, four readings under one id. */
const sweepRows = (): ProbeResultRow[] => [
  row({ id: 'a', runId: 'r1', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'week' }),
  row({ id: 'b', runId: 'r2', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'fit' }),
  row({ id: 'c', runId: 'r3', sweepId: 's1', scenarioId: 'revision-diff', preset: 'week' }),
  row({ id: 'd', runId: 'r4', sweepId: 's1', scenarioId: 'revision-diff', preset: 'fit' }),
];

describe('ProbeSittings', () => {
  /**
   * **One block expanded, and it is the newest.** The blocks were 8,487 px of a 12,842 px page over
   * fifteen sittings (`docs/specs/staff-console-design/m7-probe-history.md`), so the panel expands
   * one and indexes the rest. What must survive the compression is that a single press still
   * renders in the SAME shape as a sweep — a reader should not have to learn two layouts, and the
   * sitting of one is the commonest thing in the history.
   */
  it('expands the newest sitting, in the same shape whether it is a sweep or one press', () => {
    // Newest first: the single press is given a later timestamp, so it is the one expanded.
    view([
      row({ id: 'e', runId: 'r9', sweepId: null, recordedAt: '2026-09-08T19:00:00.000Z' }),
      ...sweepRows(),
    ]);
    expect(screen.getByRole('table', { name: /One reading/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Sweep of 4 readings/ })).not.toBeInTheDocument();

    // And the sweep, expanded, is the same shape — not a second layout for the plural case.
    view(sweepRows());
    expect(screen.getByRole('table', { name: /Sweep of 4 readings/ })).toBeInTheDocument();
  });

  it('states what the readings share exactly once, not on every row', () => {
    view(sweepRows());

    // The whole argument for the block: the flat table repeated these on each of a sweep's rows.
    expect(screen.getAllByText('web 0.125.0 · api 0.61.0')).toHaveLength(1);
    expect(screen.getAllByText('owner')).toHaveLength(1);
    expect(screen.getAllByText('1912×1068 @1x')).toHaveLength(1);
  });

  it('refuses to state one canvas when the sitting holds two, and says so', () => {
    // Reachable through M6-T4: a re-run under the same `sweep_id` can happen after a resize.
    // #261 records that confound deciding a verdict, so one figure over two readings would settle
    // it by accident in the one field a reader consults to decide comparability.
    view([
      row({ id: 'a', runId: 'r1', sweepId: 's1' }),
      row({ id: 'b', runId: 'r2', sweepId: 's1', viewportWidth: 1016, viewportHeight: 636 }),
    ]);

    expect(screen.getByText('varies between readings')).toBeInTheDocument();
    expect(screen.queryByText('1912×1068 @1x')).not.toBeInTheDocument();
  });

  it('says a sweep is incomplete rather than letting a short table imply it is whole', () => {
    // Nothing is stored for a refused reading, so a sweep whose two middle steps were refused is
    // indistinguishable in the database from a sweep of two. The count is the only thing that can
    // say so — and a reader who is not told takes an incomplete sitting for a complete one.
    // Two rows — so TWO readings of the six, not two of two. A reading is a ROW: the approved spec
    // says "four steps, six readings, each a row" seven times, and M6 shipped the vocabulary
    // inverted, captioning a complete sweep "4 readings" over a table of six. Corrected at M7 with
    // the denominator derived from the registry's limbs rather than from the step count.
    // A SECOND, older sitting beneath it, so the one under test is not the oldest block. That
    // matters since M6-T4: the read is capped at 50 rows and returns no total, so the oldest block
    // rendered may be cut by the page boundary and is the one block that may not say why a reading
    // is absent. Everything above it can.
    view([
      ...sweepRows().slice(0, 2),
      row({ id: 'old', runId: 'r-old', sweepId: null, recordedAt: '2026-09-01T09:00:00.000Z' }),
    ]);

    const alert = describedText();
    expect(alert).toContain('This sitting has 2 of 6 readings');
    expect(alert).toContain('4 were refused or never taken');
  });

  it('will not say WHY a reading is absent from the oldest block, because it cannot know', () => {
    // `staff-probe.service.ts:14` caps the read at 50 rows and returns no total and no cursor, so
    // a reading missing from the oldest sitting on screen may have been refused, may never have
    // been taken, or may simply be on a page nobody asked for. "2 were refused or never taken" is
    // then a false claim about somebody's data — the exact defect the alert exists to prevent, one
    // page boundary along, and reachable because M6-T3 added the alert.
    //
    // Verified red by rendering the assertive sentence unconditionally.
    view(sweepRows().slice(0, 2));

    const alert = describedText();
    expect(alert).toContain('This sitting has 2 of 6 readings');
    expect(alert).toContain('fall outside this page');
    expect(alert).not.toContain('were refused or never taken');
  });

  it('says the list is a page, so an absent sitting is not an absent reading', () => {
    view(sweepRows());
    expect(
      screen.getByText('Showing the most recent readings. Older sittings are not listed.'),
    ).toBeInTheDocument();
  });

  it('does not call a complete sweep partial', () => {
    view(sweepRows());
    expect(screen.queryByText(/refused or never taken/)).not.toBeInTheDocument();
  });

  it('names a one-repeat reading a check rather than leaving its missing verdict to be inferred', () => {
    view([
      row({ samples: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }] }),
    ]);

    expect(screen.getByText('Check, not a measurement')).toBeInTheDocument();
  });

  it('flags the reading that lost focus, not merely the sitting', () => {
    view([
      row({ id: 'a', runId: 'r1', sweepId: 's1', lostFocusDuringRun: false }),
      row({ id: 'b', runId: 'r2', sweepId: 's1', lostFocusDuringRun: true }),
    ]);

    // The sitting says one of them did; the table says which. Either alone leaves a reader unable
    // to act on it.
    expect(screen.getByText(/a reading lost focus/)).toBeInTheDocument();
    expect(screen.getByText('Lost focus')).toBeInTheDocument();
  });

  it('copies the whole sitting, not the row that was clicked', () => {
    // Typed, so the assertion below reads the argument rather than casting an `unknown` — a cast
    // here would go on compiling if the button ever stopped passing the block at all.
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    view(sweepRows());

    fireEvent.click(screen.getByRole('button', { name: /^Copy report/ }));

    // One control per sitting, and the block it writes carries every reading — a block for one
    // limb of a four-reading sweep would be a partial answer that looks complete.
    expect(writeText).toHaveBeenCalledTimes(1);
    const block = writeText.mock.calls[0]?.[0] ?? '';
    expect(block).toContain('Canvas draw budget');
    expect(block).toContain('Revision compare overlay');
  });

  it('keeps exactly one empty state, because there are no filters to confuse it with', () => {
    view([]);

    // ADR-0073 C1: with no filters, "nothing recorded yet" cannot be mistaken for "nothing matched
    // what you asked for". Adding a filter means adding that distinction first.
    expect(screen.getByText(/No readings recorded yet/)).toBeInTheDocument();
  });

  it('links the comparability caveat to the table rather than merely placing it above', () => {
    // TWO sittings, because the caveat is now rendered only when there is something to compare
    // with. A `DataTable` is a focusable region, so a landmark-navigating reader lands INSIDE it
    // having skipped whatever sits above.
    view([...sweepRows(), row({ id: 'e', runId: 'r9', sweepId: null })]);

    const table = screen.getByRole('table', { name: /Sweep of 4 readings/ });
    const region = table.closest('[role="region"]');
    expect(region?.getAttribute('aria-describedby')).toContain('comparability');
  });

  /**
   * **A caveat about comparing readings is advice about an act the reader cannot perform yet**, on
   * a panel whose empty state already tells them to run a measurement — and a note that is always
   * on screen is one a reader learns to skip before the day it matters (spec §8.15).
   *
   * The second assertion is the one that matters more: an `aria-describedby` pointing at an element
   * that is not on the page reads to a screen reader as a MISSING description rather than an absent
   * one, which is the rule this component already applies to its two conditional warnings. Making
   * the note conditional without threading its id would have introduced exactly that.
   */
  it('withholds the comparability caveat until there is a second sitting, and drops its reference', () => {
    view(sweepRows());

    expect(
      screen.queryByText(/only comparable to another taken at the same canvas size/),
    ).toBeNull();

    const region = screen
      .getByRole('table', { name: /Sweep of 4 readings/ })
      .closest('[role="region"]');
    for (const id of (region?.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)) {
      expect(
        document.getElementById(id),
        `aria-describedby points at "${id}", which is not on the page`,
      ).not.toBeNull();
    }
  });

  /**
   * **Each sitting says where it begins.** `DataTable`'s caption is `sr-only`, so the sitting's name
   * reached a screen-reader user and nobody else — five blocks ran together as one stream of facts,
   * table, Copy, facts, table, Copy. Found by photographing the console (`#165(e)`).
   *
   * The heading is deliberately NOT also the `<section>`'s accessible name: a named `<section>` is a
   * `region` landmark, and the table inside is already a region with the same name.
   */
  it('gives the expanded sitting a visible heading, without a second landmark', () => {
    view([...sweepRows(), row({ id: 'e', runId: 'r9', sweepId: null })]);

    expect(screen.getByRole('heading', { level: 3, name: /Sweep of 4 readings/ })).toBeVisible();
    // One region for the expanded sitting's table and one for the index — and not one per table
    // plus one per section, which is what naming the `<section>` would produce.
    expect(screen.getAllByRole('region', { name: /readings|sitting/i })).toHaveLength(2);
  });

  it('shows a stored reading with its verdict and both halves of the cull', () => {
    view([row()]);

    const table = within(screen.getByRole('table', { name: /One reading/ }));
    expect(table.getByText('PASS')).toBeInTheDocument();
    expect(table.getByText('Canvas draw budget')).toBeInTheDocument();
    expect(table.getByText('2000 activities')).toBeInTheDocument();
    // A numerator alone cannot distinguish "few bars drawn" from "few bars to draw".
    expect(table.getByText('243 at 12.00 px/day')).toBeInTheDocument();
  });

  it('says a row is unreadable rather than dressing it as a failure', () => {
    view([row({ thresholds: {}, samples: [] })]);

    expect(screen.getByText('Not readable by this version')).toBeInTheDocument();
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
  });

  it('says a sitting was not taken in one sitting when its readings span more than an hour', () => {
    // "not at one time" rather than "not in one sitting": the block IS a sitting, named one by its
    // own caption and its own model type, so telling the reader its contents are "not in one
    // sitting" reads as self-contradiction rather than as the intended "not taken together" (M7 ux
    // review). The state M6-T4 creates: a reading refused on the day, taken again under the SAME id
    // once the machine was free. The grouping stays right — the operator meant them as one act —
    // and "these were taken together" becomes false, with the machine facts above them stated once
    // from the earliest. Nothing else on the block contradicts that, so the block has to.
    view([
      row({ id: 'a', runId: 'r1', sweepId: 's1', recordedAt: '2026-09-08T18:00:00.000Z' }),
      row({
        id: 'b',
        runId: 'r2',
        sweepId: 's1',
        preset: 'fit',
        recordedAt: '2026-09-09T09:00:00.000Z',
      }),
    ]);

    expect(screen.getByText(/taken 15 hours apart, not at one time/)).toBeInTheDocument();
  });

  it('stays silent for an ordinary sweep, whose readings are minutes apart', () => {
    // A caveat printed on every sitting is a caveat read past on the day it matters. Verified red
    // by rendering the alert unconditionally.
    view(sweepRows());

    expect(screen.queryByText(/not at one time/)).not.toBeInTheDocument();
  });
});

/**
 * The index, and what the compression is not allowed to lose.
 *
 * Every assertion here is one of `docs/specs/staff-console-design/m7-probe-history.md`'s
 * falsification conditions, or the focus rule that decides how the control is shaded.
 */
describe('the sittings index', () => {
  /** Three sittings, newest first, distinguishable by canvas and by machine. */
  const threeSittings = (): ProbeResultRow[] => [
    row({
      id: 'n1',
      runId: 'rn',
      sweepId: null,
      recordedAt: '2026-09-08T20:00:00.000Z',
      machineLabel: 'Newest machine',
    }),
    ...sweepRows(),
    row({
      id: 'o1',
      runId: 'ro',
      sweepId: null,
      recordedAt: '2026-09-08T09:00:00.000Z',
      machineLabel: 'Oldest machine',
      viewportWidth: 1016,
      viewportHeight: 636,
    }),
  ];

  /**
   * **FC-B — the set stays visible.** This is the whole difference between what shipped and the
   * dropdown that was asked for: a select clears the height just as well and hides how many
   * sittings exist, so a reader cannot scan their dates or spot two taken at the same canvas
   * without opening it. Nothing here is behind a disclosure.
   */
  it('names and dates every sitting at rest, with nothing opened', () => {
    view(threeSittings());

    const index = within(screen.getByRole('table', { name: /Every sitting/ }));
    expect(index.getAllByRole('row')).toHaveLength(4); // header + three sittings
    expect(index.getByText('Newest machine')).toBeInTheDocument();
    expect(index.getByText('Oldest machine')).toBeInTheDocument();
    expect(index.getByText(/Sweep — 4 of 6/)).toBeInTheDocument();
  });

  /**
   * **FC-C — comparison survives.** `docs/TECH_DEBT.md` #261/#283 establish that two readings are
   * comparable only at the same canvas. A reader told to compare sittings cannot do it from a list
   * that omits the one fact deciding which are comparable, so this column is not negotiable when
   * somebody later tries to shorten the row.
   */
  it('states each sitting’s canvas, so comparable sittings can be found from the list', () => {
    view(threeSittings());

    const index = within(screen.getByRole('table', { name: /Every sitting/ }));
    expect(index.getAllByText('1912×1068 @1x').length).toBeGreaterThan(0);
    expect(index.getByText('1016×636 @1x')).toBeInTheDocument();
  });

  it('moves a chosen sitting into the detail slot', () => {
    view(threeSittings());

    // The newest is expanded on arrival.
    expect(screen.getByRole('table', { name: /One reading — .*8:00/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Sweep of 4 readings/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Show .* — Sweep$/ }));

    expect(screen.getByRole('table', { name: /Sweep of 4 readings/ })).toBeInTheDocument();
  });

  /**
   * **The control is shaded, never removed, and never natively `disabled`.**
   *
   * Whether a row is the shown one flips when the reader presses a DIFFERENT row's button — so the
   * control under their finger changes state as a consequence of their own press. Removing it, or
   * setting the native attribute, drops focus to `<body>` at that moment: WCAG 2.2 §2.4.3, and the
   * class this repository has recorded shipping four times (ADR-0060 M6, ADR-0063 M6, ADR-0096,
   * ADR-0133).
   */
  it('keeps the shown sitting’s control focusable, with its reason', () => {
    view(threeSittings());

    // Disambiguated by time: the fixture holds two single-press sittings and only the newest is
    // the one shown.
    const shown = screen.getByRole('button', { name: /^Show .*8:00:00 PM — One reading$/ });
    expect(shown).toHaveAttribute('aria-disabled', 'true');
    expect(shown).not.toBeDisabled();
    expect(shown).toHaveAccessibleDescription('This sitting is already shown above.');
  });

  it('refuses the press on the sitting already shown, rather than relying on the attribute', () => {
    view(threeSittings());

    // Press the sweep, then press its own control again: the slot must not change, and nothing
    // may throw. `aria-disabled` is a statement to assistive technology and stops no pointer.
    fireEvent.click(screen.getByRole('button', { name: /^Show .* — Sweep$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Show .* — Sweep$/ }));
    expect(screen.getByRole('table', { name: /Sweep of 4 readings/ })).toBeInTheDocument();
  });

  /**
   * The detail slot sits ABOVE the control that changed it and outside the reader's focus, so
   * nothing about the press announces itself. Without this a screen-reader user presses a button
   * and is told nothing at all.
   */
  it('announces which sitting the detail slot now holds', async () => {
    view(threeSittings());
    fireEvent.click(screen.getByRole('button', { name: /^Show .* — Sweep$/ }));

    // `AnnouncerProvider` clears the region and re-fills it on the next frame, so that
    // re-announcing the same sentence still fires. A synchronous read lands in the cleared gap and
    // reports silence — which is what a reader would conclude about the product.
    await waitFor(() => {
      expect(screen.getByTestId('announcer').textContent).toContain(
        'Showing 9/8/2026, 6:00:00 PM — Sweep, 4 of 6.',
      );
    });
  });

  /**
   * **Only the failing segment is painted.** Colouring the whole tally put "5 passed" in alarm ink
   * beside "1 failed", which breaks the rule `sitting-index.ts` states in its own docblock and
   * `VerdictCell` already honours one level down: an ungraded or indeterminate reading is not bad
   * news. Found by the M7 ux review.
   */
  it('paints the failing count and leaves the passing one alone', () => {
    const failing = row({
      id: 'f',
      runId: 'rf',
      sweepId: 'sf',
      recordedAt: '2026-09-08T21:00:00.000Z',
      samples: [
        { droppedPct: 40, intervalP50: 60, intervalP95: 80, fps: 12 },
        { droppedPct: 40, intervalP50: 60, intervalP95: 80, fps: 12 },
        { droppedPct: 40, intervalP50: 60, intervalP95: 80, fps: 12 },
      ],
    });
    view([
      failing,
      row({ id: 'p', runId: 'rp', sweepId: 'sf', recordedAt: '2026-09-08T21:00:01.000Z' }),
      // A second sitting, because the index only renders when there is more than one to choose
      // between — an index of one is furniture.
      row({ id: 'other', runId: 'ro', sweepId: null, recordedAt: '2026-09-08T08:00:00.000Z' }),
    ]);

    const index = within(screen.getByRole('table', { name: /Every sitting/ }));
    expect(index.getByText('1 failed').className).toMatch(/text-destructive-text/);
    // Every "passed" segment on the page, including the one sharing a cell with the failure —
    // scoped to all of them rather than one, because the assertion is that NO passing count is
    // painted, which is stronger than picking a row.
    for (const passed of index.getAllByText('1 passed')) {
      expect(passed.className, 'a passing reading is being painted as a failure').not.toMatch(
        /text-destructive-text/,
      );
    }
  });

  /**
   * **The other two confounds, on the row rather than behind a press.** The Canvas column is there
   * because readings are comparable only at equal canvas (#261/#283); a sitting that spans hours or
   * lost the window is untrustworthy for the same kind of reason, and both were previously reachable
   * only by opening each sitting in turn — the cost this index exists to remove. Raised by the M7 ux
   * review.
   */
  it('marks a sitting that lost focus or spans more than an hour', () => {
    view([
      row({ id: 'a', runId: 'ra', sweepId: 'sx', recordedAt: '2026-09-08T09:00:00.000Z' }),
      row({
        id: 'b',
        runId: 'rb',
        sweepId: 'sx',
        recordedAt: '2026-09-08T20:00:00.000Z',
        lostFocusDuringRun: true,
      }),
      // A second sitting, so the index renders at all.
      row({ id: 'other', runId: 'ro', sweepId: null, recordedAt: '2026-09-08T07:00:00.000Z' }),
    ]);

    const index = within(screen.getByRole('table', { name: /Every sitting/ }));
    expect(index.getByText('Spans time')).toBeInTheDocument();
    expect(index.getByText('Lost focus')).toBeInTheDocument();
  });

  /**
   * **The cap caveat reaches the expanded block, not only the index.**
   *
   * `DataTable` is a focusable `role="region"`, so a reader who jumps straight to the expanded
   * sitting has skipped the note above it — and with ONE sitting the index does not render at all,
   * which is precisely the state the note's own docblock says it matters most in ("a single sitting
   * can itself be truncated at fifty rows"). It was wired to the index alone, so that docblock
   * described an intent the code did not have. Found by the M7 accessibility review; nothing here
   * could see it, because the note was visible on screen throughout.
   */
  it('links the page caveat to the expanded sitting, even when there is no index', () => {
    view(sweepRows());
    expect(screen.queryByRole('table', { name: /Every sitting/ })).not.toBeInTheDocument();
    expect(describedText()).toContain('Showing the most recent readings');
  });

  /** One sitting is not a list to choose from, and an index of one is furniture. */
  it('renders no index when there is only one sitting', () => {
    view(sweepRows());
    expect(screen.queryByRole('table', { name: /Every sitting/ })).not.toBeInTheDocument();
    // …but the history is still stated to be a page, because a single sitting can itself be cut
    // at fifty rows.
    expect(
      screen.getByText('Showing the most recent readings. Older sittings are not listed.'),
    ).toBeInTheDocument();
  });
});
