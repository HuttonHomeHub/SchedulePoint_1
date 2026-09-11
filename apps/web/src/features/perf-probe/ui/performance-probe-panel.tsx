import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
import {
  mergeResumed,
  missingSteps,
  runSweep,
  stepKey,
  type SweepOutcome,
} from '../sweep/run-sweep';
import { describeDuration, estimateSweepSeconds } from '../sweep/sweep-duration';
import { sweepPlan, type SweepStep } from '../sweep/sweep-plan';

import { formatProbeReport } from './probe-report';
import { ProbeSittings } from './probe-sittings';

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
type ConfirmKind = 'sweep' | 'check' | 'one' | 'missing';

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
  /**
   * What a resume would re-measure — **passed in rather than derived**, because it is a fact about
   * one sitting on screen and not about the registry. The other three kinds can be described from
   * `sweepPlan()` alone; this one cannot, and defaulting it would let the dialog promise a shape it
   * is not about to run.
   */
  missing: { plan: readonly SweepStep[]; size: RunSize } | null = null,
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
      // **Stop is named here too**, and it was the only one of the four that left it out (M7 ux
      // review). The overlay and its Stop button render identically for a check, and a check can
      // keep a completed limb exactly like a full run — so the one control whose confirmation said
      // nothing about leaving was the one an operator is likeliest to be trying out.
      `can be graded — there is no run-to-run spread to judge against. ${motion} ${stop}`
    );
  }

  if (kind === 'missing') {
    // No plan means nothing is missing, and the control that opens this dialog is not rendered in
    // that state. Said rather than assumed: a promise about "0 readings" is the shape of sentence
    // this epic exists to remove, and it costs one branch to make it unreachable.
    if (missing === null || missing.plan.length === 0) {
      return 'There are no missing readings to take.';
    }
    const count = missing.plan.length;
    return (
      `This takes ${describeDuration(estimateSweepSeconds(missing.plan, missing.size))} and takes ` +
      `the ${count === 1 ? 'one reading' : `${String(count)} readings`} that ` +
      `${count === 1 ? 'was' : 'were'} refused or never taken. ${motion} ${stop} ` +
      // **The honest cost of joining the sitting, stated before it is paid.** The readings are
      // stored under the SAME sitting id, which is what makes them one act — and time has passed
      // since the others, on a machine that may since have been moved, resized or rebooted. The
      // block flags a spread beyond an hour for the same reason; warning here is what lets an
      // operator decide to start a fresh sitting instead.
      'They join the sitting above rather than starting a new one, so it will hold readings taken ' +
      'minutes or days apart — comparable only if this machine and this window are as they were.'
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
   * The page behind the overlay is out of the focus order for as long as it is covered.
   *
   * **The panel's own `inert` was necessary and not sufficient** (WCAG 2.2 §2.4.11, M7
   * accessibility review). `/staff` renders six more panels beside this one and several mount a
   * `DataTable`, which is a focusable `role="region"`; the overlay is `fixed inset-0` over an
   * opaque surface, so Tab from Stop landed on a control nobody could see. This is what a modal
   * `<dialog>` would give for free — and the overlay is deliberately not one, because it announces
   * nothing and traps nothing, so the property has to be asked for.
   *
   * Scoped to the panel's own document root rather than `document.body`, so the portalled overlay —
   * a child of the body — keeps its Stop button. Restored in the cleanup, which is the half that
   * matters: a leaked `inert` takes the whole console out of the keyboard's reach with nothing on
   * screen looking wrong.
   *
   * `main` is located rather than assumed: this is a component, and a future host may not have one.
   * Where there is none the panel-level `inert` still covers this panel's own controls, which is
   * the state the M5 fix left and is strictly better than throwing.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!running) return;
    const page = panelRef.current?.closest('main');
    if (!page) return;
    page.setAttribute('inert', '');
    return () => {
      page.removeAttribute('inert');
    };
  }, [running]);

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
    async (
      plan: readonly SweepStep[],
      runSize: RunSize,
      /**
       * The sitting this press continues, or `null` for a fresh one.
       *
       * A resume is an ordinary sweep over a shorter plan; the only two things it does differently
       * are reuse the id and fold its results back in, and both are one expression each below.
       */
      resume: SweepOutcome | null = null,
    ) => {
      setConfirming(null);
      // **A resume leaves the sitting on screen.** Clearing it would blank the readings the first
      // press recorded for the duration of the run and, if the resume then threw, permanently — an
      // operator would be shown a two-step sitting and could reasonably conclude the other two had
      // been lost. They are in the database; only the screen would have forgotten them.
      if (resume === null) setOutcome(null);
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
          // **The id IS the resume, and a single press has none.** `runSweep` mints through this
          // callback precisely so the CALLER decides the sitting; nothing else in the orchestration
          // has to know which press this is, which is what keeps one code path for all four
          // controls.
          //
          // Three cases, in order. A resume keeps the sitting it is continuing — including when it
          // is re-taking a single reading, where a fresh id would file the recovered reading as an
          // orphan beside a sweep permanently missing a step. A press that asks for more than one
          // reading IS a sitting. And a single **Measure one thing** press is not one: the schema's
          // own words are that `NULL` means a single press and "a default would claim membership of
          // a sitting that does not exist" (feature-spec.md:644). It claimed exactly that until
          // M6-T4 — every single press grouped as a sweep, and the history told the operator it
          // held "1 of 4 readings — 3 were refused or never taken", all of it false.
          newSweepId: () =>
            resume !== null ? resume.sweepId : plan.length > 1 ? crypto.randomUUID() : null,
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

        setOutcome(resume === null ? result : mergeResumed(resume, result));
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
  // **From the outcome's own steps, by the same rule the dialog and the button both read.** The
  // alternative — the panel deciding separately what "missing" means — is two definitions of one
  // set, where a control could offer to re-run a step the sweep would then not include.
  const missing = outcome === null ? [] : missingSteps(outcome);
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
      {/* The anchor the `inert` effect walks up from. `display: contents`, so it adds no box. */}
      <div ref={panelRef} className="contents" />
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
          {/*
            No weight. The product has exactly one other disclosure summary
            (`resource-strip-panel.tsx:335`) and it carries none, so a `font-medium` here
            would make two `<summary>` elements in one product read differently for no
            reason a reader could infer — and a `<summary>` already announces itself with a
            marker and a pointer cursor, so the weight was a third channel saying what two
            already said. Removed rather than absorbed into the ADR-0097 weight ceiling,
            which is what that ratchet is for.
          */}
          <summary className="cursor-pointer text-sm">Measure one thing</summary>
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
        {failure !== null && (
          <Alert purpose="event" tone="error">
            The measurement did not run. {failure}
          </Alert>
        )}

        {outcome !== null && (
          <SittingResult
            outcome={outcome}
            onCopy={copy}
            copied={copied}
            onRetry={retryStore}
            retrying={retrying}
            missingCount={missing.length}
            onRunMissing={() => {
              setConfirming('missing');
            }}
          />
        )}

        <ProbeSittings query={history} />
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
      {running &&
        createPortal(
          /*
            **Portalled to the body, and that is what makes the `inert` below possible.**

            The overlay covers the whole viewport, so what must be taken out of the focus order is
            the whole page — and the page includes the six sibling panels `/staff` renders beside
            this one, several of which mount a `DataTable`, which is a focusable `role="region"`.
            Tabbing from Stop walked straight into one of them, entirely hidden behind the canvas:
            WCAG 2.2 §2.4.11 Focus Not Obscured (Minimum), AA. Found by the M7 accessibility review.

            That is the SAME defect the `inert` two hundred lines up records fixing at M5 — fixed
            one level too low. The panel inerted its own controls, which was right about the
            controls it could see and silent about everything it could not.

            The portal is not decoration: inerting a common ancestor while the overlay is nested
            inside it would take the Stop button with it, leaving a two-minute full-screen overlay
            with nothing focusable in it at all — a strictly worse failure than the one being fixed.
          */
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
          </div>,
          document.body,
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
          // **The size comes from the outcome, never from the size control.** The operator may have
          // changed that select since; a `quick` reading stored beside three `full` ones under one
          // sitting id is a sitting taken under two protocols, and only the Protocol column would
          // ever say so.
          else if (confirming === 'missing' && outcome !== null) {
            void start(missing, outcome.size, outcome);
          }
        }}
        title={
          confirming === 'sweep'
            ? 'Take every measurement now?'
            : confirming === 'check'
              ? 'Check the probe works?'
              : confirming === 'missing'
                ? 'Take the missing readings now?'
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
        description={confirmationCopy(
          confirming,
          { scenario, preset, size },
          outcome === null ? null : { plan: missing, size: outcome.size },
        )}
        confirmLabel={
          confirming === 'sweep'
            ? 'Run all measurements'
            : confirming === 'check'
              ? 'Check the probe'
              : confirming === 'missing'
                ? 'Run the missing measurements'
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
        <Alert purpose="event" tone="info">
          {cancelledSentence(outcome.limbs.length)}
        </Alert>
      ) : outcome.kind === 'refused' ? (
        // Deliberately carries NO pass/fail wording anywhere. A refusal rendered as a verdict is
        // the defect this whole vocabulary exists to prevent, and there is a test for it.
        <Alert purpose="event" tone="info">
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
              <Alert purpose="event" tone="info" className="mt-2 whitespace-pre-line">
                {/*
                  **The WHOLE message, not its first line** (`docs/TECH_DEBT.md` #259 item 12).
                  This was `message.split('\n')[0]`, so everything after the first line was dropped
                  on screen while the paste-ready report carried it in full.

                  What was being dropped is the part that matters: `NothingToJudgeError`'s
                  non-vacuity message ends "This is NOT a pass. A number measured on an
                  almost-empty canvas is a number about the cull" — the one sentence whose job is
                  to stop a refusal being read as a clean run, which is the mistake ADR-0066
                  records actually happening.

                  `whitespace-pre-line` rather than mapping to paragraphs: the judge composes these
                  messages as text with deliberate line breaks and an indented detail line, and
                  re-flowing them here would be a second opinion about a layout the judge already
                  has — the same text the report prints.
                */}
                This run cannot be judged. {limb.result.message}
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
  missingCount,
  onRunMissing,
}: {
  outcome: SweepOutcome;
  onCopy: () => void;
  copied: boolean;
  onRetry: (key: string, body: ProbeResultBody) => void;
  retrying: ReadonlySet<string>;
  /** How many readings were refused or never taken. Counted by the caller, from one definition. */
  missingCount: number;
  onRunMissing: () => void;
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
            <Alert purpose="event" tone="info">
              Not taken — the sitting was stopped before this reading began. Nobody asked the
              machine, so this is not a refusal.
            </Alert>
          )}

          {step.status === 'refused' && step.outcome?.kind === 'refused' && (
            <Alert purpose="event" tone="info">
              The run was refused — nothing was measured. {step.outcome.refusal.sentence}
            </Alert>
          )}

          {step.outcome !== null && step.outcome.kind !== 'refused' && (
            <ProbeResult outcome={step.outcome} />
          )}

          {retrying.has(stepKey(step.step)) && (
            // The in-flight state, which a reader needs or a pressed Retry looks like nothing
            // happening. Per step, because one mutation object serves up to four of them.
            //
            // **Announced, not just printed.** Pressing Retry moves focus away (it has to — the
            // button unmounts), so without a live region a screen-reader user gets silence from
            // the press until the outcome lands, which on a slow write is the same silence a dead
            // button gives. `polite`, because it must not interrupt the panel's own status; the
            // outcome still arrives there. Raised independently by the M7 accessibility and ux
            // reviews.
            <p role="status" className="text-muted-foreground text-sm">
              Recording this reading…
            </p>
          )}

          {step.status === 'not recorded' &&
            step.body !== null &&
            !retrying.has(stepKey(step.step)) && (
              /**
               * **The sentence names WHY, and the button is shaded when a retry cannot help**
               * (`docs/TECH_DEBT.md` #269).
               *
               * This said "These figures were measured but NOT recorded." for every failure, beside
               * a live Retry. Right for a dropped socket or a 500; wrong for a 422, where the
               * server refuses this body and the same body will be refused again — so an operator
               * was invited to press a button that cannot work, with nothing on screen letting
               * them tell the two apart. Every `revision-diff` reading was answered
               * `422 … property frames should not exist` for the life of that scenario and read
               * exactly like a network blip.
               *
               * The retryable set is decided in `model/store-failure.ts`, not here: it is a
               * decision (429 is a 4xx and IS worth retrying), and two call sites would answer it
               * differently eventually.
               */
              <Alert purpose="event" tone="error">
                {step.storeFailure?.summary ?? 'These figures were measured but NOT recorded.'}{' '}
                <Button
                  variant="outline"
                  size="sm"
                  // **`aria-disabled`, never the native attribute** — a natively disabled button is
                  // out of the tab order, so the reason linked below becomes unreachable by
                  // keyboard, which is the defect ADR-0082 exists to stop one layer down.
                  aria-disabled={step.storeFailure?.retryable === false ? true : undefined}
                  aria-describedby={
                    step.storeFailure?.retryBlockedReason != null
                      ? `${stepKey(step.step)}-retry-blocked`
                      : undefined
                  }
                  onClick={() => {
                    // The guard the shading promises. A shaded control that still fires is a
                    // shading in appearance only, which is worse than none because it looks
                    // considered.
                    if (step.storeFailure?.retryable === false) return;
                    onRetry(stepKey(step.step), step.body as ProbeResultBody);
                  }}
                >
                  Retry recording
                </Button>
                {step.storeFailure?.retryBlockedReason != null ? (
                  // An `sr-only` SIBLING rather than text folded into the button, or the reason
                  // joins the accessible name and a screen-reader user hears the action and its
                  // refusal as one run-on label (ADR-0082, ADR-0117's `purpose` distinction).
                  <span id={`${stepKey(step.step)}-retry-blocked`} className="sr-only">
                    {step.storeFailure.retryBlockedReason}
                  </span>
                ) : null}
              </Alert>
            )}
        </div>
      ))}

      {/*
        **The remedy, after every reason.** It sits below the step list rather than beside the
        summary deliberately: each refused or never-taken step has just said in its own words why
        it produced nothing, and an operator who has read those is the one in a position to decide
        whether taking them again will go any better — a tab that is still going to be backgrounded
        will refuse a second time.

        **Only `refused` and `not taken` reach it.** A step that measured and failed to store keeps
        its own `Retry recording`, which sends the figures already on screen; re-measuring it would
        spend twenty-five seconds obtaining DIFFERENT figures under the impression of re-sending
        these ones.
      */}
      {missingCount > 0 && (
        <div className="space-y-2">
          <Button variant="outline" onClick={onRunMissing}>
            Run the missing measurements
          </Button>
          <p className="text-muted-foreground text-sm">
            {missingCount === 1 ? 'This reading' : `These ${String(missingCount)} readings`}{' '}
            {missingCount === 1 ? 'will be' : 'will be'} taken again and stored in this same
            sitting.
          </p>
        </div>
      )}

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
