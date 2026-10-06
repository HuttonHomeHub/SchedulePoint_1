import { KeyValueList, QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffInstallation } from '@/features/staff/api/staff-panels';
import { environmentLabel } from '@/features/staff/model/enum-copy';
import { INSTALLATION } from '@/features/staff/model/panel-copy';

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
      skeleton={<Spinner label="Loading version and settings…" />}
      errorLabel="Couldn't load version and settings."
      errorStatus="Version and settings couldn't be loaded."
      settledStatus={(data) =>
        `Version ${data.apiVersion}, ${environmentLabel(data.environment).toLowerCase()}.`
      }
    >
      {(data) => (
        <KeyValueList
          items={[
            { label: 'App version', value: data.apiVersion },
            { label: 'Environment', value: environmentLabel(data.environment) },
            { label: 'Mail server', value: data.mailHost ?? 'Not set up' },
            { label: 'Staff accounts', value: String(data.staffCount) },
            {
              label: 'Email confirmation required',
              value: data.requireEmailVerification ? 'Yes' : INSTALLATION.confirmationOff,
            },
            {
              label: 'One editor at a time',
              value: data.planEditLockEnforced ? 'On' : INSTALLATION.lockOff,
            },
          ]}
        />
      )}
    </QueryPanel>
  );
}
