import { useCallback, useMemo, useRef, useState } from 'react';

import { containerShouldStandDown, TOOLBAR_NAV_KEYS, vetoesKey } from './toolbar-keyboard';
import {
  resolveItems,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
} from './toolbar-registry';
import { TOOLBAR_CAPTION, toolbarCardVariants } from './toolbar-styles';
import { ToolbarButton } from './ToolbarButton';

import { cn } from '@/lib/utils';

/**
 * The **command deck** — the plan workspace's command surface (workspace redesign, 2026-08-24).
 *
 * **It exists because `Toolbar`'s answer to "too many commands" was the wrong answer.** That
 * primitive measures its container, ranks items by `priority`, and demotes the losers into a `⋯`
 * menu. Four consecutive epics tuned that mechanism — band floors, hysteresis, `CHROME_RESIDUAL_PX`,
 * a label-demotion pass — and the product owner's verdict on the result was that the overflow "is
 * not what we agreed to. I think we need all commands visible when we can."
 *
 * Reading the OLD Flask app rather than describing it settled the argument. Its toolbar was
 * `flex-wrap: wrap` over five labelled group cards holding fifteen buttons, and it had no overflow
 * menu because **it never needed one**: a row that is allowed to become two rows cannot run out of
 * width. The whole ladder was a consequence of insisting the surface stay one row tall.
 *
 * So the deck's fit algorithm is **flex line-breaking, and nothing else**. There is no
 * `ResizeObserver` here, no `clientWidth` read, no width constant, and no priority ranking. That is
 * not a simplification of the old approach — it is the removal of a class of defect this repository
 * has recorded five times, in which a row measures its own leftover width and gets it wrong.
 *
 * ## What replaces the ladder
 *
 * **Nothing but the wrap.** The deck shipped (2026-08-24) with foldable group cards — each caption
 * a disclosure button, so a reader could give a group's width back — and the fold was REMOVED in
 * the workspace visual polish pass (2026-08-28) on the product owner's steer: "it adds very little
 * and I don't think someone is ever going to collapse a toolbar." They were right about the
 * arithmetic too: the deck wraps, so width is no longer scarce enough to spend interactivity
 * buying it back, and the fold had already cost two real defects (the ADR-0114 M7 `hasActive`
 * guard protecting a tool whose publishers never published, and a persisted fold set that could
 * strand a group folded-and-active). The captions survive as **static labels** — the grouping is
 * the value; the disclosure was the cost.
 *
 * **Buttons were stacked until M1 (workspace-chrome-fit, 2026-08-25) made every control inline.**
 * Read the paragraph below as history: its width argument still explains why the deck can afford to
 * wrap, but it no longer describes the layout. It said "stacked buttons" while the code two hundred
 * lines down had stopped stacking them.
 *
 * Icon above a 9.5 px label rather than beside it — roughly half the width for
 * the same information, which is the geometry that makes "every command labelled" affordable at all.
 * The label is suppressed only where the icon is genuinely universal ({@link ICON_ONLY}).
 *
 * ## The 7 → 4 mapping
 *
 * The registry's seven-group taxonomy (ADR-0031) is **not** discarded and the ~40 registrations are
 * untouched. Seven captioned cards would be more chrome than commands, so pairs that answer the same
 * question share a card and keep a hairline between them: `frame`+`lens` are both "what am I
 * looking at", `object`+`output`+`help` are all "this plan, as a document". The taxonomy survives as
 * structure inside the card rather than as a caption above it.
 */
const DECK_GROUPS = [
  { id: 'view', caption: 'View', members: ['frame', 'lens'] },
  { id: 'find', caption: 'Find', members: ['find'] },
  { id: 'author', caption: 'Author', members: ['tools'] },
  { id: 'plan', caption: 'Plan', members: ['object', 'output', 'help'] },
] as const satisfies ReadonlyArray<{
  id: string;
  caption: string;
  members: readonly ToolbarGroupId[];
}>;

