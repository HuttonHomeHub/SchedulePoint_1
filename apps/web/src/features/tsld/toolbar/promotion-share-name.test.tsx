import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readDeck } from './promotion-test-support';
import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EXPORT_PRINT_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: true,
}));

afterEach(cleanup);

/**
 * **What the deliverables trigger is called, and what Share… says about it** (toolbar-redesign M7).
 * The trigger is "Export" while Share… sits on the bar beside it and "Share & export" when it has
 * moved in, so a description naming only the second would point a reader at a control that is not
 * on screen. Verified red by deleting `SHARE_ENTRY.description`: the default clause then names
 * "Share & export" alone.
 */
describe('Share… and the deliverables trigger', () => {
  it('names the trigger "Export" while Share… is on the bar', () => {
    const { names } = readDeck(
      makeTsldToolbarContext({ promotion: { stage: 2, pointer: 'fine' } }),
    );
    expect(names).toContain('Share…');
    expect(names).toContain('Export');
    expect(names).not.toContain('Share & export');
  });

  it('names it "Share & export" when Share… has moved in', () => {
    const { names } = readDeck(
      makeTsldToolbarContext({ promotion: { stage: 0, pointer: 'fine' } }),
    );
    expect(names).not.toContain('Share…');
    expect(names).toContain('Share & export');
  });

  it('says where Share… goes under the name the trigger has now and the one it will have', () => {
    const share = buildTsldToolbarItems().find((item) => item.id === 'share');
    expect(share?.description).toBe(
      'Moves into the Export menu in a narrower window, where it is named Share & export',
    );
    expect(share?.lostReason).toBe('Moved into the Share & export menu.');
  });
});
