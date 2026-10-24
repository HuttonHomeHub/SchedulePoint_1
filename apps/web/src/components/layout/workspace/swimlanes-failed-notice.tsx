import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { SWIMLANES_FAILED_NOTE } from '@/features/tsld/toolbar/tsld-toolbar-items';

/**
 * Said over the diagram while swimlanes are on and their list could not be loaded (swimlanes M2 gate
 * review). The diagram is drawn without them in that state, so without a sentence a planner sees
 * their division gone and no reason; the lens row carries the same sentence for a reader who is in
 * `View ▾`, and this is for everyone who is not.
 *
 * `role="status"`: it is a standing condition with a remedy beside it, not a rejected write, and it
 * must not interrupt whatever the planner is doing on the canvas.
 *
 * **Try again unmounts this strip when it works**, so a press that succeeds would leave focus on
 * `<body>` (WCAG 2.4.3, ADR-0135). The layout-effect cleanup runs before the DOM is detached: if the
 * button still holds focus then, it is handed on to the plan surface.
 */
export function SwimlanesFailedNotice({
  onRetry,
  restoreFocus,
}: {
  onRetry: () => void;
  restoreFocus: () => void;
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
      role="status"
      tone="warning"
      density="comfortable"
      messageFit="grow"
      message={SWIMLANES_FAILED_NOTE}
      data-testid="swimlanes-failed-notice"
    >
      <Button ref={retryRef} type="button" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </NoticeStrip>
  );
}
