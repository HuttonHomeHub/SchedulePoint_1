import { describe, expect, it } from 'vitest';

import { selectionActionItems } from './selection-actions';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

/**
 * **Exactly four controls are MODAL tools, and the product says which** (console epic M3-T3).
 *
 * `activeKind` decides whether an active control paints as **armed** — amber ink, an amber ring and
 * an underline, 7.91:1 against the band — or as **selected**, a `--secondary` fill with an
 * underline. They are different facts: armed means *the next canvas gesture belongs to this tool*,
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
 * Verified red three ways: flipping one declaration to `'selected'` (names it), deleting all four
 * (the armed set empties), and adding `activeKind: 'armed'` to a toggle (names the newcomer).
 */
describe('the state ladder names its modal tools', () => {
  const items = [...buildTsldToolbarItems(), ...selectionActionItems];

  /** The four the product intends. A new modal tool joins this list *and* declares itself. */
  const MODAL_TOOLS = ['add-activity', 'link-tool', 'marquee-select', 'isolate-logic'] as const;

  it('exactly the four modal tools declare themselves armed', () => {
    const armed = items.filter((i) => i.activeKind === 'armed').map((i) => i.id);

    // The pinned positive, and it is not decoration: "no item declares armed" satisfies a
    // set-difference assertion perfectly, so a registry that had lost the field entirely would pass
    // a weaker version of this test while every tool in the product painted as a toggle.
    expect(armed.length, 'no item declares activeKind: "armed"').toBeGreaterThan(0);
    expect([...armed].sort()).toEqual([...MODAL_TOOLS].sort());
  });

  it('every other active control resolves to selected, and there are some', () => {
    const selectable = items.filter((i) => i.isActive !== undefined && i.activeKind !== 'armed');

    // Second pinned positive: an empty registry, or one where every active item had become armed,
    // would satisfy "none of them declares armed" and say nothing.
    expect(selectable.length, 'no active-capable item resolves to "selected"').toBeGreaterThan(0);
    expect(selectable.map((i) => i.activeKind).filter((k) => k !== undefined)).toEqual([]);
  });

  it('a modal tool is active-capable, or its armed declaration can never paint', () => {
    // The failure this catches is a real one and silent: `activeKind` without `isActive` is a
    // control that declares a picture it can never take. It reads as covered and is not.
    for (const id of MODAL_TOOLS) {
      const item = items.find((i) => i.id === id);
      expect(item, `${id} is not in either registry`).toBeDefined();
      expect(item?.isActive, `${id} declares activeKind but no isActive`).toBeDefined();
    }
  });
});
