import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProbeOutcome } from '../runner/run-probe';

import { PerformanceProbePanel } from './performance-probe-panel';

import { ApiFetchError } from '@/lib/api/client';

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
/**
 * The sweep awaits its store, so it uses `mutateAsync`; the RETRY control still uses `mutate`.
 *
 * Both are spied, and both resolve by default. A store that rejects is what turns a step into
 * `not recorded`, which is the state with an action attached — so the rejecting case is set per
 * test rather than globally.
 */
const recordMutateAsync = vi.fn<(body: unknown) => Promise<unknown>>(() => Promise.resolve({}));
const recordState = { isPending: false, isError: false, isSuccess: false };
const historyRows: unknown[] = [];
const refreshHistory = vi.fn();

vi.mock('../api/probe-results', () => ({
  useRecordProbeResult: () => ({
    mutate: recordMutate,
    mutateAsync: recordMutateAsync,
    ...recordState,
  }),
  // The history refresh is now the SITTING's rather than the row's, so the panel asks for it
  // explicitly. Mocked as a spy so the "one refetch per sitting" rule is assertable here.
  useRefreshProbeResults: () => refreshHistory,
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
/**
 * Press the SINGLE-measurement control, which now lives behind the "Measure one thing" disclosure.
 *
 * The disclosure is opened explicitly rather than by rendering it open: a `<details>` that is shut
 * hides its contents from `getByRole`, so a helper that did not open it would fail with "no such
 * button" and read as the control being gone rather than as the harness not having looked.
 */
/**
 * The single-measurement button, inside the "Measure one thing" disclosure.
 *
 * A helper rather than a repeated query, because the control moved once already and the tests that
 * assert focus RETURNS to it need to ask for the same element the panel's ref points at.
 */
function runControl(): HTMLElement {
  return screen.getByRole('button', { name: 'Run measurement' });
}

/**
 * Press **Run all measurements**, then confirm.
 *
 * Scoped to the dialog for the same reason `runOnce` is: the confirmation's action button carries
 * the SAME accessible name as the opener, deliberately, so a reader does not have to re-derive what
 * "OK" would mean.
 */
function runAll(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Run all measurements' }));
  confirmIn('Run all measurements');
}

function confirmIn(label: string): void {
  const dialog = screen.getByRole('alertdialog');
  const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!confirm) throw new Error(`the confirmation has no ${label} button`);
  fireEvent.click(confirm);
}

function runOnce(): void {
  const disclosure = screen.getByText('Measure one thing');
  fireEvent.click(disclosure);
  fireEvent.click(runControl());
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
  recordMutateAsync.mockReset();
  recordMutateAsync.mockResolvedValue({});
  refreshHistory.mockReset();
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
    expect(runControl()).toBeInTheDocument();
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
    fireEvent.click(runControl());
    const dialog = screen.getByRole('alertdialog');
    // **The duration is derived, so the assertion is its shape rather than a constant.** The panel
    // used to say "about twenty-five seconds" for every run — true of one shape and wrong for the
    // others by a factor of two. Pinning the old words here would pin the defect.
    expect(dialog).toHaveTextContent(/This takes about \d+ seconds/);
    expect(dialog).toHaveTextContent(/that movement IS the measurement/);
    expect(dialog).toHaveTextContent(/Keep this tab in front/);
    expect(runProbe).not.toHaveBeenCalled();
  });

  it('returns focus to the Run control when the confirmation is dismissed', async () => {
    // A modal `<dialog>` restores focus from inside the effect that closes it, and lands on `<body>`
    // when the opener has moved — this repository's third-most-repeated defect (ADR-0080, ADR-0096,
    // ADR-0099 M10). Verified red by removing the `focusRun()` call from `onClose`.
    render(<PerformanceProbePanel />);
    fireEvent.click(runControl());
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(runControl()).toHaveFocus());
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
    await waitFor(() => expect(runControl()).toHaveFocus());
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

    await waitFor(() => expect(recordMutateAsync).toHaveBeenCalledTimes(1));
    const body = recordMutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
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
    expect(recordMutateAsync).not.toHaveBeenCalled();
  });

  it('sends an unjudgeable limb, because the numbers are real even when the verdict is not', async () => {
    runProbe.mockResolvedValue(unjudgeable());
    render(<PerformanceProbePanel />);
    runOnce();

    await waitFor(() => expect(recordMutateAsync).toHaveBeenCalledTimes(1));
    const body = recordMutateAsync.mock.calls[0]?.[0] as { limbs: { runs?: unknown[] }[] };
    expect(body.limbs[0]?.runs).toHaveLength(1);
  });

  it('says a reading was measured and NOT recorded, and offers to try again', async () => {
    // Two different facts kept apart: the run was fine, the store was not. Collapsing them is what
    // turns a visible refusal into silent evidence loss.
    // **The store REJECTS rather than a flag being set**, and that is the contract change: a sweep
    // POSTs once per step, so `record.isError` is a fact about the LAST write and says nothing
    // about the other three. The step's own status is the truth.
    recordMutateAsync.mockRejectedValue(new Error('network'));
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    const retry = await screen.findByRole('button', { name: 'Retry recording' });
    expect(screen.getAllByText(/NOT recorded/).length).toBeGreaterThan(0);
    // The figures are still on screen — the measurement is not thrown away by a failed store.
    expect(screen.getByText('PASS')).toBeInTheDocument();

    // The RETRY path is the one that still uses `mutate`: it is the one thing the sweep
    // deliberately does not do for itself.
    recordMutate.mockClear();
    fireEvent.click(retry);
    expect(recordMutate).toHaveBeenCalledTimes(1);
  });

  it('WITHHOLDS the retry on a 422, and says why rather than inviting a press that cannot work', async () => {
    /**
     * `docs/TECH_DEBT.md` #269. The panel said one sentence — "These figures were measured but NOT
     * recorded." — for every failure, beside a live **Retry recording**. That is right for a
     * dropped socket and wrong for a 422: the server refuses this body, so the same body will be
     * refused again.
     *
     * **This is not hypothetical.** Every `revision-diff` reading was answered
     * `422 … property frames should not exist` for the whole life of that scenario, and the panel
     * reported it in the same words it uses for a network blip. The diagnosis came from a journey
     * reading the response body, never from anything on screen.
     */
    recordMutateAsync.mockRejectedValue(new ApiFetchError(422, { code: 'X', message: 'no' }));
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    // The status reaches the operator, and so does the fact that a retry is pointless.
    expect(await screen.findByText(/refused this reading \(422\)/)).toBeInTheDocument();

    // Shaded, not removed (ADR-0082): the affordance stays visible with a reason, so an operator
    // who has seen it work elsewhere is told why it will not here.
    const retry = screen.getByRole('button', { name: 'Retry recording' });
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById(retry.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      /same reading/i,
    );

    // And pressing it does nothing — a shaded control that still fires is a shading in appearance
    // only, which is worse than none because it looks considered.
    recordMutate.mockClear();
    fireEvent.click(retry);
    expect(recordMutate).not.toHaveBeenCalled();

    // The figures survive: a refused store must not throw the measurement away.
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('KEEPS the retry on a 429, which is the one 4xx worth pressing again', async () => {
    // The pinned counter-case. Without it the assertion above is satisfied by a panel that shades
    // Retry on every failure, which would break the case the button was written for.
    recordMutateAsync.mockRejectedValue(
      new ApiFetchError(429, { code: 'X', message: 'slow down' }),
    );
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runOnce();

    const retry = await screen.findByRole('button', { name: 'Retry recording' });
    expect(retry).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/rate limiting/i)).toBeInTheDocument();

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

  it('says what a stopped run KEPT, and records it', async () => {
    // M3-T2. Verified red against the previous copy, which said "nothing was measured and nothing
    // was recorded" — a sentence that was true until a completed limb could survive a Stop, and
    // false the moment one could. A screen saying that beside a row in the history is worse than
    // saying nothing: it tells the reader to go and look for something that is there.
    const base = measured('PASS');
    if (base.kind !== 'measured') throw new Error('unreachable');
    runProbe.mockResolvedValue({ kind: 'cancelled', context: CONTEXT, limbs: base.limbs });
    render(<PerformanceProbePanel />);
    runOnce();

    // **Both channels, asserted separately.** A document-wide `findAllByText` passes when EITHER
    // says it, which is precisely the defect this test exists to catch — and the first version of
    // it did exactly that: run against the old visible copy with only the live region fixed, it
    // went green. Caught by verifying red rather than by reading.
    const kept = /One reading had already finished and was kept/;
    // Settle on the outcome FIRST. `findAllByRole('status')` resolves against the running
    // spinner — which is also `role="status"` — and would assert about the wrong element while
    // looking like it waited for the right one.
    await screen.findAllByText(kept);
    const alerts = screen.getAllByRole('status');
    expect(
      alerts.filter((el) => kept.test(el.textContent ?? '')).length,
      'the visible alert says what was kept',
    ).toBeGreaterThan(0);
    // The panel's own live region — `sr-only`, and the only channel a screen-reader user has if
    // the alert is missed. It must agree, or the two say different things about one event.
    expect(
      document.querySelector('.sr-only[aria-live]')?.textContent ?? '',
      'the live region agrees with the visible copy',
    ).toMatch(kept);
    // "The rest were not taken" — NOT "were refused". Two vocabularies: a reading not taken is one
    // nobody tried, a refusal is one the machine declined, and a reader meeting less than they
    // expected most needs to tell those apart.
    expect((await screen.findAllByText(/the rest were not taken/)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(recordMutateAsync).toHaveBeenCalled();
    });
  });

  it('renders a CANCELLED run as its own state, and records nothing', async () => {
    // A stopped run used to return to the pristine "no measurement has been taken" wording, so a
    // reader could not tell it from never having pressed Run — and nothing said the press had
    // registered. Found by the M5 ux review.
    runProbe.mockResolvedValue({ kind: 'cancelled', context: CONTEXT, limbs: [] });
    render(<PerformanceProbePanel />);
    runOnce();

    // Two elements carry it — the visible alert and the panel's own live region — and that they
    // now match EXACTLY is the M3-T2 requirement rather than an accident: before this milestone
    // they said different things, and after it a live region still claiming "nothing was recorded"
    // while the screen says two readings were kept would be false in the one channel a
    // screen-reader user has. The duplicate ANNOUNCEMENT that follows from both being live regions
    // is pre-existing and applies to a refusal too; it is `docs/TECH_DEBT.md` #259 item 10.
    expect(
      (await screen.findAllByText(/You stopped this run before anything finished/)).length,
    ).toBeGreaterThan(0);
    expect(recordMutateAsync).not.toHaveBeenCalled();
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

    resolveRun({ kind: 'cancelled', context: CONTEXT, limbs: [] });
    expect(
      (await screen.findAllByText(/You stopped this run before anything finished/)).length,
    ).toBeGreaterThan(0);
  });

  it('says a reading is being recorded while the write is in flight', async () => {
    // **Per step, not per mutation.** A sitting has up to four steps and one mutation object, so
    // `record.isPending` would light every failed step's spinner because one of them is in flight
    // — telling a reader the panel is retrying readings it has not touched.
    recordMutateAsync.mockRejectedValue(new Error('network'));
    runProbe.mockResolvedValue(measured('PASS'));
    // A retry that never settles, so the in-flight state is observable.
    recordMutate.mockImplementation(() => undefined);
    render(<PerformanceProbePanel />);
    runOnce();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry recording' }));

    expect(await screen.findByText('Recording this reading…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry recording' })).not.toBeInTheDocument();
  });

  it('returns focus to Run when Retry unmounts itself', async () => {
    // Pressing Retry flips the mutation to pending, which replaces the branch holding the focused
    // button with a paragraph — focus to `<body>`, WCAG 2.4.3. Found by the M5 accessibility review.
    recordMutateAsync.mockRejectedValue(new Error('network'));
    recordMutate.mockImplementation(() => undefined);
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

    expect(document.activeElement).toBe(runControl());
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
    const shielded = runControl().closest('[inert]');
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

    // Scoped to the sitting's own table: the scenario's label is also an `<option>` in the picker
    // above, and a document-scoped assertion would pass on the picker alone — the ADR-0073 C2.5
    // finding. **The caption names the ACT** — one press is "One reading", a sweep is "Sweep of N"
    // — because that is the distinction `sweep_id` exists to record.
    const history = within(await screen.findByRole('table', { name: /One reading — / }));
    expect(history.getByText('PASS')).toBeInTheDocument();
    expect(history.getByText('Canvas draw budget')).toBeInTheDocument();
    expect(history.getByText('2000 activities')).toBeInTheDocument();
    // Both halves of the cull, so a reading taken on an almost-empty canvas cannot look good.
    expect(history.getByText('222 at 12.00 px/day')).toBeInTheDocument();

    // **The versions are a SITTING fact now, and are stated once rather than on every row.** That
    // is the whole difference between this and the flat table it replaces, which repeated the
    // machine, the versions, the operator and the canvas on each of a sweep's rows.
    expect(screen.getByText('web 0.121.0 · api 0.55.0')).toBeInTheDocument();
    expect(history.queryByText('web 0.121.0 · api 0.55.0')).not.toBeInTheDocument();
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

    const run = runControl();
    expect(run).not.toBeDisabled();
    expect(run).toHaveAttribute('aria-disabled', 'true');
    release(measured('PASS'));
  });
});

