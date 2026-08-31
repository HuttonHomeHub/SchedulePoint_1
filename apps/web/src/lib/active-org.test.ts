import { describe, expect, it } from 'vitest';

import { forgetLastActiveOrg, getLastActiveOrg, setLastActiveOrg } from './active-org';

/**
 * **The hint is one person's, and it goes when they do** (`docs/TECH_DEBT.md` #171).
 *
 * It used to be a single unqualified `schedulepoint-active-org` key that nothing ever removed, so
 * on a shared machine the next person to sign in was redirected into the previous person's
 * organisation — silently, because the redirect is what the app does on arrival. No data leaks
 * (every read is authorised server-side), but it names an organisation the new reader may have no
 * business knowing exists, and it is the app opening somewhere they did not choose.
 *
 * These run against the real `window.localStorage` (jsdom provides one) because the getters and
 * setters read `window` directly; the sweep takes a `Storage` so it can be driven either way.
 */
describe('the active-org hint', () => {
  it('keeps two accounts apart on one machine', () => {
    window.localStorage.clear();
    setLastActiveOrg('u1', 'acme');
    setLastActiveOrg('u2', 'beta');
    expect(getLastActiveOrg('u1')).toBe('acme');
    expect(getLastActiveOrg('u2')).toBe('beta');
  });

  it('tells a user with no hint that it has none, rather than another user’s', () => {
    window.localStorage.clear();
    setLastActiveOrg('u1', 'acme');
    // The whole defect in one assertion: before this was keyed, u2 read back 'acme'.
    expect(getLastActiveOrg('u2')).toBeNull();
  });

  it('does not confuse an id that is a prefix of another', () => {
    window.localStorage.clear();
    setLastActiveOrg('u1', 'acme');
    setLastActiveOrg('u12', 'beta');
    expect(getLastActiveOrg('u1')).toBe('acme');
    expect(getLastActiveOrg('u12')).toBe('beta');
  });

  it('forgets one account at sign-out and leaves the other alone', () => {
    window.localStorage.clear();
    setLastActiveOrg('u1', 'acme');
    setLastActiveOrg('u2', 'beta');
    forgetLastActiveOrg(window.localStorage, 'u1');
    expect(getLastActiveOrg('u1')).toBeNull();
    expect(getLastActiveOrg('u2')).toBe('beta');
  });

  it('survives a storage that throws', () => {
    const hostile = {
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => {
      forgetLastActiveOrg(hostile, 'u1');
    }).not.toThrow();
  });
});
