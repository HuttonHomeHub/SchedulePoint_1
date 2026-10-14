import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import type { OrganizationExportState } from '@/features/organization-export/api/use-export-organization';
import { formatBytes } from '@/features/organization-export/model/format-bytes';

/** The one sentence the live region speaks for a state; empty when there is nothing to say. */
function statusLine(state: OrganizationExportState): string {
  switch (state.status) {
    case 'busy':
      return state.bytes === 0
        ? 'Preparing your export…'
        : `Preparing your export… ${formatBytes(state.bytes)} received`;
    case 'done':
      return `Downloaded ${state.filename} (${formatBytes(state.bytes)}). It is in your Downloads folder.`;
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
 * The status line is the page's only live region while it is saying something, and its text changes
 * at most every two seconds (the hook's cadence). A refusal is an **event**, so it is announced
 * once as an alert (ADR-0132) and the status line is empty while it shows.
 */
export function ExportAction({
  state,
  onStart,
  onCancel,
}: {
  state: OrganizationExportState;
  onStart: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const busy = state.status === 'busy';
  const Icon = busy ? X : Download;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          variant={busy ? 'outline' : 'default'}
          onClick={busy ? onCancel : onStart}
        >
          <Icon aria-hidden="true" className="size-4" />
          {busy ? 'Cancel' : 'Download export'}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground min-h-5 text-sm">
        {statusLine(state)}
      </p>
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
