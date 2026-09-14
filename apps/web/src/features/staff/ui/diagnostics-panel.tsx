import { useCallback, useId, useState } from 'react';

import { useStaffDiagnostics, type StaffDiagnosticRow } from '../api/staff-diagnostics';
import {
  diagnosticBreakdown,
  diagnosticSentence,
  diagnosticsStatus,
  formatDiagnosticsReport,
  natureSentence,
} from '../model/diagnostics-report';

import { Panel } from './panel';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

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
 * and cannot return; running, with `aria-busy` and the polite region `Panel` owns; a result,
 * including **both** zero shapes, which are different facts and say so; and a failure as an
 * `Alert purpose="event"` (ADR-0132 — this is a thing that just happened, not a standing condition)
 * with **no number rendered beside it**, because a stale count under an error message is the one
 * outcome a reader cannot tell from a fresh one. That last clause is now enforced by one derived
 * `result` rather than asserted by this paragraph — see it below for why the first version was
 * wrong about its own guarantee.
 */
export function DiagnosticsPanel(): React.ReactElement {
  const query = useStaffDiagnostics();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyBlockedId = useId();

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

  const copy = useCallback(() => {
    // The guard the shading promises. A shaded control that still fires is a shading in appearance
    // only, which is worse than none because it looks considered.
    if (result === undefined) return;
    void navigator.clipboard.writeText(formatDiagnosticsReport(result)).then(
      () => setCopyState('copied'),
      // **A rejection says so.** It used to set `copied` false, which is indistinguishable from
      // never having pressed the button: no visible change, nothing in the live region, nothing
      // announced — on a browser that refuses clipboard access, which is an ordinary configuration
      // rather than an edge case (WCAG 4.1.3, the M4 accessibility review).
      () => setCopyState('failed'),
    );
  }, [result]);

  const run = useCallback(() => {
    // A shaded control that still fires is a shading in appearance only — the same rule as Copy.
    if (running) return;
    // Clearing the copy state on a new run rather than leaving it: "Report copied." beside numbers
    // that have since been replaced describes a clipboard holding the PREVIOUS reading.
    setCopyState('idle');
    void query.refetch();
  }, [query, running]);

  return (
    <Panel title="Diagnostics" status={diagnosticsStatus(result)}>
      <p className="text-muted-foreground text-sm">
        Counts how many rows answer a named question about customer data — and returns{' '}
        <strong>only</strong> counts. No plan, client, project or activity is named, at any size,
        and the check cannot be pointed at one organisation: it has no parameters at all. What it
        replaces is a database shell on the host, which has none of those limits and leaves no
        record.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* `aria-disabled:` utilities rather than the native attribute, and paired with the
            shading — every other `aria-disabled` control in this codebase carries both, and this
            one shipped with the attribute and no visual treatment at all, so a sighted mouse user
            got no cue before pressing a control that would do nothing. */}
        <Button
          onClick={run}
          aria-busy={running}
          aria-disabled={running}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run diagnostics'}
        </Button>

        <Button
          variant="outline"
          aria-disabled={result === undefined}
          aria-describedby={result === undefined ? copyBlockedId : undefined}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onClick={copy}
        >
          Copy for the record
        </Button>
        {result === undefined ? (
          // An `sr-only` SIBLING rather than text folded into the button, or the reason joins the
          // accessible name and a screen-reader user hears the action and its refusal as one
          // run-on label (ADR-0082, ADR-0117's `purpose` distinction).
          <span id={copyBlockedId} className="sr-only">
            {running
              ? 'Wait for this run to finish — copying now would take the previous reading.'
              : 'Run the diagnostics first — there is nothing to copy yet.'}
          </span>
        ) : null}

        <span aria-live="polite" className="text-muted-foreground text-sm">
          {copyState === 'copied' ? 'Report copied.' : ''}
          {copyState === 'failed'
            ? 'Could not reach the clipboard. The numbers are below — copy them by hand.'
            : ''}
        </span>
      </div>

      {running ? <Spinner label="Running diagnostics…" /> : null}

      {query.isError && !running ? (
        <Alert purpose="event" tone="error">
          The diagnostics did not complete, so there is no number to show. Try again; if it keeps
          failing, the API log will say why.
        </Alert>
      ) : null}

      {result !== undefined ? (
        <div className="space-y-4" data-diagnostics-result>
          {result.diagnostics.map((row) => (
            <DiagnosticResult key={row.id} row={row} />
          ))}
          <p className="text-muted-foreground text-xs">
            Taken {new Date(result.takenAt).toLocaleString()} by API {result.apiVersion}. Both are
            the server&rsquo;s — a reading pasted into a record is only comparable with one taken a
            release later if it says which release produced it, and the block the Copy button
            produces carries the exact timestamp rather than this local rendering of it.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * One question's answer.
 *
 * The denominator is rendered beside the count and never behind a disclosure. A count on its own
 * lets a reader conclude a defect is large when it is a rounding error, which is the failure this
 * whole panel exists to remove.
 */
function DiagnosticResult({ row }: { row: StaffDiagnosticRow }): React.ReactElement {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">{row.label}</h3>
      <p className="text-sm">{diagnosticSentence(row)}</p>
      {/* What a non-zero count MEANS, beside the count rather than in a footnote: without it "17 of
          1,284" reads as "17 activities are broken right now", which is the misreading this panel
          is most likely to produce and the one it can least afford. */}
      <p className="text-muted-foreground text-xs">{natureSentence(row)}</p>
      <p className="text-muted-foreground text-xs">{diagnosticBreakdown(row)}</p>
    </div>
  );
}
