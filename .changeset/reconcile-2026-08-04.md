---
'@repo/api': patch
---

Reconciliation pass at the ADR-0073 epic boundary (`docs/RECONCILE.md`, ADR-0058), and the two
defects its step-7 review found.

**Fixed: the email-verification token no longer reaches production logs.** `LoggingMailService` is
selected whenever `MAIL_SMTP_URL` is unset — which its docblock called "i.e. development" but is
equally the state of a production host whose operator has not configured SMTP. It logged the full
verification URL, and Better Auth mints that token on every sign-up regardless of
`AUTH_REQUIRE_EMAIL_VERIFICATION`, so a live single-use token that marks an address verified was
being written to a retained log stream. The stub now withholds the link in production and names the
missing configuration instead; outside production it still logs it, because locally the link exists
nowhere else. `RATE_LIMIT_TTL` / `RATE_LIMIT_LIMIT` are also now listed in both compose files — they
were in the env schema and could never reach the container.

**Corrected: "a verification failure fails the sign-up" was false.** Better Auth invokes the mail
port through `runInBackgroundOrAwait`, which catches and logs the rejection without rethrowing, so
delivery is best-effort. Three places asserted otherwise and are now accurate; the remaining gap —
that a broken relay is visible only as an unstructured log line — is `docs/TECH_DEBT.md` #94.

Documentation across the repository is brought back into line with the code: the audit log, three
data-export paths and a real SMTP transport all existed while `CLAUDE.md` §17 listed them as
missing; hosting was settled on 2026-08-01 while four documents still called it the open question;
ADR-0006's shadcn/ui + Radix clause was never adopted and nothing said so; and `apps/web/README.md`
described the client as "foundation only" beside 748 source files. Every headline count is
re-derived and dated, five tech-debt rows are rewritten to be about what is actually left, and four
`.claude/agents/` files stop asserting libraries and files that do not exist.
