import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every hierarchy delete must invalidate the recycle bin.**
 *
 * A soft delete does not remove a row — it moves it, out of one list and INTO another. The three
 * delete hooks invalidated only the list the row left, so once a session had opened Recently
 * deleted, every later delete served the cached list: the screen said "Nothing has been deleted"
 * while a toast on top of it said a client had just been deleted. That is the one screen whose
 * whole job is telling somebody their work is recoverable, telling them it is not.
 *
 * Found by the ADR-0096 journey, because it is the only thing in the repository that deletes,
 * navigates away, comes back and deletes again — the sequence a planner takes and no unit test
 * mounting one screen ever does.
 *
 * **A source-reading test rather than a behavioural one**, and the limit is stated rather than
 * implied: it proves the call is written, not that TanStack Query then refetches. What it catches
 * is the case that actually happened — a fourth deletable entity arriving with one invalidation
 * copied from its neighbour, which is the ADR-0064 §7 shape this register keeps recording.
 */
const HOOKS = [
  ['features/clients/api/use-clients.ts', 'useDeleteClient'],
  ['features/projects/api/use-projects.ts', 'useDeleteProject'],
  ['features/plans/api/use-plans.ts', 'useDeletePlan'],
] as const;

const WEB_SRC = join(__dirname, '..', '..');

/** The body of one exported hook, comments stripped. */
function hookBody(relative: string, name: string): string {
  const source = readFileSync(join(WEB_SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const start = source.indexOf(`export function ${name}`);
  expect(start, `${relative}: ${name} not found`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('a soft delete moves a row into the recycle bin', () => {
  it.each(HOOKS)('%s → %s invalidates the deleted-items list', (relative, name) => {
    expect(hookBody(relative, name)).toContain('deletedItemKeys.all(orgSlug)');
  });

  it('and the restore that takes it back out invalidates it too', () => {
    // The half that was already right, pinned so a future tidy-up cannot make the two halves
    // disagree in the other direction.
    expect(
      hookBody('features/recently-deleted/api/use-deleted-items.ts', 'useRestoreItem'),
    ).toContain('deletedItemKeys.all(orgSlug)');
  });
});
