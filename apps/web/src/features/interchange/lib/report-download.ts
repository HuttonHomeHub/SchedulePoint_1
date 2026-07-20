import type { InterchangeReport, ReportFinding } from '@repo/interchange';

/**
 * Serialise an {@link InterchangeReport} to a plain-text, human-readable summary suitable for
 * downloading and keeping alongside the imported plan (the "what did I lose?" record, spec §3). Pure and
 * DOM-free so it is unit-testable; {@link downloadReport} handles the browser IO. Lists every mapped
 * count and every approximation / repair / drop line (reusing the report's own `detail`/`reason` copy),
 * so nothing that changed is omitted.
 */
export function formatReportText(report: InterchangeReport): string {
  const lines: string[] = [];
  lines.push('SchedulePoint — schedule import report');
  lines.push('');
  lines.push(`Source format:   ${report.detectedFormat}`);
  lines.push(`Source version:  ${report.sourceVersion ?? '—'}`);
  lines.push(`Source file:     ${report.sourceFilename ?? '—'}`);
  lines.push('');
  lines.push('Mapped');
  lines.push(`  Activities:     ${report.mapped.activities}`);
  lines.push(`  Relationships:  ${report.mapped.relationships}`);
  lines.push(`  Calendars:      ${report.mapped.calendars}`);

  appendSection(lines, 'Approximations', report.approximations);
  appendSection(lines, 'Repairs', report.repairs);
  appendSection(lines, 'Dropped', report.drops);

  return `${lines.join('\n')}\n`;
}

function appendSection(lines: string[], heading: string, findings: ReportFinding[]): void {
  lines.push('');
  lines.push(`${heading} (${findings.length})`);
  if (findings.length === 0) {
    lines.push('  None');
    return;
  }
  for (const finding of findings) {
    const ref = finding.sourceRef ? ` [${finding.sourceRef}]` : '';
    const reason = finding.reason ? ` — ${finding.reason}` : '';
    lines.push(`  • ${finding.entity}${ref}: ${finding.detail}${reason}`);
  }
}

/**
 * A stable, filesystem-safe download filename derived from the source file (or a default), e.g.
 * `schedule.xer` → `schedule-import-report.txt`.
 */
export function reportFilename(report: InterchangeReport): string {
  const base = (report.sourceFilename ?? 'schedule')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'schedule'}-import-report.txt`;
}

/**
 * Download the report as a text file via a temporary object URL and a synthetic `<a download>` click,
 * revoking the URL immediately afterwards. Guarded for a no-DOM environment (no-op), so the module stays
 * import-safe in tests. Kept feature-local (not a cross-feature import of the TSLD export shim) so the
 * interchange feature owns its own IO.
 */
export function downloadReport(report: InterchangeReport): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([formatReportText(report)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFilename(report);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
