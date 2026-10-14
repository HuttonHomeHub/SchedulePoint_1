# What 1.0 means, and whether we are there

> Written for the product owner, in plain words. Written 2026-10-13. The decision behind it is
> [ADR-0190](adr/0190-what-1-0-promises.md); the reasoning and the options are in
> [`specs/pre-1-0-batch-2/feature-spec.md`](specs/pre-1-0-batch-2/feature-spec.md) §4.2.
> **Nothing on this page has cut 1.0.** You said to write it down only. Cutting it is a separate step you
> take after reading this (see "How the cut works").

## The short answer

**Not yet.** Three things you said must exist before 1.0 do not all exist today: a tested way to back up and
restore the database (missing), a download of everything an organisation holds (missing), and the recycle
bin's permanent clear-out after 90 days (built, but switched off). Each gets its own short plan after this
batch. Everything else on the list is either done, waiting on a reading only you can judge, or waiting on a
tidy-up that happens at the moment of the cut.

## What "1.0" is

Today the version numbers start with a zero (`web` 0.190.2, `api` 0.89.4). In the zero era the project's own
rule ([`CLAUDE.md`](../CLAUDE.md) §10) is that a breaking change only bumps the second number, because
nobody was promised anything stable. **1.0 is the day that stops being true.** It is a promise: from then on,
the things in "What 1.0 promises" below do not change in a way that breaks someone without the first number
going up.

It does **not** mean "finished". It means "safe to build on and safe to keep your plans in".

## How to read the checklist

Every line is exactly one of three kinds. If a line cannot be put in one of them, it does not belong here.

- **Evidence** — we looked, and the page says where (a file and line, or a command you can run).
- **Owner decided** — you already answered it, and the date is given.
- **Not for 1.0** — deliberately left out, so nobody waits for it.

New things we find missing are never added here as work. They become their own item and their own plan.

## The checklist

