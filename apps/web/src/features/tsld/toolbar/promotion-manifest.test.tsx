import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MENUS, readDeck, type Reading } from './promotion-test-support';
import { selectionActionItems } from './selection-actions';
import { makeTsldToolbarContext } from './test-helpers';
import { ALL_PROMOTION_ENTRIES } from './tsld-toolbar-items';

import {
  isPromoted,
  type PromotionPointer,
  type PromotionStage,
} from '@/components/ui/toolbar/toolbar-promotion';

// Every flag the entries and menus read, pinned ON: this suite is the manifest of the full build, and
// a flag-off command is on neither the bar nor a menu (the entry's `isVisible`), which the flag-off
// registry suites cover.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_LENSES_ENABLED: true,
  CANVAS_LIVE_FEEDBACK_ENABLED: true,
  CANVAS_NAV_ENABLED: true,
  CANVAS_ACTIVITY_TYPES_ENABLED: true,
  CANVAS_RESOURCE_VIEW_ENABLED: true,
  CANVAS_MULTI_SELECT_ENABLED: true,
  CANVAS_TIME_AXIS_ENABLED: true,
  EXPORT_PRINT_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: true,
  EARNED_VALUE_ENABLED: true,
  RESOURCE_CURVES_ENABLED: true,
  SCHEDULE_INTERCHANGE_ENABLED: true,
  TOOLBAR_QUICK_WINS_ENABLED: true,
  NOTES_ENABLED: true,
  ENTRY_ROUTES_ENABLED: true,
  GANTT_VIEW_ENABLED: true,
}));

/**
 * **SC-14 and SC-19: no tool is lost** (toolbar-redesign M5, spec §4.11 "Checks").
 *
 * A render-level test per stage and pointer. For each, every promotable entry is asserted to be on
 * the bar **xor** in its source menu — never both (one accessible name exists once in the tree) and
 * never neither (a command that was lost to a refactor, which is how Share was lost once). Then the
 * stronger statement, which does not depend on the entries' own claims: **the rows each menu offers,
 * plus the entries on the bar that left it, are exactly the rows the menu offers below the first
 * stage**. So a row that vanished without being promoted is found.
 *
 * Written **before any menu changed** (plan M5-T1) and green against the unpromoted deck, then kept
 * green as the ladder came on. The committed `command-manifest.json` is the build's roster — every
 * registry id, the selection bar's, and each menu's rows — and the test fails when the live set and
 * the file differ, so adding or dropping a command is a visible edit. Regenerate with
 * `pnpm --filter @repo/web manifest:commands`.
 */

const MANIFEST_PATH = resolve(import.meta.dirname, 'command-manifest.json');
const STAGES: readonly PromotionStage[] = [0, 1, 2, 3, 4];
const POINTERS: readonly PromotionPointer[] = ['fine', 'coarse'];

afterEach(cleanup);

