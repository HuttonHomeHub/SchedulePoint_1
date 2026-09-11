import { useCallback, useMemo, useRef, useState } from 'react';

import {
  containerShouldStandDown,
  rovingIndexFor,
  TOOLBAR_NAV_KEYS,
  vetoesKey,
} from './toolbar-keyboard';
import { useToolbarFocusHandoff } from './use-focus-handoff';
import {
  resolveItems,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
} from './toolbar-registry';
import { TOOLBAR_INSET_RULE } from './toolbar-styles';
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
 * strand a group folded-and-active). The captions then survived as **static labels** — and went
 * entirely at the console epic's M6, once M4 had declared the two rows and made the row itself the
 * grouping (product owner, CQ-1). What marks a group from its neighbour now is an inset rule, built
 * at M7 after being specified twice and built neither time.
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
 * untouched. Seven named groups would be more chrome than commands, so pairs that answer the same
 * question share one and keep a hairline between them: `frame`+`lens` are both "what am I looking
 * at", `object`+`output`+`help` are all "this plan, as a document". The taxonomy survives as
 * structure **inside** a group rather than as a name above it.
 *
 * **There is no card**, and this paragraph said there was until M7. M1 deleted the box (a border
 * and padding at ≈1.2:1 against the band, drawing a boundary a 175 %-scaled screen cannot see) and
 * M6 deleted the caption. A deck group is now a bare row of controls with a `role` and an
 * `aria-label`, marked off from its neighbour by a rule taller than the one between its own
 * sections — the coarser boundary being the stronger mark, which is what makes the two read as a
 * hierarchy rather than as two of the same thing.
 *
 * ## What `caption` was called, and why it is now `name`
 *
 * `DECK_GROUPS[].caption` had not captioned anything since M6 deleted the visible spans: its only
 * consumer is `aria-label`, so it is the group's **accessible name** and nothing else. The M7
 * architecture review was right that a field named for a rendering which no longer exists is how a
 * reader concludes the caption is coming back (`docs/TECH_DEBT.md` #288) — the same class as the
 * stale sentences that milestone swept out of this subsystem, except that those are prose and this
 * is an identifier, which is why it survived several passes that corrected the words around it.
 *
 * **`name` and not `label`**: this file already has `ToolbarItem.label`, meaning the word printed
 * beside a control, and the subsystem has just been through one collision of exactly that kind (the
 * registry's `row` band axis against the deck's `row` line axis). `name` is also the ARIA
 * vocabulary for what `aria-label` sets, so the identifier and its one consumer now agree.
 *
 * M7 deferred it so a mechanical rename would not hide among nine prose corrections in one diff,
 * which is why it is its own commit. `DECK_GROUPS` is module-local, so the change does not leave
 * this file — the register row's "a rename across a shared table" overstates the blast radius.
 */
const DECK_GROUPS = [
  { id: 'view', name: 'View', row: 'look', members: ['frame', 'lens'] },
  { id: 'find', name: 'Find', row: 'look', members: ['find'] },
  { id: 'author', name: 'Author', row: 'do', members: ['tools'] },
  { id: 'plan', name: 'Plan', row: 'do', members: ['object', 'output', 'help'] },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  row: DeckRowId;
  members: readonly ToolbarGroupId[];
}>;

/**
 * **The two rows are DECLARED, and that is the 7 → 4 → 2 argument's last step** (console epic M4).
 *
 * Until M4 the deck's two lines were produced by flex line-breaking and were meaningful only by
 * coincidence: measured at M0-T3, `Find` dropped to line 2 at 1440 and took the whole DO set with
 * it, so every command in the band moved. Nothing held the arrangement and **nothing in CI counted
 * deck lines** — ADR-0109 D1 deleted the width ladder and `e2e-toolbar-fit` with it.
 *
 * `look` is *what am I looking at* — frame, lens, find. `do` is *what can I do to it* — tools,
 * object, output, help. A wrap **inside** a row is then local and harmless; it can never re-teach a
 * planner where the row's neighbours are.
 */
const DECK_ROWS = ['look', 'do'] as const;
type DeckRowId = (typeof DECK_ROWS)[number];

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
      // `-1` — focus is somewhere the deck does not own, including **on the container itself**,
      // which is where the focus handoff leaves a reader. `rovingIndexFor` starts the sequence from
      // there rather than continuing it; the old clamp to `0` then added one, so ArrowRight skipped
      // the first stop. ADR-0082's ArrowUp defect is the same arithmetic from the other end, and is
      // why `-1` must never reach the bare modulo.
      const current = nodes.findIndex((n) => n === document.activeElement);
      const next = rovingIndexFor(event.key, current, nodes.length);
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

  // **Deriving the roving stop and catching dropped focus are two different jobs**, and the
  // derivation above only does the first: it decides which item carries `tabIndex={0}`, never where
  // the browser's focus ring is. When a peer's write removes the item a reader is standing on, the
  // ring is already on `<body>` — `docs/TECH_DEBT.md` #204(c). Shared with `Toolbar` for the reason
  // `toolbar-keyboard.ts` exists: a rule these two primitives each implement drifts the moment one
  // is fixed.
  const focusHandoff = useToolbarFocusHandoff({
    containerRef,
    resolvedIds: stopIds,
    toolbarLabel: label,
    lostReasonFor: (id) => items.find((item) => item.id === id)?.lostReason,
  });

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      // Programmatically focusable only — the handoff's destination. A negative tabindex is skipped
      // by sequential navigation, so the deck still has exactly one Tab stop.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      {...focusHandoff}
      // **Two declared rows, as plain `<div>`s inside the one `role="toolbar"`.**
      //
      // Not two toolbars: that would be two Tab stops into one surface. Not a grid: it would align
      // the groups into columns, which the design study's own caveat says the real implementation
      // must not do. And the wrappers carry **no role and no name** — a `role="group"` per row would
      // nest groups inside groups to announce a fact with no words, where the four existing group
      // names are the AT structure and stay exactly as they were.
      //
      // The roving model is untouched by construction: `focusables()` queries
      // `[data-toolbar-focusable]` in **document order**, so LOOK still precedes DO with no change
      // to `onKeyDown`, and `aria-orientation="horizontal"` still holds because the deck already
      // wrapped to two lines before they were declared. The acceptance condition for this milestone
      // was that the existing roving-walk case passes **unchanged** — the ADR-0062 extraction
      // argument applied to a layout change.
      className={cn('flex flex-col gap-2', className)}
    >
      {DECK_ROWS.map((row) => (
        <div key={row} data-deck-row={row} className="flex flex-wrap items-start gap-2">
          {groups
            .filter((group) => group.row === row)
            .map((group, groupIndex) => {
              return (
                <div
                  key={group.id}
                  role="group"
                  aria-label={group.name}
                  // **A ROW, caption leading — not a caption stacked above the buttons.** Read this
                  // paragraph as history: M6 then deleted the caption outright, so what survives of
                  // the decision is the row, and the group's name reaches AT through the
                  // `aria-label` above rather than through anything rendered. Kept because the
                  // measurement is the reason the deck is one row tall per card at all.
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
                  // **No card** (console epic M1-T1, S1). The group's box — a `border` and `px-2 py-1.5`
                  // at ≈ 1.2:1 against the band — cost 14 px per deck line and 18 px per group to draw
                  // a boundary a 175 %-scaled screen cannot see (`m0-measurement.md` §1). The group
                  // keeps its role and its name; its height is now the control row's. The shared
                  // `toolbarCardVariants` base survives for the selection bar, which is not this epic's.
                  className={cn(
                    'flex items-stretch gap-2',
                    // **The group seam, built at M7 having been promised twice and never made.**
                    // `TOOLBAR_INSET_RULE`'s own docblock states as fact that "the group-level seam
                    // joins it at M4"; M1-T3 specified its geometry. Neither happened, and M6 then
                    // deleted the caption whose `border-r` had been the only mark at this boundary
                    // — so the DECK's four groups were separated by 8 px of nothing while the
                    // registry SECTIONS inside them kept a painted rule and 16 px. The finer
                    // division was twice as wide and the only one with ink: a hierarchy inverted,
                    // and the boundary it erased is the one that matters most on the DO row, where
                    // Author's eleven pen-gated commands meet Plan's, which are never gated.
                    //
                    // Found by the M7 ux and architecture reviews independently. It is the third
                    // instance in this epic of work specified and not built — the other two being
                    // the ladder's fifth state and CQ-4's outlet — and the only one of the three
                    // that looked right at rest, which is why nothing surfaced it until the
                    // captions went.
                    //
                    // `inset-y-1/5` is the 60 % M1-T3 named, against the section rule's 50 %: the
                    // coarser boundary is the taller mark, which is the whole point and is what
                    // makes the two readable as a hierarchy rather than as two of the same thing.
                    groupIndex > 0 &&
                      'before:bg-border relative before:absolute before:inset-y-1/5 before:-left-1 before:w-px',
                  )}
                >
                  {/* **The caption is gone and the group's NAME is not** (console epic M6-T1).
                It was an `aria-hidden` span reading VIEW / FIND / AUTHOR / PLAN, so nothing was
                lost to assistive technology: the group's own `aria-label` has always carried the
                word, which is the argument ADR-0119 used to delete `MODE`. The acceptance
                condition is that `command-surface.spec.ts`'s four `getByRole('group', { name })`
                assertions pass **unchanged**, and they do.

                It **reverses a direct product-owner instruction** from the 2026-08-28 polish pass,
                knowingly and on their later call (CQ-1), because the rows now do the grouping the
                words were carrying: M4 declared LOOK and DO, and a row you can see is a stronger
                boundary than a word you have to read.

                **The width it frees is what pays for the pen** (M5). Measured at 1280: the DO
                row's twelve commands sum 1069 px inside a 1264 px container — they fit with 195 px
                to spare — and the row still wrapped to two lines, because the overflow was never
                the commands. It was this span, its `pr-2`, its `border-r` and the gaps either
                side, twice over on a row carrying two cards. The captions cost the row more than
                the control the previous milestone added to it. */}
                  <div className="flex flex-wrap items-stretch gap-1">
                    {group.sections.map((section, sectionIndex) => (
                      <div
                        key={section[0]?.item.group ?? sectionIndex}
                        className={cn(
                          'flex flex-wrap items-stretch gap-1',
                          // The seven-group taxonomy, surviving as an inset hairline between sections
                          // rather than as a caption above them — the ONE seam treatment the three
                          // bands share (`TOOLBAR_INSET_RULE`), where this was a `border-l` of its own.
                          sectionIndex > 0 && cn(TOOLBAR_INSET_RULE, 'ml-1 pl-2'),
                        )}
                      >
                        {section.map((r) =>
                          r.item.render ? (
                            // `data-toolbar-item-scope`, never a second `data-toolbar-item` —
                            // `focusables()` queries `[data-toolbar-focusable]` in document order
                            // and a duplicate marker would put the wrapper in the roving walk. See
                            // `Toolbar.tsx`'s copy of this wrapper.
                            <span
                              key={r.item.id}
                              data-toolbar-item-scope={r.item.id}
                              className="inline-flex items-center"
                            >
                              {r.item.render(context, {
                                disabled: !r.enabled,
                                disabledReason: r.disabledReason,
                                active: r.active,
                                activeKind: r.activeKind,
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
                              activeKind={r.activeKind}
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
      ))}
    </div>
  );
}