export type DeckGroupId = (typeof DECK_GROUPS)[number]['id'];

/**
 * Commands whose icon carries the whole meaning, so a label beside it is cost without information.
 *
 * **The test is "would a planner who has never seen this product guess wrong?"** — not "do I
 * recognise it". A magnifier, a plus and minus, and the two undo arrows are among the most
 * standardised glyphs in software. `Arrange` and `Float paths` are not, and the difference between
 * a labelled and an unlabelled one there is the difference between a planner using the feature and
 * never finding it.
 *
 * Deliberately a small, closed set. Every addition trades discoverability for width, and the width
 * is no longer scarce now that the deck can wrap.
 */
const ICON_ONLY = new Set(['zoom-in', 'zoom-out', 'fit', 'undo', 'redo', 'print']);

export interface DeckProps<Ctx> {
  /** The registry (validated via `defineToolbar`). */
  items: ToolbarItem<Ctx>[];
  /** The evaluated context passed to every predicate/callback. */
  context: Ctx;
  /** Accessible name for the `role="toolbar"` container. */
  label: string;
  /** Whether the pen-gated authoring group is enabled (ADR-0028). */
  authoringEnabled?: boolean;
  className?: string;
}

export function Deck<Ctx>({
  items,
  context,
  label,
  authoringEnabled = true,
  className,
}: DeckProps<Ctx>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // `layout` is fixed at `comfortable`: the deck never folds items away on width, so there is no
  // band to resolve. Passing the constant keeps `isVisible` predicates that take an env working
  // exactly as they did, rather than quietly changing what a registry resolves to.
  const resolved = useMemo(
    () => resolveItems(items, context, authoringEnabled, 'comfortable'),
    [items, context, authoringEnabled],
  );

  /** Deck group → its registry sub-groups → the items in each, preserving registry order. */
  const groups = useMemo(() => {
    const byRegistryGroup = new Map<ToolbarGroupId, ResolvedToolbarItem<Ctx>[]>();
    for (const r of resolved) {
      const list = byRegistryGroup.get(r.item.group);
      if (list) list.push(r);
      else byRegistryGroup.set(r.item.group, [r]);
    }
    return DECK_GROUPS.map((group) => ({
      ...group,
      // A sub-group with no visible items contributes no hairline — otherwise a card whose middle
      // section is entirely hidden by predicates draws a rule with nothing on one side of it.
      sections: group.members
        .map((member) => byRegistryGroup.get(member) ?? [])
        .filter((section) => section.length > 0),
    })).filter((group) => group.sections.length > 0);
  }, [resolved]);

  /**
   * One roving tab stop across the whole deck — the COMMANDS only, since the fold's removal
   * (workspace visual polish, 2026-08-28) made the captions static labels. While the captions were
   * disclosure buttons they had to be in the sequence (a caption was the only route to a folded
   * group's commands); a static label in the roving order would be a stop that does nothing, which
   * is the inverse defect.
   */
  const focusables = useCallback(
    () => [
      ...(containerRef.current?.querySelectorAll<HTMLElement>('[data-toolbar-focusable]') ?? []),
    ],
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!TOOLBAR_NAV_KEYS.includes(event.key)) return;
      // **A descendant that already handled this key wins, and it is checked FIRST.** A
      // `ToolbarSplitButton` caret, a `Menu` and a `Combobox` all call `preventDefault()` without
      // `stopPropagation()`, so the event still arrives here through the React tree. Without this,
      // a disabled caret's `focus()` lands on an element the roving model cannot see, `indexOf`
      // returns -1, and focus is thrown to the deck's FIRST stop — taking the caret's shaded
      // reason with it, which is the only keyboard route to that reason (ADR-0082).
      if (containerShouldStandDown(event)) return;
      if (vetoesKey(event.target, event.key)) return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const current = nodes.findIndex((n) => n === document.activeElement);
      // `-1` (focus is somewhere the deck does not own) resolves to the first stop rather than to
      // `nodes.length - 1`, which is what a bare `indexOf` arithmetic would give and is the
      // ArrowUp-lands-on-the-second-to-last defect ADR-0082 records.
      const from = current === -1 ? 0 : current;
      let next = from;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = nodes.length - 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
        next = (from + 1) % nodes.length;
      else next = (from - 1 + nodes.length) % nodes.length;
      event.preventDefault();
      nodes[next]?.focus();
    },
    [focusables],
  );

  // The roving stop must always exist and always point at something rendered. Items appear and
  // disappear as predicates change, so an `activeId` naming a gone item would leave the deck with
  // no tab stop at all — a surface you cannot Tab into.
  const stopIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      for (const section of group.sections) {
        for (const r of section) if (!r.item.presentational) ids.push(r.item.id);
      }
    }
    return ids;
  }, [groups]);

  // **Derived, not corrected in an effect.** The first shape stored `activeId` and repaired it in
  // a `useEffect` when unmounting invalidated the item it named — which lints as a cascading render
  // and deserves to: the repair runs a frame AFTER the render that needed it, so for one commit the
  // deck has a tab stop pointing at nothing. Deriving it means the invalid state cannot exist.
  const rovingId =
    activeId !== null && stopIds.includes(activeId) ? activeId : (stopIds[0] ?? null);
  const tabIndexFor = (id: string): number => (id === rovingId ? 0 : -1);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      // `flex-wrap` IS the fit algorithm, and `items-start` is what lets a folded card sit at its
      // own height beside an open one instead of stretching to match it.
      className={cn('flex flex-wrap items-start gap-2', className)}
    >
      {groups.map((group) => {
        return (
          <div
            key={group.id}
            role="group"
            aria-label={group.caption}
            // **A ROW, caption leading — not a caption stacked above the buttons.**
            //
            // Measured (`measure-output/m4-vertical-stack.json`): as a stacked card this was 81 px,
            // of which ~29 was a full-width caption row, and the deck was 170 px because the four
            // cards need ~2,126 px and never fit on one line at any width from 1280 to 1920. Two
            // rows of 81. The canvas was down to 224 px at 1280×900.
            //
            // Turning the card on its side spends the caption's width instead of its height, which
            // the deck has to spare and the workspace does not: the card becomes one row tall, and
            // the deck 170 → ~112. The height was never the buttons'.
            //
            // This said "the buttons are untouched — stacked, labelled, exactly as approved" until
            // M1 unstacked them. Corrected rather than deleted: turning the card on its side is an
            // argument about the CARD, and is unaffected by what the buttons inside it do.
            // Shared with the canvas selection bar since the foot-row epic's M6 — see
            // `toolbarCardVariants` in `toolbar-styles.ts`. It was a literal here, and the second
            // consumer would have copied it.
            className={toolbarCardVariants()}
          >
            {/* **A STATIC label since the fold's removal** (workspace visual polish, 2026-08-28) —
                it was a disclosure `<button>` with `aria-expanded`, a roving tab stop and the
                ADR-0114 M7 `hasActive` guard, all of which went with the fold. `aria-hidden`,
                because the group's own `aria-label` already carries the word: a visible span that
                also announced would read "View, group — View" to a screen-reader user, the same
                fact twice (the ADR-0110 D1 duplication, one channel over). Pointer users see the
                caption; AT users hear the group.

                `text-micro` is the ramp's smallest member and carries its own letter-spacing, and
                `min-h-9` is the control box — a caption centred beside `min-h-9` buttons at a
                shorter box sat its label ~2 px adrift (the M1-T2 measurement, still true of a
                span). The `border-r` that separated the caption from its buttons stays: the
                grouping is the value the captions kept. */}
            <span
              aria-hidden="true"
              className={cn(TOOLBAR_CAPTION, 'border-primary/25 border-r pr-2')}
            >
              {group.caption}
            </span>

            <div className="flex flex-wrap items-stretch gap-1">
              {group.sections.map((section, sectionIndex) => (
                <div
                  key={section[0]?.item.group ?? sectionIndex}
                  className={cn(
                    'flex flex-wrap items-stretch gap-1',
                    // The seven-group taxonomy, surviving as a hairline inside the card rather
                    // than as a caption above it.
                    sectionIndex > 0 && 'border-border/50 ml-1 border-l pl-2',
                  )}
                >
                  {section.map((r) =>
                    r.item.render ? (
                      <span key={r.item.id} className="inline-flex items-center">
                        {r.item.render(context, {
                          disabled: !r.enabled,
                          disabledReason: r.disabledReason,
                          active: r.active,
                          layout: 'comfortable',
                          itemProps: r.item.presentational
                            ? { tabIndex: -1, 'data-toolbar-item': r.item.id }
                            : {
                                tabIndex: tabIndexFor(r.item.id),
                                'data-toolbar-focusable': '',
                                'data-toolbar-item': r.item.id,
                                onFocus: () => setActiveId(r.item.id),
                              },
                        })}
                      </span>
                    ) : (
                      <ToolbarButton
                        key={r.item.id}
                        itemId={r.item.id}
                        label={r.item.label}
                        {...(r.item.description ? { description: r.item.description } : {})}
                        icon={r.icon}
                        {...(r.busy ? { busy: true } : {})}
                        showLabel={!ICON_ONLY.has(r.item.id)}
                        {...(r.item.isActive ? { pressed: r.active } : {})}
                        disabled={!r.enabled}
                        disabledReason={r.disabledReason}
                        srDescription={r.srDescription}
                        tabIndex={tabIndexFor(r.item.id)}
                        onActivate={() => r.item.onActivate!(context)}
                        onFocus={() => setActiveId(r.item.id)}
                        // **The stacked geometry is GONE, and with it the four `!important`
                        // overrides** (M1-T1, CQ-1). A plain command stacked its label under its
                        // icon while a split-button or popover trigger — which never reached this
                        // branch — kept the shared CVA's row. Nobody chose that: it is one
                        // `if` having a side effect on layout. Measured at 1646, the deck's label
                        // tops were 137 for inline items and 149 for stacked ones, and a reader's
                        // eye tracks the difference along the row.
                        //
                        // There is now exactly ONE geometry, so it needs no variant to select it:
                        // the shared `toolbarControlVariants` row is simply not overridden. A
                        // two-valued `layout` variant with no second consumer would be dead code
                        // pretending to be a choice.
                        //
                        // **The label's `text-micro` override is GONE**
                        // (`docs/specs/object-bar-defects/` M3). It was kept here deliberately:
                        // the M0 probe that priced the geometry change altered flex-direction,
                        // height, gap and alignment and nothing else, so changing the type scale
                        // in the same commit "would make the shipped width unattributable to the
                        // number that justified the change". That was right, and the reason
                        // lapsed the moment the geometry shipped and was measured.
                        //
                        // **It produced two type scales on one row, by two separate mechanisms,
                        // and only the first was known.** Measured
                        // (`m3-deck-type-scale.spec.ts`): eight `render` items — every `▾`
                        // trigger — never reached this branch at all and kept the shared CVA's
                        // `text-sm`. And `> span:last-of-type` is fragile in a way nobody had
                        // costed: `ToolbarButton` renders icon → label → `sr-only` reason →
                        // `sr-only` description, so the moment a control carries a reason or an
                        // `srDescription` the override lands on an **invisible** span and the
                        // visible label falls through to `text-sm`. Three items were live in that
                        // state on the measured screen — `Next conflict`, `Float paths` and
                        // `Add note`, all shaded — which means **a plain command's label grew
                        // from 10 px to 14 px the moment it was disabled**.
                        //
                        // Deleting it leaves one scale declared in one place, by the primitive.
                        // `min-w-*` is kept: it is geometry, and it was never the problem.
                        className={cn(ICON_ONLY.has(r.item.id) ? 'min-w-9' : 'min-w-12')}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
