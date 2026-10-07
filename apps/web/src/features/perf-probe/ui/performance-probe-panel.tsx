import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

import { useProbeResults } from '../api/probe-results';
import { readMarker } from '../loading/model/marker';
import { lastReadingSummary } from '../model/last-reading';
import { sweepPlan } from '../sweep/sweep-plan';

import { LoadingProbeSection } from './loading-probe-section';
import { ProbeControls } from './probe-controls';
import { PERFORMANCE_COPY, confirmationCopy } from './probe-copy';
import { ProbeSittings } from './probe-sittings';
import { SittingResult } from './sitting-result';
import { useProbeSweep } from './use-probe-sweep';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusSection } from '@/components/ui/page';
import { Surface } from '@/components/ui/surface';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';

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
 * The box's anchor: `/staff#performance` opens it and focuses it, and the console's own links can
 * name it. Kept here with the component that answers to it.
 */
export const PERFORMANCE_SECTION_ID = 'performance';

export interface PerformanceProbePanelProps {
  /**
   * The API's version, which the plan-loading report names. Passed in rather than read here: the
   * console's screen already holds the installation query, and reading it from this feature would
   * be an import of `features/staff` (`no-staff-import.structural.test.ts`).
   */
  apiVersion: string | null;
}

/**
 * Whether the box has to be open on arrival.
 *
 * Two things need the tools mounted before anyone presses anything. A link to `#performance` is a
 * request to see them. And a plan-loading press leaves a marker in `sessionStorage` and **reloads
 * this page twice**: the section that resumes it lives inside the folded content, so a box that
 * arrived folded would never resume, the marker would expire after two minutes, and the reader's
 * measurement would be thrown away without a word. A stale or malformed marker opens it too, because
 * the section is what discards it and tells the reader.
 */
function mustStartOpen(): boolean {
  if (window.location.hash === `#${PERFORMANCE_SECTION_ID}`) return true;
  try {
    return readMarker(window.sessionStorage, Date.now()).kind !== 'none';
  } catch {
    // Storage can be refused outright (a privacy setting); then no press can have left a marker.
    return false;
  }
}

