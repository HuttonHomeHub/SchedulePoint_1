import type { Prisma, Resource } from '@prisma/client';
import { RESOURCE_TREE_MAX_DEPTH } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';

import { assertValidResourceParent, resolveActiveSubtreeIds } from './resource-tree.guard';
import type { ResourceRepository } from './resource.repository';

const ORG_ID = 'org-1';
const OTHER_ORG = 'org-2';

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'res-1',
    organizationId: ORG_ID,
    name: 'Crew A',
    code: null,
    description: null,
    kind: 'LABOUR',
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    archivedAt: null,
    calendarId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    updatedBy: 'user-1',
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

/**
 * A repository stub backed by an in-memory tree, so the walks are exercised against real shapes
 * (chains, branches, cycles) rather than a single canned answer.
 */
function repositoryOver(rows: Resource[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    findActiveByIdInOrg: vi.fn((id: string, organizationId: string) => {
      const row = byId.get(id);
      // Mirrors the real repository: org-scoped, so a foreign row is simply absent (never a leak).
      return Promise.resolve(row && row.organizationId === organizationId ? row : null);
    }),
    findActiveChildIdsOf: vi.fn((parentIds: readonly string[], organizationId: string) =>
      Promise.resolve(
        rows
          .filter(
            (row) =>
              row.parentId !== null &&
              parentIds.includes(row.parentId) &&
              row.organizationId === organizationId,
          )
          .map((row) => row.id),
      ),
    ),
  } as unknown as ResourceRepository;
}

const TX = {} as Prisma.TransactionClient;

