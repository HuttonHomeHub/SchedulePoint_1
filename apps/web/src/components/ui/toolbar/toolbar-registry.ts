import type { ReactNode } from 'react';

/**
 * The declarative **toolbar-item registry** (ADR-0031). A toolbar is described as *data* — an
 * array of {@link ToolbarItem}s — which a single generic {@link Toolbar} primitive renders. Adding
 * a command means registering one item; the primitive owns grouping, gating and the APG keyboard
 * model, so no consumer re-implements chrome or a11y.
 *
 * This module is the **contract + the pure resolution maths** only — no React rendering, no DOM —
 * so the ordering and gating rules are exhaustively unit-testable. It resolves nothing about
 * width: a command surface wraps rather than hiding (ADR-0109 D1), and the one width-dependent
 * question left, whether a label shows, is {@link ToolbarLabelVisibility}.
 */

/**
 * The fixed command-group taxonomy, in canonical left→right order (ADR-0031). Encoded as a `const`
 * tuple so {@link ToolbarGroupId} is a closed union the compiler enforces — a new command must pick
 * an existing group, it can't invent one.
 */
export const TOOLBAR_GROUPS = [
  'frame', // 1 · frame/navigate — scale, zoom, fit (today-recenter reserved)
  'lens', // 2 · lens/display — view toggles, view-mode switch (reserved)
  'find', // 3 · find/focus — filter, critical-only (reserved)
  'tools', // 4 · tools/author — add activity, link (pen-gated)
  'object', // 5 · object/plan actions — recalculate, baselines, calendar…
  // 6 · output — the deliverables a plan LEAVES the product as: export, print, share. Renamed from
  // `history` in ADR-0090 M2-T4, which was reserved for undo/redo and never used: undo and redo
  // shipped in `tools`, beside the authoring commands they undo, and they are staying there. The
  // rename is safe precisely because the group was empty — verified as one repository hit, this
  // declaration — and the closed tuple means the compiler finds any consumer that disagrees.
  'output',
  'help', // 7 · help — shortcuts, legend
] as const;

export type ToolbarGroupId = (typeof TOOLBAR_GROUPS)[number];

/** Zero-based rank of a group in the canonical order (for stable left→right layout). */
export function groupRank(group: ToolbarGroupId): number {
  return TOOLBAR_GROUPS.indexOf(group);
}

/**
 * Prominence tier. `1` = always-visible inline control; `2` = a labelled popover trigger on the bar
 * (View/Summary/Legend/Filter); `3` = admitted last.
 *
 * **Nothing reads this any more.** ADR-0109 D1 deleted the `⋯`, the demotion pass and the width
 * ladder, and toolbar-redesign M1 deleted the last two functions that branched on it
 * (`partitionByTier` and the segment-tier guard in {@link defineToolbar}). It is kept as a declared
 * prominence on every item, not as a mechanism: setting it changes nothing, and `order` is the field
 * that decides where an item sits (`docs/TECH_DEBT.md` #193).
 */
export type ToolbarTier = 1 | 2 | 3;

/**
 * Whether a plain-button item shows its text label beside the icon — a **presentation** choice,
 * stated once on the item and decided by one resolver ({@link resolveLabelVisibility} in
 * `toolbar-styles.ts`).
 *
 * - `'always'` (the default) — labelled at every width. A row that wraps can always afford a label,
 *   so there is no width at which this one is withheld.
 * - `'never'` — icon-only everywhere; the name still reaches AT through `aria-label` and the tooltip.
 * - `'roomy'` — labelled when the **command deck** is at least `--container-roomy` wide, icon-only
 *   below that. The deck is the only container that carries the query, so on any other surface
 *   (`Toolbar`) `'roomy'` resolves to `'always'`. Because the label can vanish with no JavaScript
 *   involved, the control always mounts a `description` tooltip, and only a plain `onActivate`
 *   item — the one rendered by `ToolbarButton`, which owns that tooltip — may declare it.
 */
export type ToolbarLabelVisibility = 'always' | 'never' | 'roomy';

/**
 * What {@link resolveLabelVisibility} hands a control to paint: `'visible'` (a label), `'hidden'`
 * (icon only) or `'roomy'` (a label the deck's container query hides below `--container-roomy`).
 */
export type ToolbarLabelState = 'visible' | 'hidden' | 'roomy';

