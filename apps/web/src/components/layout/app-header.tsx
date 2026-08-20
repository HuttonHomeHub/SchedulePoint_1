import { useParams } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandLink } from '@/components/layout/brand-mark';
import { useShell } from '@/components/layout/navigator/shell-context';
import { Button } from '@/components/ui/button';
import { ToolbarBandProvider } from '@/components/ui/toolbar/toolbar-band';
import { OrgSwitcher } from '@/features/organizations';

/**
 * The header's contents — brand mark, organisation switcher, account chip. **No navigation.**
 *
 * **Below `lg` only, since Graphite M3.** At `lg`+ the Project Explorer rail is the leading
 * column top to bottom and carries all three of these itself, so the top bar is deleted and the
 * ~56 px it held goes back to the stage — which is ADR-0099 D1's whole point. Below `lg` the rail
 * is an off-canvas `Sheet` with nothing pinned to open it, so a bar survives there carrying the
 * drawer trigger beside the same three controls. They are the SAME components in both places, not
 * a second copy: only one is in the accessibility tree at a time, because the other is
 * `display: none`.
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
 * A `1fr auto 1fr` grid (feature-spec.md §4.9, ADR-0056) — not a flex row with `flex-1`/`ml-auto`
 * — so the centre cell sits at the true midpoint between the brand and the account chip rather
 * than merely absorbing whatever space the edges don't claim. `min-w-0` on every cell means a long
 * organisation name truncates rather than pushing the account chip off-screen. DOM order (drawer →
 * brand → org switcher → account) is unchanged, so the pinned tab order holds by construction.
 */
function HeaderContents(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  // Opens the rail as a drawer below `lg`, where the pinned rail is hidden. Null outside the
  // shell — this row is rendered by `chrome-band.tsx` as the band's first row.
  const shell = useShell();

  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-start">
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
      <div className="flex min-w-0 items-center gap-3 justify-self-center">
        <OrgSwitcher className="max-w-[12rem] truncate" />
      </div>
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
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
 * It no longer takes an `identitySlot`. A plan's identity line lived in this row's centre cell
 * (ADR-0097 D1b) and this row does not exist on the widths a plan is worked on, so the band gives
 * that slot a row of its own — see `chrome-band.tsx`.
 */
export function AppHeaderRow(): React.ReactElement {
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
    <ToolbarBandProvider className="h-14 px-4">
      <header className="flex h-full items-center">
        <HeaderContents />
      </header>
    </ToolbarBandProvider>
  );
}
