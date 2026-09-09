import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  useProbeResults,
  useRecordProbeResult,
  useRefreshProbeResults,
} from '../api/probe-results';
import type { ProbeResultBody } from '../api/probe-results';
import type { Verdict } from '../model/judge';
import {
  SCENARIOS,
  isGated,
  scenarioById,
  type ScenarioDefinition,
  type ScenarioId,
  type ScenarioPreset,
} from '../model/scenarios';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import type { LimbOutcome, ProbeOutcome, RunSize } from '../runner/run-probe';
import { runSweep, type SweepOutcome } from '../sweep/run-sweep';
import { describeDuration, estimateSweepSeconds } from '../sweep/sweep-duration';
import { sweepPlan, type SweepStep } from '../sweep/sweep-plan';

import { ProbeHistory } from './probe-history';
import { formatProbeReport } from './probe-report';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Surface } from '@/components/ui/surface';
import { Panel } from '@/features/staff/ui/panel';

/**
 * The Performance panel — a staff member presses one control and gets a real-hardware reading.
 *
 * **The measurement runs in THIS browser, and that is the whole design.** The product owner asked
 * for the canvas benchmark as a button rather than a terminal command, and the reason it can be a
 * button at all is that a browser measurement has to happen on the machine somebody actually uses:
 * the API runs headless in Docker, where Canvas 2D can come from a software rasteriser, and
 * `m0-conditions.md` records that container's own no-change baseline moving by more than tenfold
 * between two runs an hour apart. A server-side job would produce an authoritative-looking number
 * from the wrong machine, which is worse than no number because somebody acts on it.
 *
 * **Nothing heavy is imported here.** The scenes and the painter arrive through `await import()`
 * on the press — `@repo/seed/scale` alone is 68,641 B gzip against a staff chunk of 4,619 B — and
 * F2 gates the entry chunk. A static import of `../runner/run-probe` would silently undo that, so
 * the only route to it in this file is inside the handler.
 */
/**
 * Which control opened the confirmation.
 *
 * **Three kinds rather than one dialog with a boolean**, because each control makes a different
 * promise: a sweep covers the screen for about two minutes and produces four readings, a check
 * takes seconds and produces none that can be graded, and a single measurement is whatever the
 * three selects say. A dialog that named the wrong duration would be worse than none — the number
 * is the operator's basis for deciding whether to start something that asks them to leave the
 * machine alone.
 */
type ConfirmKind = 'sweep' | 'check' | 'one';

/** A step's identity, in one place so the panel and the renderer cannot disagree about it. */
function stepKey(step: SweepStep): string {
  return `${step.scenario.id}:${step.preset}`;
}

/** `Step 2 of 4 · Canvas draw budget · whole plan` — what the overlay says it is doing. */
function stepLabel(plan: readonly SweepStep[], step: SweepStep): string {
  const index = plan.findIndex(
    (s) => s.scenario.id === step.scenario.id && s.preset === step.preset,
  );
  const position = index === -1 ? '' : `Step ${String(index + 1)} of ${String(plan.length)} · `;
  return `${position}${step.scenario.label} · ${step.preset === 'fit' ? 'whole plan' : 'week'}`;
}

/**
 * What each control promises before it takes the screen.
 *
 * **Pure and exported, so the copy is assertable from literals** rather than only reachable by
 * driving a dialog — and so the three confirmations cannot drift into three different accounts of
 * the same three facts (how long, that the motion IS the measurement, what Stop keeps).
 */
