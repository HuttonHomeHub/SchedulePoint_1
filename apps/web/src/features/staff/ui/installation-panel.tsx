import { Badge } from '@/components/ui/badge';
import { QueryPanel, StatGrid } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffInstallation } from '@/features/staff/api/staff-panels';

/** What this installation is running. Never the mail credential — the API sends host and port only. */
export function InstallationPanel(): React.ReactElement {
  const installation = useStaffInstallation();

  return (
    // **No `id`, deliberately.** It carried `CHECK_SECTION_ID.alerting` only because the alerting
    // check used to point here, and when M6 sent that check to the section that answers it this
    // panel kept the constant — so two sections shared one `id`, which is invalid and makes the
    // anchor's destination ambiguous. Found by the journey on the first run after the fix; no unit
    // test could see it, because each renders its own subtree and the collision exists only in the
    // whole page. `id` is what makes a section a focus target, and nothing links here, so the
    // honest state is to have neither. One correct pattern applied to a control and not its
    // neighbour — inside the commit fixing an instance of exactly that.
    <QueryPanel
      title="Installation"
      query={installation}
      skeleton={<Spinner label="Loading installation…" />}
      errorLabel="Could not read installation state."
      errorStatus="Installation state could not be read."
      settledStatus={(data) => `Installation: API ${data.apiVersion}, ${data.environment}.`}
    >
      {(data) => (
        <>
          <StatGrid
            items={[
              { label: 'API version', value: data.apiVersion },
              { label: 'Environment', value: data.environment },
              { label: 'Mail host', value: data.mailHost ?? 'Not configured' },
              { label: 'Staff addresses', value: String(data.staffCount) },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant={data.requireEmailVerification ? 'neutral' : 'warning'}>
              {data.requireEmailVerification
                ? 'Email verification: enforced'
                : 'Email verification: off'}
            </Badge>
            <Badge variant={data.planEditLockEnforced ? 'neutral' : 'warning'}>
              {data.planEditLockEnforced ? 'Edit lock: enforced' : 'Edit lock: off'}
            </Badge>
          </div>
        </>
      )}
    </QueryPanel>
  );
}
