import { useId, useLayoutEffect, useRef, useState } from 'react';

import { HeadingLevelContext, deeper, useHeadingLevel } from './heading-level';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  /**
   * The section's heading. Rendered as an `<h2>`, or one rank deeper inside a `SectionGroup` — see
   * below for why the archetype decides that.
   */
  title: React.ReactNode;
  /** One line saying what the section holds, when the title alone is not enough. */
  description?: React.ReactNode;
  /** A section-level action, aligned opposite the title. */
  action?: React.ReactNode;
  /**
   * How many things this section holds, rendered beside the title.
   *
   * **It is a fact about the data, which is why it belongs to the heading and not to the body.** A
   * list whose length a reader can only learn by scrolling to the end of it is a list they cannot
   * plan around — and `fill`'s docblock already says a caller that scrolls its body owes its reader
   * a count, while offering nowhere to put one.
   *
   * **It is exposed to assistive technology, and it used to be `aria-hidden` on a premise that was
   * false.** That premise was "the screens that pass it already announce their settled result count
   * through a live region (ADR-0053 M6)", so a visible-only number avoided a reader hearing "12"
   * twice. The M8 accessibility and component reviews checked it against the four consumers and it
   * does not hold for any of them at the moment it matters:
   *
   * - `RecentlyDeletedTable` calls `useResultCountAnnouncement` **nowhere**, and its only
   *   `role="status"` states a different number (how many items expire soon). Its total was
   *   reachable by no route at all.
   * - The other three do call that hook — and it is **silent on first paint by its own docblock**,
   *   speaking only after a subsequent filter-driven change. So on arrival, which is the common
   *   case for a reader who never touches the search field, none of the four announced anything.
   *
   * A claim that was true of a pattern's original consumers, restated as a blanket premise and
   * false for the one added later: ADR-0076's shape. The remedy is parity rather than a second
   * announcement — the number is plain text beside the heading, so an AT user reading the section
   * gets exactly what the sighted reader gets, once. The live region keeps its own job, which is
   * saying that the number **changed**; nothing here is a live region, so there is no second
   * utterance to collide with.
   *
   * Pass the number, not a sentence. The archetype formats it, so two sections cannot disagree
   * about whether it is "12", "12 items" or "(12)".
   */
  count?: number | undefined;
  children: React.ReactNode;
  className?: string;
  /** Omits the card's own padding, for a section whose content is a full-bleed table. */
  flush?: boolean;
  /**
   * Fill the height the parent gives, keeping the heading in place and scrolling the body.
   *
   * **Only from the `PageGrid` split (`@6xl`, ADR-0182).** In one column the card is sized by its
   * content and the page scrolls; the caps are container variants resolved against the `PageGrid`
   * frame, so a `fill` card outside a `PageGrid` never caps. The two files name one size, held by
   * `page-grid.structural.test.ts`.
   *
   * **For a section inside a height-constrained grid, and only there.** The parent has to supply a
   * definite height — a `1fr` grid row or a flex child with `min-h-0` — or `h-full` resolves
   * against an `auto` parent and the card simply sizes to its content, which looks exactly like
   * this prop not being passed.
   *
   * It exists because the organisation landing asked its workspace region for 1302 px of room in
   * 949 (`m8-density-measurement.md`), and the honest way to fit is for the boxes to absorb the
   * overflow rather than the page. A caller that turns this on owes its reader a count — content
   * below the fold of a card is content nobody can tell from content that does not exist — which
   * is the `action` slot's job and not this prop's, because the count is a fact about the data.
   *
   * The body is a tab stop only while it overflows (see `useOverflowTabStop`).
   */
  fill?: boolean | undefined;
  /**
   * The section's `id`, making it an anchor target and a place focus can be sent.
   *
   * **Taken deliberately rather than stumbled into** (staff-console design, spec §8.4). A
   * `<section aria-labelledby>` is a landmark and is NOT focusable, and this interface accepted no
   * `id` and no rest spread — so a page wanting to offer "jump to the section that answers this"
   * could not, and the obvious workaround is a script-driven scroll, which gives a keyboard user
   * nothing. Setting `id` also sets `tabIndex={-1}`, because an anchor that moves the viewport
   * without moving focus leaves a keyboard reader exactly where they were, looking at something
   * else. `-1` keeps it out of the tab sequence: it is a destination, not a stop.
   */
  id?: string;
  /**
   * A ref to the `<section>` itself, for a caller that has to send focus back here imperatively.
   *
   * **Added because `id` alone could not replace what it was written to replace.** `id` makes the
   * section an anchor target and a focus destination, which covers "jump to the section that
   * answers this"; `ProjectCalendarsSection` additionally hands its region to
   * `useCalendarScopeMove` as a `restoreFocusRef`, so focus returns to the section a dialog was
   * opened from. That is a `RefObject`, and the alternative — looking the element up by `id` in an
   * effect — is an imperative copy of a reference React already has.
   *
   * It is a plain prop rather than `forwardRef`: React 19 passes `ref` to a function component like
   * any other, and `Card` already spreads its rest props onto the element.
   */
  ref?: React.Ref<HTMLElement> | undefined;
  /**
   * The content is being refreshed — `aria-busy` on the section. Added for `StatusSection`, whose
   * panels keep earlier figures on screen while a refetch is in flight; nothing else passes it, so
   * every other consumer's DOM is unchanged.
   */
  busy?: boolean;
}

