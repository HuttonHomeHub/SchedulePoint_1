import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { CodeAssignmentRepository, loadActivityCodes } from './code-assignment.repository';

const SCOPE = { organizationId: 'org-1', planId: 'plan-1' };

const db = (anyType: { id: string } | null, rows: unknown[]) => {
  const findFirst = vi.fn().mockResolvedValue(anyType);
  const queryRaw = vi.fn().mockResolvedValue(rows);
  return {
    mock: { findFirst, queryRaw },
    db: { codeType: { findFirst }, $queryRaw: queryRaw } as unknown as Parameters<
      typeof loadActivityCodes
    >[0],
  };
};

describe('loadActivityCodes', () => {
  it('answers null, and reads nothing, for an empty page', async () => {
    const { db: client, mock } = db({ id: 't' }, []);
    expect(await loadActivityCodes(client, SCOPE, [])).toBeNull();
    expect(mock.findFirst).not.toHaveBeenCalled();
    expect(mock.queryRaw).not.toHaveBeenCalled();
  });

  it('answers null when the plan has no live code type, so the response carries no codes key', async () => {
    const { db: client } = db(null, []);
    expect(await loadActivityCodes(client, SCOPE, ['a1', 'a2'])).toBeNull();
  });

  it('scopes the type probe by organisation, plan and deletedAt', async () => {
    const { db: client, mock } = db({ id: 't' }, []);
    await loadActivityCodes(client, SCOPE, ['a1']);
    expect(mock.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', planId: 'plan-1', deletedAt: null },
      select: { id: true },
    });
  });

  it('gives every activity of the page an entry, [] for one with no value', async () => {
    const { db: client } = db({ id: 't' }, [
      { activityId: 'a1', codeTypeId: 'area', codeValueId: 'l1' },
      { activityId: 'a1', codeTypeId: 'trade', codeValueId: 'mech' },
    ]);
    const codes = await loadActivityCodes(client, SCOPE, ['a1', 'a2']);
    expect(codes?.get('a1')).toEqual([
      { codeTypeId: 'area', codeValueId: 'l1' },
      { codeTypeId: 'trade', codeValueId: 'mech' },
    ]);
    expect(codes?.get('a2')).toEqual([]);
  });

  it('issues one assignments statement for the whole page, never one per activity', async () => {
    const { db: client, mock } = db({ id: 't' }, []);
    await loadActivityCodes(client, SCOPE, ['a1', 'a2', 'a3', 'a4']);
    expect(mock.queryRaw).toHaveBeenCalledOnce();
  });

  it('joins the assignment to a live value and a live type, so a deleted one reads as none', async () => {
    const { db: client, mock } = db({ id: 't' }, []);
    await loadActivityCodes(client, SCOPE, ['a1']);
    const text = (mock.queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('?');
    expect(text).toMatch(
      /JOIN code_values v ON v\.id = cva\.code_value_id AND v\.deleted_at IS NULL/,
    );
    expect(text).toMatch(
      /JOIN code_types t ON t\.id = cva\.code_type_id AND t\.deleted_at IS NULL/,
    );
  });
});

describe('CodeAssignmentRepository', () => {
  const tx = () => {
    const executeRaw = vi.fn().mockResolvedValue(0);
    return {
      executeRaw,
      client: { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient,
    };
  };
  const repository = new CodeAssignmentRepository();

  it('issues no statement for nothing to set or clear', async () => {
    const { executeRaw, client } = tx();
    await repository.upsertMany('org-1', 'plan-1', [], client);
    await repository.deleteMany('plan-1', [], client);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('upserts the whole batch in one statement, on the (plan, activity, type) key', async () => {
    const { executeRaw, client } = tx();
    await repository.upsertMany(
      'org-1',
      'plan-1',
      [
        { activityId: 'a1', codeTypeId: 'area', codeValueId: 'l1' },
        { activityId: 'a2', codeTypeId: 'area', codeValueId: 'l2' },
      ],
      client,
    );
    expect(executeRaw).toHaveBeenCalledOnce();
    const text = (executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('?');
    expect(text).toContain('ON CONFLICT (plan_id, activity_id, code_type_id)');
    // The organisation and plan are the caller's, as parameters, never columns of the batch.
    expect(executeRaw.mock.calls[0]).toContain('org-1');
    expect(executeRaw.mock.calls[0]).toContain('plan-1');
  });

  it('deletes the whole batch in one statement, scoped to the plan', async () => {
    const { executeRaw, client } = tx();
    await repository.deleteMany(
      'plan-1',
      [
        { activityId: 'a1', codeTypeId: 'area' },
        { activityId: 'a2', codeTypeId: 'trade' },
      ],
      client,
    );
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(executeRaw.mock.calls[0]).toContain('plan-1');
  });
});
