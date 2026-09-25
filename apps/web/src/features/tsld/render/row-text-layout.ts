import { canvasLabel, centreItemText } from './a11y';
import { laneRowsOf, type LaneRow } from './paint-frame';
import {
  activityRect,
  barGlyphKind,
  dateLabelSlot,
  formatCanvasDate,
  isMilestone,
  LABEL_ELLIPSIS,
  LABEL_FONT,
  LABEL_GAP_PX,
  LABEL_LINE_H,
  LABEL_MIN_PX_PER_DAY,
  LABEL_PAD_PX,
  DATE_LABEL_MIN_PX_PER_DAY,
  labelPlacement,
  lodTier,
  MILESTONE_LABEL_FONT,
  NODE_TEXT_CLEAR_PX,
  rowReservesTextRows,
  rowSlots,
  screenYOfLane,
  sharesNode,
  truncateToWidth,
  wrappedNameYs,
  wrapTwoLines,
  type Rect,
  type RectCache,
  type RenderActivity,
  type Viewport,
} from './render-model';
import type { TsldViewToggles } from './view-toggles';

/**
 * **One text layout, two readers** (links-and-labels M1, spec §4.2).
 *
 * Where every name, date and centre item on the canvas goes — computed once, by one pure function,
 * so the painter that draws them and the router that must avoid them (M2) cannot disagree about
 * where the text is. Before M1 the placement lived inside the painter's layers 3.6–3.8, interleaved
 * with the context writes that draw it, so nothing but the painter could know it.
 *
 * **It is a move, not a change** (ADR-0078 §3). Every placement branch, constant and comment moved
 * verbatim from `paint.ts`. The painter keeps every `fillText`, `font`, `textAlign` and `fillStyle`
 * write in its layer and order, and draws what this returns; that is why the result is shaped per
 * layer and per activity (`NameStep`, `DateStep`) rather than as one flat list: a step records the
 * context writes the old code made even where it drew nothing (a milestone's bold font set and
 * reset around a name that did not fit, the date layer's `fillStyle` on a bar whose dates were
 * withheld), so the golden log stays byte-identical.
 *
 * `measure(text, font)` is the only source of widths. The painter passes its memo; a harness passes
 * a fixed-width measure; Tidy (M2) passes a table lookup. A `font` of `undefined` is the regular
 * label font, the memo's own convention (`measure.ts`).
 *
 * **What it does not decide: whether a wrap happens.** A wrap is taken only where its upper line
 * meets no routed link (`layers/wrap-clearance.ts`), and the routes are the painter's. So a name
 * that would wrap is returned as a {@link WrapProposal} carrying both the wrapped pair and the
 * one-line fallback, and the painter chooses. The router reads the fallback (spec D-4: it does not
 * wrap).
 */

export type PlacedTextKind =
  | 'name'
  | 'name-upper'
  | 'name-lower'
  | 'date-start'
  | 'date-finish'
  | 'milestone-date'
  | 'centre'
  | 'inside'
  | 'beside'
  | 'flank-start'
  | 'flank-finish';

export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One string the canvas draws, where and how. */
export interface PlacedText {
  activityId: string;
  /** The activity's lane: the text sits in that lane's name row or below-bar row. */
  lane: number;
  kind: PlacedTextKind;
  text: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  /** The font it is measured and drawn in: `LABEL_FONT` or `MILESTONE_LABEL_FONT`. */
  font: string;
  /** The measured width. */
  width: number;
  /** What a reader sees: `fontPx` high. What the probe counts and the router (M2) avoids. */
  ink: TextBox;
  /** `LABEL_LINE_H` high: what `noteText` records, for plates and gap labels to avoid. */
  line: TextBox;
}

/** A name that would read better on two lines, if the line above its row is free of links. */
export interface WrapProposal {
  upper: PlacedText;
  lower: PlacedText;
  /** The name as one truncated line, or null where even that is empty: what is drawn instead. */
  fallback: PlacedText | null;
}

/**
 * One activity that reached the name layer's font write (a name-row placement with room). `line`
 * is null where the name is suppressed; `wrap` is set where a two-line form is proposed, and then
 * `line` is null too (the proposal carries its own fallback).
 */
export interface NameStep {
  activityId: string;
  bold: boolean;
  line: PlacedText | null;
  wrap: WrapProposal | null;
}

/** One activity with both dates, on the reserved-row path: the dates it draws, in draw order. */
export interface DateStep {
  activityId: string;
  items: PlacedText[];
}

/** One centre-line date on the legacy path, with its plate where the tails lens is on. */
export interface FlankDate {
  item: PlacedText;
  /** The plate behind it (x and width; the painter owns its height). */
  plate: { x: number; w: number } | null;
}

export interface RowTextLayout {
  /** The name layer ran (its gate), and what each activity drew. Null where the layer is off. */
  names: {
    steps: NameStep[];
    /** Legacy inside/beside labels, in draw order, interleaved with the steps by `order`. */
    legacy: PlacedText[];
    /** Draw order across `steps` and `legacy`: each entry indexes one of the two. */
    order: ({ step: number } | { legacy: number })[];
  } | null;
  /** The date layer ran, and what it drew. Null where it is off. */
  dates: {
    reserved: DateStep[];
    flank: FlankDate[];
  } | null;
  /** The centre layer ran; `measured` is whether any activity reached a measurement (its lazy font). */
  centre: {
    measured: boolean;
    items: PlacedText[];
  } | null;
}

