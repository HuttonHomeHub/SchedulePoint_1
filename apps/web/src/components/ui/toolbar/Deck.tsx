import { ChevronDown } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { containerShouldStandDown, TOOLBAR_NAV_KEYS, vetoesKey } from './toolbar-keyboard';
import {
  resolveItems,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
} from './toolbar-registry';
import { toolbarCardVariants } from './toolbar-styles';
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
 * **Group cards that fold.** Each caption is a disclosure button; folding a group you rarely touch
 * gives its width back. That is the same remedy the old app used on narrow screens, and it is the
 * honest one: the reader decides what they do not need, rather than an algorithm guessing.
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

const FOLD_STORAGE_KEY = 'schedulepoint-deck-folds';

/**
 * Which groups the reader has folded away.
 *
 * **Global rather than per-plan**, and that is a decision rather than an omission. Folding `Plan`
 * away says "I do not use these commands", which is a fact about how this person works and not about
 * the plan they happen to have open — keying it per plan would make the deck rearrange itself every
 * time they switched, which is exactly the moving-controls complaint this epic exists to remove.
 *
 * Reads and writes are wrapped because storage throws in a private window, in previews and wherever
 * site data is blocked, and a deck that fails to render because it could not remember a fold would
 * be a far worse defect than forgetting one.
 */
