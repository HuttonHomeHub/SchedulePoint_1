import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { SWIMLANES_FAILED_NOTE } from '@/features/tsld/toolbar/tsld-toolbar-items';

/** The Gantt's sentence: its table loses the Swimlane column, and the diagram is not on screen (#549). */
export const GANTT_SWIMLANES_FAILED_NOTE =
  "Couldn't load swimlanes. The Swimlane column is hidden until they load.";

/**
 * Said over the diagram while swimlanes are on and their list could not be loaded (swimlanes M2 gate
 * review). The diagram is drawn without them in that state, so without a sentence a planner sees
 * their division gone and no reason; the lens row carries the same sentence for a reader who is in
 * `View ▾`, and this is for everyone who is not.
 *
 * `role="status"`: it is a standing condition with a remedy beside it, not a rejected write, and it
 * must not interrupt whatever the planner is doing on the canvas. The live region is
 * {@link SwimlanesFailedRegion}'s, mounted empty and always, because a region inserted already
 * holding its text is not announced by some screen readers; the strip inside it has no role of its
 * own, so there is exactly one.
 *
 * **Try again unmounts this strip when it works**, so a press that succeeds would leave focus on
 * `<body>` (WCAG 2.4.3, ADR-0135). The layout-effect cleanup runs before the DOM is detached: if the
 * button still holds focus then, it is handed on to the plan surface.
 */
export function SwimlanesFailedNotice({
  onRetry,
  restoreFocus,
  message = SWIMLANES_FAILED_NOTE,
}: {
  onRetry: () => void;
  restoreFocus: () => void;
  /** The sentence; the default names the diagram, so the Gantt passes its own (#549). */
  message?: string | undefined;
}): React.ReactElement {
  const retryRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef(restoreFocus);
  useLayoutEffect(() => {
    restoreRef.current = restoreFocus;
  });
  useLayoutEffect(() => {
    const retry = retryRef.current;
    return () => {
      if (retry !== null && document.activeElement === retry) restoreRef.current();
    };
  }, []);
  return (
    <NoticeStrip
      tone="warning"
      density="comfortable"
      messageFit="grow"
      message={message}
      data-testid="swimlanes-failed-notice"
    >
      <Button ref={retryRef} type="button" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </NoticeStrip>
  );
}

/**
 * The live region the notice arrives in. It is rendered in both plan views and
 * holds the notice only while the list has failed, so the region exists before its content changes.
 * Empty, it is zero-height; `empty:-mb-2` cancels the container's `gap-2` after it so the quiet state
 * costs the diagram no space (the region cannot be `hidden`, which would remove it from the
 * accessibility tree, nor `display: contents`, whose live-region support is unreliable).
 */
export function SwimlanesFailedRegion({
  failed,
  onRetry,
  restoreFocus,
  message,
}: {
  failed: boolean;
  onRetry: () => void;
  restoreFocus: () => void;
  message?: string | undefined;
}): React.ReactElement {
  return (
    <div role="status" className="empty:-mb-2">
      {failed ? (
        <SwimlanesFailedNotice onRetry={onRetry} restoreFocus={restoreFocus} message={message} />
      ) : null}
    </div>
  );
}