export interface RowTextInput {
  /**
   * `frame.laneRows` (`paint-frame.ts`): the visible set, lane-bucketed and x-sorted. A getter, and
   * called only by a layer that runs, so a paint with every text layer off never builds it.
   */
  rows: () => ReadonlyMap<number, readonly LaneRow[]>;
  view: Viewport;
  size: { width: number; height: number };
  toggles: TsldViewToggles;
  visualRefresh: boolean;
  reservesTextRows: boolean;
  measure: (text: string, font?: string) => number;
  labelOf: (a: RenderActivity) => string;
  /**
   * Propose no two-line wraps (links-and-labels M2-T3). A wrap is the painter's decision AFTER
   * routing, and the router reads a wrapped name's one-line fallback, so a caller that only routes
   * — Tidy, the probes, `sceneRowText` — gets identical items with or without it (a property test
   * holds that). Without it the layout measures single words for the wrap, which the Tidy worker's
   * width table does not hold, and the search fails on any plan whose names would wrap.
   */
  oneLineOnly?: boolean;
}

/** The font px of `LABEL_FONT` and `MILESTONE_LABEL_FONT`: the ink box's height. */
const FONT_PX = 11;

function boxes(
  x: number,
  width: number,
  y: number,
  align: 'left' | 'center' | 'right',
): { ink: TextBox; line: TextBox } {
  const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  return {
    ink: { x: left, y: y - FONT_PX / 2, w: width, h: FONT_PX },
    line: { x: left, y: y - LABEL_LINE_H / 2, w: width, h: LABEL_LINE_H },
  };
}

function placed(
  activityId: string,
  lane: number,
  kind: PlacedTextKind,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'center' | 'right',
  font: string,
  width: number,
): PlacedText {
  return { activityId, lane, kind, text, x, y, align, font, width, ...boxes(x, width, y, align) };
}

/** Every text item the layout drew or proposes, flattened: the router's and the probe's view. */
export function allItems(layout: RowTextLayout): PlacedText[] {
  const out: PlacedText[] = [];
  if (layout.names) {
    for (const s of layout.names.steps) {
      if (s.line) out.push(s.line);
      else if (s.wrap?.fallback) out.push(s.wrap.fallback);
    }
    out.push(...layout.names.legacy);
  }
  if (layout.dates) {
    for (const s of layout.dates.reserved) out.push(...s.items);
    for (const f of layout.dates.flank) out.push(f.item);
  }
  if (layout.centre) out.push(...layout.centre.items);
  return out;
}

