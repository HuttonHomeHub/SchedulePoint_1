import { useParams } from '@tanstack/react-router';

import { NoticeStrip } from '@/components/ui/notice-strip';
import { KeyValueList, PageContainer, PageHeader, SectionCard } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useExportOrganization } from '@/features/organization-export/api/use-export-organization';
import { ExportAction } from '@/features/organization-export/components/ExportAction';
import { useOrganizations } from '@/features/organizations';
import { useOrgRole } from '@/hooks/use-org-role';
import { canExportOrganization } from '@/lib/rbac';

/**
 * What the ZIP holds, in the words a reader would use for it. Grouped by what the reader came to
 * keep, not by file: the file-by-file list is the ZIP's own `README.txt` and
 * `docs/ORGANISATION_EXPORT_FORMAT.md`, and restating 28 names here would be a second copy to keep
 * true. Anything in the recycle bin is included — the copy is complete, not tidy.
 */
const INCLUDED = [
  {
    label: 'People',
    value: 'Members (including anyone removed), pending and revoked invitations, and their names.',
  },
  {
    label: 'Your work',
    value:
      'Clients, projects and plans, including anything in Recently deleted, with every activity, link, step, note and change history.',
  },
  {
    label: 'Calendars and resources',
    value: 'Working calendars with their exceptions and shifts, resources and their assignments.',
  },
  {
    label: 'Baselines and sharing',
    value:
      'Every baseline with its saved activities, and the share links that exist for each plan.',
  },
  {
    label: 'The record',
    value: 'The organisation’s audit log, and a manifest that counts and checksums every file.',
  },
];

const NOT_INCLUDED = [
  'Passwords, sign-in sessions and the secret parts of invitation and share links.',
  'The pen: who is editing right now.',
  'Internet addresses and browser details in the audit log, which the Audit log screen never shows either.',
  'People and events of other organisations.',
  'The server’s own technical records: mail delivery, browser security reports and performance measurements.',
];

/**
 * The Export data page (`/orgs/$orgSlug/export`, ADR-0194) — Org Admin only.
 *
 * Same three-branch shape as the audit log, for the same reason: the role comes from the
 * organisations query, which starts undefined, so asking `canExportOrganization` before it resolves
 * answers "no" — and rendering the refusal on that would state something false for as long as the
 * request takes (the ADR-0060 defect). Loading is its own branch, not a default.
 */
export function OrganizationExportScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const { isPending } = useOrganizations();
  const role = useOrgRole(orgSlug);
  const allowed = canExportOrganization(role);

  return (
    <PageContainer>
      <PageHeader
        title="Export organisation data"
        description="Download one ZIP file with everything this organisation holds, to keep or to open in a spreadsheet."
      />
      {isPending ? (
        <div className="mt-6 p-6">
          <Spinner label="Checking your access…" />
        </div>
      ) : allowed ? (
        <ExportBody orgSlug={orgSlug} />
      ) : (
        // A refusal, not an absence (ADR-0132's neighbour on the audit log): `role="status"` kept.
        <NoticeStrip
          className="mt-6"
          tone="info"
          emphasis="solid"
          density="comfortable"
          messageFit="grow"
          role="status"
          message="Only an Org Admin can export this organisation’s data."
        />
      )}
    </PageContainer>
  );
}

/**
 * Split out so the hook — and its abort-on-unmount — only exists for a caller who may use it,
 * mirroring the audit log's table.
 */
function ExportBody({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const { state, start, cancel } = useExportOrganization(orgSlug);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <SectionCard
        title="Download"
        description="The file shows the organisation as it stood when you pressed the button. A large organisation can take a few minutes: keep this page open until it says Downloaded."
      >
        <ExportAction state={state} onStart={start} onCancel={cancel} />
      </SectionCard>
      <SectionCard title="What is included">
        <KeyValueList items={INCLUDED} />
      </SectionCard>
      <SectionCard title="What is not included">
        <ul className="text-foreground list-disc space-y-1 pl-5 text-sm">
          {NOT_INCLUDED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
