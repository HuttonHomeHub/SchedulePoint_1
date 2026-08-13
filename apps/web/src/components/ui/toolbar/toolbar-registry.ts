import type { ReactNode } from 'react';

/**
 * The declarative **toolbar-item registry** (ADR-0031). A toolbar is described as *data* — an
 * array of {@link ToolbarItem}s — which a single generic {@link Toolbar} primitive renders. Adding
 * a command means registering one item; the primitive owns grouping, tiering, gating, overflow and
 * the APG keyboard model, so no consumer re-implements chrome or a11y.
 *
 * This module is the **contract + the pure resolution/overflow maths** only — no React rendering,
 * no DOM — so the ordering, gating and demotion rules are exhaustively unit-testable. The
 * `Toolbar` component measures widths and delegates the actual decisions here.
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
 * (View/Summary/Legend/Filter); `3` = lives in the overflow `⋯` from the start. Tier-1 and tier-2
 * both render inline until width forces a demotion into overflow (tier-2 demote before tier-1).
 */
export type ToolbarTier = 1 | 2 | 3;

/**
 * How much room the row has, as **four named bands** rather than a raw number (ADR-0090 M3-T1).
 *
 * A band, not a media query, and the difference is load-bearing: this is derived from the row's own
 * `clientWidth` via the `ResizeObserver` the primitive already runs, so it stays correct if a future
 * dock, rail or split pane narrows the band without narrowing the window. Two sources for one
 * question is how they drift — the same argument `deriveChromeWidth` makes about reading the DOM.
 *
 * - `comfortable` (≥ 1536) — the row as designed; every command inline, labels where affordable.
 * - `compact` (1280–1536) — labels retract first; nothing is folded away.
 * - `condensed` (1024–1280) — related commands fold behind a single trigger (M3-T2).
 * - `collapsed` (< 1024) — the narrowest designed layout (M3-T3), Surface Pro portrait.
 */
export type ToolbarLayoutMode = 'comfortable' | 'compact' | 'condensed' | 'collapsed';

/**
 * The bands, **widest first** — the order {@link resolveLayoutMode} walks. Their index is the
 * ladder's rung number, which is what makes "narrower" and "wider" comparable without a second
 * lookup table that could disagree with this one.
 */
const TOOLBAR_LAYOUT_BANDS: readonly { mode: ToolbarLayoutMode; min: number }[] = [
  { mode: 'comfortable', min: 1536 },
  { mode: 'compact', min: 1280 },
  { mode: 'condensed', min: 1024 },
  { mode: 'collapsed', min: 0 },
];

/**
 * Extra width required to move **back up** a rung, in px. Nothing here re-enters the measurement —
 * a mode changes what the row renders, and the row's width is imposed by its container — so this is
 * not damping a feedback loop. It exists for the one case that genuinely jitters: a user dragging a
 * window edge across a boundary, where a bare threshold re-lays the whole row out on every pixel of
 * hand tremor.
 *
 * Same size and same reason as {@link LABEL_PROMOTION_MARGIN_PX}'s second job, one rung up: 48 px is
 * wider than any plausible tremor and narrower than any deliberate resize.
 */
export const TOOLBAR_LAYOUT_HYSTERESIS_PX = 48;

/**
 * Which band a row of `width` px is in, given the band it is in **now**.
 *
 * **Deliberately asymmetric.** Narrowing takes effect immediately; widening requires clearing the
 * target band's floor by {@link TOOLBAR_LAYOUT_HYSTERESIS_PX}. That direction is the safe one: a row
 * that is denser than it strictly needs to be still fits, whereas one that is roomier than it can
 * afford is the defect this whole epic exists to remove.
 *
 * Widening walks **rung by rung** rather than testing the raw band alone. Jumping straight to the
 * band the width falls in and refusing it when the hysteresis is unmet would strand the row at its
 * old mode: growing from `collapsed` to 1550 px clears `compact` (1280 + 48) comfortably but not
 * `comfortable` (1536 + 48), and a single test would have answered "stay collapsed" — a row two
 * rungs denser than its width, which is worse than the jitter the margin is for.
 *
 * Pure; no DOM. `width` of 0 (no layout engine, an unpainted row) resolves to `collapsed` by the
 * bands alone, so callers must not ask before something has been measured — {@link Toolbar} holds
 * the previous mode in that case, for the same reason it holds the previous overflow set.
 */
