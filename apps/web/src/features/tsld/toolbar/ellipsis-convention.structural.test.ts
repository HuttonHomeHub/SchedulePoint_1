import { describe, expect, it, vi } from 'vitest';

import { buildTsldToolbarItems } from './tsld-toolbar-items';

/**
 * **The `…` convention on toolbar labels** (ADR-0091 M4).
 *
 * Raised as an inconsistency — `Schedule settings…` and `Report progress…` carry an ellipsis while
 * `Go to date` does not, and `Go to date` plainly needs input before anything happens. Audited
 * before changing anything, and **the set turned out to be already consistent under the rule that
 * actually applies**, so this milestone writes the rule down and gates it rather than editing a
 * label. The audit is the deliverable; the diff is empty on purpose.
 *
 * The rule (`docs/DESIGN_SYSTEM.md`, "The `…` convention"):
 *
 * > An ellipsis means **activating this opens something that needs more input before anything
 * > happens**. A control that already renders a **disclosure caret** does not take one — the caret
 * > has said it, and saying it twice is noise on a row this dense.
 *
 * `Go to date` is a `ToolbarPopover`, and `ToolbarPopover` always renders a `ChevronDown`. So it is
 * not an exception to the convention; it is the branch of the convention that does not use the
 * character.
 *
 * **What this test can and cannot see.** The registry knows whether an item is an `onActivate`
 * command or a `render` item; it does **not** know whether a given `onActivate` opens a modal. So
 * the checkable half is the one that was actually in dispute: **a `render` item — the disclosure
 * shape — must never carry an ellipsis.** The converse ("every dialog-opening command carries one")
 * is a review question, and this docblock is where a reviewer is told that rather than being left
 * to assume the gate covers it. Stating the blind spot is the point; ADR-0090 M5's axe scan was
 * green and meaningless for exactly the opposite reason.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
}));

describe('toolbar labels — the `…` convention', () => {
  const items = buildTsldToolbarItems();

  it('never puts an ellipsis on a disclosure item, whose caret already says it', () => {
    const offenders = items
      .filter((item) => 'render' in item && typeof item.render === 'function')
      .filter((item) => item.label.endsWith('…'))
      .map((item) => `${item.id} ("${item.label}")`);

    expect(
      offenders,
      'a disclosure control renders a caret, so an ellipsis repeats it — drop the ellipsis, not the caret',
    ).toEqual([]);
  });

  it('uses the ellipsis on the plain-command items that open a dialog, and only those', () => {
    // Pinned as a set rather than a count: a count passes when one label gains the character and
    // another loses it, which is the state this convention exists to prevent. Adding a
    // dialog-opening command here is a one-line edit and a deliberate one.
    const withEllipsis = items
      .filter((item) => item.label.endsWith('…'))
      .map((item) => item.id)
      .sort();

    // `calendar` is the id behind the label "Schedule settings…" — read from the registry, not
    // guessed from the label, which is how the first version of this assertion was wrong.
    expect(withEllipsis).toEqual(['calendar', 'update-progress']);
  });
});
