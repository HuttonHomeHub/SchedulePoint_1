import { describe, expect, it } from 'vitest';

import { exportSchedule, type ExportFormat } from './export-schedule.js';
import { buildExportGraph, toComparable } from './export.fixtures.js';
import { importSchedule } from './import-schedule.js';

/**
 * Tests for the format-agnostic `exportSchedule` dispatch (ADR-0050 M4b) — the write-direction mirror of
 * `importSchedule`. It must route each `format` to the matching serialiser and, for both, close the round
 * trip (`export → importSchedule → structural equivalence`) over the shared core-network fixture — proving
 * the caller can stay format-blind.
 */

describe('exportSchedule', () => {
  it('detects the format on re-import for each dispatched format', () => {
    for (const [format, expectedFormat] of [
      ['xer', 'XER'],
      ['mspdi', 'MSPDI'],
    ] as const) {
      const exported = exportSchedule({ graph: buildExportGraph(), format });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      expect(exported.report.detectedFormat).toBe(expectedFormat);

      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      expect(reimported.report.detectedFormat).toBe(expectedFormat);
    }
  });

  it('round-trips the core network through each format', () => {
    const original = buildExportGraph();
    for (const format of ['xer', 'mspdi'] as ExportFormat[]) {
      const exported = exportSchedule({ graph: original, format });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;

      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      expect(toComparable(reimported.graph)).toEqual(toComparable(original));
    }
  });
});
