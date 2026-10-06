import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  useRecordProbeResult,
  useRefreshProbeResults,
  type ProbeResultBody,
} from '../api/probe-results';
import { scenarioById, type ScenarioId, type ScenarioPreset } from '../model/scenarios';
import type { RunSize } from '../runner/run-probe';
import {
  mergeResumed,
  missingSteps,
  runSweep,
  stepKey,
  type SweepOutcome,
} from '../sweep/run-sweep';
import type { SweepStep } from '../sweep/sweep-plan';

import { stepLabel, verdictFor, type ConfirmKind } from './probe-copy';
import { formatProbeReport } from './probe-report';

import { useAnnounce } from '@/components/ui/announcer';
import { aNativeModalIsOpen } from '@/lib/escape-rungs';

/**
 * How often a long run may speak between its step boundaries.
 *
 * The runner narrates once per repeat, and a full measurement is about twenty-five seconds of
 * repeats: announcing every one would talk over itself, announcing none is the silence
 * `docs/TECH_DEBT.md` #259 item 11 complained about (a screen-reader user cannot tell a run that is
 * going from one that has died). Eight seconds is about one sentence per repeat on a full
 * measurement and one every other repeat on a whole-plan framing, inside the "every five to ten
 * seconds" the M1 accessibility review carried forward.
 */
export const PROGRESS_ANNOUNCE_INTERVAL_MS = 8_000;

/**
 * The state and the orchestration behind the Performance panel's measuring tools.
 *
 * **Extracted from the panel so the shell can fold the tools away without losing a run's state.**
 * The controls unmount while the box is folded and the hook does not, which is what lets a
 * selection, a machine label and the last sitting survive Hide and Open. It holds no markup:
 * `PerformanceProbePanel` composes the shell, `ProbeControls` and `SittingResult` around it.
 *
 * **The runner is reached only through `await import()` inside `start`**, which is the split point
 * `panel-imports.structural.test.ts` pins (`@repo/seed/scale` alone is 68,641 B gzip against a
 * staff chunk of 4,619 B, and F2 gates the entry chunk).
 */
