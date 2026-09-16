import { useId } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  /** The section's heading. Rendered as an `<h2>` — see below for why the archetype decides that. */
  title: React.ReactNode;
  /** One line saying what the section holds, when the title alone is not enough. */
  description?: React.ReactNode;
  /** A section-level action, aligned opposite the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Omits the card's own padding, for a section whose content is a full-bleed table. */
  flush?: boolean;
  /**
   * Fill the height the parent gives, keeping the heading in place and scrolling the body.
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
}

/**
 * A titled section of a page.
 *
 * **The archetype owns the heading rank, and that is the point.** `CardTitle` defaults to `<h1>`
 * because eleven existing call sites are a page's only heading (see its docblock). A section inside
 * a page is not that, so this passes `level={2}` once, here — rather than asking sixteen screens to
 * remember. Getting it wrong in either direction is invisible on screen and wrong in the heading
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
  flush,
  fill,
  id,
  ref,
}: SectionCardProps): React.ReactElement {
  const titleId = useId();
  return (
    <Card
      as="section"
      ref={ref}
      aria-labelledby={titleId}
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
        fill === true && 'flex h-full min-h-0 flex-col',
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
          <CardTitle id={titleId} level={2} className="text-base">
            {title}
          </CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </CardHeader>
      <CardContent
        className={cn(flush && 'p-0', fill === true && 'min-h-0 flex-1 overflow-y-auto')}
        /**
         * **`tabIndex={0}` is what makes a scrollable body operable from the keyboard** (WCAG 2.2
         * §2.1.1, level A). A scroll container that cannot take focus cannot be scrolled by
         * anything but a pointer; browsers have been inconsistent about focusing them implicitly
         * and it is not a behaviour to rely on.
         *
         * It carries no role and no name of its own on purpose. It already sits inside a named
         * `region` (this card's `<section aria-labelledby>`), so a second name would be announced
         * twice, and a `role="group"` here would put an unnamed group between the region and its
         * content for no gain.
         */
        {...(fill === true ? { tabIndex: 0 } : {})}
      >
        {children}
      </CardContent>
    </Card>
  );
}
