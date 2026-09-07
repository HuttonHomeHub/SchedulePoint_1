import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProbeOutcome } from '../runner/run-probe';

import { PerformanceProbePanel } from './performance-probe-panel';

/**
 * The panel's states.
 *
 * **The runner is mocked, deliberately and completely.** jsdom has no canvas, no compositor and no
 * frame clock, so nothing here can say anything about performance — and pretending otherwise is the
 * failure this whole epic is about. What these cases DO cover is the seam a real run cannot: that
 * every outcome the runner can return reaches the screen as the right kind of statement.
 */
const runProbe = vi.fn<(input?: unknown) => Promise<ProbeOutcome>>();

/**
 * The recording client, mocked so the POST can be **observed rather than reasoned about**.
 *
 * "The panel does not post a refused run" is exactly the kind of claim that stays true until
 * somebody moves the call, and reading the code proves it about the code as it is today. A spy
 * proves it about the code that runs.
 */
const recordMutate = vi.fn();
const recordState = { isPending: false, isError: false, isSuccess: false };
const historyRows: unknown[] = [];
vi.mock('../api/probe-results', () => ({
  useRecordProbeResult: () => ({ mutate: recordMutate, ...recordState }),
  useProbeResults: () => ({
    isPending: false,
    isError: false,
    data: historyRows,
    refetch: () => undefined,
  }),
}));

/**
 * A stored row, as the API hands it back.
 *
 * Deliberately carries real `samples`/`counts`/`thresholds`, because the history's verdict is
 * **derived on read** by the shared judge (ADR-0128 D5) — a fixture with placeholder numbers would
 * render "not readable" and prove nothing about the column that exists to be read.
 */
const storedRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  runId: 'run1',
  recordedAt: '2026-09-07T12:00:00.000Z',
  recordedByLabel: 'ops@schedulepoint.test',
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'absolute',
  preset: 'week',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars, 3200 links',
  samples: [
    { droppedPct: 0.4, intervalP50: 16.6, intervalP95: 17.2, fps: 59.8 },
    { droppedPct: 0.5, intervalP50: 16.7, intervalP95: 17.4, fps: 59.5 },
  ],
  counts: { visibleBars: 222 },
  thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9', minVisibleBars: 50 },
  viewportWidth: 1646,
  viewportHeight: 900,
  devicePixelRatio: 1.75,
  idleIntervalMs: 16.67,
  hardwareConcurrency: 8,
  deviceMemoryGb: 16,
  gpuRenderer: 'ANGLE (NVIDIA GeForce RTX 4070)',
  userAgent: 'test',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.121.0',
  apiVersion: '0.55.0',
  ...over,
});
vi.mock('../runner/run-probe', () => ({
  runProbe: (...args: unknown[]) => runProbe(...(args as [])),
  RUN_SIZES: {
    quick: { frames: 40, repeats: 1, label: 'Quick check (about 5 seconds)' },
    full: { frames: 180, repeats: 3, label: 'Full measurement (about 25 seconds)' },
  },
}));

const CONTEXT = {
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  scenarioLabel: 'Canvas draw budget',
  preset: 'week' as const,
  size: 'full' as const,
  frames: 180,
  repeats: 3,
  viewport: { width: 1646, height: 900 },
  idleInterval: 8.33,
  device: {
    viewportWidth: 1646,
    viewportHeight: 900,
    devicePixelRatio: 1,
    gpu: null,
    gpuMasked: true,
    userAgent: 'test',
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
    prefersReducedMotion: false,
  },
  startedAt: '2026-09-07T12:00:00.000Z',
  appVersion: '0.121.0',
  lostFocusDuringRun: false,
};

const measured = (verdict: 'PASS' | 'FAIL' | 'INDETERMINATE' | 'REPORTED_ONLY'): ProbeOutcome => ({
  kind: 'measured',
  context: CONTEXT,
  limbs: [
    {
      limbId: 'scale-2000',
      limbLabel: '2000 activities',
      sceneSummary: '2160 bars, 3200 links',
      pxPerDay: 12,
      visibleBars: 222,
      minFps: 30,
      source: 'ADR-0026 §9',
      recording: {
        limbKind: 'absolute',
        activityCount: 2000,
        edgeCount: 3200,
        counts: { visibleBars: 222 },
        thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9', minVisibleBars: 50 },
        runs: [{ droppedPct: 0.4, intervalP50: 16.7, intervalP95: 18, fps: 58 }],
      },
      result: {
        kind: 'absolute',
        judged: {
          verdict,
          meanFps: 58,
          slowestRunFps: 57,
          fastestRunFps: 59,
          meanDroppedPct: 0.4,
          worstIntervalP95: 18,
          visibleBars: 222,
          p2: true,
          ...(verdict === 'INDETERMINATE'
            ? { indeterminateReason: 'the repeats disagree about the answer' }
            : {}),
        },
      },
    },
  ],
});

