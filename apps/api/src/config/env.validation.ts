import { z } from 'zod';

/**
 * An optional string where **empty means absent**.
 *
 * Every deployment surface this app has — Docker Compose, Dockge, Kubernetes — passes a variable
 * it does not have a value for as an empty string rather than omitting it, because `FOO: ${FOO}`
 * in a compose file always defines `FOO`. A plain `.min(1).optional()` therefore refuses to boot
 * on the ordinary case of "I have not configured mail yet", which is the opposite of optional.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * {@link optionalString} for an **outbound webhook URL**, validated as a URL at boot rather than
 * discovered at POST time.
 *
 * The distinction matters more here than for an ordinary string. Both variables that use this are
 * fire-and-forget alerting paths whose failures are, by design, swallowed to a log line — so a
 * typo'd value does not fail anything visibly: it produces an operator who believes they are
 * covered and a channel that never receives a message. That is the precise failure this milestone
 * exists to remove (`docs/TECH_DEBT.md` #100), so it is refused at the one moment somebody is
 * watching.
 *
 * The scheme is not constrained to `https:` — a receiver on the same Docker network is a legitimate
 * and common configuration, and it has no certificate. What is on the other end is the operator's
 * decision; that it is a URL at all is not.
 */
const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

/**
 * Environment schema — the single source of truth for configuration shape.
 * The app validates the environment at startup and refuses to boot on invalid
 * config (fail fast). See docs/BACKEND_ARCHITECTURE.md (Configuration).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    /** PostgreSQL connection string (postgresql://…). */
    DATABASE_URL: z.string().min(1),
    /** Comma-separated list of allowed CORS origins. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    /** Session signing secret — must be strong in production. */
    BETTER_AUTH_SECRET: z.string().min(16).default('dev-insecure-secret-change-me!!'),
    BETTER_AUTH_URL: z.string().min(1).default('http://localhost:3000'),
    /**
     * When `true`, users must have a verified email before their account is
     * usable — and, critically, before they can accept an organisation
     * invitation. The accept flow matches the signed-in user's email to the
     * invitee's, but that only proves mailbox ownership when verification is
     * enforced; otherwise an account can be registered for any address without
     * proof (ADR-0016 §5).
     *
     * The verification-email loop now exists (Theme B2, `emailVerification` in
     * `better-auth.ts`), so this is a switch an operator can turn on rather than
     * one that would strand every new account. It stays `false` by default
     * because turning it on is a deployment decision that needs a mail transport
     * — which is why `MAIL_SMTP_URL` is a hard prerequisite in production below.
     */
    AUTH_REQUIRE_EMAIL_VERIFICATION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /**
     * Comma-separated trusted proxy IPs/CIDRs, ordered outermost→innermost. The
     * auth rate limiter derives the client IP from `X-Forwarded-For`; without a
     * trusted-proxy list a client can spoof that header and bypass the limit
     * (credential stuffing). Required in production so the vulnerable default
     * cannot ship. Empty in dev (the app is reached directly).
     */
    TRUSTED_PROXY_IPS: z.string().default(''),
    /**
     * SMTP connection URL (`smtps://user:pass@host:465`). **Absent = the logging stub**, which is
     * exactly today's behaviour — so dev, test and CI are unchanged and an operator opts in by
     * setting one variable, with no flag to flip and no code path to choose.
     *
     * SMTP rather than a provider SDK: Postmark, SES, Resend, Fastmail and a self-hosted relay all
     * speak it, so **which** provider is configuration rather than a dependency, and swapping one
     * costs an env change instead of an adapter. It also keeps the credential out of the codebase.
     */
    MAIL_SMTP_URL: optionalString,
    /** The `From:` address. Required once SMTP is configured — a transport with no sender cannot send. */
    MAIL_FROM: optionalString,
    /**
     * Where to POST when mail stops working (staff console M1). **Absent = today's behaviour
     * exactly**: the `mail.send_failed` log line and nothing else — which is the rollback contract,
     * and is asserted by a test rather than assumed.
     *
     * ADR-0075 decided that a failed send is the **operator's** signal and not the caller's, because
     * surfacing it to the caller would make "that address was free" distinguishable from "that
     * address is taken" on an unauthenticated endpoint. It then left the operator with a log line
     * nobody reads (`docs/TECH_DEBT.md` #100). This closes that half: the same event, pushed to a
     * channel somebody actually watches.
     *
     * **The message never names a recipient.** It goes to a third-party chat service, which is data
     * egress — the same ground on which the staff-console spec rejects a third-party CSP collector.
     * Counts, window and message kinds only; the address lives in `mail_events`, behind the staff
     * guard, where reading it is an audited act.
     */
    MAIL_ALERT_URL: optionalUrl,
    /**
     * How long one alert speaks for. A broken relay fails *every* send, so the interesting message
     * is "mail has been failing for ten minutes, 43 times" and not forty-three copies of "a send
     * failed" — an alert channel that cries wolf is muted, and a muted channel is worth less than
     * no channel because it is believed to be working.
     *
     * Ten minutes is chosen against how the failure is discovered rather than how fast it can be
     * fixed: nothing about a relay outage is actionable inside ten minutes, and the first alert
     * fires **immediately** regardless — the window bounds the repeats, not the notification.
     */
    MAIL_ALERT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
    /**
     * Dead-man's-switch: POST here on an interval so an external service can alert on the **absence**
     * of the ping. Absent ⇒ **no timer is created at all** (asserted, not assumed).
     *
     * This is the one honest thing an application can do about its own liveness. Everything else in
     * this milestone is a signal the API sends when something is wrong; the API cannot send anything
     * when the API is what is wrong, and `scripts/watch-mail-failures.sh`'s "cannot read logs" branch
     * has the same defect one layer out — it runs on the same host it is meant to be watching.
     *
     * **Nothing watches this yet** (product owner, CQ-4, 2026-08-09: build it, wire the receiver
     * later). Until a receiver exists it is genuinely inert, which is why the absent case creating
     * no timer is a requirement rather than an optimisation — and why `docs/TECH_DEBT.md` #100's
     * operator half stays **open** rather than closing when this merges.
     */
    HEARTBEAT_URL: optionalUrl,
    /**
     * How often to ping. Capped at 60 so a value that silently disables the switch — an interval
     * longer than any check's tolerance — cannot be set by a typo.
     *
     * With more than one replica this is N pings per interval rather than one. That is harmless for
     * a dead-man's-switch, which asks "did *anything* ping?", and is stated here because the
     * arithmetic looks wrong to a reader who assumes one.
     */
    HEARTBEAT_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
    /**
     * When `true`, structural plan writes (activity/dependency create/update/
     * delete/restore, positions batch, schedule recalculate) require the caller
     * to hold the plan edit-lock (ADR-0028) and return **423** otherwise. Off by
     * default: the lock *mechanism* ships inert so it never breaks the existing
     * (flag-on) activities-table / dependency-editor / recalculate flows, which do
     * not yet acquire a lock. Flip it on only once the front end acquires the pen
     * across every editing entry point (edit-lock M2/M3). The progress path and
     * reads are never gated regardless of this flag.
     */
    PLAN_EDIT_LOCK_ENFORCED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /**
     * Comma-separated addresses that may reach the staff console (ADR-0086 D3). Empty = **nobody**,
     * which is the default and the safe direction: an unset variable cannot accidentally grant.
     *
     * Provisioning is deliberately out-of-band. Changing this needs host access and a container
     * recreate — the **same bar as reading the database**, which is the point: it creates no new
     * privilege path, because anyone who could edit it could already do everything the console
     * offers, unaudited, over `psql`.
     *
     * Its weaknesses are real and recorded rather than discovered later: no revocation without a
     * recreate, no per-staff capability split, and a list keyed on an address — which is why the
     * guard also requires `emailVerified` unconditionally. Without that, an allowlisted address
     * that has not yet signed up is squattable, and whoever registers it first becomes staff.
     */
    STAFF_EMAILS: z.string().default(''),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Rate limiting: window (seconds) and max requests per window. */
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    // Never allow the insecure development secret — and demand real entropy.
    if (env.BETTER_AUTH_SECRET.includes('dev-insecure') || env.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'A strong BETTER_AUTH_SECRET (≥ 32 chars) must be set in production.',
      });
    }

    // The auth rate limiter cannot safely resolve client IPs without knowing
    // which proxies to trust — refuse to boot on the spoofable default.
    if (env.TRUSTED_PROXY_IPS.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUSTED_PROXY_IPS'],
        message:
          'TRUSTED_PROXY_IPS must list your proxy IP(s)/CIDR(s) in production so auth rate limiting cannot be bypassed via a spoofed X-Forwarded-For header.',
      });
    }

    // Requiring a verified address with no way to deliver the link is a dead end: without a
    // transport the only adapter left is the logging stub, so the verify URL exists nowhere but
    // the server's own log and every new account is unusable with nothing on screen saying why.
    // The switch and its prerequisite are checked together rather than trusting an operator to
    // read a doc — the same reason MAIL_FROM is demanded alongside MAIL_SMTP_URL.
    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && env.MAIL_SMTP_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_REQUIRE_EMAIL_VERIFICATION'],
        message:
          'AUTH_REQUIRE_EMAIL_VERIFICATION=true requires MAIL_SMTP_URL in production — without a transport the verification link is only written to the server log, so no new account can be used.',
      });
    }

    // Don't silently trust only localhost as a CORS/CSRF origin in production.
    if (env.CORS_ORIGINS.split(',').some((origin) => origin.includes('localhost'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Set CORS_ORIGINS to your real web origin(s) in production (not localhost).',
      });
    }
  })
  /**
   * Mail is checked in **every** environment, not just production — the rules above guard against
   * shipping an insecure default, but this one guards against a transport that cannot send at all,
   * which is equally wrong in staging or on a developer's machine. Fail at boot rather than at the
   * first invitation.
   */
  .superRefine((env, ctx) => {
    if (env.MAIL_SMTP_URL !== undefined && env.MAIL_FROM === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message:
          'MAIL_FROM must be set when MAIL_SMTP_URL is — a transport needs a sender address.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate raw environment variables into a typed `Env`.
 * Passed to `ConfigModule.forRoot({ validate })`.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
