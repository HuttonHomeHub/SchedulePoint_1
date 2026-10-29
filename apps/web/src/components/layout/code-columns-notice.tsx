import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import {
  canRetryCodeColumns,
  codeColumnsUnavailableSentence,
  retryFailedCodeColumns,
  type CodeColumn,
} from '@/lib/code-columns';
import { cn } from '@/lib/utils';

/**
 * The one sentence over a grid whose code columns could not be read, with a Retry beside it
 * (P6 activity codes, M3-T2). One sentence for the grid, not one per cell (`m3-ui-design.md` §10).
 *
 * `role="alert"`: a failed read is an error. The region is mounted empty and always, and only its
 * content changes, because a live region inserted already holding its text is not announced by some
 * screen readers (the swimlanes notice's rule). Empty it is out of flow (`empty:-mb-*` in
 * `quietClassName` cancels a parent's gap), and it cannot be `hidden`, which would remove it from the
 * accessibility tree.
 *
 * **A Retry that works unmounts the strip**, so focus on it would fall to `<body>` (WCAG 2.4.3,
 * ADR-0135): the layout-effect cleanup runs before the DOM is detached and hands focus to
 * `restoreFocus` if the button still holds it.
 */
export function CodeColumnsNotice({
  columns,
  restoreFocus,
  className,
  stripClassName,
}: {
  columns: readonly CodeColumn[];
  restoreFocus: () => void;
  /** The region's own classes: where it sits, and how it costs no space while empty. */
  className?: string;
  /** The strip's classes: where it is drawn at all (the table hides it below `lg`). */
  stripClassName?: string;
}): React.ReactElement {
  const sentence = codeColumnsUnavailableSentence(columns);
  return (
    <div role="alert" className={className}>
      {sentence === null ? null : (
        <FailedStrip
          sentence={sentence}
          columns={columns}
          restoreFocus={restoreFocus}
          {...(stripClassName === undefined ? {} : { className: stripClassName })}
        />
      )}
    </div>
  );
}

function FailedStrip({
  sentence,
  columns,
  restoreFocus,
  className,
}: {
  sentence: string;
  columns: readonly CodeColumn[];
  restoreFocus: () => void;
  className?: string;
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
  const retryable = canRetryCodeColumns(columns);
  return (
    <NoticeStrip
      tone="warning"
      density="comfortable"
      messageFit="grow"
      message={retryable ? sentence : `${sentence} Reload the page to try again.`}
      className={cn(className)}
    >
      {retryable ? (
        <Button
          ref={retryRef}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => retryFailedCodeColumns(columns)}
        >
          Retry
        </Button>
      ) : null}
    </NoticeStrip>
  );
}