/**
 * Which toolbar an item is rendered by. **`strip`** is the command deck (`Deck`, the default);
 * **`mode`** is the plan's `Diagram | Gantt` switch; **`identity`** is the plan's facts beside its
 * name in the header — Plan summary and Edit plan details (toolbar-redesign M2). They are three
 * `Toolbar`/`Deck` instances, each its own `role="toolbar"` and its own Tab stop, and this field only
 * partitions the registry between them; grouping, gating and the keyboard model are unchanged
 * within each. **Absent ⇒ `strip`.**
 *
 * This is not the deck's two LINES (`DECK_ROWS`, `data-deck-row`, the `look`/`do` identifiers in
 * `Deck.tsx`): that is a different axis, and this docblock read "Absent ⇒ `look`" for a long time
 * after the value was renamed, which sent a reader to the wrong live thing (M7 architecture review,
 * `#288`).
 *
 * `look` and `do` merged into `strip` at Graphite M5. ADR-0031's two-row amendment had split the
 * surface into "what you look at" and "what you build with", and four epics then spent themselves
 * making both rows fit; one row of commands is the shape ADR-0099 chose, and `TOOLBAR_GROUPS` was
 * already a menu structure — `frame · lens · find · tools · object · output · help` — so the merge
 * was a deletion of the split rather than a re-grouping.
 */
export type ToolbarRow = 'identity' | 'mode' | 'strip';

/** What the primitive passes an item's `render` escape-hatch so it can reflect gating + roving focus. */
export interface ToolbarItemRenderApi {
  /**
   * Whether this item's label shows, already resolved by {@link resolveLabelVisibility} for the
   * surface that renders it — hand it to `ToolbarPopover` / `ToolbarSplitButton` rather than
   * deciding again. A `render` item never resolves to `'roomy'` (see {@link ToolbarLabelVisibility}).
   */
  labelState: ToolbarLabelState;
  /** Resolved enabled state (respects `isEnabled` + pen-gating) — mirror it on custom controls. */
  disabled: boolean;
  /**
   * The resolved {@link ToolbarItem.disabledReason} when the item is disabled (else `undefined`) —
   * so a `render` control can surface *why* it's off (title / accessible name), matching the plain
   * `ToolbarButton`. Absent-reason is normal (a disable with no explanatory copy).
   */
  disabledReason: string | undefined;
  /** Resolved active/pressed state (`isActive`). */
  active: boolean;
  /**
   * The resolved {@link ToolbarItem.activeKind}. A `render` item paints its own control, so it has
   * to be handed the same fact a plain command gets, or the ladder holds on eight of the deck's
   * controls and not the other fifteen — which is this repository's most-recorded defect shape.
   */
  activeKind: 'armed' | 'selected' | 'primary';
  /**
   * Spread these onto the item's single focusable control so it joins the toolbar's roving-tabindex
   * model (APG). Carries the managed `tabIndex`, the marker attributes the toolbar queries, and the
   * focus sync. An interactive `render` item MUST spread this on exactly one focusable element. For a
   * {@link ToolbarItem.presentational} item (a non-interactive read-out) the toolbar omits the
   * focusable marker + `onFocus` and pins `tabIndex: -1`, so the item does **not** take a roving stop.
   */
  itemProps: {
    tabIndex: number;
    'data-toolbar-item': string;
    'data-toolbar-focusable'?: '';
    onFocus?: () => void;
  };
}

/**
 * One toolbar command, generic over the consumer's context `Ctx` (built from the route model + local
 * UI state; the primitive never inspects `Ctx` itself — it only calls these predicates). Exactly one
 * of {@link onActivate} / {@link render} is provided (enforced by {@link defineToolbar}): a plain
 * button, or an escape-hatch for segmented controls, chips and Tier-2 popover triggers.
 */
