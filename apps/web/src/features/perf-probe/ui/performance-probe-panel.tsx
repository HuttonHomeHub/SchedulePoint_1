import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useProbeResults, useRecordProbeResult } from '../api/probe-results';
import type { Verdict } from '../model/judge';
import {
  SCENARIOS,
  isGated,
  scenarioById,
  type ScenarioId,
  type ScenarioPreset,
} from '../model/scenarios';
import { toProbeBody } from '../model/to-probe-body';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import type { LimbOutcome, ProbeOutcome, RunSize } from '../runner/run-probe';

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
export function PerformanceProbePanel(): React.ReactElement {
  const scenarioSelectId = useId();
  const presetSelectId = useId();
  const sizeSelectId = useId();
  const machineLabelId = useId();

  const [scenarioId, setScenarioId] = useState<ScenarioId>('canvas-draw');
  const [preset, setPreset] = useState<ScenarioPreset>('week');
  const [size, setSize] = useState<RunSize>('full');

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [outcome, setOutcome] = useState<ProbeOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [machineLabel, setMachineLabel] = useState('');

  const record = useRecordProbeResult();
  const history = useProbeResults();

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
  const focusRun = useCallback(() => {
    runButtonRef.current?.focus();
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
    if (!running && wasRunning.current) runButtonRef.current?.focus();
    wasRunning.current = running;
  }, [running]);

  /**
   * Record the reading — **and record nothing at all for a refused run**.
   *
   * The decision is `toProbeBody`'s, not this function's: it returns `null` for a refusal, because
   * nothing was measured and a stored row would put a reading in the installation's history that no
   * machine ever produced. Asserted with a spy on the client rather than by reading this code.
   *
   * A failure here is deliberately NOT swallowed and deliberately NOT retried automatically. The
   * verdict is still on screen, so the honest state is "measured, not recorded" with a control that
   * tries again — a silent retry either stores the same press twice or spends the operator's
   * attention while looking like nothing happened.
   */
  const store = useCallback(
    (result: ProbeOutcome) => {
      const body = toProbeBody(result, machineLabel.trim() === '' ? null : machineLabel.trim());
      if (body === null) return;
      record.mutate(body);
    },
    [machineLabel, record],
  );

  const start = useCallback(async () => {
    setConfirming(false);
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

      const result = await runProbe({
        scenario,
        preset,
        size,
        canvas,
        surfaceRoot: surface,
        onProgress: setProgress,
        // **Asked at every boundary, not read once at the end.** The previous version set this ref
        // on click and consulted it only after the whole scenario had finished drawing, so
        // "Cancel (stops after the current run)" stopped nothing and silently discarded a finished
        // measurement. A run now ends where the operator said, and says that it did.
        shouldStop: () => cancelledRef.current,
      });
      setOutcome(result);
      store(result);
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
  }, [preset, scenario, size, store]);

  const copy = useCallback(() => {
    if (!outcome) return;
    void navigator.clipboard.writeText(formatProbeReport(outcome)).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [outcome]);

  /**
   * What the panel says, in the one channel a screen-reader user has.
   *
   * **The recording state is part of it**, and it was not: "recorded" rendered as a plain `<p>` with
   * no role, so a successful store — a row now exists in the installation's history — was completely
   * silent to assistive technology, while its failure was announced loudly by an `Alert`. WCAG 4.1.3,
   * found by the M5 accessibility review. The asymmetry is the defect: a reader heard the bad news
   * and never the good, on a screen whose whole purpose is saying what the state is now.
   */
  const recordingStatus =
    !outcome || outcome.kind !== 'measured'
      ? ''
      : record.isPending
        ? ' Recording it now.'
        : record.isError
          ? ' It was NOT recorded — the figures are still on screen.'
          : record.isSuccess
            ? ' Recorded in this installation’s history.'
            : '';

  const status = running
    ? progress
    : failure !== null
      ? failure
      : outcome
        ? `${summarise(outcome)}${recordingStatus}`
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
        <div className="flex flex-wrap items-end gap-4">
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
              <option value="full">Full measurement (about 25 seconds)</option>
              <option value="quick">Quick check (about 5 seconds)</option>
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
            ref={runButtonRef}
            onClick={() => {
              if (!running) setConfirming(true);
            }}
            // `aria-disabled`, never the native attribute: a natively-disabled button is blurred to
            // `<body>` the instant it flips, and this one flips twice per run (ADR-0083, and the
            // ScopeSaveBar lesson re-learnt in ADR-0063 M6).
            aria-disabled={running}
            aria-busy={running}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Run measurement
          </Button>
        </div>

        <p className="text-muted-foreground text-sm">{scenario.question}</p>

        {/* No bold lead-in on any Alert here. `Alert` already carries a tone colour, a coloured left
          accent bar, a leading icon and an assertive-or-polite role — a bold sentence inside it is
          a fourth channel saying what four things already say, which is what the ADR-0097 weight
          ratchet exists to remove rather than to count. */}
        {failure !== null && <Alert tone="error">The measurement did not run. {failure}</Alert>}

        {outcome !== null && <ProbeResult outcome={outcome} onCopy={copy} copied={copied} />}

        {/*
        Whether the reading was STORED — a fact about the database, kept visibly separate from
        whether the run was refused, which is a fact about the machine. Collapsing them is the
        failure `m4-schema-record.md` names as the thing every CHECK constraint on that table
        depends on not happening: a swallowed 422 turns a visible refusal into silent evidence loss.
      */}
        {outcome !== null && outcome.kind === 'measured' && (
          <RecordingState
            pending={record.isPending}
            failed={record.isError}
            recorded={record.isSuccess}
            onRetry={() => {
              store(outcome);
              // **Focus moves BEFORE the button disappears.** Pressing Retry flips the mutation to
              // pending, which replaces this branch with a plain paragraph and takes the focused
              // element with it — focus lands on `<body>`, this repository's most-repeated defect
              // (WCAG 2.4.3). Asked for in the handler rather than in an effect, and that is safe
              // here precisely because the Run button is NOT the element unmounting: it is on
              // screen before the press and after it. Found by the M5 accessibility review.
              focusRun();
            }}
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
              Stop (ends at the next repeat)
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
          focusRun();
        }}
        onConfirm={() => void start()}
        title="Run the measurement now?"
        // **Warned whenever the run will not be graded, not only when it is short.** The previous
        // wording tied the caveat to `size === 'quick'`, so a FULL measurement at the whole-plan
        // framing — equally ungraded by design — got twenty-five seconds of full-screen motion and
        // then a verdict word the reader had never been warned about. Found by the M5 ux review.
        description={
          size === 'quick'
            ? 'A quick check takes about five seconds. It runs once, so there is no run-to-run spread to grade against — it reports its figures and stops.'
            : `A full measurement takes about twenty-five seconds. It covers the screen with a moving diagram — that movement IS the measurement, so it is not reduced or stilled for a reduced-motion setting; Stop ends it at the next repeat. Keep this tab in front and leave the machine alone: a backgrounded tab is throttled by the browser, and the run will say so rather than reporting a number.${
                isGated(scenario, preset)
                  ? ''
                  : ' This framing is measured but never graded — the diagram is already known to drop frames at the whole-plan zoom, so it will report its figures without a pass or a fail.'
              }`
        }
        confirmLabel="Run measurement"
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
function summarise(outcome: ProbeOutcome): string {
  if (outcome.kind === 'cancelled') {
    return 'You stopped the run, so it was not completed and nothing was recorded.';
  }
  if (outcome.kind === 'refused') {
    return `The run was refused and nothing was measured. ${outcome.refusal.sentence}`;
  }
  const verdicts = outcome.limbs.map((limb) =>
    limb.result.kind === 'unjudgeable' ? 'CANNOT BE JUDGED' : limb.result.judged.verdict,
  );
  return `Measurement finished. ${verdicts.join(', ')}.`;
}

function ProbeResult({
  outcome,
  onCopy,
  copied,
}: {
  outcome: ProbeOutcome;
  onCopy: () => void;
  copied: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-4" data-perf-probe-result>
      {outcome.kind === 'cancelled' ? (
        // A stopped run is its own state, and it says so. Returning to the pristine "no measurement
        // has been taken" wording would leave a reader unable to tell a cancellation from never
        // having pressed Run at all.
        <Alert tone="info">
          You stopped this run before it finished, so nothing was measured and nothing was recorded.
        </Alert>
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

/**
 * Recorded, recording, or measured-but-not-recorded.
 *
 * **Three states and not two**, because "not recorded" is the one that matters: the numbers are on
 * screen and the operator can still keep them — the Copy button is right there — so the panel says
 * what failed and offers the one action that can fix it rather than discarding a measurement that
 * took twenty-five seconds of somebody's attention.
 *
 * A refused run reaches none of these: nothing was measured, so there is nothing to record and no
 * failure to report.
 */
function RecordingState({
  pending,
  failed,
  recorded,
  onRetry,
}: {
  pending: boolean;
  failed: boolean;
  recorded: boolean;
  onRetry: () => void;
}): React.ReactElement | null {
  if (pending) {
    return <p className="text-muted-foreground text-sm">Recording this reading…</p>;
  }
  if (failed) {
    return (
      <Alert tone="error">
        <span>
          The reading was measured but NOT recorded — it is not in this installation’s history. The
          figures above are still good; copy them, or try again.
        </span>
        <div className="mt-2">
          <Button variant="outline" onClick={onRetry}>
            Retry recording
          </Button>
        </div>
      </Alert>
    );
  }
  if (recorded) {
    return (
      <p className="text-muted-foreground text-sm">Recorded. It appears in the history below.</p>
    );
  }
  return null;
}