export function resolveLayoutMode(width: number, current: ToolbarLayoutMode): ToolbarLayoutMode {
  const rawRung = TOOLBAR_LAYOUT_BANDS.findIndex((b) => width >= b.min);
  const currentRung = TOOLBAR_LAYOUT_BANDS.findIndex((b) => b.mode === current);
  if (rawRung === currentRung || rawRung < 0 || currentRung < 0) return current;
  // Narrower rung (higher index): act at once.
  if (rawRung > currentRung) return TOOLBAR_LAYOUT_BANDS[rawRung]!.mode;
  // Wider: the widest rung whose floor the width clears by the hysteresis.
  for (let rung = rawRung; rung < currentRung; rung++) {
    const band = TOOLBAR_LAYOUT_BANDS[rung]!;
    if (width >= band.min + TOOLBAR_LAYOUT_HYSTERESIS_PX) return band.mode;
  }
  return current;
}

/**
 * Whether a plain-button item shows its text label beside the icon — a **presentation** choice,
 * deliberately separate from {@link ToolbarTier}, which is a **priority** one.
 *
 * The two used to be the same line of code (`showLabel={item.tier === 1}`), so `tier` silently
 * answered both "what demotes into `⋯` first?" and "does this get a label?" — questions that only
 * coincide by convention. The measured consequence: at 1 920 px the Do row carries ~1 000 px of
 * unused slack, yet showed exactly as many icon-only controls as it does at 1 280 px, because
 * nothing ever asked whether a label was affordable at the width actually available.
 *
 * - `'always'` — always labelled. For the handful of primary controls whose name is the affordance.
 * - `'never'` — always icon-only (the name still reaches AT via `aria-label` + `title`).
 * - `'auto'` (default) — labelled **only when the row measurably has room**, decided per render
 *   from the container's width. Never at the cost of demoting a command into the overflow.
 */
export type ToolbarLabelPolicy =
  | 'always'
  | 'auto'
  | 'never'
  /**
   * Labelled at this band and wider, icon-only below it (ADR-0091 D3a). Distinct from `'auto'`,
   * which is a *projected-width* decision taken **all-or-nothing for the whole row**
   * (`autoLabelsFit`) — so an `'auto'` item follows the collective fate of its neighbours and will
   * label at a narrow band that happens to have slack. A band rule is the opposite: it is per-item
   * and it is about the shape of the window, which is what D3a's 1440 finding was measured against.
   */
  | { atLeast: ToolbarLayoutMode };

/**
 * Is `layout` at least as wide as `atLeast`? Rung index is the ladder's own ordering — **lower index
 * is wider** ({@link TOOLBAR_LAYOUT_BANDS} is widest-first) — so "at least as wide" is `<=`. Derived
 * from the same array `resolveLayoutMode` walks rather than from a second table, which is the
 * property that stops the two disagreeing about where a band begins.
 */
export function bandIsAtLeast(layout: ToolbarLayoutMode, atLeast: ToolbarLayoutMode): boolean {
  const at = TOOLBAR_LAYOUT_BANDS.findIndex((b) => b.mode === layout);
  const floor = TOOLBAR_LAYOUT_BANDS.findIndex((b) => b.mode === atLeast);
  return at >= 0 && floor >= 0 && at <= floor;
}