describe('resource-tree guard (ADR-0053 §3)', () => {
  describe('assertValidResourceParent', () => {
    it('accepts an active GROUP in the same organisation', async () => {
      const repo = repositoryOver([
        resource({ id: 'grp', kind: 'GROUP' }),
        resource({ id: 'leaf' }),
      ]);
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: 'grp',
          organizationId: ORG_ID,
          selfId: 'leaf',
        }),
      ).resolves.toBeUndefined();
    });

    it('rejects a resource parenting ITSELF as a cycle (409), before any query', async () => {
      const repo = repositoryOver([resource({ id: 'grp', kind: 'GROUP' })]);
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: 'grp',
          organizationId: ORG_ID,
          selfId: 'grp',
        }),
      ).rejects.toMatchObject({ details: { reason: 'RESOURCE_PARENT_CYCLE' } });
      // Short-circuited: the trivial cycle costs no round-trip (and ck_resources_parent_not_self
      // is the DB backstop behind it).
      expect(repo.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('rejects a parent inside the resource’s OWN subtree as a cycle (409)', async () => {
      // top(GROUP) → mid(GROUP) → leaf. Moving `top` under `mid` would close a loop.
      const repo = repositoryOver([
        resource({ id: 'top', kind: 'GROUP' }),
        resource({ id: 'mid', kind: 'GROUP', parentId: 'top' }),
        resource({ id: 'leaf', parentId: 'mid' }),
      ]);
      const error = await assertValidResourceParent(TX, repo, {
        parentId: 'mid',
        organizationId: ORG_ID,
        selfId: 'top',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({ details: { reason: 'RESOURCE_PARENT_CYCLE' } });
    });

    it('404s for a parent in ANOTHER organisation — never a cross-tenant existence oracle', async () => {
      const repo = repositoryOver([
        resource({ id: 'foreign', kind: 'GROUP', organizationId: OTHER_ORG }),
      ]);
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: 'foreign',
          organizationId: ORG_ID,
          selfId: 'leaf',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('404s for an unknown or soft-deleted parent (indistinguishable from missing)', async () => {
      const repo = repositoryOver([]);
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: 'ghost',
          organizationId: ORG_ID,
          selfId: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects a parent that is not a GROUP (422 RESOURCE_PARENT_NOT_GROUP)', async () => {
      const repo = repositoryOver([resource({ id: 'crew', kind: 'LABOUR' })]);
      const error = await assertValidResourceParent(TX, repo, {
        parentId: 'crew',
        organizationId: ORG_ID,
        selfId: null,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ details: { reason: 'RESOURCE_PARENT_NOT_GROUP' } });
    });

    it('fails closed (422 RESOURCE_PARENT_WRONG_SCOPE) if a repository ever returns a cross-org parent', async () => {
      // Unreachable over HTTP — the repository already scopes by org. This asserts the guard's own
      // same-org re-check, so a future caller passing a loosened repository cannot nest across
      // tenants silently.
      const repo = {
        findActiveByIdInOrg: vi
          .fn()
          .mockResolvedValue(resource({ id: 'grp', kind: 'GROUP', organizationId: OTHER_ORG })),
        findActiveChildIdsOf: vi.fn().mockResolvedValue([]),
      } as unknown as ResourceRepository;
      const error = await assertValidResourceParent(TX, repo, {
        parentId: 'grp',
        organizationId: ORG_ID,
        selfId: null,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ details: { reason: 'RESOURCE_PARENT_WRONG_SCOPE' } });
    });

    it('rejects a nesting that would exceed the depth cap (422 RESOURCE_TREE_TOO_DEEP)', async () => {
      // A chain of exactly RESOURCE_TREE_MAX_DEPTH groups: nesting one more leaf under the deepest
      // would make the tree 11 levels.
      const chain = Array.from({ length: RESOURCE_TREE_MAX_DEPTH }, (_, i) =>
        resource({
          id: `g${i}`,
          kind: 'GROUP',
          parentId: i === 0 ? null : `g${i - 1}`,
        }),
      );
      const repo = repositoryOver([...chain, resource({ id: 'leaf' })]);
      const error = await assertValidResourceParent(TX, repo, {
        parentId: `g${RESOURCE_TREE_MAX_DEPTH - 1}`,
        organizationId: ORG_ID,
        selfId: 'leaf',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({
        details: { reason: 'RESOURCE_TREE_TOO_DEEP', maxDepth: RESOURCE_TREE_MAX_DEPTH },
      });
    });

    it('measures depth as parent-depth PLUS the moved subtree’s height, not ancestors alone', async () => {
      // Two 5-deep chains. Moving the root of one under the deepest node of the other lands at 10 —
      // legal — while moving it one level deeper would be 11. An ancestors-only check would wave
      // both through, which is exactly the hole this asserts is closed.
      const half = RESOURCE_TREE_MAX_DEPTH / 2;
      const left = Array.from({ length: half }, (_, i) =>
        resource({ id: `l${i}`, kind: 'GROUP', parentId: i === 0 ? null : `l${i - 1}` }),
      );
      const right = Array.from({ length: half + 1 }, (_, i) =>
        resource({ id: `r${i}`, kind: 'GROUP', parentId: i === 0 ? null : `r${i - 1}` }),
      );
      const repo = repositoryOver([...left, ...right]);

      // depth(l4)=5 + height(r0 subtree)=6 ⇒ 11 > 10, rejected.
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: `l${half - 1}`,
          organizationId: ORG_ID,
          selfId: 'r0',
        }),
      ).rejects.toMatchObject({ details: { reason: 'RESOURCE_TREE_TOO_DEEP' } });

      // depth(l3)=4 + height=6 ⇒ 10, exactly at the cap, allowed.
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: `l${half - 2}`,
          organizationId: ORG_ID,
          selfId: 'r0',
        }),
      ).resolves.toBeUndefined();
    });

    it('creating under a deep group measures a height of 1 (there is no subtree yet)', async () => {
      const chain = Array.from({ length: RESOURCE_TREE_MAX_DEPTH - 1 }, (_, i) =>
        resource({ id: `g${i}`, kind: 'GROUP', parentId: i === 0 ? null : `g${i - 1}` }),
      );
      const repo = repositoryOver(chain);
      await expect(
        assertValidResourceParent(TX, repo, {
          parentId: `g${RESOURCE_TREE_MAX_DEPTH - 2}`,
          organizationId: ORG_ID,
          selfId: null,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('resolveActiveSubtreeIds', () => {
    it('returns the root alone for a leaf', async () => {
      const repo = repositoryOver([resource({ id: 'leaf' })]);
      await expect(resolveActiveSubtreeIds(TX, repo, 'leaf', ORG_ID)).resolves.toEqual(['leaf']);
    });

    it('returns the whole branch breadth-first, one query per level', async () => {
      const repo = repositoryOver([
        resource({ id: 'root', kind: 'GROUP' }),
        resource({ id: 'a', kind: 'GROUP', parentId: 'root' }),
        resource({ id: 'b', parentId: 'root' }),
        resource({ id: 'c', parentId: 'a' }),
        // A sibling branch that must NOT be swept.
        resource({ id: 'other', kind: 'GROUP' }),
        resource({ id: 'other-child', parentId: 'other' }),
      ]);
      const ids = await resolveActiveSubtreeIds(TX, repo, 'root', ORG_ID);
      expect(ids.sort()).toEqual(['a', 'b', 'c', 'root']);
      // 3 levels of children (root → {a,b} → {c} → {}), never one query per node.
      expect(repo.findActiveChildIdsOf).toHaveBeenCalledTimes(3);
    });
  });
});
