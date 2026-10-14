import { Download, X } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import type { OrganizationExportState } from '@/features/organization-export/api/use-export-organization';
import { formatBytes } from '@/features/organization-export/model/format-bytes';

/**
 * A Cancel press this soon after the export started is taken for the Enter-Enter of a reflex
 * double-press, not a decision: Download and Cancel are one button in one place, so the second press
 * of a double-activation would otherwise cancel the export it just began.
 */
export const CANCEL_GRACE_MS = 500;

/**
 * The one sentence the live region speaks for a state; empty when there is nothing to say. It is
 * constant for the whole of a running export, so the region announces the start and the result and
 * nothing in between — the running byte count is drawn outside it.
 */
function statusLine(state: OrganizationExportState): string {
  switch (state.status) {
    case 'busy':
      return 'Preparing your export…';
    case 'done':
      return `Downloaded ${state.filename} (${formatBytes(state.bytes)}). Your browser has saved it.`;
    case 'cancelled':
      return 'Export cancelled.';
    default:
      return '';
  }
}

/**
 * **Download export** while resting, **Cancel** while a download runs.
 *
 * One `Button` whose label and handler change, never two buttons swapped in and out: the control
 * under the reader's focus must not unmount mid-press (ADR-0111, ADR-0135), and a keyboard user who
 * pressed Download is then one Enter away from Cancel without hunting for it. Nothing is `disabled`
 * (ADR-0083) — a second press while busy is simply the Cancel it now says it is.
 *
 * The status line is the page's only live region while it is saying something; the byte count beside
 * it is deliberately not live, so a long export is announced twice, not every two seconds. A refusal is an **event**, so it is announced
 * once as an alert (ADR-0132) and the status line is empty while it shows.
 */
export interface ExportActionProps {
  state: OrganizationExportState;
  onStart: () => void;
  onCancel: () => void;
}

export function ExportAction({ state, onStart, onCancel }: ExportActionProps): React.ReactElement {
  const busy = state.status === 'busy';
  const Icon = busy ? X : Download;
  const startedAt = useRef(0);

  const start = (): void => {
    startedAt.current = Date.now();
    onStart();
  };
  const cancel = (): void => {
    if (Date.now() - startedAt.current < CANCEL_GRACE_MS) return;
    onCancel();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          variant={busy ? 'outline' : 'default'}
          onClick={busy ? cancel : start}
        >
          <Icon aria-hidden="true" className="size-4" />
          {busy ? 'Cancel' : 'Download export'}
        </Button>
      </div>
      <div className="text-muted-foreground flex min-h-5 flex-wrap gap-x-2 text-sm">
        <p role="status">{statusLine(state)}</p>
        {state.status === 'busy' && state.bytes > 0 ? (
          <span>{formatBytes(state.bytes)} received</span>
        ) : null}
      </div>
      {state.status === 'error' ? (
        <NoticeStrip
          tone="destructive"
          emphasis="solid"
          density="comfortable"
          messageFit="grow"
          role="alert"
          message={state.message}
        />
      ) : null}
    </div>
  );
}
