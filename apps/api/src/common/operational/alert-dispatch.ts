import type { PinoLogger } from 'nestjs-pino';

/**
 * How long one alert POST may take before it is abandoned.
 *
 * Moved here verbatim from `OperationalAlertService`, which now imports it. Shorter than
 * `SEND_TIMEOUT_MS` deliberately: an alert fires from inside a `catch` block that has already
 * decided the request is finished, so nothing waits on it — but an unbounded `fetch` still holds a
 * socket, and the failure it is reporting is very often a network one, where a hung connection is
 * the *likely* case rather than the unlucky one.
 */
export const ALERT_TIMEOUT_MS = 5_000;

/**
 * The scalars an alert may carry beside its sentence.
 *
 * **Deliberately not `unknown`.** The whole point of the allow-list below is that a future field
 * cannot arrive by accident; typing this as an open bag would let one, and the compiler is the
 * cheapest place to refuse it.
 */
export type AlertContext = Readonly<Record<string, string | number>>;

/**
 * One bounded, unawaited POST to the operator's webhook (ADR-0087 M4).
 *
 * **Extracted from `OperationalAlertService.post()`, verbatim** — URL handling, timeout, body shape,
 * allow-listed log context and swallow semantics all preserved. It is a **pure function taking its
 * logger and URL**, not a `@Injectable` service, and that is the whole reason the extraction was
 * safe: `operational-alert.service.spec.ts` is the before/after oracle for this move (the ADR-0078
 * barrel-preserving argument), and a service would have added a fourth constructor parameter to
 * `OperationalAlertService` and forced both of that spec's construction sites to change. A function
 * changes neither the constructor nor a single assertion, so the oracle still means what it meant.
 * The implementation plan's M4-T1 named a service; this is the smaller change that fully does the
 * job, and the departure is recorded rather than quietly made.
 *
 * **Adding a `recordRetentionFailure` to `OperationalAlertService` was rejected**: that service's
 * whole vocabulary is mail — `MailEventKind`, the mail coalescing window, `mail_events` — and a
 * retention producer inside it would make the name a lie. A lie in a name is how the next producer
 * ends up somewhere worse.
 *
 * **The body never names row content.** This leaves the system for a third-party chat service, which
 * is data egress. For mail that means no recipient; for retention it means no `document_uri` and no
 * address — counts and table names are enough to act on and carry nothing about a person.
 *
 * **The log context is allow-listed and never includes the URL**: a webhook URL is frequently the
 * credential (`https://hooks.slack.com/services/T…/B…/<secret>`), and logs are retained and shipped.
 * That is the `smtpEndpoint` rule — a new object with named scalars, so a future field cannot arrive
 * by accident.
 */
export async function postAlert(params: {
  /** The operator's webhook. `undefined` means no POST is attempted at all. */
  readonly url: string | undefined;
  /** The sentence a chat service renders. Slack and Mattermost read `text` directly. */
  readonly text: string;
  /** The machine-readable event name, e.g. `mail.send_failed`. */
  readonly event: string;
  /** Prefix for the two log lines, e.g. `mail_alert` → `mail_alert.rejected`. */
  readonly alertName: string;
  /** Scalars for anything that parses rather than displays. Never row content. */
  readonly context: AlertContext;
  readonly logger: Pick<PinoLogger, 'warn'>;
}): Promise<void> {
  const { url, text, event, alertName, context, logger } = params;
  if (url === undefined) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, event, ...context }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        { event: `${alertName}.rejected`, status: response.status, ...context },
        'the alert endpoint rejected the notification',
      );
    }
  } catch (error) {
    logger.warn(
      { event: `${alertName}.failed`, err: error, ...context },
      'could not deliver an operational alert',
    );
  }
}