export interface ToolbarItem<Ctx> {
  /** Stable unique id (test/telemetry handle; dedup key). */
  id: string;
  group: ToolbarGroupId;
  /** Which toolbar renders this item — see {@link ToolbarRow}. Absent ⇒ `strip`. */
  row?: ToolbarRow;
  tier: ToolbarTier;
  /**
   * Whether this item's text label is shown beside its icon. Defaults to `'always'`. See
   * {@link ToolbarLabelVisibility}. A `render` item resolves the same policy and hands it to its
   * trigger as {@link ToolbarItemRenderApi.labelState}; only a plain `onActivate` item may be
   * `'roomy'`, and {@link defineToolbar} refuses any other.
   *
   * It was `showLabel` with a third, band-shaped form (`{ atLeast: 'comfortable' }`, ADR-0091 D3a)
   * until toolbar-redesign M1. That form depended on a width ladder ADR-0109 D1 had already deleted,
   * so it labelled unconditionally everywhere it was read.
   */
  labelVisibility?: ToolbarLabelVisibility;
  /**
   * Sort order **within the group** (ascending), i.e. left-to-right position. Ties break by
   * registry order. Nothing demotes on width, so this is only ever a position.
   */
  order: number;
  /**
   * Items sharing a `segment` are **alternatives to one another** — one two-state switch, not two
   * independent commands. `Diagram | Gantt` is one segment (`Early mode | Visual mode` was another
   * until ADR-0148 deleted the scheduling modes).
   *
   * Declared on the item rather than special-cased by id in the primitive, which is TSLD knowledge
   * the primitive must not carry.
   *
   * **It was `demotionGroup` until 2026-08-30, and the rename is the point** (`docs/TECH_DEBT.md`
   * #201). The old name described the one thing it was ever consumed for — keeping a pair together
   * through the width ladder's demotion pass — and ADR-0109 D1 deleted that pass, leaving a field
   * named for a mechanism that no longer exists and read by nothing. What it always *declared* is
   * the durable fact: these items are one switch. {@link ToolbarProps.segmentLabels} is the first
   * consumer to use it for that.
   *
   * One invariant guards it in {@link defineToolbar} — a segment may not span a `row`. (It also
   * refused a segment spanning a `tier` until toolbar-redesign M1, a guard written for demotion.)
   */
  segment?: string;
  /** Accessible name — always required (icon-only buttons still need it). */
  label: string;
  /**
   * Optional supplementary tooltip clause — appended to the native hover `title` (never replaces the
   * accessible {@link label}). Use it to make a terse command discoverable (e.g. "Add note" →
   * "…— Opens the Logic panel (links & notes)") without lengthening the visible/announced name.
   */
  description?: string;
  /**
   * Optional leading icon (decorative; `aria-hidden`). Either a fixed node, or — symmetric with
   * {@link isEnabled} / {@link isActive} / {@link disabledReason} — a **function of the context**,
   * resolved once per resolve pass in {@link resolveItems} onto {@link ResolvedToolbarItem.icon}.
   *
   * The ctx form exists so a command can show an in-flight icon (a spinner) without reaching for
   * the {@link render} escape hatch, which is XOR with {@link onActivate}: taking it for one item
   * would mean re-implementing that item's button, label policy, pen-gating and disabled-reason
   * wiring. A plain `ReactNode` resolves to **itself** (pinned by a registry test), so every
   * pre-existing item is unaffected.
   *
   * Consumers read `ResolvedToolbarItem.icon`, never `item.icon` — the raw field may be a function.
   */
  icon?: ReactNode | ((ctx: Ctx) => ReactNode);
  /**
   * Part of the **authoring set** (group 4). The primitive disables every pen-gated item together
   * when authoring is not enabled (ADR-0028), so read-only ↔ editing flips as one coherent state.
   */
  penGated?: boolean;
  /** Whether the item is present at all in this context. Absent ⇒ always visible. */
  isVisible?: (ctx: Ctx) => boolean;
  /** Whether the item is actionable. Absent ⇒ always enabled. Combined with pen-gating. */
  isEnabled?: (ctx: Ctx) => boolean;
  /** Toggle/segment pressed state → `aria-pressed`. Absent ⇒ not a toggle. */
  isActive?: (ctx: Ctx) => boolean;
  /**
   * **Which KIND of active this is** — and it is declared here rather than inferred, which is the
   * whole point of the field (console epic M3-T2).
   *
   * `'selected'` (the default) is *the chosen one among alternatives, or a lens that is on*: a mode
   * segment, `Filter ▾` with a filter applied, `Notes` with the panel open. `'armed'` is narrower
   * and means *this is a MODAL TOOL and the next canvas gesture belongs to it* — Add, Link, Select,
   * Isolate. They are different facts with different consequences, and until M3 they rendered as
   * the same 1.34:1 wash, which is the defect ADR-0064 was opened on.
   *
   * `'primary'` is the third and the loudest: *this surface's one highest-emphasis control* — a
   * filled slab rather than ink or a notch. In the plan workspace that is the ADR-0028 pen, the
   * precondition for the eleven authoring commands beside it, and `state-ladder.structural.test.ts`
   * says so by name. **The DESIGN-SYSTEM rule is the cardinality, not the identity**: at most one
   * per rendered surface, enforced below by {@link defineToolbar}. Which control earns it is a
   * product decision that belongs to the product's own registry, and this field carries no opinion
   * about the pen.
   *
   * That split is the M7 architecture review's, and its argument is what makes it a rule rather
   * than a preference: a name list in one feature's test cannot see a control registered in a
   * third registry, so it would let a second amber slab appear with nothing red — while an author
   * who DID register in one of the two arrives at a list that prose forbids them to append to and
   * has no good move. A cardinality the primitive enforces covers both.
   *
   * **Inferring the kind from ARIA would be wrong**, and the durable reason is not the one this
   * docblock used to give. It cited `ToolbarPopover` reporting `aria-pressed` for a merely-open
   * panel — which M3-T4 then removed, so the example is now history rather than evidence (the M7
   * architecture review found the stale present tense). The reason that survives is stronger:
   * **ARIA has no vocabulary for this distinction at all.** `aria-pressed="true"` is correct markup
   * for "this lens is on" and for "this modal tool holds the next canvas gesture" alike, so the DOM
   * structurally cannot carry the discriminator whoever sets it. The set of modal tools is a fact
   * about the product, so the product states it.
   *
   * Absent ⇒ `'selected'`, because a toggle is the common case and the other two are exceptions
   * that have to say so.
   */
  activeKind?: 'armed' | 'selected' | 'primary';
  /**
   * Whether the command's work is currently in flight → `aria-busy` on the control. Absent ⇒ never
   * busy. Deliberately separate from {@link isEnabled}: a busy command is usually also disabled, but
   * "off because you can't do this" and "off because it is happening right now" are different facts,
   * and a busy state conveyed **only** by a spinning {@link icon} would say nothing at all under
   * `prefers-reduced-motion` (the global rule in `globals.css` reduces every animation to 0.01 ms).
   *
   * **Scoped: this reaches a PLAIN-BUTTON item only** (`docs/TECH_DEBT.md` #105(1)). The resolution
   * computes it for every item, and `ToolbarButton` reads it — but
   * {@link ToolbarItemRenderApi} does not carry it, so a `render` item declaring `isBusy` gets a
   * resolved value nothing hands it. No `render` item declares one today, which is why this is a
   * trap rather than a defect: the sentence above reads as a general contract, and the first
   * Tier-2 popover trigger that wants a busy state will find no way to read it and re-derive it
   * from `ctx` — two derivations of one fact, which is what the registry exists to prevent.
   *
   * **The argument for closing it is already written thirty lines below**, on `activeKind`: _"a
   * `render` item paints its own control, so it has to be handed the same fact a plain command
   * gets, or the ladder holds on eight of the deck's controls and not the other fifteen."_ That is
   * word for word the case for `busy`, made for its neighbour and not for it — this repository's
   * most-recorded defect shape, sitting inside the docblock that names it. Adding the field is
   * additive and breaks no consumer, and it is still a change to a shared primitive's public
   * contract (ADR-0105), so it is named here rather than taken in passing.
   */
  isBusy?: (ctx: Ctx) => boolean;
  /** Human reason shown/announced when disabled (e.g. "Start editing to add activities"). */
  disabledReason?: (ctx: Ctx) => string | undefined;
  /**
   * Why this item can VANISH, announced when it is removed while a reader was standing on it
   * (`use-focus-handoff.ts`, `docs/TECH_DEBT.md` #204(c)).
   *
   * **A static string, never `(ctx) => string`, and the asymmetry with `disabledReason` above is
   * the point rather than an oversight.** A function has no honest moment to run: evaluated at
   * focus time it describes the world *before* the change, in the present tense, about a fact that
   * is about to stop being true; evaluated afterwards there is no item left to evaluate against —
   * it has left the resolved set, which is the premise of the whole mechanism. A sentence about the
   * **condition** ("This action applies only to a WBS summary.") is true
   * in both worlds, which makes the trap unreachable instead of merely avoided.
   *
   * Optional, by product-owner decision: roughly forty registry items would each need a sentence
   * written before the focus repair could ship, and a rushed sentence is worse than a generic one.
   * A development-only warning marks each gap the first time it is reached. Without one the reader
   * is still told what left and where they now are — the WCAG 2.4.3 obligation — and told nothing
   * about why.
   */
  lostReason?: string;
  /**
   * A description read to assistive tech **on focus**, when the item's own name does not carry a
   * fact a sighted user can already see beside it (ADR-0094 M3-T2).
   *
   * Added for `next-conflict`, whose count lives in an `aria-hidden` read-out next to it: a sighted
   * planner sees "3 conflicts" at rest and an AT user got an enabled button called "Next conflict"
   * and no magnitude until they activated it — information conveyed visually and withheld from the
   * accessibility tree, which is the requirement that milestone exists to meet, failed for half its
   * audience.
   *
   * **Not a live region, and that distinction is the whole design.** It is an `sr-only` node linked
   * by `aria-describedby`, read on focus and on demand — the mechanism the search field already
   * uses for its match count. A live region here would say the same sentence the polite announcer
   * already speaks on activation, twice.
   *
   * Composed with `disabledReason`'s node when both apply, so a shaded item still leads with why.
   */
  srDescription?: (ctx: Ctx) => string | undefined;
  /** Plain-button activation. Mutually exclusive with {@link render}. */
  onActivate?: (ctx: Ctx) => void;
  /**
   * A non-interactive **read-out**: rendered inline in its group but **excluded from the
   * roving-tabindex order** — not a Tab/Arrow stop, since there's nothing to operate. Its `render`
   * still receives `itemProps` (to spread `data-toolbar-item`) but without the focusable marker /
   * `onFocus`, and with `tabIndex: -1`. Must be a `render` item.
   *
   * **Who still uses it, recorded 2026-08-12 (ADR-0090 M2-T3).** The example this docblock used to
   * lead with — the pinned Project-finish figure — is gone: it moved to the plan header, because a
   * number costing 150 px of pinned width had no business in a `role="toolbar"` whose every other
   * member is a command. `search-status` went the same way, into the search field's own box. Two
   * consumers remain on the TSLD surface, and both are deliberate:
   *
   * - **`next-conflict-status`** — the "Conflict 2 of 7 · reason" chip. The plan folded this into
   *   the button's label too and measurement refused it, but **that measurement's premise has
   *   lapsed**: it turned on a label painting only when `autoLabelsFit` was true, and ADR-0109 D1
   *   deleted the ladder, so labels now always paint. What survives of ADR-0094's objection is the
   *   half that was never about layout — folding a live count into the label reduces the control's
   *   **accessible name to a status**, so it is read afresh on every cycle. The chip is
   *   `isVisible`-gated on a conflict being cycled, so it costs no width at rest.
   * - **the flag-off search stub** — an inert `<input>` awaiting wiring, which is not a read-out at
   *   all but is correctly excluded from the roving order for the same reason.
   *
   * **Do not delete this capability** on a reading that the surface has outgrown it. It has not, the
   * docked selection bar may want it, and a read-out that is *not* excluded from the roving order
   * is a focusable stop with nothing to operate — the exact APG defect this field prevents.
   */
  presentational?: boolean;
  /** Escape hatch for non-button controls (segmented scale, Project-finish chip, Tier-2 popovers). */
  render?: (ctx: Ctx, api: ToolbarItemRenderApi) => ReactNode;
}

