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

  it('makes no deadline claim when the clear-out is off or the configuration is not known yet', () => {
    const off = deleteCascadeWarning('plan', 'Programme A', { active: false, days: 90 });
    expect(off).toBe('Delete “Programme A”? You can restore it from Recently deleted.');
    expect(deleteCascadeWarning('plan', 'Programme A', undefined)).toBe(off);
  });

  it("states the SERVER's period and the permanence when the clear-out is on", () => {
    expect(deleteCascadeWarning('client', 'Northgate', { active: true, days: 90 })).toBe(
      'Delete “Northgate” and all its projects and plans? ' +
        'You can restore it from Recently deleted. ' +
        'Deleted items stay in Recently deleted for 90 days, then are permanently removed.',
    );
    expect(deleteCascadeWarning('plan', 'Programme A', { active: true, days: 3650 })).toContain(
      'Deleted items stay in Recently deleted for 3650 days, then are permanently removed.',
    );
    expect(deleteCascadeWarning('project', 'Riverside', { active: true, days: 1 })).toContain(
      'for 1 day, then',
    );
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
