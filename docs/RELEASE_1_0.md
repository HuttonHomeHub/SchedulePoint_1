# What 1.0 means, and whether we are there

> Written for the product owner, in plain words. Written 2026-10-13. The decision behind it is
> [ADR-0190](adr/0190-what-1-0-promises.md); the reasoning and the options are in
> [`specs/pre-1-0-batch-2/feature-spec.md`](specs/pre-1-0-batch-2/feature-spec.md) §4.2.
> **Nothing on this page has cut 1.0.** You said to write it down only. Cutting it is a separate step you
> take after reading this (see "How the cut works").

## The short answer

**Ready, and the next step is yours.** Every line in the checklist is now done, decided by you, or marked
not for 1.0 (2026-11-08). The three things you said must exist before 1.0 were done on your server on
2026-10-20: the nightly backup and its practice check (row 5), your organisation's export (row 6) and the
recycle bin's 90-day clear-out (row 7). On 2026-11-08 the old field names were removed in a release of their
own (row 9), you counted the Dell speed result (row 8) and you confirmed the automatic API check can wait
(row 12). 1.0 has not been cut, and cutting it is still your call.

## What "1.0" is

Today the version numbers start with a zero (for example `web` 0.192.0 and `api` 0.94.0 on 2026-10-15). In the zero era the project's own
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

