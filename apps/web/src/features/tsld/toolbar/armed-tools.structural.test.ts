import { describe, expect, it } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { resolveItems } from '@/components/ui/toolbar/toolbar-registry';

/**
 * **Every tool a planner can arm publishes that fact to the registry.**
 *
 * Written after the foot-row epic's architecture gate found that it did not, and that the gap had
 * become load-bearing without anybody noticing.
 *
 * `Deck`'s "a group holding an armed tool refuses to fold" rule reads
 * `ResolvedToolbarItem.active`, which is `item.isActive?.(ctx) ?? false`. Two of the three tools
 * that rule exists to protect are `render` items — `AddActivityControl` and `LinkControl` — and
 * each computed its own `pressed` from the context and set **no** registry `isActive`. `Add`'s
 * lived inside the `CANVAS_AUTHORING_ENABLED` ternary's flag-OFF arm, so in every shipped build it
 * was absent. The guard therefore fired for `marquee-select` alone: the one tool whose armed
 * statement the same epic KEPT, and for neither of the two it withdrew. A planner could arm Add,
 * fold `Author`, and be left with a tool armed, no trigger, no statement and no exit but Escape —
 * the founding ADR-0064 defect, reintroduced by the fix for a different one.
 *
 * **`Deck.test.tsx` could not see it**, and its fixture is why: a synthetic `onActivate` item
 * carrying `isActive: () => true`, a shape the real registry does not contain. That is ADR-0081
 * with the test as the concealer — green against a shape production does not have. So the gate for
 * this belongs here, against the real registry, and not there.
 *
 * **Verified red**: with `isActive` removed from `add-activity` or `link-tool`, the matching case
 * below fails naming the tool.
 *
 * Its blind spot, stated rather than implied: it proves the registry can SEE an armed tool. It does
 * not prove `Deck` acts on what it sees — `Deck.test.tsx` covers that, on a fixture that is now
 * honest about the shape only because this file pins the other half.
 */
describe('the TSLD registry sees every armed tool', () => {
  const ARMED_TOOLS: readonly { id: string; ctx: Record<string, unknown> }[] = [
    { id: 'add-activity', ctx: { isAddingActivity: true } },
    // LOE is armed from the Add split-button's own menu and reports its progress on that trigger,
    // so it is the SAME item's armed state — not a third one.
    { id: 'add-activity', ctx: { isLoeSpanning: true } },
    { id: 'link-tool', ctx: { isLinking: true } },
    { id: 'marquee-select', ctx: { isMarqueeSelecting: true } },
  ];

  for (const { id, ctx } of ARMED_TOOLS) {
    const [field] = Object.keys(ctx);
    it(`reports ${id} active when ${field} is set`, () => {
      const context = makeTsldToolbarContext(ctx);
      const resolved = resolveItems(buildTsldToolbarItems(), context, true).find(
        (r) => r.item.id === id,
      );
      expect(resolved, `${id} is not registered at all`).toBeDefined();
      expect(resolved?.active, `${id} is armed and the registry does not know`).toBe(true);
    });
  }

  it('reports none of them active at rest', () => {
    const context = makeTsldToolbarContext({});
    const resolved = resolveItems(buildTsldToolbarItems(), context, true);
    // The pinned negative. Without it every case above would pass equally against an `isActive`
    // hard-wired to `true`, which would make `Deck`'s guard permanent and the fold rule dead.
    const active = resolved.filter((r) => r.active).map((r) => r.item.id);
    expect(active).not.toContain('add-activity');
    expect(active).not.toContain('link-tool');
    expect(active).not.toContain('marquee-select');
  });
});