/** An item after its context predicates have been evaluated — what the renderer consumes. */
export interface ResolvedToolbarItem<Ctx> {
  item: ToolbarItem<Ctx>;
  enabled: boolean;
  active: boolean;
  /** The resolved {@link ToolbarItem.activeKind} — `'selected'` where the item declares none. */
  activeKind: 'armed' | 'selected' | 'primary';
  disabledReason: string | undefined;
  /** The resolved {@link ToolbarItem.srDescription}, or `undefined`. */
  srDescription: string | undefined;
  /**
   * The item's icon with any ctx form already applied — **the only supported read**. A plain
   * `ReactNode` icon appears here unchanged (identity), so reading this is never worse than reading
   * `item.icon` and is correct for both forms.
   */
  icon?: ReactNode;
  /** Resolved {@link ToolbarItem.isBusy} → `aria-busy` on the rendered control. */
  busy?: boolean;
}

/**
 * Validate a registry and return it unchanged (dev-time invariants; a no-op cost in prod). Catches
 * the mistakes the type system can't: duplicate ids, empty labels, and the onActivate/render XOR.
 * Throws in dev so a malformed registry fails loudly at module load rather than mis-rendering.
 */
export function defineToolbar<Ctx>(items: ToolbarItem<Ctx>[]): ToolbarItem<Ctx>[] {
  if (import.meta.env.DEV) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.id) throw new Error('ToolbarItem: every item needs a non-empty id');
      if (seen.has(item.id)) throw new Error(`ToolbarItem: duplicate id "${item.id}"`);
      seen.add(item.id);
      if (!item.label)
        throw new Error(`ToolbarItem "${item.id}": label is required (accessible name)`);
      if (item.activeKind === 'primary' && item.isActive === undefined)
        throw new Error(
          `ToolbarItem "${item.id}": activeKind "primary" needs isActive, or it declares a picture it can never take`,
        );
      const hasActivate = typeof item.onActivate === 'function';
      const hasRender = typeof item.render === 'function';
      if (hasActivate === hasRender) {
        throw new Error(
          `ToolbarItem "${item.id}": provide exactly one of onActivate or render (got ${
            hasActivate ? 'both' : 'neither'
          })`,
        );
      }
    }
  }
  // **At most ONE `primary` per registry, because "the loudest control" is a superlative** (console
  // epic M7, the architecture review). Two of them is not a louder surface, it is a surface with no
  // loudest control and a reader with nowhere to look first.
  //
  // This is the DESIGN-SYSTEM half of the rule and it is deliberately the only half that lives
  // here: the primitive enforces the cardinality, and which control earns it stays a product fact
  // in the product's own registry (`state-ladder.structural.test.ts` names the pen).
  //
  // It exists because the first version of that reservation was a name list in one feature's test,
  // which is unenforceable in the direction that matters: a control registered in a THIRD registry
  // is invisible to it, so a second amber slab could appear with nothing red — while an author who
  // did register in one of the two arrived at a list prose forbade them to append to, with no good
  // move left. A cardinality covers both, in development, at the point of declaration.
  //
  // A registry is one rendered surface here (`defineToolbar` is called once per surface), which is
  // what makes "per registry" and "per rendered surface" the same statement today. If that ever
  // stops being true the check moves to the renderer; the rule does not change.
  const primaries = items.filter((item) => item.activeKind === 'primary').map((item) => item.id);
  if (primaries.length > 1) {
    throw new Error(
      `defineToolbar: ${primaries.length} items declare activeKind "primary" (${primaries.join(', ')}) — ` +
        'a surface has at most one highest-emphasis control.',
    );
  }

  // **A segment may not span rows** (ADR-0091 M1, B2). A segment split across rows used to lose its
  // partner entirely — the pair was resolved from **one row's** `bar`, so each half demoted on its
  // own row's arithmetic. Two rows made that impossible to express; a third makes it a
  // one-character typo in `row`.
  //
  // **Retained for a reason the deleted pass no longer supplies, and now with a second one.** The
  // demotion argument went with the ladder (ADR-0109 D1); what remains is that a segment renders as
  // ONE named sub-group ({@link ToolbarProps.segmentLabels}), and a sub-group cannot straddle two
  // toolbars. So this check now guards something the product actually does, rather than something
  // it used to do.
  const rowBySegment = new Map<string, ToolbarRow>();
  for (const item of items) {
    if (!item.segment) continue;
    const row = item.row ?? 'strip';
    const seen = rowBySegment.get(item.segment);
    if (seen === undefined) rowBySegment.set(item.segment, row);
    else if (seen !== row) {
      throw new Error(
        `defineToolbar: segment "${item.segment}" spans rows "${seen}" and "${row}" — ` +
          'the members of one switch must share a row.',
      );
    }
  }

  // **Only a plain `onActivate` item that carries a `description` may be `'roomy'`** (toolbar-redesign
  // M1). A `'roomy'` label disappears under a container query, with no JavaScript involved, so the
  // control must already carry the tooltip that names it: `ToolbarButton` mounts a `description`
  // tooltip for exactly that state, and the custom triggers (`ToolbarPopover`,
  // `ToolbarSplitButton`) have only a native `title`. A bare name-echo would be a tooltip that says
  // the label back to a reader who can see it.
  for (const item of items) {
    if (item.labelVisibility !== 'roomy') continue;
    if (typeof item.onActivate !== 'function') {
      throw new Error(
        `ToolbarItem "${item.id}": labelVisibility "roomy" is only for a plain onActivate item — ` +
          'a render item has no description tooltip to carry its name when the label goes.',
      );
    }
    if (!item.description) {
      throw new Error(
        `ToolbarItem "${item.id}": labelVisibility "roomy" needs a description, because the ` +
          'tooltip it always mounts is the only thing naming the control once the label goes.',
      );
    }
  }

  return items;
}

