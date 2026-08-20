import { X } from 'lucide-react';
import { useRef } from 'react';

import {
  CONTEXT_DRAWER_MAX_WIDTH,
  CONTEXT_DRAWER_MIN_WIDTH,
} from '@/components/layout/drawer/use-context-drawer-prefs';
import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { Surface } from '@/components/ui/surface';

/**
 * The **context drawer** — the app's single trailing panel (ADR-0099 D2), and the first
 * **non-modal persistent panel** in this codebase. `Dialog` and `Sheet` are both native
 * `<dialog>` + `showModal()`, so this inherits none of a modal's free protections and every one
 * of them has to be a decision (plan.md §A16):
 *
 * - **Escape is not handled here.** It is an explicit rung in the workspace's existing ladder
 *   (ADR-0080: tool → open pick → selection → drawer), placed with ADR-0079's target guard so a
 *   keystroke typed into a field belongs to the field. A `window` listener added by this component
 *   would fire regardless of focus, which is the exact defect ADR-0079 was opened on. The drawer
 *   takes `onClose` and nothing else.
 * - **Focus never moves into it on a subject change.** The stage keeps focus, because a selection
 *   change is a chain-navigation keystroke away and yanking focus on every one of them is
 *   unusable. The subject change is carried by the canvas's existing `describeActivity`
 *   announcement rather than a second, competing live region.
 * - **The empty state is explicit**, never the last subject's stale data — a panel that keeps
 *   showing an activity nobody has selected is a panel that lies.
 * - **Below `lg` this is not used at all.** There it must overlay, and overlaying means modal,
 *   which `Sheet` already is; a second overlay contract is how two dismissal behaviours end up in
 *   one app.
 *
 * It is a shell, not a switcher: the subject is chosen by the rail's panel buttons and named here.
 * Putting a tab strip in the header as well would be one action on two surfaces, which ADR-0093
 * removed from this product and has a structural gate against.
 */
export function ContextDrawer({
  title,
  onClose,
  width,
  onResize,
  children,
  className,
}: {
  /** The active subject's name — rendered as the panel's heading and its accessible name. */
  title: string;
  /** Invoked by the close control. Escape is the workspace's ladder, not this component's. */
  onClose: () => void;
  width: number;
  onResize: (width: number) => void;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div className={className}>
      {/* The splitter sits on the drawer's LEADING edge, so a drag left grows it — which is why
          `reverseKeys` is set: without it the arrow keys would grow the panel in the opposite
          direction to the pointer, and a keyboard user and a mouse user would disagree about what
          "wider" means. `pointerToSize` is the caller's job in the primitive's contract because
          only the caller knows which edge the divider is on; here it is the panel's right edge
          minus the pointer, read from the live box rather than from `width` (which is the value
          being changed). */}
      <Surface tone="panel" className="contents">
        <PanelResizer
          orientation="vertical"
          size={width}
          min={CONTEXT_DRAWER_MIN_WIDTH}
          max={CONTEXT_DRAWER_MAX_WIDTH}
          label="Resize context drawer"
          onResize={onResize}
          reverseKeys
          pointerToSize={(event) => {
            const right = panelRef.current?.getBoundingClientRect().right ?? 0;
            return right - event.clientX;
          }}
        />
      </Surface>
      <Surface
        tone="panel"
        as="aside"
        aria-label={title}
        ref={panelRef}
        className="border-border flex h-full min-h-0 flex-col border-l"
        style={{ width }}
      >
        <div className="border-border flex h-10 shrink-0 items-center gap-1 border-b pr-1 pl-3">
          {/* An `<h2>`, because the drawer is a labelled region of the page and its subject is the
              one thing a reader arriving by landmark needs. `truncate` with a `title`: a subject
              name is data (an activity's name) and can be long. */}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close context drawer"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Surface>
    </div>
  );
}

/**
 * What the drawer shows when its subject has nothing to describe — no activity selected, an empty
 * plan, a subject that needs a selection.
 *
 * Separate from the drawer so the shell has no opinion about content, and so this state is a thing
 * a caller has to choose rather than a fallback it gets by forgetting. Stale data is the failure
 * mode being designed against: a panel still showing the last activity after the selection cleared
 * reads as current and is not.
 */
export function ContextDrawerEmpty({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <p className="text-muted-foreground p-4 text-sm">{children}</p>;
}
