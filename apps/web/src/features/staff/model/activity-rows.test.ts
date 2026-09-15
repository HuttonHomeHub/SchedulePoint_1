import { describe, expect, it } from 'vitest';

import type { StaffActivityRow } from '@/features/staff/api/staff-panels';
import { describeActivity, groupActivity } from '@/features/staff/model/activity-rows';

let seq = 0;
const row = (over: Partial<StaffActivityRow> = {}): StaffActivityRow => ({
  id: `r${String((seq += 1))}`,
  occurredAt: '2026-09-14T23:48:04.000Z',
  action: 'staff.panel_read',
  actorLabel: 'ops@schedulepoint.test',
  subjectLabel: 'health',
  ...over,
});

const read = (panel: string, over: Partial<StaffActivityRow> = {}): StaffActivityRow =>
  row({ subjectLabel: panel, ...over });

describe('groupActivity', () => {
  it('collapses one page load into a single row that names every panel and its own size', () => {
    const groups = groupActivity([
      read('performance'),
      read('installation'),
      read('accounts'),
      read('security'),
      read('health'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe('panel-reads');
    expect(groups[0]?.count).toBe(5);
    expect(describeActivity(groups[0]!)).toBe(
      '5 panel reads · performance, installation, accounts, security, health',
    );
  });

  /**
   * **A run ends at any other action**, so the log keeps its chronology. Grouping every panel read
   * on the page into one row would lose the fact that the console was opened separately each time,
   * which is itself an answer somebody may be looking for.
   */
  it('keeps two page loads separate when something happened between them', () => {
    const groups = groupActivity([
      read('health'),
      read('security'),
      row({ action: 'staff.session_started', subjectLabel: null }),
      read('health'),
      read('security'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['panel-reads', 'event', 'panel-reads']);
    expect(groups[0]?.count).toBe(2);
    expect(groups[2]?.count).toBe(2);
  });

  it('never groups reads by different people', () => {
    const groups = groupActivity([
      read('health', { actorLabel: 'a@example.test' }),
      read('security', { actorLabel: 'b@example.test' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.kind === 'event')).toBe(true);
  });

  /** A single read presented as a group would be a summary of nothing. */
  it('leaves a lone read alone', () => {
    const groups = groupActivity([read('health'), row({ action: 'staff.probe_recorded' })]);

    expect(groups[0]?.kind).toBe('event');
    expect(describeActivity(groups[0]!)).toBe('panel read · health');
  });

  /**
   * **The two figures can differ and both are printed.** A run may read the same panel twice; the
   * panel list is distinct, the count is rows, so a reader sees five names over six reads and can
   * tell. Nothing is smoothed over to make the sentence tidier.
   */
  it('names each panel once while counting every row', () => {
    const groups = groupActivity([read('health'), read('security'), read('health')]);

    expect(groups[0]?.count).toBe(3);
    expect(describeActivity(groups[0]!)).toBe('3 panel reads · health, security');
  });

  it('keeps a non-read event exactly as it reads today', () => {
    const groups = groupActivity([
      row({ action: 'staff.probe_recorded', subjectLabel: 'canvas-draw' }),
    ]);

    expect(describeActivity(groups[0]!)).toBe('probe recorded · canvas-draw');
  });

  it('is empty for no rows, and does not invent one', () => {
    expect(groupActivity([])).toEqual([]);
  });
});
