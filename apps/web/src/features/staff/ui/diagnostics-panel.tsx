import { useCallback } from 'react';

import {
  useStaffDiagnostics,
  type StaffDiagnosticRow,
  type StaffDiagnostics,
} from '../api/staff-diagnostics';
import {
  diagnosticBreakdown,
  diagnosticSentence,
  diagnosticsStatus,
  formatDiagnosticsReport,
  natureSentence,
} from '../model/diagnostics-report';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Disclosure } from '@/components/ui/disclosure';
import { StatusSection, SubSection } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { DIAGNOSTICS } from '@/features/staff/model/panel-copy';
import { formatRelative, exactInstant } from '@/lib/relative-time';

/**
 * The Diagnostics panel — a staff member presses one control and gets a count (ADR-0140).
 *
 * **This is the entry point, named rather than implied** (ADR-0081): `/staff` → Diagnostics → **Run
 * diagnostics**. There is no other route to `GET /api/v1/staff/diagnostics` in the product, and a
 * milestone that shipped the route without this would have shipped a capability nobody could reach
 * — the shape this register has recorded five times.
 *
 * **Nothing runs on mount.** The read touches customer tables and writes an audit row, so a query
 * that fired on arrival would count every visit to `/staff` as somebody asking a question about
 * customer data. The button is the only thing that fires it, and that is enforced by the hook
 * (`enabled: false`) rather than by this component remembering.
 *
 * **Four states, all named** (the ADR-0062 M6 rule): idle with an explanation of what the panel can
 * and cannot return; running, with `aria-busy` and the polite region `StatusSection` owns; a result,
 * including **both** zero shapes, which are different facts and say so; and a failure as an
 * `Alert purpose="event"` (ADR-0132 — this is a thing that just happened, not a standing condition)
 * with **no number rendered beside it**, because a stale count under an error message is the one
 * outcome a reader cannot tell from a fresh one. That last clause is now enforced by one derived
 * `result` rather than asserted by this paragraph — see it below for why the first version was
 * wrong about its own guarantee.
 */
export function DiagnosticsPanel(): React.ReactElement {
  const query = useStaffDiagnostics();

  const running = query.isFetching;

  /**
   * **The one derivation, and it is the M4 gate pass's largest finding.**
   *
   * `query.data` is NOT cleared by a failed refetch — `@tanstack/query-core`'s error reducer
   * spreads the prior state and never touches `data` — and it is not cleared while a refetch is in
   * flight either. Reading `query.data` directly, as this component first did, therefore produced
   * two states the panel's own docblock rules out: the failure `Alert` saying "there is no number
   * to show" rendered **directly above the previous run's numbers**, and Copy staying live
   * mid-refetch so an operator could paste a superseded reading into a record believing it current.
   *
   * Three reviewers reached it independently. One boolean fixes all of it, which is why it is one
   * boolean rather than three conditions maintained in parallel — the shape that let them diverge.
   */
  const result = running || query.isError ? undefined : query.data;

  const run = useCallback(() => {
    // A shaded control that still fires is a shading in appearance only.
    if (running) return;
    void query.refetch();
  }, [query, running]);

  return (
    <StatusSection
      title="Diagnostics"
      status={diagnosticsStatus(result)}
      description={DIAGNOSTICS.intro}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* `aria-disabled:` utilities rather than the native attribute, and paired with the
            shading — every other `aria-disabled` control in this codebase carries both. */}
        <Button
          onClick={run}
          aria-busy={running}
          aria-disabled={running}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run diagnostics'}
        </Button>

        {/* **A new run clears the confirmation** (`resetKey`): "Copied." beside numbers that have since
            been replaced describes a clipboard holding the PREVIOUS reading. `result` is undefined
            for the whole of a run, so the key changes the moment one starts. */}
        <CopyButton
          subject="Diagnostics report"
          text={result === undefined ? null : () => formatDiagnosticsReport(result)}
          resetKey={result}
          unavailableReason={running ? DIAGNOSTICS.copyWaiting : DIAGNOSTICS.copyUnavailable}
        >
          Copy results
        </CopyButton>
      </div>

      {running ? <Spinner label="Running diagnostics…" /> : null}

      {query.isError && !running ? (
        <Alert purpose="event" tone="error">
          {DIAGNOSTICS.error}
        </Alert>
      ) : null}

      {result !== undefined ? <DiagnosticsResults result={result} /> : null}
    </StatusSection>
  );
}

/**
 * **Compact: a question with something to report is shown in full, the rest are one line** (D-12).
 *
 * Sixteen near-identical cards, most repeating the same zero-count sentence, added about 1,700 px
 * to the page after one press. A check that found nothing is a fact the reader needs to know was
 * made, not a block they need to read, so the zeros collapse into a count and a button that shows
 * them. `Disclosure collapsed="hidden"`: the zero cards contain no controls, but nothing in them is
 * worth a screen-reader stop either until asked for. **Copy results still copies all of them**,
 * because it formats the whole response and not what is on screen, so a pasted record is unchanged.
 */
function DiagnosticsResults({ result }: { result: StaffDiagnostics }): React.ReactElement {
  const found = result.diagnostics.filter((row) => row.affected > 0);
  const nothing = result.diagnostics.filter((row) => row.affected === 0);

  return (
    <div className="space-y-4" data-diagnostics-result>
      {found.length === 0 ? null : (
        <>
          <p className="text-sm font-medium">{DIAGNOSTICS.found(found.length)}</p>
          {found.map((row) => (
            <DiagnosticResult key={row.id} row={row} />
          ))}
        </>
      )}
      {nothing.length === 0 ? null : (
        <div>
          <p className="text-muted-foreground text-sm">{DIAGNOSTICS.nothing(nothing.length)}</p>
          <Disclosure label={DIAGNOSTICS.showAll(result.diagnostics.length)} collapsed="hidden">
            <div className="space-y-4">
              {nothing.map((row) => (
                <DiagnosticResult key={row.id} row={row} />
              ))}
            </div>
          </Disclosure>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Taken{' '}
        <time dateTime={result.takenAt} title={exactInstant(result.takenAt)}>
          {formatRelative(result.takenAt, new Date())}
        </time>{' '}
        by version {result.apiVersion}.
      </p>
    </div>
  );
}

function DiagnosticResult({ row }: { row: StaffDiagnosticRow }): React.ReactElement {
  return (
    <SubSection title={row.label}>
      <p className="text-sm">{diagnosticSentence(row)}</p>
      {/* What a non-zero count MEANS, beside the count rather than in a footnote: without it "17 of
          1,284" reads as "17 activities are broken right now", which is the misreading this panel
          is most likely to produce and the one it can least afford. */}
      <p className="text-muted-foreground text-xs">{natureSentence(row)}</p>
      <p className="text-muted-foreground text-xs">{diagnosticBreakdown(row)}</p>
    </SubSection>
  );
}