export function layoutRowText({
  rows,
  view,
  size,
  toggles,
  visualRefresh,
  reservesTextRows,
  measure,
  labelOf,
  oneLineOnly = false,
}: RowTextInput): RowTextLayout {
  // Layer 3.6: activity labels (`{code} {name} · {n}d`), so the diagram reads without selecting
  // (ADR-0026 D1). Gated by the toggle and, off the reserved-row path, a legibility zoom (LABEL_MIN_PX_PER_DAY). Placed inside
  // a wide-enough task bar (truncated + ellipsised to fit, so no clip needed), beside a short bar or
  // milestone when the same-lane neighbour leaves clear room, else suppressed. The visible set is
  // bucketed by lane and x-sorted once (O(v log v)) so each label's right-neighbour is known without
  // a per-label scan; widths are memoised (font fixed) so a label measures at most once ever.
  //
  // **The zoom gate applies only where the row has no text rows** (`docs/TECH_DEBT.md` #378). It
  // was written when a name lived INSIDE its bar, where a narrow bar genuinely had no room. On the
  // reserved-row path the name sits in its own row above the bar and is fitted per bar below
  // (budget = the bar plus half of each neighbour gap, truncated to fit, nothing when nothing
  // fits), so the gate withheld names that fit — a 900 px bar at whole-plan zoom had no name. The
  // NetPoint reference plan found it: at NetPoint's own scale (~1 px/day) its picture labels every
  // bar and ours labelled none.
  let names: RowTextLayout['names'] = null;
  if ((toggles.labels ?? true) && (reservesTextRows || view.pxPerDay >= LABEL_MIN_PX_PER_DAY)) {
    const regular = (s: string): number => measure(s);
    // Placement polish (M4): an inside label clears the refreshed bar's rounded corner with a
    // little extra pad. Flag-off the extra is 0, so the arithmetic (and the paint log) is
    // byte-for-byte today's. The font is deliberately unchanged — the module-scope width memo is
    // keyed by text alone, so a metric change would poison it across palettes (export path).
    const insidePad = LABEL_PAD_PX + (visualRefresh ? 2 : 0);
    const steps: NameStep[] = [];
    const legacy: PlacedText[] = [];
    const order: ({ step: number } | { legacy: number })[] = [];

    for (const row of rows().values()) {
      for (let i = 0; i < row.length; i += 1) {
        const { activity, rect } = row[i]!;
        const nextLeftX = i + 1 < row.length ? row[i + 1]!.rect.x : Infinity;
        const besideRoomPx = nextLeftX - (rect.x + rect.w) - LABEL_GAP_PX;
        const placement = labelPlacement({
          barWidth: rect.w,
          barHeight: rect.h,
          isMilestone: isMilestone(activity.type),
          besideRoomPx,
          rowHasNameRow: reservesTextRows,
        });
        if (placement === 'none') continue;
        const cy = rect.y + rect.h / 2;
        if (placement === 'above') {
          // The reference's own placement: the name centred over its bar, in the row `rowSlots`
          // reserves for it. Centred rather than left-aligned because the bar it names is a span
          // and the eye reads the pair as one object.
          //
          // Truncated to the bar's width PLUS the room its neighbour leaves, and **nothing else**.
          // The name row carries no other bar's ink, so the only thing a name can collide with is
          // the next name in the same lane — which is exactly what `besideRoomPx` measures. A cap
          // was written here first and removed on measurement: it bound the commonest case in the
          // product, a **milestone**, whose bar is 14 px wide, so every milestone's name truncated
          // in a row that was otherwise empty.
          //
          // The residual is stated rather than hidden: a CENTRED name spends half its overhang to
          // the left, where the room is the PREVIOUS neighbour's and this layer does not compute
          // it. A name can therefore reach left into a preceding bar's name. Bounded (the previous
          // bar's own name is centred on itself) and visible in the M3-T3 picture, so it is a
          // judgement for that review rather than a guess here.
          // **The lane, never `rect.y - BAR_PAD`.** That subtraction recovers the lane's top for a
          // task bar and NOT for a milestone, whose rect is centred on the lane rather than
          // padded into it — so a milestone's name sat 4.5 px above every other name in the row,
          // a ragged text row nothing but a rendered picture would have shown.
          //
          // **A lone ellipsis is not a shorter name, and M3-T3's own claim needed this line.**
          // That milestone said crowding "truncates a name; it no longer suppresses one … a
          // planner never loses an activity's identity to density" — and `truncateToWidth` returns
          // a bare `LABEL_ELLIPSIS` when not even one character fits (`geometry.ts:824`), which
          // names nothing and reads as content. Found in the M3-T4 picture: a milestone beside a
          // close neighbour drew `…` and nothing else. So the claim holds while any character
          // survives, and below that the row shows the bar alone — the name is still on the bar's
          // option in the parallel listbox (ADR-0026 D7), which is where identity actually lives.
          const slots = rowSlots(screenYOfLane(activity.laneIndex, view));
          // **A gap is shared, so each side claims HALF of it.** The residual above was judged by
          // the M6 UX review against a rendered picture and it garbles: two adjacent names read as
          // one string (`A.A2300` in `assignment-shipped.png`), which is worse than a shorter name
          // because it reads as content and is wrong. Halving is what makes non-collision
          // provable rather than likely — bar i may reach `(gap - LABEL_GAP_PX) / 2` right and bar
          // i+1 the same distance left, so the two are always `LABEL_GAP_PX` apart. Claiming the
          // WHOLE gap on each side, which is what the old right-only rule did, lets both do it.
          //
          // **And the half is NOT clamped at zero** (NetPoint-layout M1, FC-N6a). A milestone's
          // diamond is a fixed glyph that is wider than a day at coarse zoom, so its rect can
          // overlap its neighbour's even though their spans do not. Clamping each side's room at 0
          // then left both names their whole rect width, and M0-T5 counted 9 collisions on Unit 300
          // at 4 px/day, every one beside a milestone. A negative room shrinks the budget instead,
          // so the boundary is the midpoint of the overlap and the non-collision argument above
          // holds for overlapping rects too; a budget with no room left prints nothing.
          const halfGap = (raw: number): number =>
            raw === Infinity ? size.width : (raw - LABEL_GAP_PX) / 2;
          const rightRoom = halfGap(nextLeftX - (rect.x + rect.w));
          // **The left bound exists only where a previous name does.** With no neighbour behind
          // it, a first-in-row name keeps today's free centring — it overhangs into empty lane,
          // which is where the reference puts it and is nobody's room to lose. The room it may
          // claim for WIDTH is still zero there, so this fix never makes a label longer than the
          // rule it replaces; it only stops one reaching into another.
          const hasPrev = i > 0;
          const leftRoom = hasPrev
            ? halfGap(rect.x - (row[i - 1]!.rect.x + row[i - 1]!.rect.w))
            : 0;
          const budget = rect.w + leftRoom + rightRoom;
          if (budget <= 0) continue;
          // A milestone's name is bold (spec §4.2 G7), measured under its own memo key so the bold
          // width never answers for the regular string (§4.13 A6).
          const bold = isMilestone(activity.type);
          const font = bold ? MILESTONE_LABEL_FONT : LABEL_FONT;
          const fit = bold ? (t: string): number => measure(t, MILESTONE_LABEL_FONT) : regular;
          const full = labelOf(activity);
          const stepIndex = steps.length;
          order.push({ step: stepIndex });
          const oneLine = truncateToWidth(full, budget, fit);
          let text = oneLine;
          // Wrap where a one-line name would truncate and a second line has room (M4-T2).
          let upper: string | null = null;
          if (text !== full && !oneLineOnly) {
            const lines = wrapTwoLines(full, budget, fit);
            if (lines) {
              upper = lines[0];
              text = lines[1];
            }
          }
          if (!text || text === LABEL_ELLIPSIS) {
            steps.push({ activityId: activity.id, bold, line: null, wrap: null });
            continue;
          }
          // Centred on its bar where the room allows, then slid back inside whichever neighbour's
          // half it would otherwise cross. A milestone's 14 px box with a generous gap on one side
          // still gets that whole half — the alternative (a symmetric cap) would truncate it for
          // room it is not using. **Centred on the part of the bar that is on screen**
          // (`docs/TECH_DEBT.md` #380): a bar longer than the viewport had its name at its middle,
          // so panning along it showed a line with no name for most of its length.
          const centreFor = (textW: number): number => {
            const minCx = hasPrev ? rect.x - leftRoom + textW / 2 : -Infinity;
            const maxCx = rect.x + rect.w + rightRoom - textW / 2;
            const visibleLeft = Math.max(rect.x, 0);
            const visibleRight = Math.min(rect.x + rect.w, size.width);
            const centreX =
              visibleRight - visibleLeft >= textW
                ? Math.min(
                    Math.max(rect.x + rect.w / 2, visibleLeft + textW / 2),
                    visibleRight - textW / 2,
                  )
                : rect.x + rect.w / 2;
            return minCx <= maxCx ? Math.min(Math.max(centreX, minCx), maxCx) : centreX;
          };
          const cx = centreFor(upper === null ? fit(text) : Math.max(fit(text), fit(upper)));
          if (upper === null) {
            steps.push({
              activityId: activity.id,
              bold,
              line: placed(
                activity.id,
                activity.laneIndex,
                'name',
                text,
                cx,
                slots.nameY,
                'center',
                font,
                fit(text),
              ),
              wrap: null,
            });
            continue;
          }
          // Spec §4.13 A4: a wrapped pair shares the pad above the bar, so both lines move.
          const wrapped = wrappedNameYs(slots);
          // No room above (the painter's clearance test): the one truncated line, exactly as
          // before the wrap existed.
          const fallback =
            !oneLine || oneLine === LABEL_ELLIPSIS
              ? null
              : placed(
                  activity.id,
                  activity.laneIndex,
                  'name',
                  oneLine,
                  centreFor(fit(oneLine)),
                  slots.nameY,
                  'center',
                  font,
                  fit(oneLine),
                );
          steps.push({
            activityId: activity.id,
            bold,
            line: null,
            wrap: {
              upper: placed(
                activity.id,
                activity.laneIndex,
                'name-upper',
                upper,
                cx,
                wrapped.upper,
                'center',
                font,
                fit(upper),
              ),
              lower: placed(
                activity.id,
                activity.laneIndex,
                'name-lower',
                text,
                cx,
                wrapped.lower,
                'center',
                font,
                fit(text),
              ),
              fallback,
            },
          });
        } else if (placement === 'inside') {
          const text = truncateToWidth(labelOf(activity), rect.w - insidePad * 2, regular);
          if (!text) continue;
          order.push({ legacy: legacy.length });
          legacy.push(
            placed(
              activity.id,
              activity.laneIndex,
              'inside',
              text,
              rect.x + insidePad,
              cy,
              'left',
              LABEL_FONT,
              regular(text),
            ),
          );
        } else {
          const startX = rect.x + rect.w + LABEL_GAP_PX;
          const maxPx = (nextLeftX === Infinity ? size.width : nextLeftX) - startX - LABEL_PAD_PX;
          const text = truncateToWidth(labelOf(activity), maxPx, regular);
          if (!text) continue;
          order.push({ legacy: legacy.length });
          legacy.push(
            placed(
              activity.id,
              activity.laneIndex,
              'beside',
              text,
              startX,
              cy,
              'left',
              LABEL_FONT,
              regular(text),
            ),
          );
        }
      }
    }
    names = { steps, legacy, order };
  }

  /**
   * Whether a bar's two dates fit inside its own ends (the dates ladder's first rung). One function
   * because two passes ask it — the dates themselves and the centre item that shares their row —
   * and two copies of the test would let the centre item believe the dates were outside the bar on
   * exactly the bar where they were drawn inside it, and print over them.
   */
  const datesFitInside = (
    startWidthPx: number,
    finishWidthPx: number,
    span: { left: number; right: number },
  ): boolean => startWidthPx + finishWidthPx + LABEL_GAP_PX <= span.right - span.left;

  /**
   * How far text under a bar keeps from each of its ends: clear of the node disc there (NetPoint
   * grammar M2-T3, spec §4.13 A3). A 15 px disc on a 6 px bar reaches into the date row, so a date
   * written at the bar's own end would print over it. Only a task bar on the refreshed path has
   * nodes; a milestone, a span and the legacy path keep today's placement exactly.
   */
  const nodeTextInset = (activity: RenderActivity): number =>
    visualRefresh && barGlyphKind(activity.type) === 'bar' ? NODE_TEXT_CLEAR_PX : 0;

  /**
   * The x-range text under bar `i` may use: its own ends, less its own nodes' clearance, and never
   * into a NEIGHBOUR's node where one abuts it. The second half is the case the first version
   * missed: an LOE or summary has no nodes of its own, so its text started at its own edge, where
   * an abutting task's node already sat (FC-G5 found it, as a one-day "1d" on Unit 300).
   */
  const textSpan = (
    row: readonly { activity: RenderActivity; rect: Rect }[],
    i: number,
  ): { left: number; right: number } => {
    const { activity, rect } = row[i]!;
    const own = nodeTextInset(activity);
    const prev = row[i - 1];
    const next = row[i + 1];
    const left = Math.max(
      rect.x + own,
      prev ? prev.rect.x + prev.rect.w + nodeTextInset(prev.activity) : -Infinity,
    );
    const right = Math.min(
      rect.x + rect.w - own,
      next ? next.rect.x - nodeTextInset(next.activity) : Infinity,
    );
    return { left, right };
  };

  // Layer 3.7: flanking start/finish DATES (ADR-0054 §3) — the start date left of the bar, the
  // finish date right of it, never inside (an inside date competes with the name label for the
  // same pixels and vanishes on any bar narrower than its text). Gated by the `dates` toggle AND
  // a zoom well above the label LOD, because this is two strings + two measurements per bar
  // against the ADR-0026 draw budget. Absent toggle ⇒ not one call ⇒ byte-for-byte parity.
  // Same rule as the names above (#378): the reserved-row branch below fits both dates inside the
  // bar, or flanks each end on its half of the gap, or draws nothing, so the zoom gate only ever
  // withheld dates that fit. It still guards the centre-line path, which has no such room test.
  // **Withheld at the overview tier** (NetPoint grammar M4-T4, spec §4.2 G11): at Year and Fit a
  // dense plan's dates collide more than they fit (`m0-lod.md`: Unit 300 withheld 46 % at 4 px a
  // day and 75 % at 1), and the ruler still states position.
  const datesTier = lodTier(view.pxPerDay) !== 'overview';
  let dates: RowTextLayout['dates'] = null;
  if (
    toggles.dates === true &&
    datesTier &&
    (reservesTextRows || view.pxPerDay >= DATE_LABEL_MIN_PX_PER_DAY)
  ) {
    const regular = (s: string): number => measure(s);
    // With the float/drift tails ALSO on, the two layers want the same pixels: a tail runs out of
    // the very edge the date is written beside, so the hatch strikes through the text. The date is
    // NOT moved clear of the tail — a date printed at the far end of a 200-day tail would sit
    // 1,200px from the bar and, on a time-scaled diagram, assert the wrong day. Instead each date
    // gets an opaque plate in the canvas ground behind it: the date keeps the one position that is
    // true, and the tail visibly passes behind it. One extra fillRect per drawn date, and only
    // when both toggles are on — with tails off, the draw is byte-for-byte the M3 pass.
    const plated = toggles.floatTails === true;
    /**
     * Whether the bar after `i` starts at `i`'s end AND will write its own start date there —
     * i.e. whether the node already has its one date. "At the end" means closer than
     * {@link LABEL_GAP_PX}, the separation the date layer keeps everywhere else, so any gap a
     * reader could see two dates in is left alone. It asks the same question the next bar's own
     * pass will ask ({@link datesFitInside}), so the two cannot disagree about whether the start
     * is drawn and leave the node empty.
     */
    const nextDrawsStartAtNode = (
      row: readonly { activity: RenderActivity; rect: Rect }[],
      i: number,
      rect: Rect,
    ): boolean => {
      const next = row[i + 1];
      if (!next) return false;
      if (!sharesNode(rect, next.rect)) return false;
      const a = next.activity;
      if (isMilestone(a.type) || !a.earlyStart || !a.earlyFinish) return false;
      return datesFitInside(
        regular(formatCanvasDate(a.earlyStart)),
        regular(formatCanvasDate(a.earlyFinish)),
        textSpan(row, i + 1),
      );
    };
    const reserved: DateStep[] = [];
    const flank: FlankDate[] = [];
    for (const row of rows().values()) {
      for (let i = 0; i < row.length; i += 1) {
        const { activity, rect } = row[i]!;
        if (!activity.earlyStart || !activity.earlyFinish) continue; // uncalculated ⇒ no dates
        const startText = formatCanvasDate(activity.earlyStart);
        const finishText = formatCanvasDate(activity.earlyFinish);
        const startWidthPx = regular(startText);
        const finishWidthPx = regular(finishText);
        const prevRight = i > 0 ? row[i - 1]!.rect.x + row[i - 1]!.rect.w : 0;
        const nextLeft = i + 1 < row.length ? row[i + 1]!.rect.x : size.width;
        const slot = dateLabelSlot({
          roomLeftPx: rect.x - prevRight,
          roomRightPx: nextLeft - (rect.x + rect.w),
          startWidthPx,
          finishWidthPx,
        });
        // **Below the bar when the row reserves a row for it** (M3-T3) — the reference's own
        // placement, and it disposes of `dateLabelSlot` entirely in that case: a flanking date
        // competes with the same-lane neighbour for horizontal room and is suppressed when it
        // loses, which on a dense programme is most of them. A date under its own bar end competes
        // with its own TWIN instead — see the fit test below, and read it before believing the
        // first draft of this sentence, which promised "both its dates at every density".
        //
        // **The reference's third run — the duration — is drawn by the next layer, not this one**
        // (NetPoint-layout M1). It used to be withheld here because it was already on screen in
        // the name row (`{identity} · 5d`); M1 moved it out of the name so that it could live here,
        // under its bar, beside the float left. It is the activity's `durationDays`, a working-day
        // figure, never the drawn calendar span, which differs on any calendar with non-working days.
        if (reservesTextRows) {
          // **Both dates or neither, and only when the pair fits inside the bar's own width.**
          // The M6 UX review reproduced the defect against the real painter: this branch measured
          // nothing, so on any bar narrower than its two dates the start (left-aligned at the bar's
          // left edge) and the finish (right-aligned at its right edge) overprint each other, and
          // the surplus spills past both ends into the neighbours' gaps. The comment below this
          // one claimed the opposite — "every bar states both its dates at every density" — which
          // is the reservation of a vertical ROW being read as a guarantee about horizontal room.
          //
          // The ladder is the one every other label layer here uses, and **suppression is its
          // last rung rather than its first**: inside the bar's own ends where the pair fits
          // there, flanking the ends where the row has room beside them, and nothing where it has
          // neither — with the dates always on the bar's option in the parallel listbox
          // (ADR-0026 D7). A first draft suppressed outright, and `paint.dates-budget.test.ts`
          // refused it: at the LOD threshold a five-day bar is 30 px and two dates are ~72, so
          // every date in that fixture vanished and the budget gate measured nothing — which its
          // own docblock calls worse than no fixture. The gate was right and the rule was too
          // blunt.
          const below = rowSlots(screenYOfLane(activity.laneIndex, view)).belowY;
          const inset = nodeTextInset(activity);
          const items: PlacedText[] = [];
          if (isMilestone(activity.type)) {
            // **One date, centred under the diamond** (NetPoint-layout M1). A milestone's start and
            // finish are the same day, so the ladder below printed that day twice, once either side
            // of a 12 px glyph. It is judged against HALF of each neighbour gap plus half the
            // glyph, the same sharing rule the flanking rung uses.
            // A neighbouring task's node reaches into the gap from its side (A3), so the date's
            // share of that gap stops at the node's clearance even when half the gap is more.
            const halfText = startWidthPx / 2;
            const prevReach = i > 0 ? nodeTextInset(row[i - 1]!.activity) : 0;
            const nextReach = i + 1 < row.length ? nodeTextInset(row[i + 1]!.activity) : 0;
            const gapLeft = rect.x - prevRight;
            const gapRight = nextLeft - (rect.x + rect.w);
            const roomLeft = Math.max(0, Math.min(gapLeft / 2, gapLeft - prevReach)) + rect.w / 2;
            const roomRight =
              Math.max(0, Math.min(gapRight / 2, gapRight - nextReach)) + rect.w / 2;
            if (halfText <= roomLeft && halfText <= roomRight) {
              items.push(
                placed(
                  activity.id,
                  activity.laneIndex,
                  'milestone-date',
                  startText,
                  rect.x + rect.w / 2,
                  below,
                  'center',
                  LABEL_FONT,
                  startWidthPx,
                ),
              );
            }
          } else if (datesFitInside(startWidthPx, finishWidthPx, textSpan(row, i))) {
            // **Inside its own ends**, which is the reference's placement and reaches nothing: the
            // start begins at the start node's rim plus a gap, the finish ends at the finish node's.
            const span = textSpan(row, i);
            items.push(
              placed(
                activity.id,
                activity.laneIndex,
                'date-start',
                startText,
                span.left,
                below,
                'left',
                LABEL_FONT,
                startWidthPx,
              ),
            );
            // **One date per node** (`docs/TECH_DEBT.md` #379). Where the next bar in the lane
            // starts at this bar's end, its start date is written at the same node, and the two ran
            // together ("31 Jan1 Feb"). NetPoint writes the node once, with the next activity's
            // start, so the finish is withheld exactly when the next bar will draw its start there.
            // The finish is still on the bar's option in the parallel listbox (ADR-0026 D7).
            if (!nextDrawsStartAtNode(row, i, rect)) {
              items.push(
                placed(
                  activity.id,
                  activity.laneIndex,
                  'date-finish',
                  finishText,
                  span.right,
                  below,
                  'right',
                  LABEL_FONT,
                  finishWidthPx,
                ),
              );
            }
          } else {
            // **Otherwise flank the ends it has room beside**, each end judged on its own HALF of
            // the gap — the same sharing rule the name row uses one line up, and for the same
            // reason: the whole gap belongs to two bars, so a rule that grants it to each of them
            // grants it twice. `dateLabelSlot` is the room test the flanking path has always used;
            // what is new is halving what it is told the room is.
            // A task's flanking date also stands clear of its own node (A3): the node reaches
            // `inset` beyond the bar's end, so the date is offset by that and charged for it.
            const half = (raw: number): number => Math.max(0, raw / 2);
            const offset = Math.max(LABEL_GAP_PX, inset);
            const extra = offset - LABEL_GAP_PX;
            const belowSlot = dateLabelSlot({
              roomLeftPx: half(rect.x - prevRight),
              roomRightPx: half(nextLeft - (rect.x + rect.w)),
              startWidthPx: startWidthPx + extra,
              finishWidthPx: finishWidthPx + extra,
            });
            if (belowSlot.start) {
              items.push(
                placed(
                  activity.id,
                  activity.laneIndex,
                  'date-start',
                  startText,
                  rect.x - offset,
                  below,
                  'right',
                  LABEL_FONT,
                  startWidthPx,
                ),
              );
            }
            if (belowSlot.finish) {
              items.push(
                placed(
                  activity.id,
                  activity.laneIndex,
                  'date-finish',
                  finishText,
                  rect.x + rect.w + offset,
                  below,
                  'left',
                  LABEL_FONT,
                  finishWidthPx,
                ),
              );
            }
          }
          reserved.push({ activityId: activity.id, items });
          continue;
        }
        const cy = rect.y + rect.h / 2;
        if (slot.start) {
          flank.push({
            item: placed(
              activity.id,
              activity.laneIndex,
              'flank-start',
              startText,
              rect.x - LABEL_GAP_PX,
              cy,
              'right',
              LABEL_FONT,
              startWidthPx,
            ),
            plate: plated
              ? { x: rect.x - LABEL_GAP_PX - startWidthPx - 1, w: startWidthPx + 2 }
              : null,
          });
        }
        if (slot.finish) {
          flank.push({
            item: placed(
              activity.id,
              activity.laneIndex,
              'flank-finish',
              finishText,
              rect.x + rect.w + LABEL_GAP_PX,
              cy,
              'left',
              LABEL_FONT,
              finishWidthPx,
            ),
            plate: plated ? { x: rect.x + rect.w + LABEL_GAP_PX - 1, w: finishWidthPx + 2 } : null,
          });
        }
      }
    }
    dates = { reserved, flank };
  }

  // Layer 3.8: the CENTRE ITEM under each bar (NetPoint-layout M1, spec §4.6) — `5d · 3d float
  // left`, or `5d` where only that fits, or nothing. It rides `Labels` and its LOD, because it
  // replaces the `· 5d` suffix `Labels` always governed. **It never leaves its own bar**: inside the
  // gap between the two dates when the dates are drawn inside the bar, inside the whole bar
  // otherwise. Bars in one row never overlap, so it cannot collide with a neighbour by construction
  // — the same provability the halved-gap rule gives the dates. Absent `durationDays` (a scene built
  // before the field existed) ⇒ not one call.
  // No zoom gate (#378): this layer exists only on the reserved-row path, and it never leaves its
  // own bar — the room test below is the whole of its legibility rule.
  // **Off by default, and drawn at the detail tier only** (NetPoint grammar M4-T1/T4, spec §4.2
  // G7/G11): the reference prints no duration or float under its bars, so the item is behind
  // `View ▾ ▸ Markers ▸ Duration & float`.
  let centre: RowTextLayout['centre'] = null;
  if (
    reservesTextRows &&
    (toggles.labels ?? true) &&
    toggles.centreItem === true &&
    lodTier(view.pxPerDay) === 'detail'
  ) {
    // **Every context write is lazy**, so a frame with nothing to print here costs nothing: the
    // first draft set the font, baseline and alignment up front and the golden log caught three
    // writes on a scene whose bars carry no duration — a per-frame cost for an empty layer. The
    // painter owns those writes; `measured` tells it whether the first measurement happened.
    let measured = false;
    const regular = (t: string): number => {
      measured = true;
      return measure(t);
    };
    // Must agree with the dates layer's own condition, which on this path is the toggle and the
    // tier.
    const datesDrawn = toggles.dates === true && datesTier;
    const items: PlacedText[] = [];
    for (const row of rows().values()) {
      for (let i = 0; i < row.length; i += 1) {
        const { activity } = row[i]!;
        if (activity.durationDays === undefined) continue;
        if (!activity.earlyStart || !activity.earlyFinish) continue;
        const item = {
          durationDays: activity.durationDays,
          remainingFloat: activity.remainingFloat,
          milestone: isMilestone(activity.type),
          summary: activity.type === 'WBS_SUMMARY',
        };
        // A critical activity prints its duration alone (spec §4.2 G7, P7): its float is none, and
        // "0d float left" under every bar on the critical path is noise.
        const full = centreItemText(item, activity.isCritical ? 'short' : 'full');
        if (full === null) continue;
        // Clear of its own nodes and any abutting neighbour's (A3), whether or not the dates are
        // drawn inside.
        const span = textSpan(row, i);
        let left = span.left;
        let right = span.right;
        if (datesDrawn) {
          const startWidthPx = regular(formatCanvasDate(activity.earlyStart));
          const finishWidthPx = regular(formatCanvasDate(activity.earlyFinish));
          if (datesFitInside(startWidthPx, finishWidthPx, span)) {
            left += startWidthPx + LABEL_GAP_PX;
            right -= finishWidthPx + LABEL_GAP_PX;
          }
        }
        const room = right - left;
        const short = centreItemText(item, 'short');
        const text =
          regular(full) <= room ? full : short !== null && regular(short) <= room ? short : null;
        if (text === null) continue;
        const below = rowSlots(screenYOfLane(activity.laneIndex, view)).belowY;
        items.push(
          placed(
            activity.id,
            activity.laneIndex,
            'centre',
            text,
            (left + right) / 2,
            below,
            'center',
            LABEL_FONT,
            regular(text),
          ),
        );
      }
    }
    centre = { measured, items };
  }

  return { names, dates, centre };
}

