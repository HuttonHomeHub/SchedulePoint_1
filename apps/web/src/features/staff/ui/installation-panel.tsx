import { KeyValueList, KeyValueListSkeleton, QueryPanel } from '@/components/ui/page';
import { useStaffInstallation } from '@/features/staff/api/staff-panels';
import { environmentLabel } from '@/features/staff/model/enum-copy';
import { INSTALLATION } from '@/features/staff/model/panel-copy';

// The labels are shared by the settled list and its skeleton, so the placeholder shows the real
// words and the two cannot disagree. The last two settings carry a consequence line.
const LABELS = {
  version: 'App version',
  environment: 'Environment',
  mail: 'Mail server',
  staff: 'Staff accounts',
  confirmation: 'Email confirmation',
  lock: 'One editor at a time',
} as const;

/**
 * What this installation is: its version, environment and the main safety switches, as a readable
 * list rather than four figures and two badges. A setting is a fact about the installation, not a
 * headline number, so it is a `KeyValueList` and the consequence of a switch being off sits on the
 * line under it (ADR-0178).
 *
 * **No `id`, deliberately.** Nothing links here: the status summary's five checks each have a box of
 * their own, and `id` is what makes a section a focus target. Giving this one the id another section
 * already carried is how two sections once shared one, which is invalid and makes an anchor's
 * destination ambiguous.
 */
export function InstallationPanel(): React.ReactElement {
  const installation = useStaffInstallation();

  return (
    <QueryPanel
      title="Version and settings"
      query={installation}
      skeleton={
        <KeyValueListSkeleton
          items={[
            { label: LABELS.version },
            { label: LABELS.environment },
            { label: LABELS.mail },
            { label: LABELS.staff },
            { label: LABELS.confirmation, consequence: true },
            { label: LABELS.lock, consequence: true },
          ]}
        />
      }
      loadingLabel="Loading version and settings…"
      errorLabel="Couldn't load version and settings."
      errorStatus="Version and settings couldn't be loaded."
      settledStatus={(data) =>
        `Version ${data.apiVersion}, ${environmentLabel(data.environment).toLowerCase()}.`
      }
    >
      {(data) => {
        const confirmation = data.requireEmailVerification
          ? INSTALLATION.confirmation.on
          : INSTALLATION.confirmation.off;
        const lock = data.planEditLockEnforced ? INSTALLATION.lock.on : INSTALLATION.lock.off;
        return (
          <KeyValueList
            items={[
              { label: LABELS.version, value: data.apiVersion },
              { label: LABELS.environment, value: environmentLabel(data.environment) },
              { label: LABELS.mail, value: data.mailHost ?? 'Not set up' },
              { label: LABELS.staff, value: String(data.staffCount) },
              { label: LABELS.confirmation, ...confirmation },
              { label: LABELS.lock, ...lock },
            ]}
          />
        );
      }}
    </QueryPanel>
  );
}
