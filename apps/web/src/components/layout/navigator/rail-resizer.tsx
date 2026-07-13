import { useCallback } from 'react';

import { RAIL_MAX_WIDTH, RAIL_MIN_WIDTH } from './use-rail-prefs';

import { PanelResizer } from '@/components/ui/panel-resizer';

/**
 * The divider between the pinned rail and the workspace — a vertical {@link PanelResizer}
 * (shared with the plan workspace's activity panel). The rail's left edge sits at the shell
 * row's origin, so the pointer's `clientX` is the candidate width directly. Hidden below `lg`,
 * where the rail is a drawer.
 */
export function RailResizer({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}): React.ReactElement {
  const pointerToSize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => event.clientX,
    [],
  );
  return (
    <PanelResizer
      orientation="vertical"
      size={width}
      min={RAIL_MIN_WIDTH}
      max={RAIL_MAX_WIDTH}
      label="Resize Project Explorer"
      onResize={onResize}
      pointerToSize={pointerToSize}
      className="bg-sidebar-border/60 hover:bg-sidebar-border focus-visible:bg-sidebar-ring hidden lg:block"
    />
  );
}