/**
 * Partition a registry into the toolbar rows (ADR-0031 two-row amendment; `mode` added by ADR-0091
 * D1). Items with no `row` default to `look`. Pure — the workspace renders one {@link Toolbar} per
 * returned array.
 *
 * **Keyed by a `Record<ToolbarRow, …>` rather than by a ternary, deliberately.** This was
 * `((item.row ?? 'look') === 'do' ? build : look)`, which is total for two rows and silently
 * mis-partitions for three: adding `'mode'` to the union compiles clean against that body and drops
 * every mode item into `look`, i.e. leaves them exactly where they were while the registry says
 * they moved. Indexing a record seeded with all three keys makes a fourth row a **typecheck
 * failure** at the seed instead. The mis-partition would have been invisible to the type system,
 * which is what makes it worth the extra three lines (ADR-0091 M1, B1).
 */
/**
 * Split a taxonomy group's items into named sub-groups, or refuse.
 *
 * Returns `null` — meaning "render as one group, as today" — unless **every** item carries a
 * {@link ToolbarItem.segment} that `labels` names. That refusal is the load-bearing half: see
 * {@link ToolbarProps.segmentLabels}.
 *
 * Order is **first appearance**, taken from the already-sorted `items` and never re-sorted, so a
 * sub-group cannot reorder the row. Pure and DOM-free so the rule can be tested without rendering.
 */