| #   | What has to be true                                                                                      | Where it stands today                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Kind and proof                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every "must have" in the original brief works                                                            | **Done.** The brief's §8 list is built. "Hammock" activities are covered by Level of Effort, which is your earlier decision. The Gantt can be edited, which the brief asked for.                                                                                                                                                                                                                                                                                                    | Evidence: `CLAUDE.md:34` (the engine), ADR-0095 and ADR-0170 (Gantt editing), `docs/DECISIONS.md:3636-3645` (the hammock decision)                                                                                                                                                                                                                                                                                                                          |
| 2   | Several planners editing one plan at the same moment                                                     | **Not in 1.0.** One planner holds the pen at a time and can hand it over (that is ADR-0028).                                                                                                                                                                                                                                                                                                                                                                                        | Not for 1.0 — you decided on 2026-10-12 (`docs/DECISIONS.md:87`)                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | The scheduling maths gives the same answers as the reference examples                                    | **Done.** The set of reference schedules the engine is checked against is closed and passing.                                                                                                                                                                                                                                                                                                                                                                                       | Evidence: `CLAUDE.md:34`, ADR-0034                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | No known accessibility fault that a person can meet                                                      | **Done.** The one open fault, Windows contrast themes (#505), was fixed and released in #978 (`web` 0.190.2). A first sort of the other open register rows is below; none is a blocker on its face, but you may read it differently.                                                                                                                                                                                                                                                | Evidence: `docs/TECH_DEBT.md` #505 (closed, fixed in #978, `web` 0.190.2); the list under "Open faults a person could meet"                                                                                                                                                                                                                                                                                                                                 |
| 5   | A written, **tested** way to back up the database and restore it                                         | **Built; waiting for your practice check.** A copy is taken every night and kept 30 days, and one is taken before any update that changes the database (a failed copy holds the update). The database port is closed. CI restores a copy on every change. It becomes Done when you have followed Part 1 on your server and recorded one `CHECK PASSED` from Part 2 of [`guides/back-up-and-restore.md`](guides/back-up-and-restore.md).                                             | Owner decided — required for 1.0, 2026-10-13 (`docs/DECISIONS.md:52`); spec approved 2026-10-14 (`docs/DECISIONS.md:33`). Evidence: [`specs/database-backup/feature-spec.md`](specs/database-backup/feature-spec.md), ADR-0192, `docs/DEPLOYMENT.md` "Backups", the `e2e-api` step "Backup and restore round trip" and the `image` job's restore steps in `.github/workflows/ci.yml`. Your step: the guide, Parts 1 and 2 (about 25 minutes, then 30 to 45) |
| 6   | A way for an organisation to download everything it holds                                                | **Missing.** There are plan exports (P6 XER, Microsoft Project MSPDI, CSV, PNG, PDF) but nothing for a whole organisation. The brief's §13 promised one. Its own plan comes after this batch.                                                                                                                                                                                                                                                                                       | Owner decided — required for 1.0, 2026-10-13. Proof it is missing: `CLAUDE.md:677`                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | Items in the recycle bin are permanently removed after 90 days                                           | **Built, switched off; waiting for you to switch it on.** The setting is `RETENTION_HIERARCHY_ENABLED` and it defaults to off, so nothing has ever been permanently deleted on any server. A command now lists what would go before anything does, and [a step-by-step guide](guides/switch-on-the-clear-out.md) covers switch-on day. It stays off until you choose the day.                                                                                                       | Owner decided — required for 1.0, 2026-10-13. Proof: `.env.example:91`, `docker-compose.release.yml:154`, `CLAUDE.md:620` and `:660`; the guide `docs/guides/switch-on-the-clear-out.md`                                                                                                                                                                                                                                                                    |
| 8   | The promised speed on a large plan (30 frames a second at 2,000 activities, zoomed out)                  | **Met on the Dell** (45.9 frames a second in the latest reading). The latest reading on your Surface was 26.0, taken on an older version of the drawing code and not repeated since.                                                                                                                                                                                                                                                                                                | Evidence: `CLAUDE.md:789` (Dell), `CLAUDE.md:783` (Surface). Whether the Surface counts is your call.                                                                                                                                                                                                                                                                                                                                                       |
| 9   | The things we promise not to break (below) are named, and old leftover names removed                     | **Ready to do at the cut.** Four old field names in the revision comparison are kept only for other programs and are marked "removed at the next breaking change". The cut is the last easy moment to remove them. Removing them touches `baselines/revision-delta.ts:235-244`, `schedule/dto/revision-compare.dto.ts:139`, `schedule/dto/cross-plan-revision-compare.dto.ts:215-236`, `packages/types/src/index.ts:3186-3192`, some web test fixtures and the `docs/API.md` table. | Owner's call, and evidence: `docs/API.md`, section "Deprecated fields", and `docs/TECH_DEBT.md` #405. Owner's call. Default: remove them at the cut, as a release of their own (see "How the cut works")                                                                                                                                                                                                                                                    |
| 10  | The brief, the roadmap and the operating manual all say the same thing about 1.0                         | **Done in this batch.** The brief's hosting line was out of date (it said "to be decided"; Docker Compose was settled), the roadmap had no 1.0 entry, and `CLAUDE.md` §10 had no end condition. All three now point here.                                                                                                                                                                                                                                                           | Evidence: `docs/PROJECT_BRIEF.md` §16, `docs/ROADMAP.md`, `CLAUDE.md` §10                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | Adoption measures from the brief (satisfaction score, how often views are used, a 20-minute first build) | **Not for 1.0.** These measure how well the product lands after release. Nobody should wait on them.                                                                                                                                                                                                                                                                                                                                                                                | Not for 1.0 — `docs/PROJECT_BRIEF.md` §7                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 12  | An automatic check that a change does not break the web API                                              | **Missing.** The API's OpenAPI document is not saved anywhere and nothing compares it between releases (`TECH_DEBT.md` #507).                                                                                                                                                                                                                                                                                                                                                       | Owner's call — default: not required for 1.0; the row tracks it. Evidence: `apps/api/src/main.ts:36-50`                                                                                                                                                                                                                                                                                                                                                     |

### Parked by the owner — the owner's call

These two jobs are yours, and you parked them on 2026-10-13. This page takes no position on them.

- Setting up the mail-failure and uptime alerts on your server: `docs/guides/set-up-alerts.md`, and the register
  row `docs/TECH_DEBT.md` #100.
- The device check sheet (screen reader, contrast theme and large text on your two machines):
  `docs/specs/pre-1-0-hardening/device-check-sheet.md`.

### Open faults a person could meet

A first sort of the 125 open rows in `docs/TECH_DEBT.md`, asking only one question: can a person using the
product run into this? No row was rewritten. Most of the register is internal tidying and is left out. The
rows below are the ones a person could meet, one line each, as read from each row's opening paragraph on
2026-10-13.

- **#88** — a mail program that scans links can "click" the verification link before the person does; only
  matters once email verification is required.
- **#318** — after a calendar's hours-per-day changes, a baseline comparison shows float as having moved
  when no date moved.
- **#84** — levelling gets slow when thousands of activities compete for one resource (about 11.6 seconds at
  16,000).
- **#419** — selecting an activity on the diagram takes about a quarter of a second on a 2,000-activity plan.
- **#294** — a colleague's request for the pen costs the diagram 76 to 80 pixels of height.
- **#437** — after dragging the Gantt's grid divider, a zoom preset frames the chart for the old width.
- **#477** — on a very short, narrow window the command bar scrolls away and nothing hints how to get it back.
- **#490** — at 320 pixels wide the app header takes four lines.
- **#223** — the resource strip under the diagram is not in the exports or the printout.
- **#229** and **#307** — two small keyboard and screen-reader details (a disabled option in a combo box, and
  a focusable "loading" row in the project tree).
