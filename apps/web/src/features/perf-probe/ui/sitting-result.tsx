import type { ProbeResultBody } from '../api/probe-results';
import type { Verdict } from '../model/judge';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import type { LimbOutcome, ProbeOutcome } from '../runner/run-probe';
import { stepKey, type SweepOutcome } from '../sweep/run-sweep';

import { cancelledSentence, stepLabel, summariseSweep } from './probe-copy';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { SubSection } from '@/components/ui/page';

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
            <SubSection title={limb.limbLabel} />
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

export function SittingResult({
  outcome,
  copyText,
  onRetry,
  retrying,
  missingCount,
  onRunMissing,
}: {
  outcome: SweepOutcome;
  copyText: () => string;
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
          {outcome.steps.length > 1 && <SubSection title={stepLabel(plan, step.step)} />}

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
                  // Shaded, because the attribute alone looked exactly like a live control (#458); not
                  // pointer-inert, because it rests this way for as long as the failure stands.
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

      {/* `resetKey`: a new sweep replaces `outcome`, and "Copied." beside a report that has since been
          replaced describes a clipboard holding the PREVIOUS sitting. */}
      <CopyButton subject="Full report" text={copyText} resetKey={outcome}>
        Copy full report
      </CopyButton>
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
      {/* A `Badge`, as the history's verdict cell uses: the verdict is a status and was the
          heaviest text in the box (18 px / 600, above the card's own 16 px title). `critical` only
          for a genuine FAIL — "REPORTED, NOT GRADED" is the commonest outcome here and is not bad
          news, which is why the neutral fill is the default. */}
      <p className="mt-2">
        <Badge variant={judged.verdict === 'FAIL' ? 'critical' : 'neutral'}>
          {verdictLabel(judged.verdict)}
        </Badge>
      </p>
      {note !== null && <p className="text-muted-foreground text-sm">Because {note}</p>}
    </>
  );
}
