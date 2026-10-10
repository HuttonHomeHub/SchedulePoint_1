import { useLayoutEffect, useRef } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { useAnnounce } from '@/components/ui/announcer';
import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import type { ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { toolbarCardVariants } from '@/components/ui/toolbar/toolbar-styles';
import { cn } from '@/lib/utils';

export const DIAGRAM_VIEWPORT_LABEL = 'Diagram viewport';

/**
 * Where focus goes when this cluster is removed under the reader. The cluster exists only while the
 * diagram is mounted, so the only way it vanishes under focus is the view switching to the Gantt —
 * and the control that names that state is the switch's own Gantt segment.
 */
const HANDOFF_TARGET = '[data-toolbar-item="view-gantt"]';

/**
 * **The "Diagram viewport" cluster** (toolbar-redesign M4, CQ-1): Zoom out, Zoom in, Fit to plan and
 * the Minimap toggle, rendered by the one `Toolbar` over the `canvas` slice of the one registry.
 * The workspace portals it into the slot the canvas publishes (`TsldCanvas`'s `onViewportSlot`), so
 * the context is derived once and the canvas owns only geometry.
 *
 * **ADR-0135 for a container that goes, as `HistoryResultStrip` does it.** `useToolbarFocusHandoff`
 * is about an item leaving a toolbar that stays; it cannot fire when the toolbar itself unmounts
 * (its own docblock says so). Switching to the Gantt unmounts the diagram, the slot and therefore
 * this cluster, and a reader standing on Zoom in would land on `<body>` — silently disabling every
 * workspace accelerator. So a wrapper records whether focus is inside and, on unmount, hands it to
 * the view switch's Gantt segment (the control that caused the move) and says so. Focus first, then
 * announce: the announcer defers its write by a frame (`use-focus-handoff.ts`).
 *
 * The wrapper is `display: contents`, so it adds no box to the card.
 */
export function DiagramViewportCluster({
  items,
  context,
}: {
  items: ToolbarItem<TsldToolbarContext>[];
  context: TsldToolbarContext;
}): React.ReactElement {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  const focusInside = useRef(false);

  useLayoutEffect(() => {
    announceRef.current = announce;
  }, [announce]);

  useLayoutEffect(
    () => () => {
      if (!focusInside.current) return;
      const target = document.querySelector<HTMLElement>(HANDOFF_TARGET);
      if (!target) return;
      target.focus();
      if (document.activeElement !== target) return;
      announceRef.current(
        `${DIAGRAM_VIEWPORT_LABEL} controls are only in the Diagram view. Focus moved to Gantt.`,
      );
    },
    [],
  );

  return (
    <div
      className="contents"
      onFocusCapture={() => {
        focusInside.current = true;
      }}
      onBlurCapture={(event) => {
        // A real move to another element ends "inside"; a removal blurs with no related target, and
        // that is exactly the case the unmount hand-off must still see.
        if (event.relatedTarget !== null) focusInside.current = false;
      }}
    >
      <Toolbar
        items={items}
        context={context}
        label={DIAGRAM_VIEWPORT_LABEL}
        className={cn(toolbarCardVariants(), 'border-border bg-canvas border p-1 shadow-sm')}
      />
    </div>
  );
}