/**
 * Rounded integers: `scrollHeight` and `clientHeight` are rounded separately, so a fractional layout
 * reports a spurious 1 px of overflow on a body that scrolls nothing.
 */
const OVERFLOW_SLACK_PX = 1;

/**
 * Whether a `fill` body is worth a tab stop, which is only while it overflows (`docs/TECH_DEBT.md`
 * #474). The body scrolls only from the `PageGrid` split, so in one column it is a purposeless stop.
 *
 * **It answers `0` until it has measured, and wherever it cannot** (jsdom, `display: none`): an
 * unreachable scroller is a level-A failure (WCAG 2.2 §2.1.1) and a spare stop is not.
 * The content wrapper is observed as well as the body, because a body that does not resize still
 * overflows the moment its rows grow.
 */
function useOverflowTabStop(enabled: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(true);
  useLayoutEffect(() => {
    const content = contentRef.current;
    const body = content?.parentElement;
    if (!enabled || !content || !body || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (body.clientHeight === 0) {
        setOverflows(true);
        return;
      }
      setOverflows(body.scrollHeight > body.clientHeight + OVERFLOW_SLACK_PX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [enabled]);
  return { contentRef, tabIndex: overflows ? 0 : -1 };
}

/**
 * A titled section of a page.
 *
 * **The archetype owns the heading rank, and that is the point.** `CardTitle` defaults to `<h1>`
 * because eleven existing call sites are a page's only heading (see its docblock). A section inside
 * a page is not that, so this passes the context's rank once, here — rather than asking sixteen
 * screens to remember. **The rank is `2` unless a `SectionGroup` is above it**, which supplies `3`
 * (`heading-level.tsx`); a consumer outside any group renders exactly the DOM it always did, which
 * `page/heading-level.test.tsx` pins. Getting it wrong in either direction is invisible on screen and wrong in the heading
 * tree, which is precisely the kind of decision an archetype exists to make once.
 *
 * It composes `Card` rather than reimplementing it, so a section and a card cannot drift apart —
 * the ADR-0062 extraction argument, applied before the divergence rather than after it.
 *
 * **It renders a NAMED `<section>`, which makes each section a landmark.** A `<section>` with an
 * accessible name is a `region`, so a screen-reader user can jump between "Recently changed" and
 * "Needs your attention" instead of walking the whole page. Unlike `PageContainer`'s refusal to be
 * a `<main>`, this adds no ambiguity: each region is distinctly named by its own heading, which is
 * exactly the condition the APG puts on using `region` at all.
 *
 * It was added when the overview journey hit a strict-mode violation — the same plan legitimately
 * appears in both sections, saying two different things — and the page had no way to say which
 * section a row belonged to. That is a test's problem only until you notice a screen-reader user
 * has the same one.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  count,
  flush,
  fill,
  id,
  ref,
  busy,
}: SectionCardProps): React.ReactElement {
  const titleId = useId();
  const level = useHeadingLevel();
  const { contentRef, tabIndex } = useOverflowTabStop(fill === true);
  const content = (
    <HeadingLevelContext.Provider value={deeper(level)}>{children}</HeadingLevelContext.Provider>
  );
  return (
    <Card
      as="section"
      ref={ref}
      aria-labelledby={titleId}
      {...(busy === true ? { 'aria-busy': true } : {})}
      /**
       * **The focus treatment is conditional on `id`, and it is a RING rather than nothing.**
       *
       * This shipped as an unconditional `scroll-mt-6 focus-visible:outline-none`, which is two
       * defects in one string. The first is the sharp one: `outline-none` with no replacement takes
       * the focus indicator OFF the element this prop exists to make a focus destination — a
       * keyboard reader following "jump to the section that answers this" would have landed
       * somewhere with no visible sign that they had (WCAG 2.2 §2.4.7 Focus Visible, AA). Every
       * other focusable primitive here pairs `outline-none` with a ring (`button.tsx`, `input.tsx`,
       * `combobox.tsx`, `select.tsx`, `textarea.tsx`, `tabs.tsx`, `text-link.tsx` …); this was the
       * one exception, in the one place the epic turned an element into a focus target. Found by
       * the M6 component review; every assertion that existed checked that `tabindex="-1"` was
       * PRESENT and none that focus could be seen.
       *
       * The second is smaller and worth not repeating: the classes were applied to every
       * `SectionCard` in the product, including the three overview sections that pass no `id` and
       * are therefore not focusable at all — an unconditional change to a shared primitive for a
       * behaviour one screen uses.
       */
      className={cn(
        id === undefined
          ? undefined
          : 'focus-visible:ring-ring focus-visible:ring-offset-background scroll-mt-6 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        fill === true && 'flex flex-col @6xl:h-full @6xl:min-h-0',
        className,
      )}
      {...(id === undefined ? {} : { id, tabIndex: -1 })}
    >
      <CardHeader
        className={cn(
          /*
            **`flex-row` is load-bearing and was missing, so `action` has never sat beside the
            title.** `CardHeader`'s own base is `flex flex-col`, and `flex` in this string does not
            displace it — they are different utility groups, so `tailwind-merge` keeps both and the
            column wins. `items-start justify-between` then described a row that did not exist.

            It is a latent defect rather than a visible one only because this archetype had no
            consumer passing `action` until M9's counts; every reader of this line, including the
            one who wrote it, would have said the action was on the title row.
          */
          'flex flex-row items-start justify-between gap-4',
          flush && 'pb-4',
          // The heading must not be what gets scrolled away — it is the only thing naming the
          // region a reader has scrolled into.
          fill === true && 'shrink-0',
        )}
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <CardTitle id={titleId} level={level} className="text-base">
              {title}
            </CardTitle>
            {count === undefined ? null : (
              <span className="text-muted-foreground text-sm tabular-nums">{count}</span>
            )}
          </div>
          {description ? (
            /**
             * `max-w-prose` is `PageHeader`'s exact fix for the same defect (`docs/TECH_DEBT.md`
             * #339, `page-header.tsx`'s own comment above its description `<p>`): with no cap a
             * description is its own text's width wearing one, so two screens' descriptions render
             * at whatever width their own prose happens to need. The class is applied **here, at
             * this call site, and not inside `CardDescription`** — that component is shared by
             * every `Card` in the estate (dialogs, auth cards, …), and capping it there would
             * change every one of them for a defect specific to this archetype's two-column header.
             */
            <CardDescription className="mt-1 max-w-prose">{description}</CardDescription>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </CardHeader>
      <CardContent
        /**
         * **`flush` is full-bleed for the ROW and inset for the TEXT, and that split is the fix.**
         *
         * `flush` sets `p-0` so a table's row backgrounds — hover, zebra, selection — reach the
         * card's own edges. That is what it is for and it is right. What nobody noticed is that it
         * also takes the text with them: `CardHeader` keeps `p-6`, `DataTable`'s cells are
         * `py-2 pr-4` with **no left padding at all**, so a card's heading sat 24px in and the first
         * cell of its table sat hard against the border. Measured on the deployed product: card
         * edge 551, heading 575, `Name` header 551.
         *
         * That is the "wording in the boxes is hard against margins" report, and it is the TABLE
         * that is hard against them, not the prose. The plan's remedy was to make the heading
         * full-bleed too so the two agree — which aligns them at the one x-position where text
         * touches a border, i.e. it would have delivered the complaint rather than its fix.
         *
         * **So `flush` means no VERTICAL padding, and horizontal padding that matches the header.**
         * The rows sit close under the heading — `CardHeader`'s `pb-4` leaves 16px rather than the
         * 24px an unflushed body would add, which is what this prop was for; **not zero**, and this
         * docblock claimed zero until the component review did the arithmetic. Its first cell now
         * starts where the heading starts. The row separators inset
         * by the same 24px, which inside a card reads as tidier than a rule running edge to edge.
         *
         * **A first attempt expressed this as arbitrary variants on the edge cells**
         * (`[&_td:first-child]:pl-6` and siblings), keeping the body at `p-0` so row backgrounds
         * stayed full-bleed. It did not take effect, and the journey caught it on its first run with
         * the heading and the cell still exactly 24px apart. `cn`/`tailwind-merge` was ruled out by
         * running it directly — the class survives into the DOM — so the cause is somewhere between
         * that and the generated stylesheet, and it is **not established**: this form removes the
         * question rather than answering it, and inventing a cause would be a claim nobody checked.
         */
        className={cn(
          flush && 'px-6 py-0',
          fill === true && '@6xl:min-h-0 @6xl:flex-1 @6xl:overflow-y-auto',
        )}
        /**
         * **A scrollable body must be keyboard-reachable, and only a body that scrolls needs to be**
         * (WCAG 2.2 §2.1.1, level A). A scroll container that cannot take focus cannot be scrolled by
         * anything but a pointer; browsers have been inconsistent about focusing them implicitly and
         * it is not a behaviour to rely on. So the body is `0` while it overflows and `-1` while it
         * does not: out of the tab sequence, but **never without the attribute**, because removing
         * `tabindex` from a focused element that stops being focusable drops focus to `<body>`.
         * Unmeasured counts as overflowing, because an unreachable scroller is the failure and a
         * spare stop is not.
         *
         * It carries no role and no name of its own on purpose. It already sits inside a named
         * `region` (this card's `<section aria-labelledby>`), so a second name would be announced
         * twice, and a `role="group"` here would put an unnamed group between the region and its
         * content for no gain.
         */
        {...(fill === true ? { tabIndex } : {})}
      >
        {/* The body's own headings (`SubSection`) sit one rank below this card's. */}
        {fill === true ? <div ref={contentRef}>{content}</div> : content}
      </CardContent>
    </Card>
  );
}
