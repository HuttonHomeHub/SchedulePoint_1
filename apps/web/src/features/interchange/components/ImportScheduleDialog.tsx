import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useCommitImport, useDryRunImport } from '../api/use-interchange';
import {
  checkUploadSize,
  toImportError,
  type ImportError,
  MAX_UPLOAD_LABEL,
} from '../lib/interchange-errors';
import { downloadReport } from '../lib/report-download';

import { InterchangeReportTable } from './InterchangeReportTable';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

/**
 * The schedule-import **review dialog** (ADR-0050, Stage C2 M1). A two-phase flow over the shared
 * `Dialog` primitive: pick a `.xer` → the app dry-runs it (parse-only, no write) and renders the returned
 * `InterchangeReport` (mapped counts + approximation / repair / drop lists, downloadable) → **Confirm
 * import** commits it (creates the plan server-side, recalculates) and opens the new plan on the TSLD
 * canvas, announcing the outcome. The target project is fixed from the surface context (display-only).
 *
 * States: **idle** (file picker), **loading** (parsing / committing spinners), **success** (report +
 * enabled Confirm), and **error** (a client-side size guard, or the server's 422 reject / 413 oversize /
 * network failure mapped to friendly copy). Confirm is disabled until a report is shown and while a
 * commit is in flight. Focus/Escape/return-focus come from the native `<dialog>`; the shared polite
 * live region announces success (WCAG 2.2 AA).
 *
 * The stateful flow lives in {@link ImportFlow}, mounted only while the dialog is open (the `Dialog`
 * primitive renders its children only when `open`), so each open starts from a clean slate — no
 * reset-on-open effect, and the upload/report state is discarded on close.
 */
export function ImportScheduleDialog({
  orgSlug,
  projectId,
  projectName,
  open,
  onClose,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import schedule from file"
      description={`Review what will be imported into “${projectName}” before creating the plan.`}
    >
      <ImportFlow orgSlug={orgSlug} projectId={projectId} onClose={onClose} />
    </Dialog>
  );
}

/** The upload → dry-run → confirm → commit flow. Mounted only while the dialog is open. */
function ImportFlow({
  orgSlug,
  projectId,
  onClose,
}: {
  orgSlug: string;
  projectId: string;
  onClose: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const dryRun = useDryRunImport(orgSlug, projectId);
  const commit = useCommitImport(orgSlug, projectId);

  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<ImportError | null>(null);

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files?.[0] ?? null;
    setClientError(null);
    commit.reset();
    dryRun.reset();
    setFile(picked);
    if (!picked) return;
    const sizeError = checkUploadSize(picked);
    if (sizeError) {
      setClientError(sizeError);
      return;
    }
    dryRun.mutate(picked);
  };

  const onConfirm = (): void => {
    if (!file || !dryRun.isSuccess || commit.isPending) return;
    commit.mutate(file, {
      onSuccess: ({ planId, report }) => {
        announce(`Imported schedule — ${report.mapped.activities} activities. Opening the plan.`);
        onClose();
        void navigate({
          to: '/orgs/$orgSlug/plans/$planId',
          params: { orgSlug, planId },
        });
      },
    });
  };

  const errorMessage =
    clientError?.message ??
    (dryRun.isError ? toImportError(dryRun.error).message : null) ??
    (commit.isError ? toImportError(commit.error).message : null);

  const canConfirm = dryRun.isSuccess && !commit.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="interchange-file">Schedule file (.xer)</Label>
        <input
          id="interchange-file"
          type="file"
          accept=".xer"
          onChange={onPickFile}
          aria-describedby="interchange-file-hint"
          className="border-input bg-background text-foreground file:bg-secondary file:text-secondary-foreground focus-visible:ring-ring focus-visible:ring-offset-background block w-full rounded-md border text-sm file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        />
        <p id="interchange-file-hint" className="text-muted-foreground text-xs">
          Primavera P6 XER files up to {MAX_UPLOAD_LABEL}.
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-destructive-text text-sm">
          {errorMessage}
        </p>
      ) : null}

      {dryRun.isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner label="Parsing the file…" />
          <span>Parsing the file…</span>
        </div>
      ) : null}

      {dryRun.isSuccess ? (
        <div className="flex flex-col gap-3">
          <InterchangeReportTable report={dryRun.data} />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadReport(dryRun.data)}
            >
              Download report
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          aria-busy={commit.isPending}
        >
          {commit.isPending ? 'Importing…' : 'Confirm import'}
        </Button>
      </div>
    </div>
  );
}
