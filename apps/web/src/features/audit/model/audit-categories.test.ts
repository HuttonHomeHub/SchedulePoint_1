import {
  AUDIT_ACTION_CATEGORY,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  auditActionsForCategories,
  auditActionsInCategory,
  auditCategoriesForSurface,
} from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * The audit filter's category vocabulary (ADR-0073 C1.2).
 *
 * Exhaustiveness itself is a **compile-time** property — `Record<AuditAction, AuditCategory>` makes
 * a missing action a type error — so these tests cover what the compiler cannot: that every
 * category earns its place, that no action is silently in two, and that the organisation surface
 * cannot offer a filter its endpoint refuses.
 */
describe('audit categories', () => {
  it('assigns every action exactly one category', () => {
    for (const action of AUDIT_ACTIONS) {
      const category = AUDIT_ACTION_CATEGORY[action];
      expect(AUDIT_CATEGORIES).toContain(category);
      expect(
        AUDIT_CATEGORIES.filter((c) => auditActionsInCategory(c).includes(action)),
      ).toHaveLength(1);
    }
  });

  it('never OFFERS a category with nothing in it', () => {
    // A chip that can only answer "no events" is the defect this whole milestone exists to stop,
    // in the control meant to fix it. Stated over EVERY category rather than against a named empty
    // one: `plan-structure` and `settings` were both declared-but-empty when C1 shipped and were
    // populated by C3.1 and C3.2, so an example-based test would have needed rewriting twice and
    // would say nothing about the category declared next.
    for (const surface of ['organization', 'self'] as const) {
      for (const category of auditCategoriesForSurface(surface)) {
        expect(auditActionsForCategories([category], surface).length).toBeGreaterThan(0);
      }
    }
  });

  it('offers EXACTLY the categories that can answer on each surface', () => {
    // The other direction, and the one that stops the rule decaying into "offer everything" now
    // that every declared category holds an action. A category withheld while it CAN answer is a
    // filter a reader cannot reach; the two assertions together pin the offering to the
    // vocabulary rather than to anyone's memory.
    for (const surface of ['organization', 'self'] as const) {
      const answerable = AUDIT_CATEGORIES.filter(
        (category) => auditActionsForCategories([category], surface).length > 0,
      );
      expect([...auditCategoriesForSurface(surface)]).toEqual(answerable);
    }
  });

  it('keeps every declared category reachable, so a new action always has a home', () => {
    // The declared set was deliberately wider than the offered one through C1–C3.1, which is what
    // made adding an action a compile error rather than a decision. C3.2 populated the last empty
    // one, so today the two coincide on `/me` — asserted rather than assumed, because the gap
    // reopening (a sixth category declared for a later rung) is the case the rule serves.
    expect(AUDIT_CATEGORIES.every((c) => auditActionsInCategory(c).length > 0)).toBe(true);
    expect(auditCategoriesForSurface('self')).toEqual([...AUDIT_CATEGORIES]);
  });

  it('OFFERS a category the moment its first action lands, with nobody editing the offering', () => {
    // The other half of the rule, and the half C3.1 exercised for real: `plan-structure` was
    // declared-but-hidden for the whole of C1, and appeared by itself when family D gave it six
    // actions. Nothing in `auditCategoriesForSurface` was touched — the offering is DERIVED from
    // the vocabulary, which is why a coverage slice cannot forget to reveal its own chip.
    expect(auditActionsInCategory('plan-structure').length).toBeGreaterThan(0);
    for (const surface of ['organization', 'self'] as const) {
      expect(auditCategoriesForSurface(surface)).toContain('plan-structure');
    }
  });

  it('accounts for the whole vocabulary — no action is unreachable by any chip', () => {
    const reachable = AUDIT_CATEGORIES.flatMap((c) => [...auditActionsInCategory(c)]);
    expect([...reachable].sort()).toEqual([...AUDIT_ACTIONS].sort());
  });

  describe('per-surface offering', () => {
    it('withholds Sign-ins from the organisation surface', () => {
      // An auth.* row carries no organizationId and that read filters on exactly that column, so
      // the chip could only ever return nothing — and the API refuses those actions there.
      expect(auditCategoriesForSurface('organization')).not.toContain('sign-ins');
    });

    it('offers Sign-ins on /me — the only surface that can return one', () => {
      expect(auditCategoriesForSurface('self')).toContain('sign-ins');
    });

    it('withholds a category only when ALL of its actions are organisation-less', () => {
      // Derived rather than listed: the rule is a property of the actions, so a category that
      // gained one auth action would still be offered (and its expansion, below, drops it).
      for (const category of auditCategoriesForSurface('organization')) {
        expect(auditActionsInCategory(category).some((a) => !a.startsWith('auth.'))).toBe(true);
      }
    });
  });

  describe('expansion to the wire', () => {
    it('expands chosen categories into their actions', () => {
      const actions = auditActionsForCategories(['deletions'], 'organization');
      expect(actions).toContain('client.deleted');
      expect(actions).toContain('plan.restored');
      expect(actions).not.toContain('member.joined');
    });

    it('returns an empty list for an empty selection — no chip means every action, not none', () => {
      expect(auditActionsForCategories([], 'organization')).toEqual([]);
      expect(auditActionsForCategories([], 'self')).toEqual([]);
    });

    it('never sends an auth.* action to the organisation route, even if a category held one', () => {
      // The trap this guards: withholding the chip stops a reader PICKING the bad filter, but not
      // a category that merely contains an auth action from smuggling one into the request — which
      // the API answers with a 422. The two lists are maintained in different places; this makes
      // the agreement structural instead of coincidental.
      const everything = auditActionsForCategories(AUDIT_CATEGORIES, 'organization');
      expect(everything.some((a) => a.startsWith('auth.'))).toBe(false);
    });

    it('does send auth.* actions on /me, which is the only surface that can return them', () => {
      const mine = auditActionsForCategories(['sign-ins'], 'self');
      expect(mine).toContain('auth.sign_in_failed');
      expect(mine.every((a) => a.startsWith('auth.'))).toBe(true);
    });
  });
});