- **#500, #504, #505, #501** — the faults fixed or measured in this same batch. All four are now closed (#976, #980,
  #978, #981).

Counting this list as a blocker or not is your call. None of them loses data.

## What 1.0 promises afterwards

These are what the first number protects. If a change breaks any of them, the first number goes up.

1. **The web API under `/api/v1`**: the controllers and their request and response shapes, as written up in
   `docs/API.md`. A machine-readable OpenAPI document is generated from them, but it is only served on
   non-production servers and is not saved or checked automatically (line 12). That includes the public links
   guests use (`/api/v1/share/*`) and the health checks (`/api/v1/health`, `/api/v1/health/ready`).
2. **The file formats the product writes and reads**, including the hidden SchedulePoint layout field inside
   exported files (ADR-0156).
3. **The settings an operator uses** — the environment variables in `.env.example` and the Docker Compose files.

These are **not** promised: the staff console (`/api/v1/staff/*`, already declared separate in
`docs/API.md`), the sign-in routes under `/api/auth/*` (they belong to the sign-in library, Better Auth, and the
web app is their only user), the database layout, and the internal code packages.

Two different numbers move for two different reasons:

- The **package version** (`api` 1.x.x, `web` 1.x.x) goes up a major step when something above breaks.
- The **address version** (`/api/v1`) is not touched by an ordinary major. After 1.0, a breaking change to
  `/api/v1` may be made in place only with a package major bump, a migration note in the CHANGELOG and an ADR;
  `/api/v2` is introduced only when a program outside this repository depends on v1 (none does today).

The web app has no programs calling it, so its first number moves only when something users rely on is
removed, or when saved links (plan addresses, guest links) stop working.

## How the cut works

Described here, **not performed**. We rehearsed it on a throwaway copy on 2026-10-13 and deleted the copy.

1. One small note file ("changeset") says `api` and `web` both get a **major** change. Its text becomes the
   1.0 release note.
2. The release tool then opens its usual "Version Packages" pull request. The rehearsal showed `api`
   going from 0.89.3 to **1.0.0** and `web` from 0.190.1 to **1.0.0**. Only four files changed: the two
   version files and the two changelogs. The internal packages are private and stay at 0.x.
3. You merge that pull request. The automation tags `api-v1.0.0` and `web-v1.0.0` (`release.yml:139-158`), and
   publishes the two images with the tags `1.0.0`, `latest`, a `sha-…` tag and `main`
   (`docker-publish.yml:128-139`). There is no `:1` (major-only) tag on any path, so a server cannot pin to "any 1.x". A `:1.0` tag
   would come only from the old `v*` tag trigger (`docker-publish.yml:4-10`, `:129-130`); that is read from the
   workflow, not exercised.
4. Your server follows `latest` by default (`docker-compose.release.yml:74` for the API, `:161` for the web
   app). **With the automatic updater on (ADR-0047), merging the Version Packages pull request is the
   production deploy, a few minutes later**, and the new image applies any database changes by itself when it
   restarts (ADR-0018). A server pinned to a 0.x version stays put.
5. **Rolling back:** set `API_IMAGE_TAG=0.89.4` and `WEB_IMAGE_TAG=0.190.2` (the versions each package has today;
   re-read them at the time). Pinning also stops the updater pulling `latest` again. Database changes are not
   undone by this; undoing one needs a new, compensating change.
6. **Keep the cut small.** Removing the four old fields and turning on the recycle-bin clear-out (a permanent
   delete that cannot be undone) should each be their own release, not part of the cut, so that rolling back an
   image stays meaningful.
7. The Version Packages pull request shows its checks as `action_required` (`CLAUDE.md` §11), so nothing gates
   it. Read it by hand before merging, as `CLAUDE.md` §19.9 describes.

**You decide when.** The checklist is the gate: the cut happens when every line above is done, decided, or
marked not for 1.0.

## Known limits at 1.0

Left empty on purpose. It is filled in, in plain words, at the moment of the cut, from whatever lines you
decide to carry as "not yet". As written today, the lines you required (5, 6 and 7) would not be limits; they
would be done first.

## Words used on this page

- **Changeset** — a short note file saying "this change deserves a bigger or smaller version number".
- **Major / minor / patch** — the first, second and third number of a version. A breaking change moves the first.
- **Float** — how long an activity can slip without moving the finish date.
- **Levelling** — spreading work out so one resource is not double-booked.
- **Baseline** — a saved copy of the plan to compare against later.
- **OpenAPI document** — the machine-readable list of every web address the product answers, and what each takes and returns.
- **Image** — the packaged copy of the product that your server runs. **Watchtower** is the helper that fetches a newer one.
- **Register row** — an entry in `docs/TECH_DEBT.md`, the list of known faults and loose ends.