/** A run the machine refused. Nothing was measured, so there is nothing to record. */
const refused = (): ProbeOutcome => ({
  kind: 'refused',
  refusal: {
    reason: 'TAB_HIDDEN',
    sentence: 'The tab was hidden part-way through, so the browser throttled the frame loop.',
  },
  context: CONTEXT,
});

/**
 * A run the JUDGE refused — which is not the same thing.
 *
 * The numbers are real measurements; only the verdict is withheld. The server does not judge, so
 * the row is worth storing and is read back against the thresholds beside it.
 */
const unjudgeable = (): ProbeOutcome => {
  const base = measured('PASS');
  if (base.kind !== 'measured') throw new Error('unreachable');
  const limb = base.limbs[0];
  if (!limb) throw new Error('the fixture has no limb');
  return {
    ...base,
    limbs: [
      {
        ...limb,
        result: {
          kind: 'unjudgeable',
          message: 'NON-VACUITY FAILED — the painter did not draw enough.',
        },
      },
    ],
  };
};

/**
 * Press Run, then confirm.
 *
 * The dialog's action button carries the SAME accessible name as the opener, which is deliberate —
 * a confirmation whose button reads "OK" makes the reader re-derive what they are agreeing to. The
 * helper therefore scopes to the dialog rather than to the name.
 */
function runOnce(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Run measurement' }));
  const dialog = screen.getByRole('alertdialog');
  const confirm = [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent === 'Run measurement',
  );
  if (!confirm) throw new Error('the confirmation has no Run measurement button');
  fireEvent.click(confirm);
}

beforeEach(() => {
  runProbe.mockReset();
  recordMutate.mockReset();
  recordState.isPending = false;
  recordState.isError = false;
  recordState.isSuccess = false;
  historyRows.length = 0;
});

