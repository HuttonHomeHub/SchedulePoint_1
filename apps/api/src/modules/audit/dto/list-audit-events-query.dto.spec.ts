import {
  AUDIT_ACTIONS,
  AUDIT_SURFACES,
  auditActionsForCategories,
  auditCategoriesForSurface,
} from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AUDIT_FILTER_MAX_ACTIONS, ListAuditEventsQueryDto } from './list-audit-events-query.dto';
import { ListOrganizationAuditEventsQueryDto } from './list-organization-audit-events-query.dto';

/** Validate as the global pipe does — `transform`, whitelist, and the query source. */
function validate(query: Record<string, unknown>): string[] {
  const dto = plainToInstance(ListAuditEventsQueryDto, query, {
    enableImplicitConversion: false,
  });
  return validateSync(dto, { whitelist: true }).flatMap((e) =>
    Object.values(e.constraints ?? {}).concat(
      (e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
    ),
  );
}

function parse(query: Record<string, unknown>): ListAuditEventsQueryDto {
  return plainToInstance(ListAuditEventsQueryDto, query);
}

describe('ListAuditEventsQueryDto (ADR-0073)', () => {
  describe('the unfiltered request is unchanged', () => {
    it('accepts an empty query and leaves every filter absent', () => {
      expect(validate({})).toEqual([]);

      // The property that lets this ship before any UI exists and keeps the flag-off surface
      // byte-identical: no filter field materialises unless the caller sent one.
      const dto = parse({});
      expect(dto.action).toBeUndefined();
      expect(dto.outcome).toBeUndefined();
      expect(dto.from).toBeUndefined();
      expect(dto.to).toBeUndefined();
      expect(dto.limit).toBe(20);
    });

    it('still accepts the inherited pagination params on their own', () => {
      expect(validate({ limit: '50', cursor: 'abc' })).toEqual([]);
    });
  });

  describe('repeatable params', () => {
    it('normalises a single value to an array', () => {
      expect(parse({ action: 'plan.deleted' }).action).toEqual(['plan.deleted']);
      expect(parse({ outcome: 'DENIED' }).outcome).toEqual(['DENIED']);
    });

    it('keeps an array as an array', () => {
      expect(parse({ action: ['plan.deleted', 'client.deleted'] }).action).toEqual([
        'plan.deleted',
        'client.deleted',
      ]);
    });

    it('accepts a real repeated selection', () => {
      expect(validate({ action: ['member.role_changed', 'share.created'] })).toEqual([]);
    });
  });

  describe('an unmatchable value is refused, never answered with an empty page', () => {
    // The whole point of the 422. A misspelled filter answered with 200 + zero rows is an audit
    // log asserting that nothing happened (TECH_DEBT #19's lesson, in a context where it is worse).
    it('rejects an unknown action', () => {
      expect(validate({ action: 'plan.exploded' })).toContain(
        'action must be one of the documented audit actions.',
      );
    });

    it('rejects an unknown action even when mixed with valid ones', () => {
      expect(validate({ action: ['plan.deleted', 'plan.exploded'] })).toContain(
        'action must be one of the documented audit actions.',
      );
    });

    it('rejects an unknown outcome', () => {
      expect(validate({ outcome: 'MAYBE' })).toContain(
        'outcome must be SUCCESS, DENIED or FAILURE.',
      );
    });
  });

  describe('the action list is bounded', () => {
    it(`accepts exactly ${String(AUDIT_FILTER_MAX_ACTIONS)} actions`, () => {
      const actions = Array.from({ length: AUDIT_FILTER_MAX_ACTIONS }, () => 'plan.deleted');
      expect(validate({ action: actions })).toEqual([]);
    });

    it('rejects one more than the cap', () => {
      const actions = Array.from({ length: AUDIT_FILTER_MAX_ACTIONS + 1 }, () => 'plan.deleted');
      expect(validate({ action: actions }).join(' ')).toMatch(
        new RegExp(String(AUDIT_FILTER_MAX_ACTIONS)),
      );
    });

    it('accepts EVERY category combination the surfaces can produce', () => {
      // Derived from the vocabulary, never from an example. The cap shipped in C1 as the literal
      // `20` — "exactly today's vocabulary size", with a docblock reasoning that the largest single
      // category was nine so no chip selection could reach it. C3 then added nineteen actions, and
      // `deletions` (12) + `access` (9) became 21: two chips a reader can click side by side, both
      // offered on the same screen, 422. The category chips are independent toggles with no
      // combination guard, so the only honest bound is the vocabulary itself — and a cap derived
      // from it cannot fall behind the next action the way a literal did.
      for (const surface of AUDIT_SURFACES) {
        const every = auditActionsForCategories(auditCategoriesForSurface(surface), surface);
        expect(every.length, `${surface}: ${String(every.length)} actions`).toBeLessThanOrEqual(
          AUDIT_FILTER_MAX_ACTIONS,
        );
        expect(validate({ action: [...every] })).toEqual([]);
      }
    });
  });

  describe('the date range', () => {
    it('accepts a well-ordered range', () => {
      expect(
        validate({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-04T00:00:00.000Z' }),
      ).toEqual([]);
    });

    it('accepts either bound alone', () => {
      expect(validate({ from: '2026-08-01T00:00:00.000Z' })).toEqual([]);
      expect(validate({ to: '2026-08-04T00:00:00.000Z' })).toEqual([]);
    });

    it('accepts an instant equal to itself — both bounds are inclusive', () => {
      const at = '2026-08-04T09:15:00.000Z';
      expect(validate({ from: at, to: at })).toEqual([]);
    });

    it('rejects an inverted range rather than silently swapping it', () => {
      expect(
        validate({ from: '2026-08-04T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }),
      ).toContain('to must not be earlier than from.');
    });

    it('rejects a malformed instant', () => {
      expect(validate({ from: 'yesterday' })).toContain('from must be an ISO-8601 instant.');
    });

    it('reports a malformed instant once, not also as a broken range', () => {
      // The range constraint stands down when either bound is unparseable, so the caller gets one
      // message about the field they mistyped instead of two about different things.
      const errors = validate({ from: 'yesterday', to: '2026-08-04T00:00:00.000Z' });
      expect(errors).toContain('from must be an ISO-8601 instant.');
      expect(errors).not.toContain('to must not be earlier than from.');
    });
  });
});

describe('ListOrganizationAuditEventsQueryDto (ADR-0073)', () => {
  function validateOrg(query: Record<string, unknown>): string[] {
    const dto = plainToInstance(ListOrganizationAuditEventsQueryDto, query);
    return validateSync(dto, { whitelist: true }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
  }

  const AUTH_REFUSAL =
    'auth.* actions carry no organisation and cannot appear in an organisation’s log. ' +
    'Read your own sign-in history on /me/audit-events.';

  it('refuses an auth.* action rather than answering with an empty page', () => {
    // Unanswerable AND the most expensive query the table accepts: with no index on `action`,
    // proving the absence means walking the whole organisation partition (measured 681–954 ms at
    // 1M rows against 0.35 ms for the unfiltered page).
    expect(validateOrg({ action: 'auth.signed_in' })).toContain(AUTH_REFUSAL);
  });

  it('refuses an auth.* action mixed in with matchable ones', () => {
    expect(validateOrg({ action: ['plan.deleted', 'auth.sign_in_failed'] })).toContain(
      AUTH_REFUSAL,
    );
  });

  it('covers every auth action in the vocabulary, not a hand-listed subset', () => {
    for (const action of AUDIT_ACTIONS.filter((a) => a.startsWith('auth.'))) {
      expect(validateOrg({ action })).toContain(AUTH_REFUSAL);
    }
  });

  it('still accepts every organisation-scoped action', () => {
    for (const action of AUDIT_ACTIONS.filter((a) => !a.startsWith('auth.'))) {
      expect(validateOrg({ action })).toEqual([]);
    }
  });

  it('keeps the inherited rules — a subclass override must not drop them', () => {
    // The trap this test exists for: `class-validator` reads decorators per declaring class, so a
    // redeclared property that omitted the base rules would silently stop validating.
    expect(validateOrg({ action: 'plan.exploded' })).toContain(
      'action must be one of the documented audit actions.',
    );
    expect(validateOrg({ outcome: 'MAYBE' })).toContain(
      'outcome must be SUCCESS, DENIED or FAILURE.',
    );
    expect(
      validateOrg({ from: '2026-08-04T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }),
    ).toContain('to must not be earlier than from.');
  });

  it('leaves the unfiltered request untouched', () => {
    expect(validateOrg({})).toEqual([]);
    expect(plainToInstance(ListOrganizationAuditEventsQueryDto, {}).action).toBeUndefined();
  });
});
