import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';

import { ProbeHistory } from './probe-history';

/**
 * The three acceptance criteria the predecessor spec approved and never got.
 *
 * `docs/specs/staff-performance-probe/feature-spec.md:206-208` says a history row names "the
 * scenario, the verdict, **the viewport width, the display refresh**, the GPU …, the app version
 * and when it was taken". The verdict half was found missing at that epic's M5 gate pass and fixed;
 * these were not, and M0-T3 re-verified on 2026-09-09 that they were still absent — nine columns,
 * none of them viewport, display or focus.
 *
 * Every value asserted here was **already stored on every row** and rendered by nothing, which is
 * why this file is short and the defect was invisible: nothing was wrong, something was missing,
 * and a missing column looks exactly like a column that was never meant to be there.
 */

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

const table = (rows: ProbeResultRow[]): ReturnType<typeof render> =>
  render(
    <ProbeHistory
      query={
        {
          isPending: false,
          isError: false,
          data: rows,
          refetch: () => undefined,
        } as never
      }
    />,
  );

describe('a stored reading carries the facts that decide whether it means anything', () => {
  it('names the canvas it was taken at, with the device pixel ratio', () => {
    table([row()]);
    // The pair is one fact: 1646x1080 at dpr 2 pushes four times the pixels of the same box at
    // dpr 1, so a CSS size alone would not settle comparability (`docs/TECH_DEBT.md` #261).
    expect(screen.getByRole('columnheader', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByText('1912x1068 @1x')).toBeInTheDocument();
  });

  it('names the measured display interval every dropped-frame figure is a share of', () => {
    table([row({ idleIntervalMs: 8.3 })]);
    expect(screen.getByRole('columnheader', { name: 'Display' })).toBeInTheDocument();
    // A 120 Hz machine. `run-probe.ts` measures this rather than assuming 16.7, and its own
    // docblock records a version that passed a literal where the measurement belonged.
    expect(screen.getByText('8.3 ms')).toBeInTheDocument();
  });

  it('says whether the window held focus, in words, in BOTH states', () => {
    // A blank cell for "held" would make the absence of a fact and the absence of a rendering look
    // identical — the defect this milestone is about, reproduced in the fix for it.
    const { unmount } = table([row({ lostFocusDuringRun: false })]);
    expect(screen.getByText('Held')).toBeInTheDocument();
    unmount();

    table([row({ lostFocusDuringRun: true })]);
    expect(screen.getByText('Lost focus')).toBeInTheDocument();
  });

  it('does not render a masked GPU as a guess', () => {
    table([row({ gpuRenderer: null, machineLabel: null })]);
    expect(screen.getByText('(masked or not recorded)')).toBeInTheDocument();
  });
});

describe('the comparability caveat is associated, not merely present', () => {
  it('is linked to the table region by aria-describedby', () => {
    table([row()]);

    // `DataTable` is a focusable `role="region"`, so a reader navigating by landmark lands INSIDE
    // it having skipped whatever sits above. Asserting the text alone would pass against a
    // paragraph nobody using a screen reader will ever meet — which is the state this replaces.
    const region = screen.getByRole('region');
    const describedBy = region.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();

    const note = document.getElementById(describedBy ?? '');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/only comparable to another taken at the same canvas size/);
  });

  it('is linked on the EMPTY state too, where a reader has most reason to read it', () => {
    table([]);
    const described = document.querySelector('[aria-describedby]');
    expect(described).not.toBeNull();
    // Asserted through the id rather than by matching the sentence: the copy contains non-breaking
    // spaces, which are invisible in a diff and in a terminal, and the first version of this
    // assertion carried one INSIDE its own regex — so it searched for text the DOM's whitespace
    // normalisation had already turned into an ordinary space, and failed against correct markup.
    const note = document.getElementById(described?.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toMatch(/per megapixel/);
  });
});

describe('a stored reading can still be copied', () => {
  it('offers a Copy control and writes the sitting block to the clipboard', () => {
    // **The entry point** (ADR-0081). M2-T3 re-points the formatter onto a model a stored row can
    // fill, and that is worth nothing if the only way to reach a block is still to have just
    // pressed Run — which is the shape this register records five times over: a capability that
    // landed with unit tests and no door.
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    table([row()]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const block = writeText.mock.calls[0]?.[0] ?? '';
    // The block, not a summary of it: the machine, the framing, the canvas and the verdict are
    // what make a figure arguable a month later.
    expect(block).toContain('SchedulePoint performance probe');
    expect(block).toContain('viewport   1912x1068');
    expect(block).toContain('── 2000 activities ──');
    expect(block).toContain('VERDICT');
  });

  it('announces the copy, because the button changes nothing visible', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.resolve() },
      configurable: true,
      writable: true,
    });

    table([row()]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    // WCAG 4.1.3 — the same finding the live panel's copy control already carries.
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
  });
});
