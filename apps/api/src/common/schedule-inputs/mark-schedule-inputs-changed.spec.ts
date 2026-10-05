import { describe, expect, it, vi } from 'vitest';

import { markScheduleInputsChanged } from './mark-schedule-inputs-changed';

function fakeTx() {
  const executeRaw = vi.fn().mockResolvedValue(1);
  return { executeRaw, tx: { $executeRaw: executeRaw } as never };
}

describe('markScheduleInputsChanged', () => {
  it('writes nothing for an empty list', async () => {
    const { tx, executeRaw } = fakeTx();
    await markScheduleInputsChanged(tx, 'org', []);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('passes the ids de-duplicated and in id order, so two multi-plan stamps lock alike', async () => {
    const { tx, executeRaw } = fakeTx();
    await markScheduleInputsChanged(tx, 'org', ['b', 'a', 'b']);
    const [, org, ids] = executeRaw.mock.calls[0] as [unknown, string, string[]];
    expect(org).toBe('org');
    expect(ids).toEqual(['a', 'b']);
  });

  it('locks the rows in id order before updating, and touches no version column', async () => {
    const { tx, executeRaw } = fakeTx();
    await markScheduleInputsChanged(tx, 'org', ['a']);
    const sql = (executeRaw.mock.calls[0] as [string[]])[0].join('?');
    expect(sql).toMatch(/ORDER BY id\s+FOR NO KEY UPDATE/);
    expect(sql).toContain('clock_timestamp()');
    expect(sql).not.toMatch(/updated_at|version/);
  });
});