export function partitionBySegment<T extends { item: { segment?: string } }>(
  items: readonly T[],
  labels: Record<string, string> | undefined,
): { segment: string; label: string; items: T[] }[] | null {
  if (!labels || items.length === 0) return null;
  const out: { segment: string; label: string; items: T[] }[] = [];
  const index = new Map<string, number>();
  for (const entry of items) {
    const segment = entry.item.segment;
    if (!segment) return null;
    const label = labels[segment];
    if (label === undefined) return null;
    const at = index.get(segment);
    if (at === undefined) {
      index.set(segment, out.length);
      out.push({ segment, label, items: [entry] });
    } else {
      out[at]!.items.push(entry);
    }
  }
  return out;
}

export function splitByRow<Ctx>(items: ToolbarItem<Ctx>[]): Record<ToolbarRow, ToolbarItem<Ctx>[]> {
  const rows: Record<ToolbarRow, ToolbarItem<Ctx>[]> = { identity: [], mode: [], strip: [] };
  for (const item of items) rows[item.row ?? 'strip'].push(item);
  return rows;
}

/**
 * Resolve every item's context-dependent state and drop the invisible ones, returning the survivors
 * in **canonical order**: by group rank, then by `order`, then by registry index (stable). Pen-gated
 * items are disabled as a set when `authoringEnabled` is false. Pure — no DOM, no measurement.
 */
export function resolveItems<Ctx>(
  items: ToolbarItem<Ctx>[],
  ctx: Ctx,
  authoringEnabled: boolean,
): ResolvedToolbarItem<Ctx>[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isVisible?.(ctx) ?? true)
    .sort((a, b) => {
      const byGroup = groupRank(a.item.group) - groupRank(b.item.group);
      if (byGroup !== 0) return byGroup;
      const byOrder = a.item.order - b.item.order;
      if (byOrder !== 0) return byOrder;
      return a.index - b.index;
    })
    .map(({ item }) => {
      const penBlocked = item.penGated === true && !authoringEnabled;
      const enabled = !penBlocked && (item.isEnabled?.(ctx) ?? true);
      return {
        item,
        enabled,
        active: item.isActive?.(ctx) ?? false,
        activeKind: item.activeKind ?? 'selected',
        disabledReason: enabled ? undefined : item.disabledReason?.(ctx),
        srDescription: item.srDescription?.(ctx),
        // A function icon is called exactly once here, not per consumer: every renderer reads this
        // resolution, and calling it twice would let one item paint two different icons.
        icon: typeof item.icon === 'function' ? item.icon(ctx) : item.icon,
        busy: item.isBusy?.(ctx) ?? false,
      };
    });
}
