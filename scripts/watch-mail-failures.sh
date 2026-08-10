#!/usr/bin/env bash
#
# Alert an operator when SchedulePoint cannot send mail (`docs/TECH_DEBT.md` #100).
#
# ---------------------------------------------------------------------------------------------
# SUPERSEDED (staff console M1, 2026-08-09) — kept in-tree for one release as the fallback.
#
# Both halves of this script now have a replacement inside the application, and both replacements
# are strictly better for the same underlying reason: this script runs on the host it is watching.
#
#   * The mail-failure grep below is replaced by `MAIL_ALERT_URL`. The API posts the same signal
#     from inside the container — no Docker socket, no `SP_API_CONTAINER` to get wrong, no log
#     window to tune, and no dependence on the log driver keeping the line. It also coalesces, so a
#     broken relay produces one alert and one summary rather than one per send.
#   * The "cannot read logs" branch is replaced by `HEARTBEAT_URL`. That branch is this script's
#     attempt at a liveness check and it cannot work in the case that matters: if the HOST goes
#     down, the cron does not run, so nothing is emitted at all — the watcher and the thing watched
#     fail together and the silence looks exactly like health. An outward heartbeat inverts the
#     signal so that silence IS the alarm, which is the only construction that survives the failure
#     it reports.
#
# **Do not remove the cron entry until you have watched the new path alert on the real host.** The
# replacement is code that has passed unit tests and a real migration; it has not yet been observed
# failing over a genuinely broken relay on the deployed machine, and that observation is the
# evidence — not the test suite. Retiring first would leave a window with no alerting at all.
#
# And note what is NOT yet true: nothing is watching `HEARTBEAT_URL`. It ships built and dormant by
# choice (CQ-4, 2026-08-09), so until a dead-man's-switch check exists, this script's liveness
# branch — flawed as it is — is still the only one there is. `docs/TECH_DEBT.md` #100's operator
# half stays open until that check exists.
#
# See `docs/DEPLOYMENT.md` §"Alerting on mail failures" for the compose settings.
# ---------------------------------------------------------------------------------------------
#
# ADR-0075 decided mail delivery is best-effort and that the failure belongs to the **operator**,
# not the caller: a send that fails after Better Auth's handoff is invisible to the person who
# triggered it, and deliberately so — surfacing it would make "that address was free" and "that
# address is taken" distinguishable on an unauthenticated endpoint. The application therefore emits
# one alertable line, `event: 'mail.send_failed'` (`apps/api/src/common/mail/smtp-mail.service.ts`),
# and this is the thing that was missing: nothing watched it.
#
# What that costs while unwatched is not abstract. If the relay breaks — an expired credential, a
# provider outage — then every sign-up, invitation and password reset fails silently, for every
# organisation, and the first signal is a person who cannot get in telling somebody. With external
# clients that person has no one to tell.
#
# **Deliberately not email.** The one transport this alert exists to report on is the one that is
# broken, so the notification must not depend on it. `ntfy`, a Slack/Discord webhook or a phone
# push are all fine; the script only needs a URL that accepts a POST.
#
# **Deliberately not part of `/health/ready`.** The host recreates containers unattended (ADR-0047),
# so a readiness probe that failed on a 03:00 relay blip would take the API down and keep it down.
# The same reasoning is why the boot-time SMTP handshake is warn-only.
#
# Usage (as a cron entry, every five minutes):
#
#   */5 * * * * SP_ALERT_URL=https://ntfy.sh/your-topic SP_API_CONTAINER=schedulepoint-release-api-1 /path/to/watch-mail-failures.sh
#
# **Set SP_API_CONTAINER explicitly and check it first.** Neither compose file sets
# `container_name`, so Docker Compose names the container `<project>-<service>-<index>` — which is
# `schedulepoint-release-api-1` for the release stack and `schedulepoint-api-1` for the local build,
# and something else again if Dockge names the project after its stack directory. Confirm with:
#
#   docker ps --format '{{.Names}}' | grep api
#
# A wrong name does not fail silently — the branch below alerts "cannot read logs" — but it alerts
# every five minutes about the watcher rather than about the mail, which is its own kind of useless.
#
# It is stateless between runs except for a cursor file, so it reports each failure once. A run with
# no new failures prints nothing and exits 0 — silence means the transport is working.
set -euo pipefail

# The release stack's name. Overridden by SP_API_CONTAINER, which is what the usage note above
# tells operators to set — this default is a plausible starting point, not a safe assumption.
CONTAINER="${SP_API_CONTAINER:-schedulepoint-release-api-1}"
ALERT_URL="${SP_ALERT_URL:-}"
CURSOR="${SP_MAIL_CURSOR:-/var/tmp/schedulepoint-mail-watch.cursor}"
WINDOW="${SP_MAIL_WINDOW:-10m}"

if [ -z "$ALERT_URL" ]; then
  echo "SP_ALERT_URL is not set — refusing to run a watcher that cannot alert anyone." >&2
  echo "Set it to an ntfy topic, a Slack/Discord webhook, or anything that accepts a POST." >&2
  exit 2
fi

# `--since` bounds the read so this stays O(recent) rather than re-reading a rotated log each run.
# The window is deliberately wider than the cron interval: overlapping reads are harmless because
# the cursor de-duplicates, whereas a gap loses a failure permanently.
if ! logs="$(docker logs --since "$WINDOW" "$CONTAINER" 2>&1)"; then
  # A container that is not running is itself worth knowing about, and it is not a mail failure —
  # say which it is rather than emitting a misleading alert.
  curl -fsS -m 10 -d "SchedulePoint: cannot read logs for container '${CONTAINER}' — is it running?" \
    "$ALERT_URL" >/dev/null || true
  exit 1
fi

failures="$(printf '%s\n' "$logs" | grep -F 'mail.send_failed' || true)"
[ -z "$failures" ] && exit 0

# One line per failure, hashed, so a failure already reported is not reported again on the next
# overlapping window. Only the hashes are kept — the log lines carry addresses.
touch "$CURSOR"
new="$(printf '%s\n' "$failures" | sha256sum | cut -d' ' -f1)"
grep -qxF "$new" "$CURSOR" 2>/dev/null && exit 0
printf '%s\n' "$new" >> "$CURSOR"
# Keep the cursor bounded; a few hundred entries is far more than the de-duplication window needs.
tail -n 200 "$CURSOR" > "${CURSOR}.tmp" && mv "${CURSOR}.tmp" "$CURSOR"

count="$(printf '%s\n' "$failures" | wc -l | tr -d ' ')"
# The alert names the count and the window, not the addresses: this goes to a chat channel, and the
# addresses are in the log for whoever investigates.
curl -fsS -m 10 \
  -d "SchedulePoint: ${count} mail send failure(s) in the last ${WINDOW}. Sign-ups, invitations and password resets are failing silently. Check the SMTP relay, then: docker logs --since ${WINDOW} ${CONTAINER} | grep mail.send_failed" \
  "$ALERT_URL" >/dev/null
