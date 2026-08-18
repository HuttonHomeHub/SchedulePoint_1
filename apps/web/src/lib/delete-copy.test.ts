import { describe, expect, it } from 'vitest';

import { deleteCascadeWarning } from './delete-copy';

/**
 * **The sentence must be true on a host that has not armed retention**, which is the default and
 * the only state any host has ever been in. ADR-0096 M3 changed all five delete dialogs to say
 * "…for a limited time" and `RETENTION_HIERARCHY_ENABLED` defaults to `false`, so the claim was
 * false at the one moment a planner decides whether deleting is safe — the epic's own honesty rule
 * (D4) failing one screen along from the screen that enforces it.
 */
describe('the delete confirmation sentence', () => {
  it('never promises a deadline the installation may not enforce', () => {
    for (const kind of ['client', 'project', 'plan'] as const) {
      const sentence = deleteCascadeWarning(kind, 'Northgate');
      expect(sentence).not.toMatch(/limited time|days|permanently/i);
      expect(sentence).toContain('You can restore it from Recently deleted.');
    }
  });

  it('names the cascade for a client and a project, and not for a plan', () => {
    expect(deleteCascadeWarning('client', 'Northgate')).toBe(
      'Delete “Northgate” and all its projects and plans? You can restore it from Recently deleted.',
    );
    expect(deleteCascadeWarning('project', 'Riverside')).toBe(
      'Delete “Riverside” and all its plans? You can restore it from Recently deleted.',
    );
    // A plan is a leaf in this hierarchy — inventing a cascade clause would overstate the blast
    // radius, which is the mirror of the defect above.
    expect(deleteCascadeWarning('plan', 'Programme A')).toBe(
      'Delete “Programme A”? You can restore it from Recently deleted.',
    );
  });
});
