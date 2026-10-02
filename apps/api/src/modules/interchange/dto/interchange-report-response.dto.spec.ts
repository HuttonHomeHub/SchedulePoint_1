import { interchangeReportStrictSchema, REPORT_SENTENCE_MAX_LENGTH } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import { InterchangeReportResponseDto } from './interchange-report-response.dto';

describe('InterchangeReportResponseDto.from (TECH_DEBT #399)', () => {
  it('truncates an over-long finding the API added after the importer, rather than refusing it', () => {
    const dto = InterchangeReportResponseDto.from({
      detectedFormat: 'XER',
      sourceVersion: null,
      sourceFilename: null,
      mapped: { activities: 1, relationships: 0, calendars: 0 },
      approximations: [],
      repairs: [
        {
          kind: 'repair',
          entity: 'calendar',
          sourceRef: null,
          detail: 'x'.repeat(REPORT_SENTENCE_MAX_LENGTH + 500),
        },
      ],
      drops: [],
    });

    expect(dto.repairs[0]?.detail).toHaveLength(REPORT_SENTENCE_MAX_LENGTH);
    expect(interchangeReportStrictSchema.safeParse(dto).success).toBe(true);
  });
});
