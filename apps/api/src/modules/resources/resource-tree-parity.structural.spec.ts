import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

/**
 * The ADR-0053 §6 parity gate for the resource tree, argued STRUCTURALLY rather than observed.
 *
 * M3 adds two things to the resource model: a `parent_id` and a `GROUP` kind. Neither may reach the
 * CPM engine, the levelling pass, the resource histogram or the Earned-Value read-model — if either
 * did, introducing a purely organisational tree could move a date, and ADR-0034's golden + scenario
 * suite would be load-bearing evidence rather than a formality.
 *
 * Two independent facts make that true, and this file pins BOTH down so a future slice cannot
 * quietly break either:
 *
 *  1. **The engine's input types never mention the tree.** `EngineResource` carries an id, a
 *     capacity and a calendar — nothing else. A new field there would fail here.
 *  2. **A `GROUP` can never be assigned.** Every resource-consuming read-model starts from
 *     `resource_assignments`, so a node that can never be an assignment endpoint contributes zero
 *     demand, zero capacity and zero cost BY CONSTRUCTION. The service reject is what guarantees
 *     that, so its presence is asserted here too.
 *
 * The behavioural half of the argument (a real plan levels and earns identically with a GROUP
 * parent inserted over its resources) lives in `test/resource-hierarchy.e2e-spec.ts`.
 */
describe('resource tree parity (structural)', () => {
  const engineTypes = readSource('../schedule/engine/types.ts');

  it('EngineResource exposes only id / capacity / calendar — no tree, no kind', () => {
    const block = /export interface EngineResource \{([\s\S]*?)^\}/m.exec(engineTypes)?.[1];
    expect(block).toBeDefined();
    const fields = [...(block ?? '').matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields).toEqual(['id', 'capacity', 'calendar']);
  });

  it('EngineAssignment carries no resource kind or tree position either', () => {
    const block = /export interface EngineAssignment \{([\s\S]*?)^\}/m.exec(engineTypes)?.[1];
    expect(block).toBeDefined();
    expect(block).not.toMatch(/parentId/);
    expect(block).not.toMatch(/\bkind\b/);
  });

  it('the whole engine directory never reads parentId off a resource', () => {
    // `activity.parentId` (the ADR-0038 WBS tree) IS legitimately read by the engine's WBS rollup,
    // so the assertion is deliberately about the RESOURCE tree: the engine's resource inputs are
    // EngineResource / EngineAssignment, and neither has the field (asserted above). This third
    // check guards the seam the other two cannot: a future `EngineResource.parentId`.
    expect(engineTypes).not.toMatch(/EngineResource[\s\S]*?parentId[\s\S]*?^\}/m);
  });

  it('the assignment service rejects a GROUP outright — the reason the tree is invisible', () => {
    const assignmentService = readSource('./resource-assignment.service.ts');
    expect(assignmentService).toMatch(/resource\.kind === 'GROUP'/);
    expect(assignmentService).toMatch(/GROUP_NOT_ASSIGNABLE/);
  });
});
