import { describe, expect, it } from 'vitest';

import {
  EMPTY_AUDIT_FILTER,
  type AuditFilterState,
  isAuditFilterEmpty,
  parseAuditFilter,
  selectedCategories,
  toAuditQuery,
  toggleCategory,
} from './audit-filter';

/**
 * A filter carrying only categories. Written out rather than spread from a `Partial`, because
 * `exactOptionalPropertyTypes` makes `{...defaults, ...patch}` widen every key to `| undefined`.
 */
function withCategories(categories: string | undefined): AuditFilterState {
  return { ...EMPTY_AUDIT_FILTER, categories: categories ?? '' };
}

describe('audit filter state (ADR-0073 C1)', () => {
  describe('parsing a URL', () => {
    it('reads an empty search as no filter at all', () => {
      const parsed = parseAuditFilter({});
      expect(parsed).toEqual(EMPTY_AUDIT_FILTER);
      expect(isAuditFilterEmpty(parsed)).toBe(true);
    });

    it('reads categories, outcome and dates', () => {
      const parsed = parseAuditFilter({
        categories: 'access,deletions',
        outcome: 'DENIED',
        from: '2026-08-01',
        to: '2026-08-04',
      });
      expect(selectedCategories(parsed)).toEqual(['access', 'deletions']);
      expect(parsed.outcome).toBe('DENIED');
      expect(parsed.from).toBe('2026-08-01');
    });

    it('drops an unknown category instead of breaking the screen', () => {
      // A URL is pasted, hand-edited and outlives deployments. The API rejects an unknown value
      // because its caller can be told it is wrong; a URL bar cannot be, so this narrows slightly
      // differently rather than erroring. The asymmetry is deliberate.
      expect(selectedCategories(parseAuditFilter({ categories: 'access,wat' }))).toEqual([
        'access',
      ]);
    });

    it('drops an unknown outcome and a malformed date', () => {
      expect(parseAuditFilter({ outcome: 'MAYBE' }).outcome).toBe('');
      expect(parseAuditFilter({ from: 'yesterday' }).from).toBe('');
      expect(parseAuditFilter({ from: '04/08/2026' }).from).toBe('');
    });

    it('orders categories by the vocabulary, not by how they were typed', () => {
      // So two readers who ticked the same chips in a different order produce the same URL, and
      // the same query key — otherwise the cache holds two copies of one result set.
      expect(selectedCategories(parseAuditFilter({ categories: 'deletions,access' }))).toEqual([
        'access',
        'deletions',
      ]);
    });
  });

  describe('toggling', () => {
    it('adds and removes a category', () => {
      const one = toggleCategory(EMPTY_AUDIT_FILTER, 'access', true);
      expect(one.categories).toBe('access');

      const both = toggleCategory(withCategories(one.categories), 'deletions', true);
      expect(both.categories).toBe('access,deletions');

      const back = toggleCategory(withCategories(both.categories), 'access', false);
      expect(back.categories).toBe('deletions');
    });
  });

  describe('building the request', () => {
    it('sends nothing when nothing is chosen', () => {
      // The property the flag-off parity rests on: an untouched filter adds no parameter at all.
      expect(toAuditQuery(EMPTY_AUDIT_FILTER, 'organization')).toEqual({});
    });

    it('expands a category to its actions', () => {
      const query = toAuditQuery(parseAuditFilter({ categories: 'deletions' }), 'organization');
      expect(query.action).toContain('client.deleted');
      expect(query.action).not.toContain('member.joined');
    });

    it('never sends an auth.* action to the organisation route', () => {
      const query = toAuditQuery(
        parseAuditFilter({ categories: 'access,deletions,sign-ins' }),
        'organization',
      );
      expect(query.action?.some((a) => a.startsWith('auth.'))).toBe(false);
    });

    it('does send auth.* on /me', () => {
      const query = toAuditQuery(parseAuditFilter({ categories: 'sign-ins' }), 'self');
      expect(query.action).toContain('auth.sign_in_failed');
    });

    it('sends the outcome as a one-element list', () => {
      expect(toAuditQuery(parseAuditFilter({ outcome: 'FAILURE' }), 'self').outcome).toEqual([
        'FAILURE',
      ]);
    });

    it('widens the To date to the END of that day', () => {
      // Sending midnight would silently drop everything that happened on the day the reader
      // picked — the class of quiet wrongness this whole feature exists to remove.
      const query = toAuditQuery(
        parseAuditFilter({ from: '2026-08-01', to: '2026-08-04' }),
        'self',
      );
      expect(query.from).toBe(new Date('2026-08-01T00:00:00').toISOString());
      expect(query.to).toBe(new Date('2026-08-04T23:59:59.999').toISOString());
      expect(Date.parse(query.to ?? '')).toBeGreaterThan(Date.parse(query.from ?? ''));
    });

    it('sends a single-day range as a whole day, not an empty instant', () => {
      const query = toAuditQuery(
        parseAuditFilter({ from: '2026-08-04', to: '2026-08-04' }),
        'self',
      );
      expect(Date.parse(query.to ?? '') - Date.parse(query.from ?? '')).toBeGreaterThan(
        23 * 60 * 60 * 1000,
      );
    });
  });
});