/** A width lookup: `measure(text, font)`, `font` undefined for the regular label font. */
export type TextMeasure = (text: string, font?: string) => number;

/**
 * **The text layout of a whole scene**, for a caller with no paint frame: the layout objective
 * (Tidy), the probes and the routing tests (links-and-labels M2-T2). Every activity with a drawn rect
 * takes part, as it does in a frame whose viewport holds the whole plan; the rows come from
 * `laneRowsOf`, the frame's own bucketing, so the search scores the text the canvas draws.
 */
export function sceneRowText(
  scene: {
    activities: readonly RenderActivity[];
    dataDate: string;
    visualRefresh?: boolean | undefined;
  },
  view: Viewport,
  size: { width: number; height: number },
  toggles: TsldViewToggles,
  measure: TextMeasure,
  rectCache: RectCache = new Map(),
): RowTextLayout {
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const rects = new Map<string, Rect>();
  for (const a of scene.activities) {
    const r = activityRect(a, view, scene.dataDate, rectCache);
    if (r) rects.set(a.id, r);
  }
  const withCodes = toggles.activityCodes === true;
  let rows: ReadonlyMap<number, readonly LaneRow[]> | null = null;
  return layoutRowText({
    rows: () => (rows ??= laneRowsOf(rects, byId)),
    view,
    size,
    toggles,
    visualRefresh: scene.visualRefresh === true,
    reservesTextRows: rowReservesTextRows(),
    measure,
    labelOf: (a) => canvasLabel({ code: a.code ?? null, name: a.label }, withCodes),
    oneLineOnly: true,
  });
}

