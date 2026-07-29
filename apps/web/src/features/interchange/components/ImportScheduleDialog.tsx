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
import { CheckboxField } from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-layout';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

/**
 * The schedule-import **review dialog** (ADR-0050, Stage C2 M1). A two-phase flow over the shared
 * `Dialog` primitive: pick a `.xer` or `.xml` → the app dry-runs it (parse-only, no write) and renders the returned
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
  canManageOrgCalendars = false,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
  /**
   * The caller holds `calendar:manage_org` (ADR-0053 §2). Only then is the "add this file's global
   * calendars to the organisation library" option offered — it writes SHARED tenant state, so a
   * Contributor-level importer must not be able to grow the org library as a side effect.
   */
  canManageOrgCalendars?: boolean;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import schedule from file"
      description={`Review what will be imported into “${projectName}” before creating the plan.`}
    >
      <ImportFlow
        orgSlug={orgSlug}
        projectId={projectId}
        projectName={projectName}
        onClose={onClose}
        canManageOrgCalendars={canManageOrgCalendars}
      />
    </Dialog>
  );
}

/** The upload → dry-run → confirm → commit flow. Mounted only while the dialog is open. */
function ImportFlow({
  orgSlug,
  projectId,
  projectName,
  onClose,
  canManageOrgCalendars,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  onClose: () => void;
  canManageOrgCalendars: boolean;
}): React.ReactElement {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const dryRun = useDryRunImport(orgSlug, projectId);
  const commit = useCommitImport(orgSlug, projectId);

  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<ImportError | null>(null);
  // ADR-0053 §5: the source file's GLOBAL calendars land in this project by default. Ticking this
  // opts them into the shared organisation library instead. It shapes the MAPPING, so changing it
  // re-runs the dry-run — the report a planner confirms must describe the import they will get.
  const [globalCalendarsShared, setGlobalCalendarsShared] = useState(false);

  const startDryRun = (picked: File, shared: boolean): void => {
    dryRun.mutate(
      { file: picked, ...(shared ? { globalCalendarScope: 'ORG' as const } : {}) },
      {
        // Announce that the report resolved so a screen-reader user not focused on the mounting
        // report region still hears it — the Confirm button silently enabling otherwise (WCAG 4.1.3).
        onSuccess: (report) => {
          announce(
            `Report ready — ${report.mapped.activities} activities, ${report.mapped.relationships} relationships mapped.`,
          );
        },
      },
    );
  };

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
    startDryRun(picked, globalCalendarsShared);
  };

  const onToggleGlobalCalendars = (shared: boolean): void => {
    setGlobalCalendarsShared(shared);
    commit.reset();
    // A report already on screen described the OTHER choice — re-run rather than let a planner
    // confirm an import the report does not match.
    if (file && !clientError) startDryRun(file, shared);
  };

  const onConfirm = (): void => {
    if (!file || !dryRun.isSuccess || commit.isPending) return;
    commit.mutate(
      { file, ...(globalCalendarsShared ? { globalCalendarScope: 'ORG' as const } : {}) },
      {
        onSuccess: ({ planId, report }) => {
          announce(`Imported schedule — ${report.mapped.activities} activities. Opening the plan.`);
          onClose();
          void navigate({
            to: '/orgs/$orgSlug/plans/$planId',
            params: { orgSlug, planId },
          });
        },
      },
    );
  };

  const errorMessage =
    clientError?.message ??
    (dryRun.isError ? toImportError(dryRun.error).message : null) ??
    (commit.isError ? toImportError(commit.error).message : null);

  const canConfirm = dryRun.isSuccess && !commit.isPending;

  return (
    <div className="flex flex-col gap-5">
      {/* A real two-step process, numbered because the order is load-bearing (ADR-0061): you cannot
          review a report before choosing a file, and you should not confirm before reading one.
          Step 2 is always present, carrying its own empty/pending/result state — a step that
          appears only once it has content leaves the reader unsure whether there is more to do. */}
      <FormSection title="1 · Choose a file">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="interchange-file">Schedule file (.xer or .xml)</Label>
          <input
            id="interchange-file"
            type="file"
            accept=".xer,.xml"
            onChange={onPickFile}
            aria-invalid={!!errorMessage}
            // Point the control at the error text only while it shows, so a screen-reader user
            // moving onto the field hears the failure with it (WCAG 1.3.1 / 3.3.1 / 4.1.2) —
            // mirroring the PlanCalendarPicker hint+error pattern.
            aria-describedby={
              errorMessage
                ? 'interchange-file-hint interchange-file-error'
                : 'interchange-file-hint'
            }
            className="border-input bg-background text-foreground file:bg-secondary file:text-secondary-foreground focus-visible:ring-ring focus-visible:ring-offset-background block w-full rounded-md border text-sm file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
          <p id="interchange-file-hint" className="text-muted-foreground text-xs">
            Primavera P6 (.xer) or Microsoft Project MSPDI (.xml) files up to {MAX_UPLOAD_LABEL}.
          </p>
        </div>

        {/*
        ADR-0053 §5. Imported calendars are tiered to this project by default, so importing three
        P6 files can no longer quietly add a dozen shared "Standard 5 Day Workweek" calendars every
        other project has to scroll past. The opt-out writes SHARED tenant state, so it is offered
        only to a holder of `calendar:manage_org`.
      */}
        {canManageOrgCalendars ? (
          <CheckboxField
            label="Add this file’s global calendars to the organisation library"
            checked={globalCalendarsShared}
            onChange={(event) => onToggleGlobalCalendars(event.target.checked)}
            hint={`Off (recommended): the file’s calendars belong to “${projectName}” alone. On: its global calendars join the shared library every project picks from.`}
          />
        ) : null}

        {errorMessage ? (
          <p id="interchange-file-error" role="alert" className="text-destructive-text text-sm">
            {errorMessage}
          </p>
        ) : null}
      </FormSection>

      <FormSection
        title="2 · Review what will be imported"
        description="Every approximation and every dropped field is listed. Nothing is written until you confirm."
      >
        {dryRun.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner label="Parsing the file…" />
            <span>Parsing the file…</span>
          </div>
        ) : dryRun.isSuccess ? (
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
        ) : (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            Choose a file above and its report appears here.
          </p>
        )}
      </FormSection>

      {commit.isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner label="Importing the schedule…" />
          <span>Importing the schedule…</span>
        </div>
      ) : null}

      <div className="border-border flex justify-end gap-2 border-t pt-4">
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