/**
 * Which of the two toolbar rows an item belongs to (ADR-0031 two-row amendment). `look` = the
 * always-live view/navigate/find row; `do` = the build-&-manage row (its pen-gated authoring cluster
 * shades as a set). Absent ⇒ `look`. The workspace renders one {@link Toolbar} per row, so this only
 * partitions items — grouping, tiering, gating and overflow are unchanged within each row.
 */
export type ToolbarRow = 'mode' | 'look' | 'do';

/**
 * What the row's current width means, handed to the two places a consumer can act on it: an item's
 * {@link ToolbarItem.isVisible} predicate (fold a command away) and its {@link ToolbarItem.render}
 * escape hatch (render the same command more tightly).
 *
 * **Only those two, deliberately.** `isEnabled`, `isActive` and `disabledReason` answer questions
 * about the *plan*, not about the window — a command that is shut because the pen is elsewhere is
 * shut at every width, and letting narrowness disable something would be a dead end with no
 * explanation a reader could act on (ADR-0082's discriminator: shade for a state the reader can
 * change, omit when it does not apply).
 */
export interface ToolbarLayoutEnv {
  layout: ToolbarLayoutMode;
}

/** What the primitive passes an item's `render` escape-hatch so it can reflect gating + roving focus. */
export interface ToolbarItemRenderApi extends ToolbarLayoutEnv {
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
  /** Which toolbar row this item lives on (ADR-0031 two-row amendment). Absent ⇒ `look`. */
  row?: ToolbarRow;
  tier: ToolbarTier;
  /**
   * Whether this item's text label is shown beside its icon. Defaults to `'auto'` — labelled only
   * where the row has measured room. Set `'always'` for a control whose name is the affordance, or
   * `'never'` to pin it icon-only. See {@link ToolbarLabelPolicy}; ignored by `render` items, which
   * own their own chrome.
   *
   * **A band form exists as of ADR-0091 D3a** — `{ atLeast: 'comfortable' }` labels at that band and
   * wider, icon-only below.
   *
   * It was tried once before and reverted (ADR-0090 M3-T2): the plan's *"segments become icon
   * pairs"* needed it, but the four segment items it named carried **no `icon`**, so dropping their
   * labels rendered four blank 16 px buttons and `e2e-toolbar-fit` S5 caught the WCAG 2.5.8 failure
   * the same hour. The widening was reverted with the task so no untested branch shipped, and the
   * blocker was recorded as `docs/TECH_DEBT.md` #126 rather than guessed at. **That reason is now
   * spent**: ADR-0091 D5 gave those four items icons, chosen by the product owner and registered in
   * `scripts/dependency-claims.json`, so the revert's premise no longer holds and the form returns
   * with its first honest consumer.
   */
  showLabel?: ToolbarLabelPolicy;
  /**
   * Sort order **within the group** (ascending), i.e. left-to-right position. Ties break by
   * registry order.
   *
   * **This is not the demotion key.** It used to be — `computeOverflow` sorted the whole row's
   * demotion queue by `order` descending — which quietly made "where does this sit in its group"
   * answer "what leaves the bar first", two questions that only coincide by accident. The measured
   * consequence on Row 1 was that Zoom −, Zoom +, Fit and Go-to-today demoted **before** Legend and
   * Keyboard shortcuts. See {@link priority}.
   */
  order: number;
  /**
   * How much this row wants to keep the item: **higher survives longer, lowest goes into the `⋯`
   * first.** Separate from `order` because they answer different questions — `order` is *where does
   * this sit*, `priority` is *what can this row afford to lose*. A zoom control is worth more than a
   * link to the keyboard-shortcuts sheet even though it sits further left.
   *
   * **Defaults to `-order`, not `order`**, which is the only default that reads correctly *and*
   * preserves today's behaviour. The old rule was "highest `order` demotes first", so importance
   * runs *opposite* to position; defaulting to `order` would have made an unset item's priority say
   * the reverse of what it does. The first draft did exactly that, and its own test caught it.
   * Because the default is exact, every item that does not set this behaves as it always has —
   * which is what keeps the existing suites a before/after oracle.
   */
  priority?: number;
  /**
   * Items sharing a `demotionGroup` demote **together or not at all**.
   *
   * For a two-state segment — Early | Visual, Diagram | Gantt — where each half is an independently
   * demotable button with adjacent `order` values. Without this the higher `order` goes first and
   * the planner is left with a lone "Diagram" button on the bar and "Gantt" inside a menu: a
   * two-state switch with one state hidden. Declared on the item rather than special-cased by id in
   * the primitive, which is TSLD knowledge the primitive must not carry.
   *
   * Recorded as **latent, not observed** (`docs/specs/workspace-layout/m0-measurement.md`): no
   * measured width reproduced the split. The test is what keeps it latent.
   */
  demotionGroup?: string;
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
  /**
   * Whether the item is present at all in this context. Absent ⇒ always visible.
   *
   * The second argument carries the row's {@link ToolbarLayoutMode}, so a command can fold away
   * where a narrower band offers it behind another trigger (M3-T2/T3). Ignore it and the item's
   * visibility is width-independent, which is what every pre-M3 registry entry means.
   */
  isVisible?: (ctx: Ctx, env: ToolbarLayoutEnv) => boolean;
  /** Whether the item is actionable. Absent ⇒ always enabled. Combined with pen-gating. */
  isEnabled?: (ctx: Ctx) => boolean;
  /** Toggle/segment pressed state → `aria-pressed`. Absent ⇒ not a toggle. */
  isActive?: (ctx: Ctx) => boolean;
  /**
   * Whether the command's work is currently in flight → `aria-busy` on the control. Absent ⇒ never
   * busy. Deliberately separate from {@link isEnabled}: a busy command is usually also disabled, but
   * "off because you can't do this" and "off because it is happening right now" are different facts,
   * and a busy state conveyed **only** by a spinning {@link icon} would say nothing at all under
   * `prefers-reduced-motion` (the global rule in `globals.css` reduces every animation to 0.01 ms).
   */
  isBusy?: (ctx: Ctx) => boolean;
  /** Human reason shown/announced when disabled (e.g. "Start editing to add activities"). */
  disabledReason?: (ctx: Ctx) => string | undefined;
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
   *   the button's label too; measurement refused it. A label paints only when `autoLabelsFit` is
   *   true, and at 1920 it is false, so the fold would hide the count at the width the epic exists
   *   to fix. The chip is `isVisible`-gated on a conflict being cycled, so it costs no width at rest.
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
  disabledReason: string | undefined;
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
  // **A `demotionGroup`'s companions must share a `tier`** (ADR-0090 M5, component gate). D3's "a
  // segment is one demotion unit" guarantee only holds while both halves are on the bar: a `tier: 3`
  // companion is in `partitionByTier`'s static overflow and never enters `computeOverflow`'s pair
  // map at all, so the pairing would degrade silently to "one always overflows, the other sometimes
  // does" — a split segment, which is the exact state `demotionGroup` exists to prevent. Both
  // current pairs happen to agree, so this has shipped no defect; it is a guard for the next author.
  const tierByGroup = new Map<string, ToolbarTier>();
  for (const item of items) {
    if (!item.demotionGroup) continue;
    const seen = tierByGroup.get(item.demotionGroup);
    if (seen === undefined) tierByGroup.set(item.demotionGroup, item.tier);
    else if (seen !== item.tier) {
      throw new Error(
        `defineToolbar: demotionGroup "${item.demotionGroup}" mixes tier ${seen} and tier ${item.tier} — ` +
          'companions must share a tier, or they cannot demote as one unit.',
      );
    }
  }

