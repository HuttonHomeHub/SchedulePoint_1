import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The detail counts stay off the LIST routes, and off `_count`.
 *
 * **Why this is a gate and not a comment.** `ClientResponseDto implements ClientSummary` and is
 * returned by both `list()` and `get()`, so a count added to that class appears on the list route
 * **without anyone choosing it** — the default outcome is the bad one. Measured by
 * `database-architect` at 2,124 clients / 50,004 projects: Prisma's `_count` on a page emits a
 * grouped subquery with no client restriction, `Seq Scan on projects` over the whole child table,
 * **14.509 ms against 0.034 ms**, and `clients_organization_id_created_at_id_idx` gone from the
 * plan. The cost stops being O(page) and becomes O(all projects in the installation), which is the
 * pagination ceasing to work rather than merely getting slower.
 *
 * `falsification.md` FC-9(b) states the same thing as a plan-shape condition on a real database.
 * This is the cheap half: it fails in CI, before anyone runs a harness.
 *
 * **Its blind spot, stated rather than left to be discovered.** It reads source text, so it cannot
 * see a count reaching the list through a helper it does not name, and it cannot see a count that
 * is correct-shaped and wrong. What it does catch is the two edits a later reader would most
 * plausibly make: moving a count field onto the shared DTO, and reaching for `_count` because the
 * design note once said to.
 */

const ROOT = join(__dirname, '../..');

function source(relative: string): string {
  // Comments stripped: this file's own subject is a set of identifiers, and a docblock explaining
  // why `_count` was rejected contains the word `_count`. Four gates in this repository have
  // matched their own prose (`docs/TECH_DEBT.md` #222); the remedy is now standard.
  return readFileSync(join(ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const COUNT_FIELDS = ['projectCount', 'planCount', 'activityCount'];

describe('the detail counts are not on the list DTOs', () => {
  it.each([
    ['modules/clients/dto/client-response.dto.ts'],
    ['modules/projects/dto/project-response.dto.ts'],
  ])('%s declares no child count', (relative) => {
    const text = source(relative);
    for (const field of COUNT_FIELDS) {
      expect(
        text,
        `${relative} must not carry ${field} — the list route returns this class`,
      ).not.toContain(field);
    }
  });

  it('the detail DTOs DO declare them — so the assertion above is about placement, not absence', () => {
    // The pinned positive case (ADR-0093). Without it, deleting both detail DTOs satisfies every
    // assertion in this file perfectly, and a green run could not tell "correctly placed" from
    // "gone". It earned that on its first full run: it went red the moment FC-9 withdrew a count,
    // which is the gate distinguishing the two states exactly as intended.
    expect(source('modules/clients/dto/client-detail-response.dto.ts')).toContain('projectCount');

    const project = source('modules/projects/dto/project-detail-response.dto.ts');
    expect(project).toContain('planCount');
    expect(project).toContain('activityCount');
  });

  it('a client carries NO plan count — withdrawn by FC-9, not omitted by accident', () => {
    /**
     * A count of plans across a client's projects was built and measured as a `Seq Scan on
     * projects` at 500 projects of 2,000 — 4.12 ms, and O(projects in the installation) rather than
     * O(this client), which is the property FC-9(b) refuses whatever the timing says.
     *
     * Asserted rather than left as an absence, because re-adding it is the natural thing for a
     * later reader to do: the field reads as an obvious companion to `projectCount`, the type would
     * accept it, and nothing else in the tree would object. `clients.e2e-spec.ts` asserts the same
     * thing over the wire, on a fixture holding exactly the plans that would make one look right.
     */
    expect(source('modules/clients/dto/client-detail-response.dto.ts')).not.toContain('planCount');
    expect(source('modules/clients/client.repository.ts')).not.toContain('countActivePlans(');
  });
});

describe('the counts use count() with a relation filter, never _count', () => {
  it.each([['modules/clients/client.repository.ts'], ['modules/projects/project.repository.ts']])(
    '%s issues no _count',
    (relative) => {
      /**
       * `_count` is not a style preference here, it is a capability limit: it takes **direct relation
       * fields only** (a nested selection is rejected at runtime with `SelectionSetOnScalar`), and
       * two of this epic's four counts are two-level — a plan hangs off a project, an activity off a
       * plan, and `plans` has no `client_id`. So `_count` cannot express half of them, and using it
       * for the other half would mean two mechanisms on one screen.
       *
       * It is also the shape that gets copied to a list, which is the regression above.
       */
      expect(source(relative)).not.toContain('_count');
    },
  );
});