export function confirmationCopy(
  kind: ConfirmKind | null,
  one: { scenario: ScenarioDefinition; preset: ScenarioPreset; size: RunSize },
): string {
  const motion =
    'It covers the screen with a moving diagram — that movement IS the measurement, so it is not ' +
    'reduced or stilled for a reduced-motion setting. Keep this tab in front and leave the machine ' +
    'alone: a backgrounded tab is throttled by the browser, and a run will say so rather than ' +
    'reporting a number.';
  const stop = 'Stop ends it at the next repeat and keeps every reading that has already finished.';

  if (kind === 'sweep') {
    const plan = sweepPlan();
    return (
      `This takes ${describeDuration(estimateSweepSeconds(plan, 'full'))} and produces ` +
      `${String(plan.length)} readings — every measurement at both framings. ${motion} ${stop} ` +
      'Half the readings are ungraded by design: the whole-plan framing is measured and never ' +
      'given a pass or a fail, because the diagram is already known to drop frames there.'
    );
  }

  if (kind === 'check') {
    const plan = sweepPlan();
    return (
      `This takes ${describeDuration(estimateSweepSeconds(plan, 'quick'))} and answers one ` +
      'question: does the probe work on this machine? Every reading runs once, so none of them ' +
      `can be graded — there is no run-to-run spread to judge against. ${motion}`
    );
  }

  const seconds = estimateSweepSeconds([{ scenario: one.scenario, preset: one.preset }], one.size);
  const ungraded =
    one.size === 'quick'
      ? ' It runs once, so there is no run-to-run spread to grade against — it reports its figures and stops.'
      : isGated(one.scenario, one.preset)
        ? ''
        : ' This framing is measured but never graded — the diagram is already known to drop frames at the whole-plan zoom, so it will report its figures without a pass or a fail.';
  return `This takes ${describeDuration(seconds)}. ${motion} ${stop}${ungraded}`;
}

