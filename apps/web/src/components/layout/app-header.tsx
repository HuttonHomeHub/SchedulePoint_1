import { useParams } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandLink } from '@/components/layout/brand-mark';
import { ChromeSlot } from '@/components/layout/chrome/chrome-slot';
import { useShell } from '@/components/layout/navigator/shell-context';
import { Button } from '@/components/ui/button';
import { ToolbarBandProvider } from '@/components/ui/toolbar/toolbar-band';
import { OrgSwitcher } from '@/features/organizations';

/**
 * The header's contents — brand mark, organisation switcher, account chip. **No navigation.**
 *
 * **At every width again, since the workspace redesign M3-T2.** Graphite M3 deleted this row above
 * `lg` and moved all three controls onto a 48 px icon rail down the leading edge, to give the
 * ~56 px back to the stage. The rail is gone — M3-T1 docks the Project Explorer in that column,
 * and the product owner's question about what the rail was still adding had a short answer: the
 * brand, a switcher, six links and an account menu, none of which is a reason to spend the leading
 * edge of every screen.
 *
 * One consequence is worth naming rather than discovering: this row and the `Sheet` trigger inside
 * it are now a SINGLE rendering rather than two `display: none` twins, so a selector written by
 * role or accessible name resolves to one element at every width. The trigger itself keeps its
 * `lg:hidden`, because above `lg` the Explorer is a docked column and there is nothing to open.
 *
 * The six organisation destinations (Clients, Calendars, Resources, Members, Audit log, Recently
 * deleted) moved to the Project Explorer rail's bottom zone in ADR-0097 Landing D1: they are
 * *places in the organisation*, and one navigator beats two. What is left is identity and account,
 * which is what a header is for.
 *
 * That freed **540 px** at 1646 — measured, not estimated
 * (`docs/specs/design-system-rewrite/m0-landing-d1-measurement.md`), and the figure the spec
 * carried until then was 637 px, which appears never to have been measured at all. It is what pays
 * for folding the plan identity line into this band, which ADR-0092 M5 withdrew for want of
 * exactly this width.
 *
 * Split from the element that carries it because the two shell shapes place it differently:
 * flag-off the header IS the chrome surface and centres its row at `max-w-6xl` (today's shell);
 * flag-on it is one row inside a full-bleed band that already owns the scope, the sticky
 * behaviour and the border. Keeping the split explicit means neither path branches on a flag
 * inside its own markup.
 *
 * ## THREE SECTIONS, space split between them
 *
 * The product owner's report on the merged row was that it looked **crammed**: brand, breadcrumb,
 * mode and pen all packed against the leading edge, a void, then the organisation and the account.
 * That is what two clusters pinned to two edges looks like. It is now three:
 *
 * | section                                  | flex        |
 * | ---------------------------------------- | ----------- |
 * | 1. brand + the plan's identity           | `shrink`, `min-w-0` |
 * | 2. the plan's modes + pen                | `shrink-0`  |
 * | 3. organisation + account                | `shrink-0`  |
 *
 * with `justify-between`, so the free width is split **between** them rather than all landing in
 * one gap. Measured (`docs/specs/canvas-maximisation/m0-measurement.md`): the sections need 582,
 * 620 and 256 px, so at 1920 the two gaps are **202 px each** and at 1646 they are **65 px** —
 * separation at the width this is judged on, and nothing truncates until the container falls below
 * 1458 px.
 *
 * **Space-between rather than a truly centred middle, and that was a measured decision.** Centring
 * the middle means the outer sections get **equal** shares, because that is what centring is — so
 * section 1 is capped at whatever section 3's share is. At 1646 that is 472 px against the 582 px
 * section 1 needs, cutting **110 px of the plan name** on the machine this product is used on. The
 * middle sits 163 px right of true centre at 1920 instead, which is a look; the alternative was a
 * truncated plan name, which is information.
 *
 * ## A WRAPPING FLEX ROW, and the grid it replaced
 *
 * This was a `1fr auto 1fr` grid, chosen so the organisation switcher sat at the true midpoint
 * between the brand and the account chip rather than merely absorbing whatever space the edges did
 * not claim. **That is no longer what this row is for, and the rationale is replaced rather than
 * left standing** — a superseded reason sitting above working code is this repository's
 * most-recorded drift shape.
 *
 * The row now also carries the plan's identity, its four mode controls and its pen controls, and a
 * grid cannot wrap. It is `flex flex-wrap` with three children:
 *
 * | child                    | flex                | why                                       |
 * | ------------------------ | ------------------- | ----------------------------------------- |
 * | brand (+ drawer trigger) | `shrink-0`          | identity; nothing here is worth truncating |
 * | the **identity slot**    | `shrink`, `min-w-0` | the one thing that gives way — see below  |
 * | organisation + account   | `shrink-0 ml-auto`  | pinned to the trailing edge on every line  |
 *
 * **The wrap is the threshold, and there is deliberately no breakpoint constant.** Measured
 * (`docs/specs/one-row-header/falsification.md`, third result) the row breaks to two lines below a
 * container of **1480 px** — one line at 1646 and 1920, two at 1440 and 1280. That is exactly the
 * behaviour the product owner asked for, expressed in widths as "1600 and above", and the browser
 * and the product owner agree, so only one of them has to be maintained. It also disposes of the
 * fact that Tailwind's nearest breakpoint (`2xl`, 1536) leaves the container four pixels short.
 *
 * **`flex-1` on the identity slot would defeat all of it, and that is established rather than
 * asserted.** An item that absorbs the line's slack never lets anything move to a second line: the
 * plan name would truncate towards nothing while the row stayed one line tall. It is `shrink` with
 * `min-width: 0`, which gives wrap-then-truncate in the right order — flex starts a new line when
 * the next item does not fit, and shrinks only within a line that still overflows, so truncation is
 * the last resort it should be.
 *
 * The journey (`e2e-workspace-fit/pen-status.spec.ts`) was run against a build with `flex-1` put
 * back on the slot and fails at 1440, one line where two are expected. It was **also** run against a
 * build with `flex-1` restored on the identity block *inside* the slot — and passed, which is how
 * the load-bearing line was identified as this one and not that one. A comment in
 * `plan-workspace-toolbar.tsx` claimed the opposite until the test refused to go red.
 *
 * `ml-auto` appears **exactly once**. ADR-0091 M7 records a flex line splitting free space *equally*
 * between every auto margin, which left a trailing group 281 px adrift; one margin cannot do that.
 *
 * DOM order (drawer → brand → identity → org switcher → account) keeps the pinned tab order: the
 * plan's controls come after the brand and before the account menu, which is where a planner
 * tabbing from the top of the page expects the thing they are working on.
 */
