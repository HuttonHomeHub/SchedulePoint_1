import { PanelLeft } from 'lucide-react';

import { OrgDestinationsCollapsed } from './org-destinations';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandLink } from '@/components/layout/brand-mark';
import { ChromeSlot } from '@/components/layout/chrome/chrome-slot';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { OrgSwitcher } from '@/features/organizations';

/** The drawer subjects the shell itself owns. Plan-scoped subjects arrive with the plan. */
export type DrawerSubject = 'explorer';

/**
 * The **tool rail** — the leading edge, top to bottom, at a fixed 48 px (ADR-0099 D1).
 *
 * **48 px, not the 46 the design brief drew.** `w-12` is on the sizing scale and an arbitrary
 * `w-[46px]` is not — `token-architecture.test.ts` ratchets those down and went red on it, which is
 * the gate doing exactly its job. Two pixels is not worth an exemption from a governed axis.
 *
 * It replaces the resizable Project Explorer rail. The tree it used to hold is now a subject of the
 * trailing context drawer, and this carries the buttons that choose which subject that is, plus the
 * identity and account controls Graphite M3 moved out of the deleted top bar.
 *
 * **Fixed width, no collapse.** The rail this supersedes was resizable 220–480 and collapsible to an
 * icon strip, which existed so a planner could buy canvas width back from it. At 48 px there is
 * nothing left to buy: the width a collapse used to recover now belongs to the drawer, which has its
 * own splitter and its own closed state. Two collapse mechanisms on one edge is how a reader ends up
 * with a rail that is open and a panel that is not, and no way to tell which control did what.
 *
 * **Everything survives at 48 px, which is the constraint that shaped it.** ADR-0097 Landing D1
 * moved six organisation destinations out of a header a rail collapse could not reach, and
 * `OrgDestinationsCollapsed` exists because leaving them behind a toggle would have hidden the
 * product's whole secondary navigation. Graphite M3 moved the brand, the switcher and the account
 * out of that same header. All of it is here, and none of it is behind anything.
 */
export function ToolRail({
  orgSlug,
  railSlotRef,
  subject,
  drawerOpen,
  onSelectSubject,
}: {
  orgSlug?: string | undefined;
  /**
   * Where a plan portals its **mode cluster** (Graphite M5). Empty on the twelve screens that are
   * not a plan, so `empty:hidden` costs them nothing — the same contract the command band's slot
   * has kept since ADR-0055 §3, and the reason the rail can carry a plan's modes without the shell
   * ever learning what a plan is (ADR-0029).
   */
  railSlotRef?: ((node: HTMLDivElement | null) => void) | undefined;
  /** The drawer's active subject, so the matching button reads as pressed. */
  subject: DrawerSubject;
  /** Whether the drawer is showing anything at all — a pressed button with a closed drawer lies. */
  drawerOpen: boolean;
  /**
   * Choose a subject. Called with the subject the button names; the shell decides whether that
   * opens the drawer, re-points it, or closes it because the reader pressed the one already shown.
   */
  onSelectSubject: (subject: DrawerSubject) => void;
}): React.ReactElement {
  return (
    <Surface
      tone="panel"
      // A test hook, in the established shape (`data-toolbar-item`, `data-plan-identity`). The rail
      // is a `Surface` div with no landmark of its own — it is chrome, not navigation — and the
      // below-`lg` top bar still renders the same brand link behind `display: none`, so a selector
      // written by role or accessible name resolves to two elements. Scoping by copy would be worse
      // (the standing rule after three journeys broke on a label change).
      data-tool-rail
      className="border-border flex h-full w-12 flex-col items-center gap-1 border-r py-2"
    >
      <BrandLink orgSlug={orgSlug} variant="tile" />
      {/* A native `<select>` at 36 px: its visible text truncates and its popup does not, so it
          keeps full keyboard and screen-reader operation with the accessible name it already had.
          `title` carries the organisation for a pointer user, who is the only reader the
          truncation costs anything. */}
      <OrgSwitcher className="w-9 px-1" title={orgSlug} />

      {/* **The panel buttons.** One today; the plan's four arrive with the plan (ADR-0099 D2).
          `aria-pressed` rather than `aria-current`: this is a toggle over what the drawer shows,
          not a statement about where the reader is. It reads as pressed only when the drawer is
          actually open on that subject — a lit button beside a closed panel is a control claiming
          something the screen contradicts. */}
      <div className="mt-1 flex flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Project Explorer"
          aria-pressed={drawerOpen && subject === 'explorer'}
          onClick={() => onSelectSubject('explorer')}
        >
          <PanelLeft aria-hidden="true" className="size-4" />
        </Button>
      </div>

      {/* **The plan's mode cluster** — `Early | Visual` and `Diagram | Gantt`. It was 400 px of the
          command strip, a quarter of the room at 1646, spent on four controls that are not commands:
          ADR-0091 D1's thesis is that a mode is not a command, and the rail is the leading-edge
          cluster where a mode belongs. They stay REGISTRY items rather than becoming hand-rolled
          buttons here (plan.md §E): arm/disarm, Escape precedence, announcement and pen gating are
          all the registry's, and hand-rolling is how one control gets a rule and its neighbour does
          not. */}
      {railSlotRef ? (
        <ChromeSlot
          slotRef={railSlotRef}
          name="rail"
          className="mt-1 flex-col items-center gap-1 empty:hidden"
        />
      ) : null}

      {/* Pinned to the bottom, so the same things are in the same place whatever the drawer shows. */}
      <div className="min-h-0 flex-1" />
      {orgSlug ? <OrgDestinationsCollapsed orgSlug={orgSlug} /> : null}
      <AccountChip />
    </Surface>
  );
}
