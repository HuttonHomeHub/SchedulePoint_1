import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fixturePath, loadFixture } from './load.js';

/**
 * The JSON↔CSV consistency gate (fix-slice M-E, TECH_DEBT #205a). The vendored fixture exists
 * twice: `p6_torture_test_v1.json` (what the loaders and the seeder read) and `csv/*.csv` (the
 * human-auditable view). Both are emitted by `fixtures/tools/generate_fixture.py`, but the CSVs
 * were hand-edited once during the CAL-05 amendment — and a calendar whose CSV row says one
 * window while the JSON says another is exactly the drift ADR-0058 exists to gate: a reviewer
 * audits the CSV, the engine schedules the JSON, and the two disagree silently.
 *
 * The gate parses `csv/calendars.csv` in full and asserts every row agrees with the JSON
 * calendar of the same id on every column the CSV carries. Verified red by de-syncing CAL-05's
 * date_range in a scratch copy of the CSV parser's input (see the M-E notes).
 */

/** Minimal RFC-4180 parser — quoted fields, doubled quotes, CRLF; enough for the vendored CSVs. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

describe('fixture JSON ↔ csv/calendars.csv consistency', () => {
  const fixture = loadFixture();
  const csv = parseCsv(readFileSync(fixturePath('csv/calendars.csv'), 'utf8'));
  const header = csv[0] ?? [];
  const dataRows = csv.slice(1);

  it('the CSV carries the columns this gate compares', () => {
    expect(header).toEqual([
      'id',
      'name',
      'type',
      'hours_per_day',
      'hours_per_week',
      'workweek',
      'exceptions',
      'test_tags',
    ]);
  });

  it('lists exactly the calendars the JSON holds — none missing, none extra', () => {
    expect(dataRows.map((r) => r[0]).sort()).toEqual(fixture.calendars.map((c) => c.id).sort());
  });

  it.each(dataRows.map((r) => [r[0], r] as const))(
    'calendar %s agrees with the JSON on every CSV column',
    (id, row) => {
      const cal = fixture.calendars.find((c) => c.id === id);
      expect(cal).toBeDefined();
      if (!cal) return;
      const get = (col: string): string => {
        const idx = header.indexOf(col);
        expect(idx).toBeGreaterThanOrEqual(0);
        return row[idx] ?? '';
      };
      expect(get('name')).toBe(cal.name);
      expect(get('type')).toBe(cal.type);
      expect(Number(get('hours_per_day'))).toBe(cal.hours_per_day);
      expect(Number(get('hours_per_week'))).toBe(cal.hours_per_week);
      // The embedded JSON columns compare as VALUES, not strings — the generator and a hand edit
      // are allowed to disagree about whitespace, never about a window.
      expect(JSON.parse(get('workweek'))).toEqual(cal.workweek);
      expect(JSON.parse(get('exceptions'))).toEqual(cal.exceptions ?? []);
      expect(get('test_tags').split(';').filter(Boolean)).toEqual(cal.test_tags ?? []);
    },
  );
});
