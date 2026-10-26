import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { NoteRepository } from './note.repository';

/**
 * The reads an export makes (notes-through-interchange M2). They are pinned by what they ask the
 * database for, because the failures that matter are invisible in the result a happy-path test sees: a
 * query that forgot the soft-delete filter returns the same rows until somebody deletes a note, and a
 * query that also selected the author returns the same body.
 */
function repository(pages: { id: string; activityId: string | null; body: string }[][] = [[]]) {
  const findMany = vi.fn();
  for (const page of pages) findMany.mockResolvedValueOnce(page);
  findMany.mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const prisma = { note: { findMany, count } } as unknown as PrismaService;
  return { repository: new NoteRepository(prisma), findMany, count };
}

const LIMITS = { maxNotes: 100, maxBytes: 1_000_000 };
const row = (n: number, body = `note ${String(n)}`) => ({
  id: `n${String(n)}`,
  activityId: 'a1',
  body,
});

describe('NoteRepository.findActiveActivityNotesForExport', () => {
  it('states the soft-delete filter, the live activity, and the org, plan and kind scope', async () => {
    const { repository: repo, findMany } = repository();
    await repo.findActiveActivityNotesForExport('org-1', 'plan-1', LIMITS);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      organizationId: 'org-1',
      planId: 'plan-1',
      entityType: 'ACTIVITY',
      activity: { deletedAt: null },
      deletedAt: null,
    });
  });

  it('reads the body, its activity and a paging id, and nothing about who wrote it', async () => {
    const { repository: repo, findMany } = repository();
    await repo.findActiveActivityNotesForExport('org-1', 'plan-1', LIMITS);
    expect(findMany.mock.calls[0]?.[0].select).toEqual({ id: true, activityId: true, body: true });
  });

  it('orders by creation then id', async () => {
    const { repository: repo, findMany } = repository();
    await repo.findActiveActivityNotesForExport('org-1', 'plan-1', LIMITS);
    expect(findMany.mock.calls[0]?.[0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('pages with a cursor until a short page, and is not truncated', async () => {
    const full = Array.from({ length: 500 }, (_, i) => row(i));
    const { repository: repo, findMany } = repository([full, [row(500)]]);
    const result = await repo.findActiveActivityNotesForExport('org-1', 'plan-1', {
      maxNotes: 10_000,
      maxBytes: 10_000_000,
    });
    expect(result.notes).toHaveLength(501);
    expect(result.truncated).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ cursor: { id: 'n499' }, skip: 1 });
  });

  it('stops at the note ceiling and says it was truncated', async () => {
    const { repository: repo } = repository([[row(1), row(2), row(3)]]);
    const result = await repo.findActiveActivityNotesForExport('org-1', 'plan-1', {
      maxNotes: 2,
      maxBytes: 1_000,
    });
    expect(result.notes.map((n) => n.body)).toEqual(['note 1', 'note 2']);
    expect(result.truncated).toBe(true);
  });

  it('stops before the note that would pass the byte budget, counting UTF-8 bytes', async () => {
    // "é" is two bytes: three notes of five of them are ten bytes each.
    const { repository: repo } = repository([[row(1, 'ééééé'), row(2, 'ééééé'), row(3, 'ééééé')]]);
    const result = await repo.findActiveActivityNotesForExport('org-1', 'plan-1', {
      maxNotes: 10,
      maxBytes: 25,
    });
    expect(result.notes).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe('NoteRepository.countActiveForPlan', () => {
  it('counts plan notes that are active', async () => {
    const { repository: repo, count } = repository();
    await repo.countActiveForPlan('org-1', 'plan-1', 'PLAN');
    expect(count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', planId: 'plan-1', entityType: 'PLAN', deletedAt: null },
    });
  });

  it('counts activity notes over the same population the export reads', async () => {
    const { repository: repo, count, findMany } = repository();
    await repo.countActiveForPlan('org-1', 'plan-1', 'ACTIVITY');
    await repo.findActiveActivityNotesForExport('org-1', 'plan-1', LIMITS);
    expect(count.mock.calls[0]?.[0].where).toEqual(findMany.mock.calls[0]?.[0].where);
  });
});
