import { describe, expect, it } from 'vitest';

import { cspActionLabel, environmentLabel, mailKindLabel } from './enum-copy';

describe('mailKindLabel', () => {
  it('names the four kinds the server sends', () => {
    expect(mailKindLabel('invitation')).toBe('Invitation');
    expect(mailKindLabel('email_verification')).toBe('Email confirmation');
    expect(mailKindLabel('password_reset')).toBe('Password reset');
    expect(mailKindLabel('test')).toBe('Test email');
  });

  // Nothing is hidden and nothing is invented: a kind added on the server reads as itself.
  it('falls back to the raw value with underscores replaced', () => {
    expect(mailKindLabel('weekly_digest')).toBe('weekly digest');
  });
});

describe('cspActionLabel', () => {
  it('says what the browser did, and a dash when it did not say', () => {
    expect(cspActionLabel('enforce')).toBe('Blocked');
    expect(cspActionLabel('report')).toBe('Reported only');
    expect(cspActionLabel(null)).toBe('—');
  });

  it('falls back to the raw value for a disposition it does not know', () => {
    expect(cspActionLabel('some_new_mode')).toBe('some new mode');
  });
});

describe('environmentLabel', () => {
  it('capitalises the environment', () => {
    expect(environmentLabel('production')).toBe('Production');
    expect(environmentLabel('development')).toBe('Development');
    expect(environmentLabel('staging_eu')).toBe('Staging eu');
  });
});