describe('no tool is lost (SC-14, SC-19)', () => {
  // Read once per cell: opening six menus in jsdom is the expensive part.
  const readings = new Map<string, Reading>();
  const at = (pointer: PromotionPointer, stage: PromotionStage): Reading => {
    const key = `${pointer}:${String(stage)}`;
    let reading = readings.get(key);
    if (!reading) {
      reading = readDeck(makeTsldToolbarContext({ promotion: { stage, pointer } }));
      readings.set(key, reading);
    }
    return reading;
  };

  describe.each(POINTERS)('%s pointer', (pointer) => {
    describe.each(STAGES)('stage %i', (stage) => {
      const state = { stage, pointer } as const;

      it('every promotable entry is on the bar xor in its menu — never both, never neither', () => {
        const reading = at(pointer, stage);
        const ctx = makeTsldToolbarContext({ promotion: state });
        for (const entry of ALL_PROMOTION_ENTRIES) {
          if (entry.isVisible?.(ctx) === false) continue;
          const onBar = reading.bar.includes(entry.id);
          const trigger = entry.from;
          const inMenu = (reading.menus[trigger] ?? []).includes(entry.menuLabel);
          expect(onBar, `${entry.id} on the bar at ${pointer} stage ${String(stage)}`).toBe(
            isPromoted(entry.at, state),
          );
          expect(
            onBar !== inMenu,
            `${entry.id} (${entry.menuLabel}): bar=${String(onBar)} menu=${String(inMenu)}`,
          ).toBe(true);
        }
      });

      it('a menu loses exactly the rows that are on the bar, and no others', () => {
        const reading = at(pointer, stage);
        const floor = at(pointer, 0);
        const ctx = makeTsldToolbarContext({ promotion: state });
        for (const { from } of MENUS) {
          const left = ALL_PROMOTION_ENTRIES.filter(
            (entry) => entry.from === from && reading.bar.includes(entry.id),
          )
            .filter((entry) => entry.isVisible?.(ctx) !== false)
            .map((entry) => entry.menuLabel);
          expect(
            [...(reading.menus[from] ?? []), ...left].sort(),
            `${from}: rows + promoted rows ≠ the unpromoted menu`,
          ).toEqual(floor.menus[from]);
          // Disjoint: a row is never both on the bar and still in its menu.
          expect(
            left.filter((label) => (reading.menus[from] ?? []).includes(label)),
            `${from}: still in the menu`,
          ).toEqual([]);
          // No menu ever empties (each has an anchor), so its trigger is always on the bar.
          expect((reading.menus[from] ?? []).length, `${from} emptied`).toBeGreaterThan(0);
          expect(reading.bar, `${from} trigger missing`).toContain(from);
        }
      });

      it('nothing on the unpromoted bar ever leaves it: promotion only adds', () => {
        const reading = at(pointer, stage);
        const floor = at(pointer, 0);
        const missing = floor.bar.filter((id) => !reading.bar.includes(id));
        expect(missing).toEqual([]);
      });

      it('names every focusable once: one accessible name exists once in the tree', () => {
        const names = at(pointer, stage).names;
        const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
        expect(duplicated).toEqual([]);
      });
    });
  });

  it('each source menu keeps an anchor that renders whatever the stage', () => {
    // Link's anchor is Start → Finish, not "Stop linking", which renders only while linking; Add's is
    // Task and Level of Effort, not "Stop adding". `isLinking`/`isAddingActivity` are false in the
    // context, so these are the unarmed cases the spec names.
    const ANCHORS: Record<string, string[]> = {
      filter: ['Has constraint'],
      analysis: ['Baselines…'],
      export: ['Print…', 'Diagram — whole plan (PNG)', 'Schedule (CSV)'],
      'add-activity': ['Task', 'Level of Effort (hammock)'],
      'link-tool': ['SF — Start → Finish'],
    };
    for (const pointer of POINTERS) {
      for (const stage of STAGES) {
        for (const [from, anchors] of Object.entries(ANCHORS)) {
          for (const anchor of anchors) {
            expect(
              at(pointer, stage).menus[from],
              `${from} lost anchor "${anchor}" at ${pointer} stage ${String(stage)}`,
            ).toContain(anchor);
          }
        }
      }
    }
  });

  it('matches the committed manifest of the build (pnpm manifest:commands to regenerate)', () => {
    const floor = at('fine', 0);
    const manifest = {
      registry: [...floor.bar].sort(),
      selectionBar: selectionActionItems.map((item) => item.id).sort(),
      menus: Object.fromEntries(MENUS.map(({ from }) => [from, floor.menus[from] ?? []])),
      promotable: ALL_PROMOTION_ENTRIES.map((entry) => ({
        id: entry.id,
        from: entry.from,
        menuLabel: entry.menuLabel,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
    if (process.env.UPDATE_COMMAND_MANIFEST === '1') {
      writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    expect(manifest).toEqual(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
  });
});