export function useProbeSweep() {
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
  /**
   * The verdict the app's shared announcer has already spoken, so the panel's own region does not
   * speak it a second time.
   *
   * **Why the announcer at all:** while a run is going `<main>` is `inert`, which removes the whole
   * subtree — the panel's polite region included — from the accessibility tree, so progress written
   * there had no listener. The announcer renders as a sibling of `<main>`
   * (`components/ui/announcer.tsx`), outside the inert subtree. The verdict goes through it as well
   * because the run settles in the same commit that lifts `inert`, and a region that appears and is
   * written in one commit is the case a screen reader is least likely to speak.
   */
  const announce = useAnnounce();
  const [announcedVerdict, setAnnouncedVerdict] = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  // The plan-loading section's sentence for the panel's one polite region; see `LoadingProbeSection`.
  const [loadingStatus, setLoadingStatus] = useState('');

  const record = useRecordProbeResult();
  const refreshHistory = useRefreshProbeResults();

  const runButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  /** When the run last spoke, so per-repeat progress can be rationed. */
  const lastSpokenAt = useRef(0);

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
  const stopHintId = useId();
  // The run only stops at the next repeat, which can be seconds away, so the press is acknowledged
  // at once rather than left silent until the verdict.
  const stop = useCallback(() => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    announce('Stopping after the current repeat.');
  }, [announce]);
  /**
   * **Escape stops the run, through the same handler as the button.** The overlay covers the
   * whole viewport and takes focus, so Escape is the key a reader reaches for to leave it; with no
   * handler it did nothing. It is the only thing open during a run — the confirmation has closed
   * before one starts — so no other Escape owner is competing for the key.
   */
  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      // The repository's Escape rungs (lib/escape-rungs.ts): a key another owner already
      // handled, or one a native modal answers for, is not ours.
      if (event.key !== 'Escape' || event.defaultPrevented || aNativeModalIsOpen()) return;
      event.preventDefault();
      stop();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [running, stop]);

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
      // A sweep starting supersedes the plan-loading sentence: left in place it outranked every
      // later sweep summary in the polite region, so a "NOT recorded" warning was never announced.
      setLoadingStatus('');
      setAnnouncedVerdict('');
      cancelledRef.current = false;
      setRunning(true);
      setProgress('Preparing…');

      try {
        // The split point. Everything expensive lives on the other side of this line.
        const { runProbe } = await import('../runner/run-probe');

        const canvas = canvasRef.current;
        const surface = surfaceRef.current;
        if (!canvas || !surface) {
          const message = 'The measurement surface did not mount, so nothing could be drawn.';
          setFailure(message);
          announce(message);
          setAnnouncedVerdict(message);
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
              onProgress: (message) => {
                const line = plan.length > 1 ? `${stepLabel(plan, step)} — ${message}` : message;
                setProgress(line);
                // **Throttled, never per message.** A step boundary has just spoken (below), so the
                // first sentences after it are skipped; a long step then speaks once every
                // `PROGRESS_ANNOUNCE_INTERVAL_MS`, which is what tells a listener the run is alive.
                const now = Date.now();
                if (now - lastSpokenAt.current >= PROGRESS_ANNOUNCE_INTERVAL_MS) {
                  lastSpokenAt.current = now;
                  announce(line);
                }
              },
              // **Asked at every boundary, not read once at the end.** The previous version set
              // this ref on click and consulted it only after the whole scenario had finished
              // drawing, so "Cancel (stops after the current run)" stopped nothing and silently
              // discarded a finished measurement.
              shouldStop: () => cancelledRef.current,
            }),
          store: (body) => record.mutateAsync(body),
          onProgress: (state) => {
            if (state.status === 'running') {
              // **At a step boundary only, never per frame** — the runner's own sentences arrive
              // many times a second and a live region that spoke them would talk over itself.
              announce(stepLabel(plan, state.step));
              lastSpokenAt.current = Date.now();
              if (plan.length > 1) setProgress(`${stepLabel(plan, state.step)} — preparing…`);
            }
          },
          shouldStop: () => cancelledRef.current,
        });

        const settled = resume === null ? result : mergeResumed(resume, result);
        setOutcome(settled);
        const verdict = verdictFor(settled);
        announce(verdict);
        setAnnouncedVerdict(verdict);
        // **One refresh for the sitting, whatever it wrote** — see `useRefreshProbeResults`. Four
        // POSTs invalidating individually would be four extra audited reads for one press.
        if (result.steps.some((step) => step.status === 'recorded')) refreshHistory();
      } catch (error) {
        // The panel must survive its own dependency being absent — a chunk that fails to load is a
        // network fact, not a measurement, and it must not read as a failing painter.
        const message =
          error instanceof Error
            ? `The measurement could not run: ${error.message}`
            : 'The measurement could not run.';
        setFailure(message);
        announce(message);
        setAnnouncedVerdict(message);
      } finally {
        setRunning(false);
        setProgress('');
      }
    },
    [announce, machineLabel, record, refreshHistory],
  );

  // **The text, not the act of copying.** `CopyButton` owns the clipboard, the wording and the
  // confirmation (and clears it when `outcome` is replaced by the next sweep), so this only says what
  // the report IS.
  const copyText = useCallback(() => {
    if (!outcome) return '';
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
    return text;
  }, [machineLabel, outcome]);

  // **From the outcome's own steps, by the same rule the dialog and the button both read.** The
  // alternative — the panel deciding separately what "missing" means — is two definitions of one
  // set, where a control could offer to re-run a step the sweep would then not include.
  const missing = outcome === null ? [] : missingSteps(outcome);

  const settledStatus =
    failure !== null
      ? failure
      : loadingStatus !== ''
        ? loadingStatus
        : outcome
          ? verdictFor(outcome)
          : 'No measurement has been taken in this browser.';
  // **Empty during a run** (progress goes through the announcer, which the inert `<main>` cannot
  // swallow) **and empty while it merely repeats what the announcer just said**, so lifting `inert`
  // does not read the verdict twice. Anything that changes it afterwards — a retried recording, a
  // plan-loading reading — differs from the announced text and is written here as before.
  const status = running ? '' : settledStatus === announcedVerdict ? '' : settledStatus;

  return {
    ids: { scenarioSelectId, presetSelectId, sizeSelectId, machineLabelId },
    scenarioId,
    setScenarioId,
    preset,
    setPreset,
    size,
    setSize,
    scenario,
    machineLabel,
    setMachineLabel,
    confirming,
    setConfirming,
    running,
    progress,
    outcome,
    failure,
    retrying,
    missing,
    status,
    setLoadingStatus,
    start,
    stop,
    retryStore,
    copyText,
    focusRun,
    openerRef,
    runButtonRef,
    cancelButtonRef,
    canvasRef,
    surfaceRef,
    panelRef,
    stopHintId,
  };
}

export type ProbeSweep = ReturnType<typeof useProbeSweep>;
