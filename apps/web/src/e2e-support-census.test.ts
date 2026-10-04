import { describe, expect, it } from 'vitest';

import { templatePath } from '../e2e-support/test';

describe('throttle census templatePath', () => {
  it('counts one handler under two organisation slugs as one key', () => {
    const a = templatePath('/api/v1/organizations/chrome-co-1/plans/12/activities');
    const b = templatePath('/api/v1/organizations/chrome-co-2/plans/34/activities');
    expect(a).toBe('/api/v1/organizations/:org/plans/:id/activities');
    expect(b).toBe(a);
  });

  it('leaves the organisations collection route alone', () => {
    expect(templatePath('/api/v1/organizations')).toBe('/api/v1/organizations');
  });
});
