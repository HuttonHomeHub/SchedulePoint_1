# ADR-0047: Automatic redeploy of released images (host-side pull trigger)

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** Platform / delivery

## Context

The release pipeline builds and pushes `web`/`api` images to GHCR — each tagged
with its own version plus a moving `latest` (ADR-0027) — but **nothing tells the
running host to pull them.** The self-hosted Docker/Dockge stack keeps serving
whatever image it already pulled until an operator runs `docker compose pull &&
up -d` (or clicks Dockge **Update**). A release that no host pulls simply never
reaches users (TECH_DEBT #29). This has already bitten production once: it sat on
a stale `web` image across several releases because the stack was "restarted"
without a pull of the moving tag.

Forces at play:

- The production topology is a **self-hosted Docker Compose / Dockge stack**
  behind Nginx Proxy Manager + Cloudflare, tracking `:latest` (ADR-0027,
  `docs/DEPLOYMENT.md`). The host is **not** publicly reachable — only the web
  origin is exposed through the proxy.
- The GHCR images are **private**, so any puller needs `read:packages` credentials.
- The API **self-migrates** on startup (`prisma migrate deploy`, ADR-0018), so a
  recreate applies pending migrations before it serves — a pull+recreate is a
  complete deploy with no extra step.
- `web` and `api` version **independently** (ADR-0027); each `:latest` moves on
  its own release.
- Auto-deploying to production is **outward-facing and only partly reversible**
  (rollback = pin the previous tag + recreate), so the mechanism must be **opt-in**
  and must never touch the database container.

## Decision

We will add an **opt-in, host-side pull trigger using [Watchtower](https://containrrr.dev/watchtower/)**,
shipped **dormant** in `docker-compose.release.yml` behind a compose
`autodeploy` **profile**. When an operator enables the profile, Watchtower polls
GHCR on an interval and **pulls + recreates only the label-enabled app
containers** (`web`, `api`) when their image digest moves — never the `db`
container or Watchtower itself.

Concretely:

- **Dormant by default.** The service declares `profiles: ["autodeploy"]`, so a
  normal `docker compose -f docker-compose.release.yml up -d` does **not** start
  it. Enabling it is a deliberate operator action:
  `COMPOSE_PROFILES=autodeploy docker compose -f docker-compose.release.yml up -d`.
- **Scoped by label.** `WATCHTOWER_LABEL_ENABLE=true` + a
  `com.centurylinklabs.watchtower.enable=true` label on `web`/`api` only, so
  Postgres is never recreated by the updater.
- **Reuses the existing GHCR login.** The host's Docker config (`config.json`,
  from the `docker login ghcr.io` the compose header already requires) is mounted
  read-only into Watchtower — no registry PAT is added to the compose environment.
- **Monitor-only escape hatch.** `WATCHTOWER_MONITOR_ONLY` (env, default `false`)
  lets an operator run it as **notify-without-update** — a manual gate that still
  tells you a release is waiting — without changing the wiring.
- **Rolling, tidy recreate.** `WATCHTOWER_ROLLING_RESTART=true` recreates one app
  container at a time; `WATCHTOWER_CLEANUP=true` prunes the superseded image.
- **Pinned image.** `containrrr/watchtower:1.7.1` (no `:latest` for an infra
  dependency).
- **Per-app tag selection.** The stack selects each image via `WEB_IMAGE_TAG` /
  `API_IMAGE_TAG` (default `latest`, the two versioning independently — ADR-0027),
  with `IMAGE_TAG` as a shared override for branch/sha builds. A **pinned** version
  (not `latest`) is not moved by Watchtower — so rollback-by-pin genuinely holds a
  host on a known version even while the updater runs.

Rollback is unchanged: pin the previous version tag and recreate (ADR-0027,
`docs/DEPLOYMENT.md` → _Runtime health & rollout_).

## Alternatives considered

- **A GHCR registry webhook → a receiver on the host.** GHCR does not emit
  push webhooks to arbitrary endpoints the way Docker Hub does, so this needs a
  custom receiver **and** an inbound-reachable endpoint on an otherwise
  non-public host — more moving parts and a new attack surface, for no benefit
  over a poll at our release cadence.
- **A deploy job in the publish workflow that SSHes/calls the host.** Requires
  the host to be reachable from GitHub Actions and long-lived host credentials
  stored as CI secrets — pushing deploy authority into CI and widening the blast
  radius of a compromised token. Rejected in favour of a host-side poll that
  needs no inbound access and no CI-held host credentials.
- **Do nothing / keep the manual pull.** Zero new dependency, but leaves the
  "shipped but not live" gap that already caused a stale-production incident.
  Rejected; the manual pull stays available and documented for anyone who wants
  it (or runs monitor-only).

## Consequences

- **Positive:** a release reaches the host automatically within one poll interval;
  the "shipped but not deployed" gap closes without exposing the host or handing
  deploy credentials to CI. The API's self-migration means the recreate is a
  complete deploy. Monitor-only preserves a manual gate for operators who want one.
- **Negative / risk:** Watchtower requires the **Docker socket** (`/var/run/docker.sock`),
  which is root-equivalent on the host — an accepted, well-understood cost of any
  host-side auto-updater, and the reason it is scoped by label and shipped
  dormant. Unattended production updates mean a bad release lands without a human
  in the loop; mitigated by the opt-in profile, the monitor-only toggle, the
  pre-release checklist (`docs/DEPLOYMENT.md`), backward-compatible migrations
  (expand/contract), and single-command rollback.
- **Neutral / follow-up:** the mechanism is documented in `docs/DEPLOYMENT.md`;
  operators choose per environment whether to enable auto-update, monitor-only,
  or neither. Optional release notifications via a shoutrrr
  `WATCHTOWER_NOTIFICATION_URL` are wired but unset by default. Resolves
  TECH_DEBT #29; relates to the still-open hosting-platform decision (TECH_DEBT #5).

## References

- TECH_DEBT #29 (no auto-deploy) and #5 (hosting platform undecided)
- ADR-0018 (self-migrating container image), ADR-0027 (per-package release
  tagging & per-image versions)
- `docs/DEPLOYMENT.md` → "Deploying a release to a self-hosted host"
- Watchtower documentation — https://containrrr.dev/watchtower/
