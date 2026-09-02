import { describe, expect, it } from 'vitest';

import { batchRestoreAnchor } from './batch-restore-anchor';

/**
 * **A cascade batch must be anchored on its root** (`docs/TECH_DEBT.md` #230).
 *
 * Every case is stated **child-first**, deliberately. The defect was that `restoreDeleteBatch` took
 * `ids[0]` from a `findMany` with no `orderBy`, so whether a restore worked depended on the order
 * Postgres happened to return rows in — and asserting against that order is asserting against
 * nothing. Handing the function a child-first list makes the old behaviour fail deterministically,
 * on the machine, with no database involved.
 *
 * Verified red against `(members) => members[0]?.id`: the first three cases return the child.
 */

/** `parentId` is the WBS parent (ADR-0038) — the field `assertParentActive` reads for an activity. */
function row(id: string, parentId: string | null): { id: string; parentId: string | null } {
  return { id, parentId };
}

describe('batchRestoreAnchor', () => {
  it('picks the summary, not a child, in a cascade batch listed child-first', () => {
    // A phase and the two activities filed under it, deleted together.
    const members = [
      row('b-child', 'a-summary'),
      row('c-child', 'a-summary'),
      row('a-summary', null),
    ];
    expect(batchRestoreAnchor(members)).toBe('a-summary');
  });

  it('walks past an intermediate summary to the batch root', () => {
    // summary → sub-phase → leaf, all in one batch, listed deepest first.
    const members = [row('c-leaf', 'b-sub'), row('b-sub', 'a-root'), row('a-root', null)];
    expect(batchRestoreAnchor(members)).toBe('a-root');
  });

  /**
   * The root is not always `parentId === null`: a phase filed under ANOTHER phase that is still
   * active is a perfectly ordinary cascade root, and its parent is outside the batch. A rule
   * written as "the one with no parent" would find nothing here and fall through.
   */
  it('treats a member whose parent is outside the batch as a root', () => {
    const members = [row('c-leaf', 'b-summary'), row('b-summary', 'untouched-parent')];
    expect(batchRestoreAnchor(members)).toBe('b-summary');
  });

  /**
   * An ADR-0080 bulk delete stamps ONE batch across unrelated activities, so several members are
   * eligible. Any of them passes the guard; the sort is so a failure reproduces, not because the
   * choice matters.
   */
  it('is deterministic when a batch has several eligible roots', () => {
    const members = [row('z-one', null), row('a-two', null), row('m-three', null)];
    expect(batchRestoreAnchor(members)).toBe('a-two');
    expect(batchRestoreAnchor([...members].reverse())).toBe('a-two');
  });

  it('handles the leaf batch that has always worked', () => {
    expect(batchRestoreAnchor([row('only', null)])).toBe('only');
    expect(batchRestoreAnchor([row('only', 'active-summary')])).toBe('only');
  });

  it('returns undefined for an empty batch, so the caller can 404', () => {
    expect(batchRestoreAnchor([])).toBeUndefined();
  });

  /**
   * Every parent inside the batch is a cycle, which ADR-0021 and ADR-0038 both forbid. Rather than
   * invent a failure mode for a state that cannot exist, it falls back deterministically and lets
   * the restore guard report `PARENT_DELETED` exactly as it does today.
   */
  it('falls back rather than throwing on a batch with no root', () => {
    const members = [row('b', 'a'), row('a', 'b')];
    expect(batchRestoreAnchor(members)).toBe('a');
  });
});