  // The same guard one axis over, and for the same reason (ADR-0091 M1, B2). `companionsOf` resolves
  // a pair from **one row's** `bar`, so a `demotionGroup` split across rows loses its companion
  // entirely: each half then demotes on its own row's arithmetic, which is the split segment the
  // block above exists to prevent — arrived at through a door that did not exist until now. Two rows
  // made this impossible to express; a third makes it a one-character typo in `row`.
  const rowByGroup = new Map<string, ToolbarRow>();
  for (const item of items) {
    if (!item.demotionGroup) continue;
    const row = item.row ?? 'look';
    const seen = rowByGroup.get(item.demotionGroup);
    if (seen === undefined) rowByGroup.set(item.demotionGroup, row);
    else if (seen !== row) {
      throw new Error(
        `defineToolbar: demotionGroup "${item.demotionGroup}" spans rows "${seen}" and "${row}" — ` +
          'companions must share a row, or they cannot demote as one unit.',
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
export function splitByRow<Ctx>(items: ToolbarItem<Ctx>[]): Record<ToolbarRow, ToolbarItem<Ctx>[]> {
  const rows: Record<ToolbarRow, ToolbarItem<Ctx>[]> = { mode: [], look: [], do: [] };
  for (const item of items) rows[item.row ?? 'look'].push(item);
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
  /**
   * The row's measured band. Defaults to `comfortable` — the band in which nothing folds — so every
   * caller that predates M3 (and every test that renders a registry directly) resolves exactly the
   * item set it always did.
   */
  layout: ToolbarLayoutMode = 'comfortable',
): ResolvedToolbarItem<Ctx>[] {
  const env: ToolbarLayoutEnv = { layout };
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isVisible?.(ctx, env) ?? true)
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
        disabledReason: enabled ? undefined : item.disabledReason?.(ctx),
        // A function icon is called exactly once here, not per consumer: the bar and the `⋯`
        // overflow both render from this resolution, and calling it twice would let one item paint
        // two different icons in the two places it can appear.
        icon: typeof item.icon === 'function' ? item.icon(ctx) : item.icon,
        busy: item.isBusy?.(ctx) ?? false,
      };
    });
}