/**
 * {@link sceneRowText}'s items, laid out **a lane at a time** and, given a `memo`, remembered by what
 * each lane holds (links-and-labels M2-T6b, spec §4.9). Every placement rule in {@link
 * layoutRowText} reads one lane's row and nothing else, so a lane's items depend only on its own
 * activities, in order, at a fixed view, width and set of toggles: a Tidy move changes one or two
 * lanes and every other lane is answered from the memo. A property test holds the items equal to
 * the whole-plan layout's.
 *
 * The memo is valid for ONE view, canvas width, set of toggles, measure and set of activity dates:
 * its owner (`optimiseLayout`) creates one per search, where all of those are fixed and only the
 * lanes move.
 */
export function sceneRowTextItems(
  scene: {
    activities: readonly RenderActivity[];
    dataDate: string;
    visualRefresh?: boolean | undefined;
  },
  view: Viewport,
  size: { width: number; height: number },
  toggles: TsldViewToggles,
  measure: TextMeasure,
  rectCache: RectCache = new Map(),
  memo?: Map<string, readonly PlacedText[]>,
): PlacedText[] {
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const rects = new Map<string, Rect>();
  for (const a of scene.activities) {
    const r = activityRect(a, view, scene.dataDate, rectCache);
    if (r) rects.set(a.id, r);
  }
  const withCodes = toggles.activityCodes === true;
  const reservesTextRows = rowReservesTextRows();
  const out: PlacedText[] = [];
  for (const [lane, row] of laneRowsOf(rects, byId)) {
    const key = memo ? `${String(lane)}|${row.map((r) => r.activity.id).join(',')}` : null;
    const hit = key === null ? undefined : memo!.get(key);
    if (hit) {
      out.push(...hit);
      continue;
    }
    const items = allItems(
      layoutRowText({
        rows: () => new Map([[lane, row]]),
        view,
        size,
        toggles,
        visualRefresh: scene.visualRefresh === true,
        reservesTextRows,
        measure,
        labelOf: (a) => canvasLabel({ code: a.code ?? null, name: a.label }, withCodes),
        oneLineOnly: true,
      }),
    );
    if (key !== null) memo!.set(key, items);
    out.push(...items);
  }
  return out;
}