export function PerformanceProbePanel(): React.ReactElement {
  const scenarioSelectId = useId();
  const presetSelectId = useId();
  const sizeSelectId = useId();
  const machineLabelId = useId();

  const [scenarioId, setScenarioId] = useState<ScenarioId>('canvas-draw');
  const [preset, setPreset] = useState<ScenarioPreset>('week');
  const [size, setSize] = useState<RunSize>('full');

  /** Which control asked, so its own confirmation can name its own duration. */
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [outcome, setOutcome] = useState<SweepOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [machineLabel, setMachineLabel] = useState('');

  const record = useRecordProbeResult();
  const history = useProbeResults();
  const refreshHistory = useRefreshProbeResults();

  const runButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  const scenario = scenarioById(scenarioId);

  /**
   * Return focus to the control that opened the dialog.
   *
   * A modal `<dialog>` restores focus from inside the effect that closes it, and if the opener has
   * moved or the surrounding tree has re-rendered the restore lands on `<body>` — this repository's
   * third-most-repeated defect (ADR-0080, ADR-0096, ADR-0099 M10). Asking for the control by ref is
   * cheap insurance and is what the regression test asserts.
   */
  /**
   * Return focus to **the control that opened the dialog** — which is now one of three.
   *
   * A modal `<dialog>` restores focus from inside the effect that closes it, and if the opener has
   * moved or the surrounding tree has re-rendered the restore lands on `<body>` — this repository's
   * third-most-repeated defect (ADR-0080, ADR-0096, ADR-0099 M10).
   *
   * **The opener is captured at click time rather than assumed.** An earlier version of this
   * milestone kept a single `runButtonRef` pointing at the primary control, so confirming from the
   * "Measure one thing" disclosure returned focus to a button at the top of the panel — a keyboard
   * user was silently moved out of the disclosure they were working in, and the disclosure may not
   * even be open. Caught by the focus-return test, which is why it exists.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  const focusRun = useCallback(() => {
    (openerRef.current ?? runButtonRef.current)?.focus();
  }, []);

  /**
   * Focus follows the overlay, in both directions.
   *
   * **In an effect rather than in the handler**, and that ordering is the point. The overlay
   * unmounts when `running` flips, and asking for focus inside the same `finally` block races the
   * unmount: React schedules the state update, the handler's `focus()` may run first, and then the
   * Cancel button disappears taking focus to `<body>` with it. That is this repository's
   * third-most-repeated defect (ADR-0080, ADR-0096, ADR-0099 M10) and it is caused by exactly this
   * ordering. An effect runs AFTER the commit, so the element it asks for is the one on screen.
   *
   * The overlay is deliberately **not** a modal dialog: it announces nothing, traps nothing, and
   * carries one control. Moving focus into it is what stops a keyboard reader sitting on a Run
   * button they can no longer see for twenty-five seconds.
   */
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running && !wasRunning.current) cancelButtonRef.current?.focus();
    // The SAME opener the confirmation returns to, not the primary control: a run started
    // from the disclosure should hand focus back into the disclosure.
    if (!running && wasRunning.current) focusRun();
    wasRunning.current = running;
  }, [focusRun, running]);

  /**
   * Re-send one step's body after a failed POST.
   *
   * **Only a retry lives here now.** The sweep records each step as it completes (`run-sweep.ts`),
   * which is what makes an interruption cheap — two minutes of measurement should not be lost
   * because the operator closed the tab at 1:50. What remains is the one thing the sweep
   * deliberately does not do: try again. A silent retry either stores the same press twice or
   * spends the operator's attention while looking like nothing happened, so the figures stay on
   * screen with a control that asks.
   */
  /**
   * Which steps are being re-sent right now, keyed by scenario and framing.
   *
   * **A set rather than the mutation's `isPending`.** A sitting has up to four steps and one
   * mutation object; `record.isPending` would light every failed step's spinner because one of them
   * is in flight, and a reader would be told the panel is retrying readings it has not touched.
   */
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());

  const retryStore = useCallback(
    (key: string, body: ProbeResultBody) => {
      setRetrying((current) => new Set(current).add(key));
      // **Focus moves BEFORE the button disappears.** Pressing Retry replaces this step's alert
      // with the in-flight paragraph and takes the focused element with it — focus lands on
      // `<body>`, this repository's most-repeated defect (WCAG 2.4.3, ADR-0080/0096/0099 M10).
      // Asked for in the handler rather than in an effect, which is safe here precisely because
      // the control being focused is NOT the one unmounting.
      focusRun();
      record.mutate(body, {
        onSuccess: () => {
          // **The step's status is updated, not just the spinner cleared.** Without this the
          // operator presses Retry, the row reaches the database, and the panel goes on saying NOT
          // recorded — which reads as a second failure and invites a third press, storing the same
          // press twice. Caught by the focus-return test, whose premise was that Retry unmounts
          // itself; it only unmounts if something actually changes.
          setOutcome((current) =>
            current === null
              ? current
              : {
                  ...current,
                  steps: current.steps.map((step) =>
                    stepKey(step.step) === key ? { ...step, status: 'recorded' as const } : step,
                  ),
                },
          );
          setRetrying((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
          refreshHistory();
        },
        onError: () => {
          setRetrying((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        },
      });
    },
    [focusRun, record, refreshHistory],
  );

  /**
   * Run a plan — **the one path all three controls take.**
   *
   * A single run is a one-step sweep. That is not a simplification for its own sake: two
   * orchestrations would drift, and the drift would be invisible because each looks right alone
   * (the ADR-0065 `routeOrthogonal` argument, and the reason M2's formatter became one model with
   * two adapters rather than two formatters).
   */
  const start = useCallback(
    async (plan: readonly SweepStep[], runSize: RunSize) => {
      setConfirming(null);
      setOutcome(null);
      setFailure(null);
      setCopied(false);
      cancelledRef.current = false;
      setRunning(true);
      setProgress('Preparing…');

      try {
        // The split point. Everything expensive lives on the other side of this line.
        const { runProbe } = await import('../runner/run-probe');

        const canvas = canvasRef.current;
        const surface = surfaceRef.current;
        if (!canvas || !surface) {
          setFailure('The measurement surface did not mount, so nothing could be drawn.');
          return;
        }
        // A real viewport, because a framing is part of a reading. The overlay is visible while it
        // runs for the same reason: a canvas the compositor can skip is not the canvas we ship.
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const result = await runSweep({
          size: runSize,
          machineLabel: machineLabel.trim() === '' ? null : machineLabel.trim(),
          newSweepId: () => crypto.randomUUID(),
          plan,
          runStep: (step) =>
            runProbe({
              scenario: step.scenario,
              preset: step.preset,
              size: runSize,
              canvas,
              surfaceRoot: surface,
              // **Per step AND per repeat.** `docs/TECH_DEBT.md` #259 item 11 records
              // `revision-diff` narrating once for a whole multi-pair run, so a screen-reader user
              // hears nothing for twenty-five seconds; over a four-step sweep that becomes two
              // minutes of silence. The step prefix is added here so the runner's own per-repeat
              // sentences keep working unchanged.
              onProgress: (message) =>
                setProgress(plan.length > 1 ? `${stepLabel(plan, step)} — ${message}` : message),
              // **Asked at every boundary, not read once at the end.** The previous version set
              // this ref on click and consulted it only after the whole scenario had finished
              // drawing, so "Cancel (stops after the current run)" stopped nothing and silently
              // discarded a finished measurement.
              shouldStop: () => cancelledRef.current,
            }),
          store: (body) => record.mutateAsync(body),
          onProgress: (state) => {
            if (state.status === 'running' && plan.length > 1) {
              setProgress(`${stepLabel(plan, state.step)} — preparing…`);
            }
          },
          shouldStop: () => cancelledRef.current,
        });

        setOutcome(result);
        // **One refresh for the sitting, whatever it wrote** — see `useRefreshProbeResults`. Four
        // POSTs invalidating individually would be four extra audited reads for one press.
        if (result.steps.some((step) => step.status === 'recorded')) refreshHistory();
      } catch (error) {
        // The panel must survive its own dependency being absent — a chunk that fails to load is a
        // network fact, not a measurement, and it must not read as a failing painter.
        setFailure(
          error instanceof Error
            ? `The measurement could not run: ${error.message}`
            : 'The measurement could not run.',
        );
      } finally {
        setRunning(false);
        setProgress('');
      }
    },
    [machineLabel, record, refreshHistory],
  );

  const copy = useCallback(() => {
    if (!outcome) return;
    // One block per sitting, its steps in the order they ran — the operator pastes ONE thing into
    // a document, not four. A step that was refused or never taken says so in its own line rather
    // than being omitted, because a block missing a reading is indistinguishable from a sweep that
    // was never asked for it.
    const text = outcome.steps
      .map((step) =>
        step.outcome === null
          ? `${stepLabel(
              outcome.steps.map((s) => s.step),
              step.step,
            )} — ${step.status}`
          : formatProbeReport(
              step.outcome,
              machineLabel.trim() === '' ? null : machineLabel.trim(),
            ),
      )
      .join('\n\n');
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [machineLabel, outcome]);

  /**
   * What the panel says, in the one channel a screen-reader user has.
   *
   * **The recording state is part of it**, and it was not: "recorded" rendered as a plain `<p>` with
   * no role, so a successful store — a row now exists in the installation's history — was completely
   * silent to assistive technology, while its failure was announced loudly by an `Alert`. WCAG 4.1.3,
   * found by the M5 accessibility review. The asymmetry is the defect: a reader heard the bad news
   * and never the good, on a screen whose whole purpose is saying what the state is now.
   */
  // **Counted from the steps rather than from one mutation's flags.** A sweep POSTs four times, so
  // `record.isError` is a fact about the LAST write and says nothing about the other three. The
  // sitting's own step statuses are the truth, which is why `run-sweep.ts` returns them.
  const recorded = outcome?.steps.filter((step) => step.status === 'recorded').length ?? 0;
  const unrecorded = outcome?.steps.filter((step) => step.status === 'not recorded').length ?? 0;
  const recordingStatus =
    outcome === null
      ? ''
      : unrecorded > 0
        ? ` ${String(unrecorded)} of ${String(outcome.steps.length)} were NOT recorded — the figures are still on screen.`
        : recorded > 0
          ? ` Recorded in this installation’s history.`
          : '';

  const status = running
    ? progress
    : failure !== null
      ? failure
      : outcome
        ? `${summariseSweep(outcome)}${recordingStatus}`
        : 'No measurement has been taken in this browser.';

  return (
    <Panel title="Performance" status={status}>
      <p className="text-muted-foreground text-sm">
        Measures how the schedule diagram paints <strong>on this machine</strong>. Nothing is
        measured on the server: the API runs headless in a container, where the canvas can fall back
        to software rendering and the same code has produced readings more than ten times apart an
        hour apart. A number from there would look authoritative and mean nothing.
      </p>

      {/*
        **`inert` while the overlay covers the screen** — WCAG 2.2 §2.4.11 Focus Not Obscured.
        The overlay is `fixed inset-0` over an OPAQUE `Surface tone="canvas"`, and it is
        deliberately not a modal `<dialog>` (it announces nothing and traps nothing), so it does not
        get the inert backdrop `showModal()` would give it for free. Without this, Shift+Tab from
        Cancel walks backwards into the selects and the Run button — every one of them completely
        hidden behind the canvas, so a keyboard user can change the framing they cannot see, with
        no focus ring anywhere on screen. Found by the M5 accessibility review.

        `inert` rather than `disabled` on each control: it removes the whole subtree from the focus
        order AND from the accessibility tree in one place, and it cannot be forgotten on the next
        control somebody adds here.
      */}
      <div inert={running} className="contents">
        {/*
          **Three controls, in the order an operator needs them.**

          The primary one takes every reading the probe can take — which is what `docs/TECH_DEBT.md`
          #75 has been waiting a year for, and what nobody was going to assemble four presses at a
          time. The secondary one exists because two minutes is a real commitment and finding out
          the probe works here should not cost it. The three selects are still there and still work;
          they move behind a disclosure because "which of eight combinations do I want?" is the
          question an operator asks LAST, and the panel used to ask it first.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={runButtonRef}
            onClick={(event) => {
              if (running) return;
              openerRef.current = event.currentTarget;
              setConfirming('sweep');
            }}
            // `aria-disabled`, never the native attribute: a natively-disabled button is blurred to
            // `<body>` the instant it flips, and this one flips twice per run (ADR-0083, and the
            // ScopeSaveBar lesson re-learnt in ADR-0063 M6).
            aria-disabled={running}
            aria-busy={running}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Run all measurements
          </Button>
          <Button
            variant="outline"
            onClick={(event) => {
              if (running) return;
              openerRef.current = event.currentTarget;
              setConfirming('check');
            }}
            aria-disabled={running}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Check the probe works
          </Button>
          <span className="text-muted-foreground text-sm">
            {describeDuration(estimateSweepSeconds(sweepPlan(), 'full'))} for all four readings.
          </span>
        </div>

        <details className="border-border rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Measure one thing</summary>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={scenarioSelectId}>Measurement</Label>
              <Select
                id={scenarioSelectId}
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value as ScenarioId)}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={presetSelectId}>Framing</Label>
              <Select
                id={presetSelectId}
                value={preset}
                onChange={(e) => setPreset(e.target.value as ScenarioPreset)}
              >
                <option value="week">Week — a working zoom</option>
                <option value="fit">Fit — the whole plan</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={sizeSelectId}>Length</Label>
              <Select
                id={sizeSelectId}
                value={size}
                onChange={(e) => setSize(e.target.value as RunSize)}
              >
                {/* Derived, not stated: the old constants said 25 s and 5 s for every shape, and
                a whole-plan framing is nearly twice the first. See `sweep-duration.ts`. */}
                <option value="full">
                  Full measurement (
                  {describeDuration(estimateSweepSeconds([{ scenario, preset }], 'full'))})
                </option>
                <option value="quick">
                  Quick check (
                  {describeDuration(estimateSweepSeconds([{ scenario, preset }], 'quick'))})
                </option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={machineLabelId}>Machine (optional)</Label>
              {/* Insert-time only in v1, and the panel says so rather than offering an edit that does
              not exist: an editable note needs `updated_at` and a version column, which is a
              migration and a decision. */}
              <Input
                id={machineLabelId}
                value={machineLabel}
                onChange={(e) => setMachineLabel(e.target.value)}
                placeholder="the Dell, docked, on mains"
                maxLength={200}
              />
            </div>
            <Button
              variant="outline"
              onClick={(event) => {
                if (running) return;
                openerRef.current = event.currentTarget;
                setConfirming('one');
              }}
              aria-disabled={running}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              Run measurement
            </Button>
          </div>
          <p className="text-muted-foreground mt-3 text-sm">{scenario.question}</p>
        </details>

        {/* No bold lead-in on any Alert here. `Alert` already carries a tone colour, a coloured left
          accent bar, a leading icon and an assertive-or-polite role — a bold sentence inside it is
          a fourth channel saying what four things already say, which is what the ADR-0097 weight
          ratchet exists to remove rather than to count. */}
        {failure !== null && <Alert tone="error">The measurement did not run. {failure}</Alert>}

        {outcome !== null && (
          <SittingResult
            outcome={outcome}
            onCopy={copy}
            copied={copied}
            onRetry={retryStore}
            retrying={retrying}
          />
        )}

        <ProbeHistory query={history} />
      </div>

      {/*
        The measurement surface. Mounted only while running, sized to the real viewport, and
        VISIBLE — a hidden or zero-size canvas is one the compositor is free to be unusually good
        at, which would measure something the product never does. It is `aria-hidden` because it
        carries no information a reader needs; the progress sentence in the panel's own status
        region is the accessible channel, and the verdict lands there when the run ends.

        `<Surface tone="canvas">` is not decoration: ADR-0102 established that a palette resolved
        from `document.documentElement` gives the PAGE's inks on a ground that is not the page, and
        does so silently. The runner takes this element as a required parameter.
      */}
      {running && (
        <div className="bg-background/95 fixed inset-0 z-50 flex flex-col">
          <Surface tone="canvas" ref={surfaceRef} className="relative flex-1 overflow-hidden">
            <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
          </Surface>
          <div className="flex items-center justify-between gap-4 p-4">
            {/*
              A bare icon, NOT `<Spinner>`. That primitive carries `role="status"`, which would put
              a second live region on screen alongside the panel's own — and two live regions during
              one run is how a progress announcement overwrites a verdict (ADR-0079's debounced
              count, ADR-0080's focus announcement). The panel's status region is the accessible
              channel; this is decoration and says so.
            */}
            <span className="flex items-center gap-2 text-sm">
              <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
              {progress}
            </span>
            <Button
              ref={cancelButtonRef}
              variant="outline"
              onClick={() => {
                cancelledRef.current = true;
              }}
            >
              Stop (keeps what is already measured)
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => {
          setConfirming(null);
          focusRun();
        }}
        onConfirm={() => {
          if (confirming === 'sweep') void start(sweepPlan(), 'full');
          else if (confirming === 'check') void start(sweepPlan(), 'quick');
          else if (confirming === 'one') void start([{ scenario, preset }], size);
        }}
        title={
          confirming === 'sweep'
            ? 'Take every measurement now?'
            : confirming === 'check'
              ? 'Check the probe works?'
              : 'Run the measurement now?'
        }
        // **Each control names its OWN duration, derived from its own plan.** The panel used to say
        // "about twenty-five seconds" for everything, which was true of one shape and wrong for the
        // others by a factor of two — and this number is the operator's basis for deciding whether
        // to start something that covers their screen and asks them to leave the machine alone.
        //
        // **The ungraded caveat is attached to the run's shape, not to its length.** An earlier
        // version tied it to `size === 'quick'`, so a FULL measurement at the whole-plan framing —
        // equally ungraded by design — got twenty-five seconds of motion and then a verdict word
        // the reader had never been warned about (found by the M5 ux review). A sweep is warned
        // unconditionally, because half its steps are ungraded by construction.
        description={confirmationCopy(confirming, { scenario, preset, size })}
        confirmLabel={
          confirming === 'sweep'
            ? 'Run all measurements'
            : confirming === 'check'
              ? 'Check the probe'
              : 'Run measurement'
        }
        cancelLabel="Not now"
        confirmVariant="default"
      />
    </Panel>
  );
}

/**
 * One sentence for the live region.
 *
 * **A refusal is never phrased as a result.** The whole point of the fourth verdict is that a
 * reader can tell "this machine says no" from "this machine cannot say", and a status line that
 * flattened them would undo it in the one channel a screen-reader user has.
 */
/**
 * What a sitting came to, in one sentence.
 *
 * **One function, both consumers** — the visible copy and the live region read the same string, so
 * they cannot say different things about one press. That is the rule `docs/TECH_DEBT.md` #259
 * item 10 exists because of, applied at the point where it is cheap.
 *
 * It counts what the steps say rather than what the last mutation flag says: a sweep writes four
 * times, so one `isError` is a fact about the fourth write and nothing about the other three.
 */
export function summariseSweep(outcome: SweepOutcome): string {
  const counts = {
    recorded: outcome.steps.filter((s) => s.status === 'recorded').length,
    notRecorded: outcome.steps.filter((s) => s.status === 'not recorded').length,
    refused: outcome.steps.filter((s) => s.status === 'refused').length,
    notTaken: outcome.steps.filter((s) => s.status === 'not taken').length,
  };

  // A one-step sitting says what it always said: a reader who pressed "Measure one thing" should
  // not be handed the vocabulary of a sweep.
  if (outcome.steps.length === 1) {
    const only = outcome.steps[0];
    return only?.outcome ? summarise(only.outcome) : 'Nothing was measured.';
  }

  const parts: string[] = [];
  if (counts.recorded > 0) parts.push(`${String(counts.recorded)} measured`);
  // **"Not taken" and "refused" stay apart here too**, because this sentence is where a reader
  // meets them: one means nobody tried, the other means the machine declined.
  if (counts.refused > 0) parts.push(`${String(counts.refused)} refused`);
  if (counts.notTaken > 0) parts.push(`${String(counts.notTaken)} not taken`);
  if (counts.notRecorded > 0) parts.push(`${String(counts.notRecorded)} measured but not recorded`);

  const lead = outcome.stopped ? 'You stopped this sitting.' : 'Sitting finished.';
  return parts.length === 0 ? lead : `${lead} ${parts.join(', ')}.`;
}

function summarise(outcome: ProbeOutcome): string {
  if (outcome.kind === 'cancelled') {
    // **The same sentence the visible copy uses, not a second wording of it.** Before M3 both said
    // "nothing was recorded" and were right; after it, a live region still saying so while the
    // screen says two readings were kept would be false in the one channel a screen-reader user
    // has — the one-correct-pattern-applied-to-a-control-and-not-its-neighbour shape this register
    // records six times over, and the M3-T2 risk names it in advance.
    return cancelledSentence(outcome.limbs.length);
  }
  if (outcome.kind === 'refused') {
    return `The run was refused and nothing was measured. ${outcome.refusal.sentence}`;
  }
  const verdicts = outcome.limbs.map((limb) =>
    limb.result.kind === 'unjudgeable' ? 'CANNOT BE JUDGED' : limb.result.judged.verdict,
  );
  return `Measurement finished. ${verdicts.join(', ')}.`;
}

function ProbeResult({ outcome }: { outcome: ProbeOutcome }): React.ReactElement {
  return (
    <div className="space-y-4">
      {outcome.kind === 'cancelled' ? (
        // A stopped run is its own state, and it says so. Returning to the pristine "no measurement
        // has been taken" wording would leave a reader unable to tell a cancellation from never
        // having pressed Run at all.
        //
        // **"Not taken" and "refused" are two vocabularies and stay apart.** A reading not taken is
        // one nobody tried; a refusal is one the machine declined. Collapsing them into a single
        // "did not happen" sentence would lose the difference between "you stopped early" and
        // "your tab was in the background", which are the two things a reader most needs to tell
        // apart when a press produces less than they expected.
        <Alert tone="info">{cancelledSentence(outcome.limbs.length)}</Alert>
      ) : outcome.kind === 'refused' ? (
        // Deliberately carries NO pass/fail wording anywhere. A refusal rendered as a verdict is
        // the defect this whole vocabulary exists to prevent, and there is a test for it.
        <Alert tone="info">
          The run was refused — nothing was measured. {outcome.refusal.sentence}
        </Alert>
      ) : (
        outcome.limbs.map((limb) => (
          <div key={limb.limbId} className="border-border rounded-md border p-3">
            <h3 className="font-medium">{limb.limbLabel}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{limb.sceneSummary}</p>
            <p className="text-muted-foreground text-sm">
              {limb.visibleBars} bars on screen at {limb.pxPerDay.toFixed(2)} px/day · floor{' '}
              {limb.minFps} fps
            </p>
            {limb.result.kind === 'unjudgeable' ? (
              <Alert tone="info" className="mt-2">
                This run cannot be judged. {limb.result.message.split('\n')[0]}
              </Alert>
            ) : (
              <LimbVerdict limb={limb} judged={limb.result.judged} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * What a stopped run kept, and what it did not get to.
 *
 * The count is of **completed** readings — the runners drop an interrupted limb rather than
 * truncating it, so a number here is never a partial measurement dressed as a whole one. Singular
 * and plural are separate strings rather than a bare "1 reading(s)", because this is the sentence a
 * reader meets at the moment they are least sure what just happened.
 */
function cancelledSentence(kept: number): string {
  if (kept === 0) {
    return 'You stopped this run before anything finished, so nothing was measured and nothing was recorded.';
  }
  if (kept === 1) {
    return 'You stopped this run. One reading had already finished and was kept; the rest were not taken.';
  }
  return `You stopped this run. ${String(kept)} readings had already finished and were kept; the rest were not taken.`;
}

/**
 * What one sitting came to — one block per step, in the order they ran.
 *
 * **A step that produced nothing still gets a line.** A block that simply omitted a refused or
 * never-taken step would be indistinguishable from a sweep that was never asked for it, which is
 * the absence-a-reader-cannot-check defect this whole epic is about. So `refused`, `not taken` and
 * `not recorded` each say what they are, and only `not recorded` offers an action — because it is
 * the only one where the figures exist and the row does not.
 *
 * **`ProbeResult` is reused rather than reimplemented** for the measured steps: a second renderer
 * would drift from the single-run one, and only somebody who ran the same scenario both ways would
 * ever see it.
 */
/** Steps whose row reached the database. Counted from the steps, not from a mutation flag. */
function recordedCount(outcome: SweepOutcome): number {
  return outcome.steps.filter((step) => step.status === 'recorded').length;
}

function SittingResult({
  outcome,
  onCopy,
  copied,
  onRetry,
  retrying,
}: {
  outcome: SweepOutcome;
  onCopy: () => void;
  copied: boolean;
  onRetry: (key: string, body: ProbeResultBody) => void;
  retrying: ReadonlySet<string>;
}): React.ReactElement {
  const plan = outcome.steps.map((s) => s.step);
  return (
    <div className="space-y-4" data-perf-probe-result>
      {outcome.steps.length > 1 && <p className="text-sm font-medium">{summariseSweep(outcome)}</p>}

      {/*
        **The successful store gets a visible line, and that is a guarantee rather than decoration.**
        A previous version rendered "recorded" as a plain `<p>` with no role, so a row appearing in
        the installation's history was completely silent to assistive technology while its FAILURE
        was announced loudly by an `Alert` — WCAG 4.1.3, found by the staff-probe M5 accessibility
        review. The asymmetry was the defect: a reader heard the bad news and never the good. The
        live region carries it too (`recordingStatus`); this is the sighted half.
      */}
      {recordedCount(outcome) > 0 && (
        <p className="text-muted-foreground text-sm">
          {recordedCount(outcome) === outcome.steps.length
            ? 'Recorded. It appears in the history below.'
            : `${String(recordedCount(outcome))} of ${String(outcome.steps.length)} recorded. They appear in the history below.`}
        </p>
      )}

      {outcome.steps.map((step) => (
        <div key={stepKey(step.step)} className="space-y-2">
          {outcome.steps.length > 1 && (
            <h3 className="text-muted-foreground text-sm">{stepLabel(plan, step.step)}</h3>
          )}

          {step.status === 'not taken' && (
            <Alert tone="info">
              Not taken — the sitting was stopped before this reading began. Nobody asked the
              machine, so this is not a refusal.
            </Alert>
          )}

          {step.status === 'refused' && step.outcome?.kind === 'refused' && (
            <Alert tone="info">
              The run was refused — nothing was measured. {step.outcome.refusal.sentence}
            </Alert>
          )}

          {step.outcome !== null && step.outcome.kind !== 'refused' && (
            <ProbeResult outcome={step.outcome} />
          )}

          {retrying.has(stepKey(step.step)) && (
            // The in-flight state, which a reader needs or a pressed Retry looks like nothing
            // happening. Per step, because one mutation object serves up to four of them.
            <p className="text-muted-foreground text-sm">Recording this reading…</p>
          )}

          {step.status === 'not recorded' &&
            step.body !== null &&
            !retrying.has(stepKey(step.step)) && (
              <Alert tone="error">
                These figures were measured but NOT recorded.{' '}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onRetry(stepKey(step.step), step.body as ProbeResultBody);
                  }}
                >
                  Retry recording
                </Button>
              </Alert>
            )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onCopy}>
          Copy full report
        </Button>
        {/* Announced, because a Copy button that changes nothing visible is silent to a screen
            reader — and the report is the deliverable, so knowing it was taken matters. */}
        <span aria-live="polite" className="text-muted-foreground text-sm">
          {copied ? 'Report copied.' : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * A limb's verdict, and the sentence that goes with it.
 *
 * **No verdict prints bare.** `REPORTED_ONLY` used to render as exactly that — underscore and all,
 * with nothing beside it — which a first-time reader cannot tell from a failure code, on the two
 * paths (a quick check, the whole-plan framing) that produce it by design. The sentence comes from
 * the same pure module the paste-ready report uses, so the screen and the block somebody pastes
 * into a document cannot disagree about the same run.
 */
function LimbVerdict({
  limb,
  judged,
}: {
  limb: LimbOutcome;
  judged: { verdict: Verdict; indeterminateReason?: string; saturated?: boolean };
}): React.ReactElement {
  const note = verdictNote(judged.verdict, {
    gated: limb.recording.thresholds.gated === true,
    repeats: (limb.recording.pairs ?? limb.recording.runs ?? []).length,
    indeterminateReason: judged.indeterminateReason,
    saturated: judged.saturated,
  });
  return (
    <>
      <p className="mt-2 text-lg font-semibold tabular-nums">{verdictLabel(judged.verdict)}</p>
      {note !== null && <p className="text-muted-foreground text-sm">Because {note}</p>}
    </>
  );
}
