import { ConditionStrip } from '@/components/ui/condition-strip';
import { KeyValueList, QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffInstallation } from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { ALERTING } from '@/features/staff/model/panel-copy';

/**
 * Alerts and monitoring: would anybody outside this page hear about a problem?
 *
 * **It is the alerting check's destination, and it reads the INSTALLATION response** — the one the
 * summary's `alerting` row reads — so the row and the box it opens cannot disagree (spec §0.12). The
 * health response carries the same fact (`alertingConfigured`), and both come from one server setting
 * (`StaffHealthService`: `config.mailAlertUrl !== undefined` on both lines), which is what made it
 * safe to choose one. It was two badges inside the Mail card until the redesign, which put the
 * answer to "is anybody told?" inside a box about something else.
 */
export function AlertingPanel(): React.ReactElement {
  const installation = useStaffInstallation();

  return (
    <QueryPanel
      title="Alerts and monitoring"
      id={CHECK_SECTION_ID.alerting}
      description={ALERTING.intro}
      query={installation}
      skeleton={<Spinner label="Loading alerts and monitoring…" />}
      errorLabel="Couldn't load alerts and monitoring."
      errorStatus="Alerts and monitoring couldn't be loaded."
      settledStatus={(data) =>
        data.mailAlertingConfigured && data.heartbeatConfigured
          ? 'Alerts and monitoring: on.'
          : 'Alerts and monitoring: something is off.'
      }
    >
      {(data) => (
        <>
          <KeyValueList
            items={[
              {
                label: 'Email failure alerts',
                value: data.mailAlertingConfigured ? 'On' : ALERTING.mailOff,
              },
              {
                label: 'Uptime check',
                value: data.heartbeatConfigured ? 'On' : ALERTING.uptimeOff,
              },
            ]}
          />
          {data.mailAlertingConfigured && data.heartbeatConfigured ? null : (
            <ConditionStrip
              verdict="Nobody outside this page will be told"
              howToFix={
                <p>
                  Ask whoever runs the server to set <code>MAIL_ALERT_URL</code> (for alerts) and{' '}
                  <code>HEARTBEAT_URL</code> (for the uptime check).
                </p>
              }
            >
              Until both are set, the only way to find a problem is to open this page.
            </ConditionStrip>
          )}
        </>
      )}
    </QueryPanel>
  );
}