/**
 * One refetch per sitting, not one per stored row.
 *
 * **This is a cost, not tidying.** A sweep POSTs once per step, and the history read is an AUDITED
 * act — so invalidating inside the mutation writes four extra `staff.panel_read` rows into a table
 * that refuses `DELETE` (ADR-0072) for one press, recording nothing but the client's own impatience.
 *
 * The property that must survive any rearrangement is the other one: a single run still refreshes,
 * because a single run IS a one-step sitting. Its failure mode is a stored reading the operator
 * cannot see, which reads as a lost measurement.
 */
describe('the history refresh', () => {
  it('happens exactly once for a single run, and only after the store succeeds', async () => {
    refreshHistory.mockClear();
    recordMutate.mockImplementation((_body: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    runProbe.mockResolvedValue(measured('PASS'));

    render(<PerformanceProbePanel />);
    runOnce();

    await waitFor(() => {
      expect(recordMutateAsync).toHaveBeenCalled();
    });
    expect(refreshHistory).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when nothing was stored', async () => {
    // A refusal stores nothing, so there is nothing new to see and no audited read to spend.
    refreshHistory.mockClear();
    recordMutate.mockClear();
    runProbe.mockResolvedValue({
      kind: 'refused',
      refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden.' },
      context: CONTEXT,
    });

    render(<PerformanceProbePanel />);
    runOnce();

    // Two channels carry it — the visible alert and the panel's live region — which is
    // `docs/TECH_DEBT.md` #259 item 10, filed and not this milestone's subject.
    await screen.findAllByText(/The run was refused/);
    expect(recordMutateAsync).not.toHaveBeenCalled();
    expect(refreshHistory).not.toHaveBeenCalled();
  });
});

describe('taking the readings a sitting never got', () => {
  /**
   * M6-T4 — taking again the readings a sitting never got.
   *
   * **These are the ADR-0081 half.** `missingSteps` and `mergeResumed` are proved from literals in
   * `run-sweep.test.ts`, and that says nothing about whether a planner can reach either: this
   * repository has shipped a whole milestone whose capability had no entry point five times, most
   * recently one wired into a host and not the layout its flag selects. Only something that drives
   * the panel can say the control exists, is reachable, and runs what it says it runs.
   */
  it('offers to take the readings that produced nothing, and not the ones that landed', async () => {
    let call = 0;
    runProbe.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 2 ? refused() : measured('PASS'));
    });
    render(<PerformanceProbePanel />);
    runAll();

    await waitFor(() => {
      expect(runProbe).toHaveBeenCalledTimes(4);
    });
    // Verified red by removing the `missingCount > 0` block: the sitting reports a refusal and
    // offers nothing to do about it, which is the state this task exists to remove.
    expect(
      await screen.findByRole('button', { name: 'Run the missing measurements' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This reading will be taken again and stored in this same sitting/),
    ).toBeInTheDocument();
  });

  it('does not offer it when every reading landed', async () => {
    runProbe.mockResolvedValue(measured('PASS'));
    render(<PerformanceProbePanel />);
    runAll();

    await waitFor(() => {
      expect(runProbe).toHaveBeenCalledTimes(4);
    });
    expect(
      screen.queryByRole('button', { name: 'Run the missing measurements' }),
    ).not.toBeInTheDocument();
  });

  it('stores the re-run reading in the SAME sitting, and keeps the ones already recorded', async () => {
    const sweepIds: unknown[] = [];
    recordMutateAsync.mockImplementation((body: unknown) => {
      sweepIds.push((body as { sweepId?: unknown }).sweepId);
      return Promise.resolve({});
    });
    let call = 0;
    runProbe.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 2 ? refused() : measured('PASS'));
    });
    render(<PerformanceProbePanel />);
    runAll();
    await waitFor(() => {
      expect(runProbe).toHaveBeenCalledTimes(4);
    });
    // Three of four stored; the second was refused and there was nothing to store.
    expect(sweepIds).toHaveLength(3);

    fireEvent.click(await screen.findByRole('button', { name: 'Run the missing measurements' }));
    confirmIn('Run the missing measurements');

    await waitFor(() => {
      // One more press, not four: only the reading that produced nothing is taken again.
      expect(runProbe).toHaveBeenCalledTimes(5);
    });
    await waitFor(() => {
      expect(sweepIds).toHaveLength(4);
    });

    // **One sitting, not two.** This is the whole reason `newSweepId` is a callback: a resume that
    // minted a fresh id would file the recovered reading as a separate one-reading sitting, and the
    // history would show a sweep permanently missing a step beside an orphan that looks like a
    // single press somebody took for no reason. Verified red by restoring `crypto.randomUUID()`.
    expect(new Set(sweepIds).size).toBe(1);

    // And the sitting on screen is still four readings. Setting the resume as the panel's state
    // would show a one-step sitting and let an operator conclude the other three were lost.
    await waitFor(() => {
      expect(screen.queryByText(/The run was refused/)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Run the missing measurements' }),
    ).not.toBeInTheDocument();
    // **Counted, not read off the summary sentence.** A one-step outcome says "Recorded." and a
    // four-step one says "Recorded." too, so a sentence assertion would pass equally against the
    // sitting having been replaced — the shape ADR-0093 records, where a green suite cannot tell
    // "everything is there" from "there is one thing". The step headings are per step.
    const result = document.querySelector('[data-perf-probe-result]');
    if (result === null) throw new Error('no result block');
    expect(
      within(result as HTMLElement).getAllByRole('heading', { level: 3, name: /^Step \d of 4/ }),
    ).toHaveLength(4);
  });

  /**
   * **A single press stores no sitting id, and a press for several stores one.**
   *
   * This is the assertion that would have caught the defect M6-T4 found by reading. `runSweep`
   * called `newSweepId` unconditionally, so **Measure one thing** stored a `sweep_id`; the history
   * derives a sitting's kind from which id space grouped its rows, so that press rendered as
   * `Sweep of 1 reading` above "This sitting has 1 of 4 readings. 3 were refused or never taken".
   *
   * **No existing test could see it**, and the reason is worth keeping: every fixture in the
   * model's suite sets `sweepId: null` for a single press, because that is what the producer was
   * supposed to send. A suite built from what the contract says is blind to a producer that
   * disobeys it, which is why this one asks the panel what it actually posts.
   */
  it('files a single press as a single press, and a sweep as a sitting', async () => {
    const ids: unknown[] = [];
    recordMutateAsync.mockImplementation((body: unknown) => {
      ids.push((body as { sweepId?: unknown }).sweepId);
      return Promise.resolve({});
    });
    runProbe.mockResolvedValue(measured('PASS'));

    const { unmount } = render(<PerformanceProbePanel />);
    runOnce();
    await waitFor(() => {
      expect(ids).toHaveLength(1);
    });
    // `null`, not a fresh uuid: the schema's own words are that NULL means a single press, and "a
    // default would claim membership of a sitting that does not exist".
    expect(ids[0]).toBeNull();
    unmount();

    ids.length = 0;
    render(<PerformanceProbePanel />);
    runAll();
    await waitFor(() => {
      expect(ids).toHaveLength(4);
    });
    // Four presses, one sitting — and every one of them a real id, not four nulls.
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
    expect(new Set(ids).size).toBe(1);
  });
});
