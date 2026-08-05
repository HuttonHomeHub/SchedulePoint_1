---
'@repo/api': minor
'@repo/web': patch
---

Bound every SMTP send at 10 seconds, and make wrong claims a gated defect class (ADR-0076).

**The mail fix corrects ADR-0075's own central claim.** That ADR's risk table said mail delivery
has "no request-path cost". It does: Better Auth's `runInBackgroundOrAwait` **awaits** the send
unless `advanced.backgroundTasks.handler` is configured, nothing here configures one, and
`InvitationsService` awaits its send in the handler outright. So sign-up, password-reset requests,
verification resends and invitation creation each blocked on a live SMTP round trip bounded only by
nodemailer's defaults — **up to ten minutes** on a socket that connects and then goes quiet. Every
send now races a 10 s timeout it controls, taking the same swallow-and-log path as a refusal, so no
caller-visible behaviour changes and every enumeration-uniformity property is untouched. The
abandoned send gets its own handler, without which a late rejection would be _unhandled_ and Node
would terminate the process — a bound added to stop an outage hanging a request would otherwise
have converted that outage into a crash loop.

**Operators: two log fields were renamed.** `mail.transport_unreachable` is now
`mail.transport_check_failed`, and the failure record's `message` field is now `kind`. Update any
alert built on the previous names. A new `abandoned: true` warn record marks a send that exceeded
the bound and then failed anyway — filter it out when counting failures.

**Sign-out now clears the cache on `onSettled` rather than `onSuccess`**, so a sign-out whose
request fails (offline, proxy error, API restarting) no longer leaves the previous user's
organisations, plans and activities in memory and on screen.

**Two new CI gates, both pure filesystem reads.** `pnpm check:counts` re-derives `CLAUDE.md`'s six
stage-banner figures — every one was wrong at a reconciliation pass, the correction told readers to
re-run `ls | wc -l`, and five of six were wrong again a day later. `pnpm check:claims` pins the 34
file-and-line citations this repository makes into `better-auth` and `better-call`: the version each
was verified against, an anchor from the code at each cited line, and that no citation exists
outside `scripts/dependency-claims.json`. Those citations are load-bearing — ADR-0074 hashes reset
identifiers and ADR-0075 rejects an abort design because of them — and a minor bump moves every one
while the prose keeps reading as authoritative. **A Dependabot bump of either package now fails
CI**, which is the intended cost rather than a side effect.

Also recorded: `docs/TECH_DEBT.md` #99 (`/request-password-reset` leaks account existence through
timing — narrowed from ten minutes to ten seconds, not closed) and #98 (the guest share view scrolls
sideways at 320 px, pre-existing and only observable once the canvas had height).