/** Split resolved items into the bar (tiers 1–2, order preserved) and the always-overflow set (tier 3). */
export function partitionByTier<Ctx>(resolved: ResolvedToolbarItem<Ctx>[]): {
  bar: ResolvedToolbarItem<Ctx>[];
  overflow: ResolvedToolbarItem<Ctx>[];
} {
  const bar: ResolvedToolbarItem<Ctx>[] = [];
  const overflow: ResolvedToolbarItem<Ctx>[] = [];
  for (const r of resolved) (r.item.tier === 3 ? overflow : bar).push(r);
  return { bar, overflow };
}

/**
 * **How much the row wants to keep an item** — higher survives longer.
 *
 * Exported because two decisions have to agree about it and previously did not have to: the
 * demotion queue below, and the order in which {@link computeLadder} withdraws labels, which is
 * this comparator reversed. Two copies of "least wanted" would eventually let a row demote a
 * command into the `⋯` while keeping a label on one it values less — visibly incoherent, and
 * invisible to any test that does not exercise both at once.
 *
 * The `-order` default is exact rather than approximate, which is what keeps every item that does
 * not declare a priority behaving as it always has (see {@link ToolbarItem.priority}).
 */
export function priorityOf<Ctx>(item: ToolbarItem<Ctx>): number {
  return item.priority ?? -item.order;
}

/**
 * **`computeOverflow` was deleted at ADR-0091 M7.** `computeLadder` (`toolbar-ladder.ts`) replaced
 * it: the overflow decision is now one rung of a ladder that also decides labels and tier-3
 * admission, and the three cannot be taken independently — each reads the budget the one before it
 * left.
 *
 * Recorded here rather than left as a silent gap, because this same milestone *extended* the old
 * function with a new parameter and gave it three new tests hours before making it unreachable. A
 * component review found it still exported, still tested, and still carrying a docblock describing
 * how the running component fed it — the ADR-0058 drift class, in a docblock rather than in prose.
 */
