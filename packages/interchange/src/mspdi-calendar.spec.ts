import { describe, expect, it } from 'vitest';

import { parseMspdiCalendar } from './mspdi-calendar.js';
import { childElements, parseMspdi, type MspdiElement } from './mspdi-parser.js';
import { buildMspdi, standardWeekDays, type MspdiCalendarSpec } from './mspdi.fixtures.js';

/**
 * Tests for the pure MSPDI `<Calendar>` work-pattern parser (Task 3.3), focused on the parts the wider
 * adapter suite does not exercise directly: multi-day `<TimePeriod>` expansion, the per-range day bound,
 * and — the security-review fold — the **total** per-calendar exception ceiling that keeps the read-only
 * dry-run memory-bounded against a hostile file packed with maximal exception ranges (ADR-0050).
 */

/** Build one `<Calendar>` fixture and hand back its parsed `<Calendar>` MspdiElement. */
function calendarElement(cal: MspdiCalendarSpec): MspdiElement {
  const parsed = parseMspdi(buildMspdi({ name: 'Cal test', calendars: [cal] }));
  if (!parsed.ok) throw new Error(`fixture did not parse: ${parsed.error.code}`);
  const project = parsed.document.project;
  const container = childElements(project, 'Calendars')[0];
  if (container === undefined) throw new Error('no <Calendars> in fixture');
  const element = childElements(container, 'Calendar')[0];
  if (element === undefined) throw new Error('no <Calendar> in fixture');
  return element;
}

describe('parseMspdiCalendar', () => {
  it('reads a standard base week', () => {
    const result = parseMspdiCalendar(
      calendarElement({ uid: 'C1', name: 'Standard', weekDays: standardWeekDays() }),
      'C1',
    );

    expect(result.hasWorkingTime).toBe(true);
    expect(result.exceptions).toHaveLength(0);
    expect(result.workWeek.monday).toEqual([{ start: '08:00', end: '16:00' }]);
    expect(result.workWeek.sunday).toEqual([]);
  });

  it('expands a multi-day exception <TimePeriod> to one exception per day', () => {
    const result = parseMspdiCalendar(
      calendarElement({
        uid: 'C1',
        weekDays: standardWeekDays(),
        exceptions: [{ fromDate: '2026-01-01T00:00:00', toDate: '2026-01-03T00:00:00' }],
      }),
      'C1',
    );

    expect(result.exceptions.map((exception) => exception.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(result.findings).toHaveLength(0);
  });

  it('truncates a single hostile range and reports the drop', () => {
    const result = parseMspdiCalendar(
      calendarElement({
        uid: 'C1',
        weekDays: standardWeekDays(),
        // ~9 years — far beyond the 750-day per-range bound.
        exceptions: [{ fromDate: '2000-01-01T00:00:00', toDate: '2009-01-01T00:00:00' }],
      }),
      'C1',
    );

    expect(result.exceptions).toHaveLength(750);
    expect(result.findings.some((finding) => /truncated/.test(finding.detail))).toBe(true);
  });

  it('caps the TOTAL exceptions across many maximal ranges and fails closed', () => {
    // 30 maximal (~9-year) ranges each truncate to 750 days → 22,500 uncapped, well over the 20,000 total
    // ceiling. Without the total cap this is the memory-amplification DoS the security review flagged.
    const exceptions = Array.from({ length: 30 }, (_unused, index) => ({
      fromDate: `${2000 + index * 10}-01-01T00:00:00`,
      toDate: `${2009 + index * 10}-01-01T00:00:00`,
    }));

    const result = parseMspdiCalendar(
      calendarElement({ uid: 'C1', weekDays: standardWeekDays(), exceptions }),
      'C1',
    );

    expect(result.exceptions.length).toBe(20_000);
    expect(result.findings.some((finding) => /capped/.test(finding.detail))).toBe(true);
  });
});
