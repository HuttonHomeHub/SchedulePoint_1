import { describe, expect, it } from 'vitest';

import { selectionActionItems } from './selection-actions';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

/**
 * **Exactly four controls are MODAL tools and exactly one is the PEN, and the product says which**
 * (console epic M3-T3, widened at M5).
 *
 * `activeKind` decides whether an active control paints as **armed** — amber ink and an amber
 * underline on the band's own fill, both 7.91:1 — or as **selected**, a `--secondary` fill with an
 * underline. (This said "an amber ring" until M7. It was written at M3 and CQ-2 then resolved to
 * the plan's fallback, dropping the ring because `--chrome-ring` and `--chrome-primary` are the
 * identical string and an armed control that is also focused would have shown one amber inset ring
 * for two facts. Nothing swept the sentence.) They are different facts: armed means *the next canvas gesture belongs to this tool*,
 * selected means *this is the chosen one of alternatives, or this lens is on*. Until M3 they were
 * the same 1.34:1 wash, which is the defect ADR-0064 was opened on and a WCAG 2.2 §1.4.11 exposure
 * besides.
 *
 * **Why this is a gate rather than four comments.** The alternative — inferring the kind from ARIA
 * — is not merely weaker, it is wrong: `ToolbarPopover` sets `aria-pressed` on an open disclosure,
 * so a ladder driven from that attribute paints an open `View ▾` as an armed tool. And the failure
 * a comment cannot catch is the quiet one: a **fifth** modal tool arriving with no `activeKind`,
 * which inherits `'selected'` silently, looks correct in its own file and reads to a planner as a
 * toggle. Nothing else in the codebase would report it.
 *
 * **Both rosters are derived from the two registries, never a hard-coded list** — a literal list is
 * the ADR-0073 C4 defect in miniature, a gate that goes stale the moment the thing it guards moves.
 *
 * **The `primary` roster was added because this gate WATCHED the pen ship wrong.** M5 put the pen
 * at the head of the Author card and painted it by hard-coding `activeKind: 'armed'` inside its
 * renderer's JSX — so the registry declared nothing, this file's filters saw nothing, all three
 * cases passed, and a held pen rendered identically to an armed tool: the exact collision
 * `toolbar-styles.ts` records having already fixed once, in the opposite direction. The gate's own
 * paragraph above names that failure ("a fifth modal tool arriving with no `activeKind` … nothing
 * else in the codebase would report it") and could not report this one either, because it reads
 * declarations and the declaration was absent rather than wrong.
 *
 * So the third case below is the load-bearing one now: **every control that can be active declares
 * both halves on the registry**, which is what makes the other two able to see anything at all.
 *
 * Verified red four ways: flipping one declaration to `'selected'` (names it), deleting all four
 * (the armed set empties), adding `activeKind: 'armed'` to a toggle (names the newcomer), and
 * giving the pen `'armed'` (names it in both roster cases).
 */
describe('the state ladder names its modal tools', () => {
  const items = [...buildTsldToolbarItems(), ...selectionActionItems];

  /** The four the product intends. A new modal tool joins this list *and* declares itself. */
  const MODAL_TOOLS = ['add-activity', 'link-tool', 'marquee-select', 'isolate-logic'] as const;

  /**
   * **`primary` is the pen and only the pen**, which the approved spec states in those words. It is
   * the row's one amber slab, so a second one would make two controls the loudest thing at once and
   * neither of them the precondition the fill is meant to name.
   */
  const PRIMARY_CONTROLS = ['pen'] as const;

  it('exactly the four modal tools declare themselves armed', () => {
    const armed = items.filter((i) => i.activeKind === 'armed').map((i) => i.id);

    // The pinned positive, and it is not decoration: "no item declares armed" satisfies a
    // set-difference assertion perfectly, so a registry that had lost the field entirely would pass
    // a weaker version of this test while every tool in the product painted as a toggle.
    expect(armed.length, 'no item declares activeKind: "armed"').toBeGreaterThan(0);
    expect([...armed].sort()).toEqual([...MODAL_TOOLS].sort());
  });

  it('exactly the pen declares itself primary', () => {
    const primary = items.filter((i) => i.activeKind === 'primary').map((i) => i.id);

    // The same pinned positive, for the same reason: a registry that had lost the declaration would
    // satisfy a set-difference assertion while the pen painted as an ordinary toggle.
    expect(primary.length, 'no item declares activeKind: "primary"').toBeGreaterThan(0);
    expect([...primary].sort()).toEqual([...PRIMARY_CONTROLS].sort());
  });

  it('every other active control resolves to selected, and there are some', () => {
    const named = new Set<string>(['armed', 'primary']);
    const selectable = items.filter(
      (i) => i.isActive !== undefined && !named.has(i.activeKind ?? ''),
    );

    // Second pinned positive: an empty registry, or one where every active item had taken a named
    // kind, would satisfy "none of them declares armed" and say nothing.
    expect(selectable.length, 'no active-capable item resolves to "selected"').toBeGreaterThan(0);
    expect(selectable.map((i) => i.activeKind).filter((k) => k !== undefined)).toEqual([]);
  });

  it('a named-kind control is active-capable, or its declaration can never paint', () => {
    // The failure this catches is a real one and silent: `activeKind` without `isActive` is a
    // control that declares a picture it can never take. It reads as covered and is not.
    for (const id of [...MODAL_TOOLS, ...PRIMARY_CONTROLS]) {
      const item = items.find((i) => i.id === id);
      expect(item, `${id} is not in either registry`).toBeDefined();
      expect(item?.isActive, `${id} declares activeKind but no isActive`).toBeDefined();
    }
  });
});
