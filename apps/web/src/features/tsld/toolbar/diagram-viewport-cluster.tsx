import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import type { ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { toolbarCardVariants } from '@/components/ui/toolbar/toolbar-styles';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';
import { cn } from '@/lib/utils';

export const DIAGRAM_VIEWPORT_LABEL = 'Diagram viewport';

/**
 * Where focus goes when this cluster is removed under the reader. The cluster exists only while the
 * diagram is mounted, so the only way it vanishes under focus is the view switching to the Gantt —
 * and the control that names that state is the switch's own Gantt segment.
 */
const HANDOFF_TARGET = '[data-toolbar-item="view-gantt"]';
const HANDOFF_MESSAGE = `${DIAGRAM_VIEWPORT_LABEL} controls are only in the Diagram view. Focus moved to Gantt.`;

/**
 * **The "Diagram viewport" cluster** (toolbar-redesign M4, CQ-1): Zoom out, Zoom in, Fit to plan and
 * the Minimap toggle, rendered by the one `Toolbar` over the `canvas` slice of the one registry.
 * The workspace portals it into the slot the canvas publishes (`TsldCanvas`'s `onViewportSlot`), so
 * the context is derived once and the canvas owns only geometry.
 *
 * **ADR-0135 for a container that goes** — `useContainerUnmountHandoff`. Switching to the Gantt
 * unmounts the diagram, the slot and therefore this cluster, and a reader standing on Zoom in would
 * land on `<body>`, silently disabling every workspace accelerator. The wrapper the hook returns
 * props for is `display: contents`, so it adds no box to the card.
 *
 * **No group of its own.** The cluster is one toolbar of one registry group; `ungrouped` keeps a
 * screen reader from hearing the toolbar's name and then a "Navigate" group around the same four
 * buttons. **Tooltips open above and go when pressed**: the cluster sits on the bottom edge of the
 * stage, where a tip below it lands on the foot row, and the Minimap's press opens a panel directly
 * above the button the tip would be covering.
 */
export function DiagramViewportCluster({
  items,
  context,
}: {
  items: ToolbarItem<TsldToolbarContext>[];
  context: TsldToolbarContext;
}): React.ReactElement {
  const handoff = useContainerUnmountHandoff({ target: HANDOFF_TARGET, message: HANDOFF_MESSAGE });

  return (
    <div className="contents" {...handoff}>
      <Toolbar
        items={items}
        context={context}
        label={DIAGRAM_VIEWPORT_LABEL}
        ungrouped
        tooltip={{ placement: 'above', dismissOnPress: true }}
        className={cn(toolbarCardVariants(), 'border-border bg-canvas border p-1 shadow-sm')}
      />
    </div>
  );
}