| #   | What has to be true                                                                                      | Where it stands today                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Kind and proof                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Every "must have" in the original brief works                                                            | **Done.** The brief's §8 list is built. "Hammock" activities are covered by Level of Effort, which is your earlier decision. The Gantt can be edited, which the brief asked for.                                                                                                                                                                                                                                                                                                    | Evidence: `CLAUDE.md:34` (the engine), ADR-0095 and ADR-0170 (Gantt editing), `docs/DECISIONS.md`, the "On-canvas Level of Effort / Hammock" entry (the hammock decision)                                                                                                                                                                                                                  |
| 2   | Several planners editing one plan at the same moment                                                     | **Not in 1.0.** One planner holds the pen at a time and can hand it over (that is ADR-0028).                                                                                                                                                                                                                                                                                                                                                                                        | Not for 1.0 — you decided on 2026-10-12 (`docs/DECISIONS.md`, "2026-10-12 — Real-time collaborative editing is not in 1.0")                                                                                                                                                                                                                                                                |
| 3   | The scheduling maths gives the same answers as the reference examples                                    | **Done.** The set of reference schedules the engine is checked against is closed and passing.                                                                                                                                                                                                                                                                                                                                                                                       | Evidence: `CLAUDE.md:34`, ADR-0034                                                                                                                                                                                                                                                                                                                                                         |
| 4   | No known accessibility fault that a person can meet                                                      | **Done.** The one open fault, Windows contrast themes (#505), was fixed and released in #978 (`web` 0.190.2), and the shaded radio card's low-contrast reason (#564) was fixed on 2026-10-31. The other open rows a person could meet are listed below; you decided on 2026-11-08 that none of them holds up 1.0.                                                                                                                                                                   | Evidence: `docs/TECH_DEBT.md` #505 and #564 (both closed); the list under "Open faults a person could meet"; owner decided 2026-11-08 (`docs/DECISIONS.md`)                                                                                                                                                                                                                                |
| 5   | A written, **tested** way to back up the database and restore it                                         | **Done** (2026-10-20). Backups are on on your server: a copy every night, 30 days kept, and one before any update that changes the database. The practice check passed on the first copy, `schedulepoint-2026-10-20T1601Z.dump` (`CHECK PASSED`, every count equal to the live database), and again on `schedulepoint-2026-10-20T1632Z.dump`, taken just before the clear-out was switched on. The database port was already closed. Your `.env` is saved in your password manager. | Owner decided — required for 1.0, 2026-10-13 (`docs/DECISIONS.md`); spec approved 2026-10-14. Evidence: your two `CHECK PASSED` results of 2026-10-20 (`docs/DECISIONS.md`, 2026-10-20), [`guides/back-up-and-restore.md`](guides/back-up-and-restore.md), ADR-0192, `docs/DEPLOYMENT.md` "Backups", and the CI restore round trip in `.github/workflows/ci.yml`                           |
| 6   | A way for an organisation to download everything it holds                                                | **Done** (2026-10-20). You downloaded Wood Group's export, `schedulepoint-export-wood-group-20261020T1615Z.zip` (12,898 records, per the Audit log), unpacked it and opened `clients.csv` and `plans.csv`; both read correctly, including the clients in Recently deleted.                                                                                                                                                                                                          | Owner decided — required for 1.0, 2026-10-13. Evidence: your result of 2026-10-20 (`docs/DECISIONS.md`, 2026-10-20), ADR-0194, [`guides/export-your-organisation.md`](guides/export-your-organisation.md), [`ORGANISATION_EXPORT_FORMAT.md`](ORGANISATION_EXPORT_FORMAT.md), the journey `apps/web/e2e-audit/org-export.spec.ts` and the `e2e-api` suite `organization-export.e2e-spec.ts` |
| 7   | Items in the recycle bin are permanently removed after 90 days                                           | **Done** (2026-10-20). You switched the clear-out on (`RETENTION_HIERARCHY_ENABLED=true`) after a fresh copy passed its check and the preview listed what would go. The first run permanently removed the 9 Wood Group test clients deleted on 2026-07-21 (9 projects, 10 plans, 26 activities); the log shows `hierarchy expiry ARMED` and 9 removals, the preview now says nothing is waiting, and the Audit log has 9 **Permanently deleted** rows.                              | Owner decided — required for 1.0, 2026-10-13. Evidence: your result of 2026-10-20 (`docs/DECISIONS.md`, 2026-10-20), [`guides/switch-on-the-clear-out.md`](guides/switch-on-the-clear-out.md), ADR-0096, ADR-0193, `.env.example`, `docker-compose.release.yml`                                                                                                                            |
| 8   | The promised speed on a large plan (30 frames a second at 2,000 activities, zoomed out)                  | **Met — the Dell result counts** (45.9 frames a second in the latest reading). The older Surface reading (26.0, on earlier drawing code, not repeated) is listed under "Known limits at 1.0".                                                                                                                                                                                                                                                                                       | Owner decided 2026-11-08 (`docs/DECISIONS.md`). Evidence: `CLAUDE.md` §17, the canvas draw budget bullet: the eighth sitting (Dell) and the seventh (Surface)                                                                                                                                                                                                                              |
| 9   | The things we promise not to break (below) are named, and old leftover names removed                     | **Done** (2026-11-08). The four old field names in the revision comparison (`fromEarlyStart`, `toEarlyStart`, `fromEarlyFinish`, `toEarlyFinish`) were removed in #1275 and released on their own, before the cut, as `api` 0.106.0. Nothing is marked deprecated now.                                                                                                                                                                                                              | Owner decided 2026-11-08. Evidence: `docs/API.md`, section "Deprecated fields" (now a removal record), `docs/TECH_DEBT.md` #405, and the e2e checks that the four names are absent (`apps/api/test/revision-compare.e2e-spec.ts`, `cross-plan-revision-compare.e2e-spec.ts`)                                                                                                               |
| 10  | The brief, the roadmap and the operating manual all say the same thing about 1.0                         | **Done in this batch.** The brief's hosting line was out of date (it said "to be decided"; Docker Compose was settled), the roadmap had no 1.0 entry, and `CLAUDE.md` §10 had no end condition. All three now point here.                                                                                                                                                                                                                                                           | Evidence: `docs/PROJECT_BRIEF.md` §16, `docs/ROADMAP.md`, `CLAUDE.md` §10                                                                                                                                                                                                                                                                                                                  |
| 11  | Adoption measures from the brief (satisfaction score, how often views are used, a 20-minute first build) | **Not for 1.0.** These measure how well the product lands after release. Nobody should wait on them.                                                                                                                                                                                                                                                                                                                                                                                | Not for 1.0 — `docs/PROJECT_BRIEF.md` §7                                                                                                                                                                                                                                                                                                                                                   |
| 12  | An automatic check that a change does not break the web API                                              | **Not in 1.0.** The API's OpenAPI document is not saved anywhere and nothing compares it between releases. Nothing outside SchedulePoint uses the API today; the register row tracks it for the day something does.                                                                                                                                                                                                                                                                 | Not for 1.0 — you confirmed on 2026-11-08 (`docs/DECISIONS.md`). Tracked by `docs/TECH_DEBT.md` #507; evidence `apps/api/src/main.ts:36-50`                                                                                                                                                                                                                                                |

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
  when no date moved. Closed on 2026-11-08 (ADR-0214, `api` 0.106.0): float is stored and compared in minutes,
  and a baseline captured before then reads "Float change unknown" until the 1.0 wipe.
- **#84** — levelling gets slow when thousands of activities compete for one resource (about 11.6 seconds at
  16,000). Closed on 2026-10-17: a 16,000-activity single crew now levels in about 3 seconds where it took
  146 on the same machine before.
