import type { InterchangeReport } from '@repo/interchange';
import { useId } from 'react';

/**
 * The dry-run **review** surface: the mapped counts plus the approximation / repair / drop findings,
 * rendered as accessible, labelled regions (a definition list for counts; a headed list per finding
 * kind) so a screen-reader user hears each section's name and item count. Every finding line reuses the
 * report's own human-readable `detail` (+ optional `reason`) — nothing is summarised away (spec §4).
 * Presentational only; the dialog owns fetching, actions and announcements.
 */
export function InterchangeReportTable({
  report,
}: {
  report: InterchangeReport;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <dl aria-label="Mapped" className="grid grid-cols-3 gap-2">
        <Count label="Activities" value={report.mapped.activities} />
        <Count label="Relationships" value={report.mapped.relationships} />
        <Count label="Calendars" value={report.mapped.calendars} />
        {/* Only a SchedulePoint XER carries a layout (layout-interchange), so these two appear only
            for one: a tile reading 0 on every foreign import would describe a feature that file
            could never have used. */}
        {report.mapped.placements === undefined ? null : (
          <Count label="Placed starts" value={report.mapped.placements} />
        )}
        {report.mapped.lanes === undefined ? null : (
          <Count label="Lanes" value={report.mapped.lanes} />
        )}
      </dl>

      <p className="text-muted-foreground text-xs">
        {report.detectedFormat.toUpperCase()}
        {report.sourceVersion ? ` · ${report.sourceVersion}` : ''}
        {report.sourceFilename ? ` · ${report.sourceFilename}` : ''}
      </p>

      <FindingSection
        heading="Approximations"
        emptyLabel="No values were approximated."
        findings={report.approximations}
      />
      <FindingSection
        heading="Repairs"
        emptyLabel="No repairs were needed."
        findings={report.repairs}
      />
      <FindingSection heading="Dropped" emptyLabel="Nothing was dropped." findings={report.drops} />
      {/* Advisories (ADR-0162) are not a fourth finding kind: nothing was coerced, repaired or left
          out, so there is no "nothing to advise" line either. The section renders only when the
          report carries some, which keeps a report without the key exactly as it was. */}
      {report.advisories === undefined || report.advisories.length === 0 ? null : (
        <FindingSection heading="Advisories" emptyLabel="" findings={report.advisories} />
      )}
    </div>
  );
}

/** One mapped-count tile — a `<div>` term/definition pair inside the counts `<dl>`. */
function Count({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="border-border bg-muted/40 flex flex-col rounded-md border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The fields one report line needs. A finding and an advisory both carry them, so one section renders
 * either; the finding's `kind` and the advisory's `code` are what the heading already says.
 */
interface ReportLine {
  entity: string;
  sourceRef: string | null;
  detail: string;
  reason?: string | undefined;
}

/**
 * A labelled region for one finding kind: a heading carrying the count (announced by name) and either an
 * empty-state line or a list of human-readable finding lines. Each `<li>` names the entity, its optional
 * source ref, the detail, and the reason — never encoding meaning in colour alone.
 */
function FindingSection({
  heading,
  emptyLabel,
  findings,
}: {
  heading: string;
  emptyLabel: string;
  findings: readonly ReportLine[];
}): React.ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <h3 id={headingId} className="text-foreground text-sm font-medium">
        {heading} ({findings.length})
      </h3>
      {findings.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        // Explicit roles (ADR-0122): Tailwind's Preflight sets `list-style: none`, which WebKit and
        // VoiceOver read as "not a list", so the count in the heading would name a list nobody hears.
        // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see above.
        <ul role="list" className="flex flex-col gap-1">
          {findings.map((finding, index) => (
            // eslint-disable-next-line jsx-a11y/no-redundant-roles -- ADR-0122; see the list above.
            <li
              role="listitem"
              key={`${finding.entity}-${finding.sourceRef ?? 'n'}-${index}`}
              className="border-border bg-card text-card-foreground rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{finding.entity}</span>
              {finding.sourceRef ? (
                <span className="text-muted-foreground"> [{finding.sourceRef}]</span>
              ) : null}
              <span>: {finding.detail}</span>
              {finding.reason ? (
                <span className="text-muted-foreground"> — {finding.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