export function PerformanceProbePanel({
  apiVersion,
}: PerformanceProbePanelProps): React.ReactElement {
  const contentId = useId();
  const hideReasonId = useId();
  const sweep = useProbeSweep();
  const {
    running,
    progress,
    outcome,
    failure,
    retrying,
    missing,
    confirming,
    setConfirming,
    scenario,
    preset,
    size,
    start,
    stop,
    retryStore,
    copyText,
    focusRun,
    cancelButtonRef,
    canvasRef,
    surfaceRef,
    panelRef,
    stopHintId,
    status,
    setLoadingStatus,
  } = sweep;

  // **The history is read here, at the panel's root, and not in the part that folds.** The one-line
  // summary needs it while the tools are folded, and the read is an audited act: mounting the
  // observer only on open would write one more `staff.panel_read` row on every open after the cache
  // had gone stale. The screen above also observes this key, so there is still exactly one request.
  const history = useProbeResults();
  const now = useNow();

  const [open, setOpen] = useState(mustStartOpen);
  // How many times the anchor has asked for focus. A counter, not a flag: a second press of the same
  // link is a second request, and clearing a flag would be a state write inside an effect.
  const [focusRequests, setFocusRequests] = useState(() =>
    window.location.hash === `#${PERFORMANCE_SECTION_ID}` ? 1 : 0,
  );

  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash !== `#${PERFORMANCE_SECTION_ID}`) return;
      setOpen(true);
      setFocusRequests((count) => count + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (focusRequests === 0) return;
    // After the commit that mounted the section's content, so the viewport lands on the final layout.
    document.getElementById(PERFORMANCE_SECTION_ID)?.focus();
  }, [focusRequests]);

  const lastReading = history.isPending
    ? PERFORMANCE_COPY.readingPending
    : history.isError
      ? PERFORMANCE_COPY.readingFailed
      : lastReadingSummary(history.data, now);

  // `announce="change"`: the resting sentence ("No measurement has been taken…") is a standing fact
  // that the page-level load sentence replaces (ADR-0178 D-6); a run's outcome is a change and is spoken.
  return (
    <StatusSection
      id={PERFORMANCE_SECTION_ID}
      title="Performance"
      status={status}
      announce="change"
    >
      {/* The anchor the `inert` effect walks up from. `display: contents`, so it adds no box. */}
      <div ref={panelRef} className="contents" />
      {/* One row, text beside the button: the folded box is the page's shortest and was measured as
          the difference between meeting SC-1 and missing it, so it does not spend a line on each
          sentence. It wraps under the text when the row is narrow. */}
      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-muted-foreground min-w-0 grow basis-64 text-sm">
          {PERFORMANCE_COPY.summary} {open ? PERFORMANCE_COPY.intro : lastReading}
        </p>
        {/* **Not a `Disclosure`, because the label changes with the state** (spec US-6: Open, then
            Hide). `aria-expanded` and `aria-controls` as the primitive sets them, and `aria-disabled`
            with a reason rather than a native `disabled` while a run covers the screen, so the press
            that started it cannot blur this to `<body>` (ADR-0083). */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          {...(open ? { 'aria-controls': contentId } : {})}
          {...(open && running ? { 'aria-disabled': true, 'aria-describedby': hideReasonId } : {})}
          onClick={() => {
            if (running) return;
            setOpen((previous) => !previous);
          }}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', open && 'rotate-180')}
          />
          {open ? PERFORMANCE_COPY.hide : PERFORMANCE_COPY.open}
        </Button>
        {open && running ? (
          <span id={hideReasonId} className="sr-only">
            {PERFORMANCE_COPY.hideBlocked}
          </span>
        ) : null}
      </div>

      {/* **Not rendered while folded** (D-3): it holds buttons and selects, and a clipped control is a
          focusable thing nobody can see (WCAG 2.4.7). Mounting it costs no request — the history is
          read above — and the sweep's state lives in the hook, so a selection survives a fold. */}
      {open ? (
        <div id={contentId} className="space-y-4">
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
            <ProbeControls sweep={sweep} />
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
                copyText={copyText}
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

          <LoadingProbeSection apiVersion={apiVersion} onStatusChange={setLoadingStatus} />
        </div>
      ) : null}

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
          <div
            role="region"
            aria-label="Measurement in progress"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col"
          >
            {/*
              **The caption the spec asked for and nobody built** (`docs/TECH_DEBT.md` #259 item 9;
              `docs/specs/staff-performance-probe/feature-spec.md:813` — "a visible caption naming
              it a test picture").

              Not a WCAG failure: the canvas is `aria-hidden` and the progress sentence below is
              the accessible channel. It is a sighted-user affordance. Without it a staff member
              watching a full-screen schedule paint has nothing telling them it is synthetic, and
              the obvious reading of an unlabelled plan on a staff console is that it is somebody's
              real one — which is exactly what a `StaffPrincipal` structurally cannot reach
              (ADR-0086), so the picture contradicts the console's own guarantee.

              A plain `<p>` with NO role. The progress line below already sits in the panel's
              `aria-live` status slot, and a second live region during one run is how a progress
              announcement overwrites a verdict — the reason the spinner beside it is a bare icon
              rather than `<Spinner>`.
            */}
            <p className="text-muted-foreground px-4 pt-4 text-sm">
              A synthetic test picture — not a real plan. Nothing here comes from a customer&rsquo;s
              data.
            </p>
            <Surface tone="canvas" ref={surfaceRef} className="relative flex-1 overflow-hidden">
              <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
            </Surface>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
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
              {/*
                The promise is a visible line beside a short button name rather than a 37-character
                label: the old label could not fit a 320 px row (WCAG 1.4.10, which still applies
                with the target set at desktop and Surface), and a name that long is read in full
                every time the button is focused.
              */}
              <span className="flex flex-wrap items-center gap-3">
                <span id={stopHintId} className="text-muted-foreground text-sm">
                  Stopping keeps what is already measured.
                </span>
                <Button
                  ref={cancelButtonRef}
                  variant="outline"
                  aria-describedby={stopHintId}
                  onClick={stop}
                >
                  Stop
                </Button>
              </span>
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
    </StatusSection>
  );
}