- **#419** — selecting an activity on the diagram takes about a quarter of a second on a 2,000-activity plan.
- **#294** — a colleague's request for the pen costs the diagram 76 to 80 pixels of height.
- **#437** — after dragging the Gantt's grid divider, a zoom preset frames the chart for the old width. Closed
  on 2026-10-16: the preset now frames the room beside the pane as it stands.
- **#477** — on a very short, narrow window the command bar scrolls away and nothing hints how to get it back.
- **#490** — at 320 pixels wide the app header takes four lines.
- **#223** — the resource strip under the diagram is not in the exports or the printout. Closed on 2026-10-17:
  a strip that is open now exports and prints as shown, with a caption and legend.
- **#229** and **#307** — two small keyboard and screen-reader details (a menu that closes and reopens when its
  own button is pressed, and a focusable "loading" row in the project tree). Both closed: #229 on 2026-10-17
  and #307 on 2026-10-20 (#1082).
- **#500, #504, #505, #501** — the faults fixed or measured in this same batch. All four are now closed (#976, #980,
  #978, #981).

**You decided on 2026-11-08 that none of the rows still open here holds up 1.0** (#419, #294, #477, #490).
Three rows raised on 2026-11-07 belong in the same group and are also not for 1.0: **#570** (at very large
text, a strip that arrives while you are scrolled up lands below the window), **#572** (the organisation
landing is taller than a short window, hidden by the page's own scroll) and **#573** (on a touch screen, four
of 55 spots at one corner of the selection bar press the neighbouring control). None of them loses data, and
each waits on its own trigger in `docs/TECH_DEBT.md`.

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
4. Your server follows `latest` by default (`docker-compose.release.yml:89` for the API, `:237` for the web
   app). **With the automatic updater on (ADR-0047), merging the Version Packages pull request is the
   production deploy, a few minutes later**, and the new image applies any database changes by itself when it
   restarts (ADR-0018). A server pinned to a 0.x version stays put.
5. **Rolling back:** set `API_IMAGE_TAG=0.106.0` and `WEB_IMAGE_TAG=0.202.0` (the last 0.x release, cut on
   2026-11-08; re-read `git ls-remote --tags origin` at the time). Pinning also stops the updater pulling
   `latest` again. Database changes are not undone by this; undoing one needs a new, compensating change.
   **You also decided on 2026-11-08 that every plan is wiped when 1.0 rolls out** (only you have used the
   product), so nothing before 1.0 needs to keep working afterwards. The wipe is yours to do, after a backup
   whose check has passed; it is not part of the cut's automation.
6. **Keep the cut small.** The four old fields were removed in their own release (`api` 0.106.0, row 9), so the
   cut itself changes only version numbers and changelogs. (The recycle-bin clear-out, the other permanent
   change, is already on: you switched it on 2026-10-20.)
7. The Version Packages pull request shows its checks as `action_required` (`CLAUDE.md` §11), so nothing gates
   it. Read it by hand before merging, as `CLAUDE.md` §19.9 describes.

**You decide when.** The checklist is the gate: the cut happens when every line above is done, decided, or
marked not for 1.0.

## Known limits at 1.0

What 1.0 knowingly ships without, in plain words (filled in 2026-11-08 from the lines above):

- **Speed on the Surface.** The large-plan speed promise is met on the Dell (45.9 frames a second). The last
  reading on your Surface was 26.0, on older drawing code, and has not been repeated (row 8).
- **One planner edits a plan at a time.** Several people editing the same plan at once is not in 1.0 (row 2).
- **No automatic API breaking-change check.** A change that breaks the web API is caught by review and tests,
  not by a saved copy of the API description (row 12, #507).
- **The small faults listed above** (#419, #294, #477, #490, #570, #572, #573), each waiting on its own trigger.
- **Old baselines.** A baseline taken before `api` 0.106.0 shows "Float change unknown" in comparisons; this
  goes away with the 1.0 wipe.

## Words used on this page

- **Changeset** — a short note file saying "this change deserves a bigger or smaller version number".
- **Major / minor / patch** — the first, second and third number of a version. A breaking change moves the first.
- **Float** — how long an activity can slip without moving the finish date.
- **Levelling** — spreading work out so one resource is not double-booked.
- **Baseline** — a saved copy of the plan to compare against later.
- **OpenAPI document** — the machine-readable list of every web address the product answers, and what each takes and returns.
- **Image** — the packaged copy of the product that your server runs. **Watchtower** is the helper that fetches a newer one.
- **Register row** — an entry in `docs/TECH_DEBT.md`, the list of known faults and loose ends.
