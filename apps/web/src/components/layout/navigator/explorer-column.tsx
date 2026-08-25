import { PanelLeftOpen } from 'lucide-react';
import { useRef } from 'react';

import { NavigatorRail } from './navigator-rail';
import { OrgDestinationsCollapsed } from './org-destinations';

import {
  EXPLORER_MAX_WIDTH,
  EXPLORER_MIN_WIDTH,
  type ExplorerPrefs,
} from '@/components/layout/navigator/use-explorer-prefs';
import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { Surface } from '@/components/ui/surface';
import type { UseExpansionState } from '@/features/navigator';

/**
 * The width of the collapsed **spine**.
 *
 * A spine rather than nothing, because a panel that vanishes leaves a reader with no way back —
 * the ADR-0082 "shade, never hide" rule applied to a whole surface. 34 px is enough for one
 * `icon-sm` control with the column's border, and the number is on the sizing scale's arbitrary
 * list for exactly that reason: it is a control's width, not a layout choice.
 */
const SPINE_WIDTH = 34;

/**
 * The **Project Explorer, docked on the leading edge** (workspace redesign M3-T1).
 *
 * ## Why it moved, and what it replaced
 *
 * ADR-0099 D2 made the Explorer a *subject of the trailing context drawer*, reached by a button on
 * a 48 px icon rail. That arrangement had a coherent argument — one panel, one edge, one splitter —
 * and two things have happened since. ADR-0101 sent the activity editor back to a modal, leaving
 * the drawer's `'context'` subject with **no production registrant at all** (`docs/TECH_DEBT.md`
 * #156), so the "one panel, two subjects" premise had quietly become "one panel, one subject
 * reached through a switcher". And the product owner, looking at the shipped app, asked what the
 * rail was still adding — most of what it held were links to other pages.
 *
 * So the hierarchy navigator returns to the edge it names. It is where a file tree lives in every
 * tool a planner already uses, and it is beside the thing it navigates rather than across the
 * workspace from it.
 *
 * ## What is a decision here rather than a default
 *
 * - **The splitter is on the TRAILING edge**, so a drag right grows the panel and `reverseKeys` is
 *   deliberately NOT set — the mirror of `ContextDrawer`, whose splitter leads and which therefore
 *   does set it. Getting this wrong makes a keyboard user and a pointer user disagree about which
 *   way "wider" is, which is why the primitive makes the caller say.
 * - **Collapsed is a spine, not an absence.** The control that collapses it is inside the panel and
 *   unmounts with it, so a browser would drop focus to `<body>` — the WCAG 2.4.3 class this
 *   repository has shipped four times (ADR-0080 M2, ADR-0099 M10, TECH_DEBT #64/#67). The spine's
 *   expand button is the surviving control both ways, and focus is moved to it explicitly rather
 *   than left to the platform.
 * - **It renders nothing without an organisation** (`docs/TECH_DEBT.md` #165a / ADR-0104). The
 *   caller decides that; this component requires a slug, so "an Explorer with no root" is
 *   unrepresentable rather than something two guards agree about.
 */
export function ExplorerColumn({
  orgSlug,
  expansion,
  prefs,
}: {
  /** Required, not optional — see the docblock's third bullet. */
  orgSlug: string;
  expansion: UseExpansionState;
  prefs: ExplorerPrefs;
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);

  if (prefs.collapsed) {
    return (
      <Surface
        tone="panel"
        className="border-border flex h-full flex-col items-center border-r py-2"
        style={{ width: SPINE_WIDTH }}
      >
        <Button
          ref={spineRef}
          variant="ghost"
          size="icon-sm"
          aria-label="Show Project Explorer"
          aria-expanded={false}
          onClick={() => {
            prefs.expand();
            // The button that was pressed is about to unmount with the spine. Focus its
            // counterpart in the expanded panel — the same control, one state along — rather than
            // letting it fall to `<body>` and take every workspace accelerator with it.
            requestAnimationFrame(() => collapseRef.current?.focus());
          }}
        >
          <PanelLeftOpen aria-hidden="true" className="size-4" />
        </Button>
        {/* **The spine keeps the destinations, and that is not a nicety.** Collapsing this column
            is the gesture a planner makes to gain canvas width, and without this it would also take
            the product's whole secondary navigation with it — the objection
            `OrgDestinationsCollapsed`'s own docblock records, which is why that component exists.
            It is the same array rendered a second way, never a second list. */}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <OrgDestinationsCollapsed orgSlug={orgSlug} />
        </div>
      </Surface>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* **No landmark and no heading of its own.** `NavigatorRail` already renders
          `<nav aria-label="Project Explorer">` with an actions row, so a wrapper adding a second
          `<nav>` and a second `<h2>` with the same words is how one panel comes to announce itself
          twice — the strict-mode duplicate ADR-0099 M10 found between the rail icons and the drawer
          list, one layer along. This component owns the width, the fold and the splitter, and
          nothing else. */}
      <Surface
        tone="panel"
        ref={panelRef}
        className="border-border flex h-full min-h-0 flex-col border-r"
        style={{ width: prefs.size }}
      >
        <NavigatorRail
          orgSlug={orgSlug}
          expansion={expansion}
          onCollapse={() => {
            prefs.collapse();
            requestAnimationFrame(() => spineRef.current?.focus());
          }}
          collapseRef={collapseRef}
        />
      </Surface>
      {/* `pointerToSize` is the pointer's distance from the panel's LEFT edge, read from the live
          box rather than from `prefs.size` — which is the value being changed, so using it would
          make each move relative to the last one and drift under a fast drag. */}
      <Surface tone="panel" className="contents">
        <PanelResizer
          orientation="vertical"
          size={prefs.size}
          min={EXPLORER_MIN_WIDTH}
          max={EXPLORER_MAX_WIDTH}
          label="Resize Project Explorer"
          onResize={prefs.setSize}
          pointerToSize={(event) => {
            const left = panelRef.current?.getBoundingClientRect().left ?? 0;
            return event.clientX - left;
          }}
        />
      </Surface>
    </div>
  );
}
