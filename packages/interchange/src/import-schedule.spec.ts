import { describe, expect, it } from 'vitest';

import { importSchedule } from './import-schedule.js';

/** Minimal well-formed fixtures for each format — enough to exercise detection + routing, not mapping. */
const MINIMAL_XER = ['ERMHDR\t18.8', '%T\tPROJECT', '%F\tproj_id', '%R\tP1', '%E'].join('\n');
const MINIMAL_MSPDI =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Project xmlns="http://schemas.microsoft.com/project"><Name>P</Name></Project>';

describe('importSchedule — format detection + routing', () => {
  it('routes a Primavera XER to the XER pipeline (detectedFormat XER)', () => {
    const result = importSchedule({ content: MINIMAL_XER });
    // The minimal XER has no data date → the XER pipeline rejects it, but as an XER (proving it routed).
    if (result.ok) {
      expect(result.report.detectedFormat).toBe('XER');
    } else {
      expect(result.error.stage).not.toBe('parse'); // got past detection into the XER adapter
    }
  });

  it('routes an MSPDI document to the MSPDI pipeline', () => {
    const result = importSchedule({ content: MINIMAL_MSPDI });
    if (result.ok) {
      expect(result.report.detectedFormat).toBe('MSPDI');
    } else {
      // Rejected by the MSPDI pipeline (no tasks/project data), not by the unified detector.
      expect(result.error.code).not.toBe('UNRECOGNISED_FORMAT');
    }
  });

  it('rejects an unrecognised file with a single user-safe error', () => {
    const result = importSchedule({ content: 'this is neither an xer nor mspdi file' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('parse');
      expect(result.error.code).toBe('UNRECOGNISED_FORMAT');
    }
  });
});