function HeaderContents({
  identitySlotRef,
  modeSlotRef,
}: {
  identitySlotRef: (node: HTMLDivElement | null) => void;
  modeSlotRef: (node: HTMLDivElement | null) => void;
}): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  // Opens the rail as a drawer below `lg`, where the pinned rail is hidden. Null outside the
  // shell — this row is rendered by `chrome-band.tsx` as the band's first row.
  const shell = useShell();

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      {/* **Section 1 — the brand and the plan's identity, as one group.** They belong together:
          `SchedulePoint / Project1 / best` reads as one path from the product to the thing in front
          of you, and splitting them would put a gap in the middle of a sentence. `min-w-0` and
          `shrink` because this is the section that gives way — it is text with a `title`. */}
      <div className="flex min-w-0 shrink items-center gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {shell && orgSlug ? (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 lg:hidden"
              aria-label="Show Project Explorer"
              onClick={shell.openDrawer}
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
          ) : null}
          <BrandLink orgSlug={orgSlug} />
        </div>
        {/* The plan's breadcrumb, status and Edit control — empty, and occupying nothing, on the
            twelve `_authed` routes that are not a plan (`empty:hidden` lives on the slot). */}
        <ChromeSlot slotRef={identitySlotRef} name="identity" />
      </div>
      {/* **Section 2 — the plan's modes and pen.** Also `empty:hidden`, so on a non-plan route the
          row is brand … organisation + account, exactly as it was before three sections existed. */}
      <ChromeSlot slotRef={modeSlotRef} name="mode" />
      {/* **Section 3.** No `ml-auto` any more: `justify-between` on the row does that job for all
          three sections at once, and ADR-0091 M7 records a flex line splitting free space *equally*
          between every auto margin — which is what we now want, and want the row to own. */}
      <div className="flex shrink-0 items-center gap-3">
        <OrgSwitcher className="max-w-[12rem] truncate" />
        <AccountChip />
      </div>
    </div>
  );
}

/**
 * The header as the first row of the chrome band, **below `lg` only** (Graphite M3). Full-bleed —
 * the band is chrome, and chrome spans the viewport; the measure cap belongs to content, which
 * keeps its own `max-w-6xl`. The band owns the surface scope and the bottom border, so this is a
 * bare landmark.
 *
 * **It takes the identity slot's ref again.** ADR-0097 D1b put a plan's identity line in this row's
 * centre cell; Graphite M3 took it out because this row did not exist at the widths a plan is worked
 * on, and gave the identity a row of its own inside the band. The row exists at every width again
 * (M3-T2, above), and the one-row header folds the identity back into it — so the band no longer
 * needs a second row to hold it.
 *
 * **`min-h-14`, not `h-14`.** A wrapping row's height is a function of its width, which is the
 * accepted cost of the wrap (`docs/specs/one-row-header/falsification.md`): one line above a
 * container of 1480 px and two below it. A fixed height would clip the second line rather than
 * showing it, which is the ADR-0090 defect — content painted where a pointer cannot reach it — and
 * is exactly what a `h-14` would have done here silently.
 */
export function AppHeaderRow({
  identitySlotRef,
  modeSlotRef,
}: {
  identitySlotRef: (node: HTMLDivElement | null) => void;
  modeSlotRef: (node: HTMLDivElement | null) => void;
}): React.ReactElement {
  return (
    // **`ToolbarBandProvider` wraps the row, and the reason is a reading rather than a caution**
    // (`m0-landing-d1-measurement.md`). The identity slot carries the plan's mode `Toolbar`, and a
    // toolbar with no provider above it resolves its DENSITY from its own `clientWidth` — which for
    // a `shrink-0` row is its content width, landing it in a narrow band on a wide screen.
    //
    // It is NOT protection against the fit trap. That one is already closed by
    // `isWidthConstrained` (`Toolbar.tsx:81-84`): a width-unconstrained row is charged no chrome and
    // never demotes, because its `clientWidth` is an *output* of the demotion decision. The first
    // answer here was "the mode items are `render`, so they cannot demote", and that is false —
    // `mode-early` has an `onActivate` and a `demotionGroup`, which is exactly what
    // `Toolbar.tsx:352` calls demotable. Recorded because it was nearly built on.
    //
    // `toolbar-band.tsx`'s invariant is honoured either way: the band width says how roomy the
    // surface is and never answers whether a row's content fits.
    <ToolbarBandProvider className="min-h-14 px-4 py-1">
      <header className="flex min-h-full items-center">
        <HeaderContents identitySlotRef={identitySlotRef} modeSlotRef={modeSlotRef} />
      </header>
    </ToolbarBandProvider>
  );
}
