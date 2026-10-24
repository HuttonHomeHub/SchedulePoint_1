import { useMemo } from 'react';

import {
  isCollapsedGutterWidth,
  swimlaneGutterText,
  type GutterSwimlane,
} from '../render/swimlane-gutter';

import { cn } from '@/lib/utils';

export interface SwimlaneGutterProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  swimlanes: readonly GutterSwimlane[];
  /** The width the host reserved (`gutterWidthFor`). Whether this is the collapsed strip follows
   * from it, so there is one input and no pair that can disagree. */
  widthPx: number;
  cornerHeightPx: number;
  /** Height reserved at the foot (the resource strip), so the labels stop where the scene does. */
  footPx: number;
}

/**
 * The swimlane gutter's DOM (swimlanes epic M2-T3, C3/C4): a bordered corner cell over the ruler and
 * the WBS band, then one label per swimlane. **Text comes from `swimlaneGutterText`, memoised on
 * the swimlanes and the width; positions are written by the canvas's frame loop** (`syncGutter`,
 * from `swimlaneGutterGeometry`), so each label renders hidden and a pan never re-renders this.
 *
 * `aria-hidden`: visual only, like the ruler. The accessible layer (the toolbar composite whose
 * buttons carry the full names) is M2-T9; until it lands the gutter must not be a second, wrong
 * voice. `title` stays as a pointer convenience for a name the strip or a clamp has shortened.
 *
 * Padding and line height are the classes below, and `GUTTER_PAD_PX` / `GUTTER_LINE_PX` are the
 * numbers the model reasons with; `TsldPanel.gutter.test.tsx` pins the two together.
 */
export function SwimlaneGutter({
  rootRef,
  swimlanes,
  widthPx,
  cornerHeightPx,
  footPx,
}: SwimlaneGutterProps): React.ReactElement {
  const collapsed = isCollapsedGutterWidth(widthPx);
  const labels = useMemo(
    () => swimlaneGutterText({ swimlanes, widthPx, collapsed }),
    [swimlanes, widthPx, collapsed],
  );
  return (
    <div
      aria-hidden="true"
      data-testid="tsld-swimlane-gutter"
      className="bg-canvas border-border absolute inset-y-0 left-0 z-10 overflow-hidden border-r"
      style={{ width: widthPx }}
    >
      <div
        data-testid="tsld-swimlane-gutter-corner"
        className="border-border border-b"
        style={{ height: cornerHeightPx }}
      />
      <div
        ref={rootRef}
        data-testid="tsld-swimlane-gutter-labels"
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: cornerHeightPx, bottom: footPx }}
      >
        {labels.map((l) => (
          <div
            key={l.key}
            data-swimlane={l.key}
            data-cut={l.cut}
            title={l.name}
            className={cn(
              'border-border text-foreground absolute inset-x-0 overflow-hidden border-b px-2 py-1 text-xs leading-4 wrap-anywhere',
              collapsed && 'text-center',
            )}
            style={{ display: 'none' }}
          >
            <span
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: collapsed ? 1 : l.maxLines,
                overflow: 'hidden',
              }}
            >
              {l.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
