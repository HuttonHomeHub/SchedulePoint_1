import type { InterchangeReport } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import { formatReportText, reportFilename } from './report-download';

function report(overrides: Partial<InterchangeReport> = {}): InterchangeReport {
  return {
    detectedFormat: 'XER',
    sourceVersion: '19.12',
    sourceFilename: 'my project.xer',
    mapped: { activities: 214, relationships: 231, calendars: 3 },
    approximations: [
      {
        kind: 'approximation',
        entity: 'activity',
        sourceRef: 'A1010',
        detail: 'lag "3d" → 4320min',
      },
    ],
    repairs: [
      {
        kind: 'repair',
        entity: 'relationship',
        sourceRef: null,
        detail: 'edge A→B dropped',
        reason: 'unknown successor',
      },
    ],
    drops: [],
    ...overrides,
  };
}

describe('formatReportText', () => {
  it('lists the counts and every finding line with its reason', () => {
    const text = formatReportText(report());
    expect(text).toContain('Activities:     214');
    expect(text).toContain('Relationships:  231');
    expect(text).toContain('Approximations (1)');
    expect(text).toContain('lag "3d" → 4320min');
    expect(text).toContain('Repairs (1)');
    expect(text).toContain('edge A→B dropped — unknown successor');
    expect(text).toContain('Dropped (0)');
    expect(text).toContain('None');
  });
});

describe('reportFilename', () => {
  it('derives a filesystem-safe .txt name from the source filename', () => {
    expect(reportFilename(report())).toBe('my-project-import-report.txt');
  });

  it('falls back to a default when no source filename is present', () => {
    expect(reportFilename(report({ sourceFilename: null }))).toBe('schedule-import-report.txt');
  });
});
