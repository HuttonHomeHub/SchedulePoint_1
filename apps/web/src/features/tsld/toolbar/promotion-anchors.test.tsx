import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readDeck } from './promotion-test-support';
import { makeTsldToolbarContext } from './test-helpers';

import type { PromotionPointer, PromotionStage } from '@/components/ui/toolbar/toolbar-promotion';

// The optional commands are all OFF here, which is the other end of the manifest suite's pinned-on
// flags: an anchor that only rendered because a flag was on would not be an anchor.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_LENSES_ENABLED: true,
  EXPORT_PRINT_ENABLED: true,
  EARNED_VALUE_ENABLED: false,
  RESOURCE_CURVES_ENABLED: false,
  GUEST_SHARE_LINKS_ENABLED: false,
  CANVAS_ACTIVITY_TYPES_ENABLED: false,
  SCHEDULE_INTERCHANGE_ENABLED: false,
  CANVAS_LIVE_FEEDBACK_ENABLED: false,
}));

afterEach(cleanup);

/**
 * **A menu's anchor renders whatever the state and the flags** (toolbar-redesign M5, spec §4.11
 * "Focus and stability"). The anchor is what keeps a menu from emptying and its trigger from being
 * removed as the window widens — so a focused trigger can never disappear (E-3), and no "everything
 * from ‹menu› is on the bar" sentence is needed.
 *
 * Link's anchor is **Start → Finish**, not "Stop linking", which renders only while linking; Add's is
 * **Task**, not "Stop adding", which is conditional too. Both are asserted with the tool **unarmed
 * and armed**, at the widest stage on both pointers (where the most has left each menu), with the
 * optional commands' flags off. Verified red by making Start → Finish promotable: the Link menu then
 * lost its only unconditional row.
 */
const ANCHORS: ReadonlyArray<{ from: string; row: string }> = [
  { from: 'filter', row: 'Has constraint' },
  { from: 'analysis', row: 'Baselines…' },
  { from: 'export', row: 'Print…' },
  { from: 'export', row: 'Schedule (CSV)' },
  { from: 'add-activity', row: 'Task' },
  { from: 'link-tool', row: 'SF — Start → Finish' },
];

const POINTERS: readonly PromotionPointer[] = ['fine', 'coarse'];
const STAGES: readonly PromotionStage[] = [0, 4];

describe.each(POINTERS)('menu anchors, %s pointer', (pointer) => {
  describe.each(STAGES)('stage %i', (stage) => {
    it.each([
      ['unarmed', {}],
      ['armed (adding and linking)', { isAddingActivity: true, isLinking: true }],
    ] as const)('every anchor renders, %s', (_label, armed) => {
      const reading = readDeck(makeTsldToolbarContext({ promotion: { stage, pointer }, ...armed }));
      for (const { from, row } of ANCHORS) {
        expect(reading.menus[from], `${from} lost "${row}"`).toContain(row);
      }
    });
  });
});