/** A width table key: the memo's own (`measure.ts`), the font only when one is given. */
export const textWidthKey = (text: string, font: string | undefined): string =>
  font === undefined ? text : `${font}\u0000${text}`;

/**
 * **Every width the layout can ask for, per activity** (links-and-labels M2-T3, spec §4.4). The
 * Tidy worker has no `document`, so it is sent a table of these keys' widths, measured by the
 * painter's own memo at the moment of the press. What the layout can ask is finite: an activity's
 * canvas label in its font (bold for a milestone), the ellipsis, every prefix of the label plus the
 * ellipsis trimmed and untrimmed (`truncateToWidth`'s search), the two dates, and the centre item's
 * two forms. The two-line wrap is NOT here: the router scores the one-line name (spec D-4), and the
 * wrap is the painter's decision after routing, so `sceneRowText` proposes none (`oneLineOnly`).
 * **M2-T3's property test is why that flag exists**: M0-T4's recording found no key outside this
 * set because none of its four scenes wraps a name, and the first property run over random plans
 * found the wrap's single words at once. M0-T4 recorded every key the painter asks for over
 * four scenes and found none outside this set; the completeness property test holds it.
 */
export function textWidthKeys(
  activities: readonly RenderActivity[],
  toggles: TsldViewToggles,
): { text: string; font: string | undefined }[] {
  const out = new Map<string, { text: string; font: string | undefined }>();
  const add = (text: string, font: string | undefined): void => {
    out.set(textWidthKey(text, font), { text, font });
  };
  const withCodes = toggles.activityCodes === true;
  for (const a of activities) {
    const font = isMilestone(a.type) ? MILESTONE_LABEL_FONT : undefined;
    const label = canvasLabel({ code: a.code ?? null, name: a.label }, withCodes);
    add(label, font);
    add(LABEL_ELLIPSIS, font);
    for (let k = 0; k <= label.length; k += 1) {
      add(label.slice(0, k) + LABEL_ELLIPSIS, font);
      add(label.slice(0, k).trimEnd() + LABEL_ELLIPSIS, font);
    }
    if (a.earlyStart) add(formatCanvasDate(a.earlyStart), undefined);
    if (a.earlyFinish) add(formatCanvasDate(a.earlyFinish), undefined);
    if (toggles.centreItem === true && a.durationDays !== undefined) {
      const item = {
        durationDays: a.durationDays,
        remainingFloat: a.remainingFloat,
        milestone: isMilestone(a.type),
        summary: a.type === 'WBS_SUMMARY',
      };
      for (const form of ['full', 'short'] as const) {
        const t = centreItemText(item, form);
        if (t !== null) add(t, undefined);
      }
    }
  }
  return [...out.values()];
}

/** A measure answered from a width table, which throws on a key it does not hold. */
export function tableMeasure(table: Iterable<readonly [string, number]>): TextMeasure {
  const widths = new Map(table);
  return (text, font) => {
    const w = widths.get(textWidthKey(text, font));
    if (w === undefined) {
      throw new Error(
        `text width table has no entry for ${JSON.stringify(textWidthKey(text, font))}`,
      );
    }
    return w;
  };
}