function readFolds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FOLD_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeFolds(folds: Set<string>): void {
  try {
    window.localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify([...folds]));
  } catch {
    /* Storage unavailable — the fold is a convenience, never a correctness requirement. */
  }
}

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
  const [folded, setFolded] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : readFolds(),
  );

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
    }))
      .filter((group) => group.sections.length > 0)
      .map((group) => ({
        ...group,
        /**
         * **A group holding an ACTIVE command cannot be folded away.**
         *
         * Folding unmounts a group's items (the `isFolded ? null :` branch below), and the fold set is
         * persisted globally — so a
         * planner who arms a tool and then folds `Author` is left with a tool armed, no trigger
         * rendered to say so, and no trigger to stop it with. That is ADR-0064's founding defect
         * restored: a planner who believes a tool is armed and is wrong, or worse, one who does not
         * know a tool is armed at all.
         *
         * The rule is general rather than a carve-out for that case, and it is defensible on its
         * own terms: **you should not be able to hide a control that is currently doing something.**
         * It reuses `active`, which `resolveItems` already computes for the pressed state, so the
         * deck learns nothing new about what its items mean.
         *
         * **It is a ONE-WAY guard — it refuses a fold and never an unfold — and that is a fix rather
         * than a restatement.** This paragraph used to argue that it "can only ever refuse to START
         * a fold", on the premise that arming needs a trigger and a folded group renders none. The
         * premise is a survey of today's registry, not a property of the primitive: `active` is
         * whatever a consumer's `isActive` returns, the fold set is global `localStorage` and so is
         * at least one panel-open flag that drives an `isActive` in one of these cards, so a group
         * CAN in principle come back folded and active in a later session. The `onClick` did not
         * distinguish the directions, so in that case the caption would have refused to unfold, its
         * items would have stayed unmounted, and the reason it announced — "cannot be folded away" —
         * would have been false. Checking `!isFolded` costs one term and removes the whole class of
         * argument. Raised by the architecture gate, which could not construct a reachable instance
         * in today's registry either, and correctly said that is a coincidence and not a guarantee.
         */
        hasActive: group.sections.some((section) => section.some((r) => r.active)),
      }));
  }, [resolved]);

  const toggleFold = useCallback((id: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFolds(next);
      return next;
    });
  }, []);

  /**
   * One roving tab stop across the whole deck, captions included.
   *
   * The captions are IN the sequence rather than beside it. A caption is the only route to the
   * commands it hides, so leaving it out of the roving order would make a folded group unreachable
   * by keyboard — the same class of defect as a shaded menu item whose reason cannot be focused
   * (ADR-0082), one layer up.
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

  // The roving stop must always exist and always point at something rendered. Folding a group
  // unmounts its items, so an `activeId` naming one of them would leave the deck with no tab stop
  // at all — a surface you cannot Tab into.
  const stopIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      ids.push(`caption:${group.id}`);
      if (folded.has(group.id)) continue;
      for (const section of group.sections) {
        for (const r of section) if (!r.item.presentational) ids.push(r.item.id);
      }
    }
    return ids;
  }, [groups, folded]);

  // **Derived, not corrected in an effect.** The first shape stored `activeId` and repaired it in
  // a `useEffect` when folding unmounted the item it named — which lints as a cascading render and
  // deserves to: the repair runs a frame AFTER the render that needed it, so for one commit the
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
        const isFolded = folded.has(group.id);
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
            <button
              type="button"
              data-toolbar-focusable=""
              data-toolbar-item={`caption:${group.id}`}
              aria-expanded={!isFolded}
              // **Named `<caption> commands`, not just `<caption>`.** The visible word is the
              // group's name and must stay short, but `View` alone collides with the `View ▾`
              // display-toggles popover that lives INSIDE this very group — two buttons with one
              // accessible name, which two journeys reported as a strict-mode violation on their
              // first run against the deck.
              //
              // It satisfies WCAG 2.5.3 because the accessible name CONTAINS the visible label.
              // The fold state is not in the name: that is `aria-expanded`'s job, and putting it
              // in the name too would make the control announce its state twice and change what
              // it is called every time somebody presses it.
              aria-label={`${group.caption} commands`}
              tabIndex={tabIndexFor(`caption:${group.id}`)}
              onFocus={() => setActiveId(`caption:${group.id}`)}
              onClick={() => {
                // `!isFolded` is load-bearing: refuse to fold a group holding an armed tool, never
                // to UNFOLD one. See `hasActive`'s docblock — without it a group that ever came
                // back folded-and-active would be permanently shut, under a reason that says the
                // opposite of what happened.
                if (group.hasActive && !isFolded) return;
                toggleFold(group.id);
              }}
              // Shaded with a reason, never removed (ADR-0082): the caption keeps its roving tab
              // stop and its reason is reachable, which is the whole point of that decision. Not
              // the native `disabled` attribute — this control flips as a tool is armed and
              // disarmed, and `disabled` blurs to `<body>` mid-interaction.
              {...(group.hasActive && !isFolded
                ? { 'aria-disabled': true as const, 'aria-describedby': `fold-held-${group.id}` }
                : {})}
              className={cn(
                // `text-micro` is the ramp's smallest member and carries its own letter-spacing.
                // The mockup drew this at 9px with wider tracking; using the ramp's 10px instead is
                // the disciplined answer, and the difference is imperceptible at a caption. A ramp
                // that gets a new member every time a design wants half a pixel is not a ramp.
                // **`min-h-9`, the same box the buttons take** (M1-T2). The caption measured 32 px
                // against `toolbarControlVariants`' 36, and both centre their text, so their labels
                // sat ~2 px apart — the residual spread left after M1-T1 removed the stacked
                // geometry. A caption is a real control here (it folds its group and is a roving
                // stop), so matching the control height is what it should have had anyway, and it
                // moves WCAG 2.5.8's minor axis in the right direction rather than the wrong one.
                'text-primary text-micro flex min-h-9 shrink-0 items-center gap-1 font-bold tracking-wider uppercase',
                'border-primary/25 cursor-pointer',
                group.hasActive && 'cursor-default opacity-60',
                // The rule that separated the caption from its buttons was a `border-b` under a
                // full-width row; on its side it is a `border-r` beside them, doing the same job in
                // the dimension the deck can afford. Absent when folded: there is nothing left to
                // separate the caption FROM.
                isFolded ? '' : 'border-r pr-2',
              )}
            >
              <span>{group.caption}</span>
              <ChevronDown
                aria-hidden="true"
                // **`-rotate-90` on the folded state is kept and now means something different.**
                // Stacked, the chevron pointed down at the buttons below it and sideways when they
                // were gone. Leading, it points down at rest and sideways when folded — the same
                // two glyphs, and the same convention a disclosure uses everywhere else in the
                // product, so nothing about it has to be re-learnt.
                className={cn('size-3 opacity-60', isFolded && '-rotate-90')}
              />
              {/* `&& !isFolded` matches the guard and the `aria-disabled` above it: the sentence is
                  only true of a group that is currently open. A described node with no
                  `aria-describedby` pointing at it is harmless, but the three going out of step is
                  how one of them ends up describing a state the control is not in. */}
              {group.hasActive && !isFolded ? (
                <span id={`fold-held-${group.id}`} className="sr-only">
                  Cannot be folded away while one of its tools is armed.
                </span>
              ) : null}
            </button>

            {isFolded ? null : (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