describe('PerformanceProbePanel', () => {
  it('names its entry point and takes no measurement until asked', () => {
    // ADR-0081: a milestone claiming user-facing capability names its entry point. This is that
    // control, located by role and accessible name rather than by copy (ADR-0091's lesson).
    render(<PerformanceProbePanel />);
    expect(screen.getByRole('button', { name: 'Run measurement' })).toBeInTheDocument();
    expect(screen.getByText(/No measurement has been taken in this browser/)).toBeInTheDocument();
    expect(runProbe).not.toHaveBeenCalled();
  });

  it('lists what it can measure without downloading anything', () => {
    // The registry is imported statically precisely so this list renders before the 68 kB of scene
    // code is fetched. If it ever needed the runner to name a scenario, the split would be pointless.
    render(<PerformanceProbePanel />);
    expect(screen.getByRole('combobox', { name: 'Measurement' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Canvas draw budget' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Revision compare overlay' })).toBeInTheDocument();
  });

  it('confirms before covering the screen, and says the movement IS the measurement', () => {
    render(<PerformanceProbePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Run measurement' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/twenty-five seconds/);
    expect(dialog).toHaveTextContent(/that movement IS the measurement/);
    expect(dialog).toHaveTextContent(/Keep this tab in front/);
    expect(runProbe).not.toHaveBeenCalled();
  });

  it('returns focus to the Run control when the confirmation is dismissed', async () => {
    // A modal `<dialog>` restores focus from inside the effect that closes it, and lands on `<body>`
    // when the opener has moved — this repository's third-most-repeated defect (ADR-0080, ADR-0096,
    // ADR-0099 M10). Verified red by removing the `focusRun()` call from `onClose`.
    render(<PerformanceProbePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Run measurement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run measurement' })).toHaveFocus(),
    );
  });

  it('returns focus to the Run control when a run finishes', async () => {
    // **Focus is deliberately moved AWAY first**, and that is what makes this assertion mean
    // anything. Without it the test passed even with the focus effect deleted: the confirmation is
    // a native `<dialog>`, which restores focus to its opener on close, so Run held focus the whole
    // time and the assertion was true for a reason that has nothing to do with this component.
    // A test that passes against the defect it names is worse than no test (ADR-0093's shape), and
    // this one did — caught by deleting the effect and watching it stay green.
    let release: (v: ProbeOutcome) => void = () => undefined;
    runProbe.mockReturnValue(
      new Promise<ProbeOutcome>((resolve) => {
        release = resolve;
      }),
    );
    render(<PerformanceProbePanel />);
    runOnce();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop/ })).toHaveFocus());

    release(measured('PASS'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run measurement' })).toHaveFocus(),
    );
  });

  it('renders a REFUSED run as a refusal, with no pass or fail wording anywhere', async () => {
    // The assertion the milestone exists for. A refusal shown as a verdict is exactly the confident
    // wrong answer the fourth verdict value was added to prevent.
    runProbe.mockResolvedValue({
      kind: 'refused',
      refusal: {
        reason: 'TAB_HIDDEN',
        sentence: 'The tab was hidden part-way through, so the browser throttled the frame loop.',
      },
      context: CONTEXT,
    });
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText(/The run was refused — nothing was measured/);
    // The WHOLE panel, not the alert alone. The defect this guards against is a verdict word
    // appearing somewhere else on the surface — a status line, a leftover heading — beside a
    // correctly-worded refusal, which reads as "it was refused AND it failed".
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bPASS\b/);
    expect(text).not.toMatch(/\bFAIL\b/);
  });

  it('shows INDETERMINATE with its reason, and never the word PASS', async () => {
    runProbe.mockResolvedValue(measured('INDETERMINATE'));
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText('INDETERMINATE');
    expect(screen.getByText(/Because the repeats disagree/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bPASS\b/);
  });

  it('survives its own dependency failing to load', async () => {
    // A chunk that fails to download is a network fact, not a measurement — and it must not read as
    // a failing painter, which is the whole thing this panel is asked about.
    runProbe.mockRejectedValue(new Error('chunk load failed'));
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText(/The measurement did not run/);
    expect(document.body.textContent).toMatch(/chunk load failed/);
    expect(document.body.textContent).not.toMatch(/\bFAIL\b/);
  });

  it('moves focus into the overlay while it covers the screen', async () => {
    // The overlay is `position: fixed; inset: 0` for twenty-five seconds. Leaving focus on the Run
    // button behind it strands a keyboard reader on a control they can no longer see, next to the
    // one control that would stop the run. It is NOT a modal dialog — it traps nothing and
    // announces nothing — so moving focus in is the whole of the remedy.
    let release: (v: ProbeOutcome) => void = () => undefined;
    runProbe.mockReturnValue(
      new Promise<ProbeOutcome>((resolve) => {
        release = resolve;
      }),
    );
    render(<PerformanceProbePanel />);
    runOnce();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop/ })).toHaveFocus());
    release(measured('PASS'));
  });

  it('records a measured run, carrying the machine note and the scenario version', async () => {
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Machine (optional)' }), {
      target: { value: '  the Dell, docked  ' },
    });
    runOnce();

    await waitFor(() => expect(recordMutate).toHaveBeenCalledTimes(1));
    const body = recordMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    // Trimmed, and a blank note becomes `null` rather than an empty string — the column keeps
    // "not typed" and "typed nothing" apart.
    expect(body.machineLabel).toBe('the Dell, docked');
    expect(body.scenarioVersion).toBe(1);
    expect(body.appVersion).toBe('0.121.0');
    // Server-set fields are absent from the body entirely, not sent as null.
    expect(body).not.toHaveProperty('runId');
    expect(body).not.toHaveProperty('recordedAt');
    expect(body).not.toHaveProperty('apiVersion');
  });

  it('records NOTHING for a refused run', async () => {
    // The assertion this mock exists for. A refusal means nothing was measured, so a stored row
    // would put a reading in the installation's history that no machine ever produced.
    runProbe.mockResolvedValue(refused());
    render(<PerformanceProbePanel />);
    runOnce();

    // Two matches by design — the alert and the panel's own live region both say it, which is what
    // `summarise` is for. `findAllByText` rather than narrowing: asserting which element says it
    // would be asserting about layout, and this test is about the POST.
    await screen.findAllByText(/The run was refused/);
    expect(recordMutate).not.toHaveBeenCalled();
  });

  it('sends an unjudgeable limb, because the numbers are real even when the verdict is not', async () => {
    runProbe.mockResolvedValue(unjudgeable());
    render(<PerformanceProbePanel />);
    runOnce();

    await waitFor(() => expect(recordMutate).toHaveBeenCalledTimes(1));
    const body = recordMutate.mock.calls[0]?.[0] as { limbs: { runs?: unknown[] }[] };
    expect(body.limbs[0]?.runs).toHaveLength(1);
  });

  it('says a reading was measured and NOT recorded, and offers to try again', async () => {
    // Two different facts kept apart: the run was fine, the store was not. Collapsing them is what
    // turns a visible refusal into silent evidence loss.
    recordState.isError = true;
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    const retry = await screen.findByRole('button', { name: 'Retry recording' });
    // Two matches now, and that is the fix: the alert says it and so does the panel's live
    // region, which was silent about the record state until the M5 accessibility review.
    expect(screen.getAllByText(/NOT recorded/).length).toBeGreaterThan(0);
    // The figures are still on screen — the measurement is not thrown away by a failed store.
    expect(screen.getByText('PASS')).toBeInTheDocument();

    recordMutate.mockClear();
    fireEvent.click(retry);
    expect(recordMutate).toHaveBeenCalledTimes(1);
  });

  it('offers no retry and no failure wording when the reading was recorded', async () => {
    recordState.isSuccess = true;
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText(/Recorded\./);
    expect(screen.queryByRole('button', { name: 'Retry recording' })).not.toBeInTheDocument();
  });

  it('shows one empty state for the history, and it is about having none rather than matching none', async () => {
    // There are no filters here, so "nothing recorded yet" cannot be confused with "nothing
    // matched" — the distinction ADR-0073 C1 found collapsed in a live region.
    render(<PerformanceProbePanel />);
    expect(await screen.findByText(/No readings recorded yet/)).toBeInTheDocument();
  });

  it('renders a CANCELLED run as its own state, and records nothing', async () => {
    // A stopped run used to return to the pristine "no measurement has been taken" wording, so a
    // reader could not tell it from never having pressed Run — and nothing said the press had
    // registered. Found by the M5 ux review.
    runProbe.mockResolvedValue({ kind: 'cancelled', context: CONTEXT });
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText(/You stopped this run before it finished/);
    expect(recordMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('PASS')).not.toBeInTheDocument();
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
  });

  it('asks the runner to stop, rather than discarding a finished run', async () => {
    // The label said "stops after the current run" and the signal was read ONCE, after the whole
    // scenario had finished drawing — so nothing stopped and a completed measurement was thrown
    // away. WCAG 2.2.2, and the confirmation offers cancellation as the reason full-screen motion
    // is not stilled for a reduced-motion reader.
    let resolveRun: (o: ProbeOutcome) => void = () => undefined;
    let shouldStop: () => boolean = () => false;
    runProbe.mockImplementation((input: unknown) => {
      shouldStop = (input as { shouldStop: () => boolean }).shouldStop;
      return new Promise<ProbeOutcome>((resolve) => {
        resolveRun = resolve;
      });
    });
    render(<PerformanceProbePanel />);
    runOnce();

    const stop = await screen.findByRole('button', { name: /^Stop/ });
    expect(shouldStop(), 'nothing is asked for before the operator asks').toBe(false);
    fireEvent.click(stop);
    expect(shouldStop(), 'the runner is told at its next boundary').toBe(true);

    resolveRun({ kind: 'cancelled', context: CONTEXT });
    await screen.findByText(/You stopped this run before it finished/);
  });

  it('says a reading is being recorded while the write is in flight', async () => {
    recordState.isPending = true;
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    expect(await screen.findByText('Recording this reading…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry recording' })).not.toBeInTheDocument();
  });

  it('returns focus to Run when Retry unmounts itself', async () => {
    // Pressing Retry flips the mutation to pending, which replaces the branch holding the focused
    // button with a paragraph — focus to `<body>`, WCAG 2.4.3. Found by the M5 accessibility review.
    recordState.isError = true;
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    const retry = await screen.findByRole('button', { name: 'Retry recording' });
    // **Focused first, and that is what makes this test mean anything.** `fireEvent.click` does not
    // move focus in jsdom, and the run's own completion effect has already put focus on Run — so
    // without this line the assertion passes against a panel that drops focus, which is exactly
    // what it did when verified red. A test that cannot fail for its own defect is worse than none.
    retry.focus();
    expect(document.activeElement).toBe(retry);

    fireEvent.click(retry);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Run measurement' }));
  });

  it('announces a SUCCESSFUL recording, not only a failed one', async () => {
    // The asymmetry was the defect: failure was an `Alert` with an implicit live-region role and
    // success was a plain paragraph, so a screen-reader user heard the bad news and never the good.
    recordState.isSuccess = true;
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByText(/Recorded\./);
    const live = document.querySelector('[aria-live="polite"].sr-only');
    expect(live?.textContent).toMatch(/Recorded in this installation’s history/);
  });

  it('makes the controls behind the overlay unreachable while it runs', async () => {
    // WCAG 2.2 §2.4.11: the overlay is opaque and traps nothing, so Shift+Tab from Stop used to
    // land on a select completely hidden behind the canvas.
    let resolveRun: (o: ProbeOutcome) => void = () => undefined;
    runProbe.mockImplementation(
      () =>
        new Promise<ProbeOutcome>((resolve) => {
          resolveRun = resolve;
        }),
    );
    render(<PerformanceProbePanel />);
    runOnce();

    await screen.findByRole('button', { name: /^Stop/ });
    const shielded = screen.getByRole('button', { name: 'Run measurement' }).closest('[inert]');
    expect(
      shielded,
      'the controls sit inside an inert subtree while the overlay covers them',
    ).not.toBeNull();

    resolveRun(measured('PASS'));
    await screen.findByText('PASS');
  });

  it('glosses REPORTED_ONLY instead of printing a bare enum', async () => {
    // The commonest outcome on this surface, and it rendered as `REPORTED_ONLY` with nothing beside
    // it — indistinguishable, to a first-time reader, from a failure code.
    runProbe.mockResolvedValue(measured('REPORTED_ONLY'));
    render(<PerformanceProbePanel />);
    runOnce();

    expect(await screen.findByText('REPORTED, NOT GRADED')).toBeInTheDocument();
    expect(screen.getByText(/never graded|no run-to-run spread/)).toBeInTheDocument();
  });

  it('shows a stored reading with its derived verdict, labels and both versions', async () => {
    // The history had no verdict at all: the server stores samples and thresholds and does not
    // judge, and nothing called the judge on read. The approved spec names the verdict first.
    historyRows.push(storedRow());
    render(<PerformanceProbePanel />);

    // Scoped to the table: the scenario's label is also an `<option>` in the picker above, and a
    // document-scoped assertion would pass on the picker alone — the ADR-0073 C2.5 finding.
    const history = within(
      await screen.findByRole('table', { name: /Readings recorded on this installation/ }),
    );
    expect(history.getByText('PASS')).toBeInTheDocument();
    expect(history.getByText('Canvas draw budget')).toBeInTheDocument();
    expect(history.getByText('2000 activities')).toBeInTheDocument();
    expect(history.getByText('web 0.121.0 · api 0.55.0')).toBeInTheDocument();
    // Both halves of the cull, so a reading taken on an almost-empty canvas cannot look good.
    expect(history.getByText('222 of 2000')).toBeInTheDocument();
  });

  it('says a stored row is unreadable rather than dressing it as a failure', async () => {
    // Reachable: a newer web release can store a scenario shape an older one does not know, which
    // is the same skew that keeps `scenario_id` shape-checked rather than value-checked.
    historyRows.push(storedRow({ thresholds: {}, samples: [] }));
    render(<PerformanceProbePanel />);

    expect(await screen.findByText('Not readable by this version')).toBeInTheDocument();
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
  });

  it('does not use the native disabled attribute on the Run control', () => {
    // A natively-disabled button is blurred to `<body>` the instant it flips, and this one flips
    // twice per run (ADR-0083; the ScopeSaveBar lesson, re-learnt in ADR-0063 M6).
    let release: (v: ProbeOutcome) => void = () => undefined;
    runProbe.mockReturnValue(
      new Promise<ProbeOutcome>((resolve) => {
        release = resolve;
      }),
    );
    render(<PerformanceProbePanel />);
    runOnce();

    const run = screen.getByRole('button', { name: 'Run measurement' });
    expect(run).not.toBeDisabled();
    expect(run).toHaveAttribute('aria-disabled', 'true');
    release(measured('PASS'));
  });
});
