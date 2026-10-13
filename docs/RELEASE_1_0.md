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

Today the version numbers start with a zero (`web` 0.190.1, `api` 0.89.3). In the zero era the project's own
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

| #   | What has to be true                                                                                      | Where it stands today                                                                                                                                                                                                             | Kind and proof                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every "must have" in the original brief works                                                            | **Done.** The brief's §8 list is built. "Hammock" activities are covered by Level of Effort, which is your earlier decision. The Gantt can be edited, which the brief asked for.                                                  | Evidence: `CLAUDE.md:34` (the engine), ADR-0095 and ADR-0170 (Gantt editing), `docs/DECISIONS.md:3597-3606` (the hammock decision)                   |
| 2   | Several planners editing one plan at the same moment                                                     | **Not in 1.0.** One planner holds the pen at a time and can hand it over (that is ADR-0028).                                                                                                                                      | Not for 1.0 — you decided on 2026-10-12 (`docs/DECISIONS.md:48`)                                                                                     |
| 3   | The scheduling maths gives the same answers as the reference examples                                    | **Done.** The set of reference schedules the engine is checked against is closed and passing.                                                                                                                                     | Evidence: `CLAUDE.md:34`, ADR-0034                                                                                                                   |
| 4   | No known accessibility fault that a person can meet                                                      | **One open fault in this batch:** Windows contrast themes (#505), being fixed now. A first sort of the other open register rows is below; none is a blocker on its face, but you may read it differently.                         | Evidence: `docs/TECH_DEBT.md` #505; the list under "Open faults a person could meet"                                                                 |
| 5   | A written, **tested** way to back up the database and restore it                                         | **Missing.** No document describes a backup or a restore (searched `docs/` for `pg_dump` and `pg_restore`: nothing). The brief's §16 promised a daily snapshot kept 30 days. Its own short plan comes after this batch.           | Owner decided — required for 1.0, 2026-10-13 (`docs/DECISIONS.md:13`). Proof it is missing: `grep -rli 'pg_dump' docs scripts .github` finds nothing |
| 6   | A way for an organisation to download everything it holds                                                | **Missing.** There are plan exports (P6 XER, Microsoft Project MSPDI, CSV, PNG, PDF) but nothing for a whole organisation. The brief's §13 promised one. Its own plan comes after this batch.                                     | Owner decided — required for 1.0, 2026-10-13. Proof it is missing: `CLAUDE.md:674`                                                                   |
| 7   | Items in the recycle bin are permanently removed after 90 days                                           | **Built, switched off.** The setting is `RETENTION_HIERARCHY_ENABLED` and it defaults to off, so nothing has ever been permanently deleted on any server. The plan after this batch is mostly turning it on and proving it works. | Owner decided — required for 1.0, 2026-10-13. Proof: `.env.example:90`, `docker-compose.release.yml:141`, `CLAUDE.md:607`                            |
| 8   | The promised speed on a large plan (30 frames a second at 2,000 activities, zoomed out)                  | **Met on the Dell** (45.9 frames a second in the latest reading). The latest reading on your Surface was 26.0, taken on an older version of the drawing code and not repeated since.                                              | Evidence: `CLAUDE.md:784` (Dell), `CLAUDE.md:777` (Surface). Whether the Surface counts is your call.                                                |
| 9   | The things we promise not to break (below) are named, and old leftover names removed                     | **Ready to do at the cut.** Four old field names in the revision comparison are kept only for other programs and are marked "removed at the next breaking change". The cut is the last easy moment to remove them.                | Evidence: `docs/API.md`, section "Deprecated fields", and `docs/TECH_DEBT.md` #405. Default: remove them at the cut                                  |
| 10  | The brief, the roadmap and the operating manual all say the same thing about 1.0                         | **Done in this batch.** The brief's hosting line was out of date (it said "to be decided"; Docker Compose was settled), the roadmap had no 1.0 entry, and `CLAUDE.md` §10 had no end condition. All three now point here.         | Evidence: `docs/PROJECT_BRIEF.md` §16, `docs/ROADMAP.md`, `CLAUDE.md` §10                                                                            |
| 11  | Adoption measures from the brief (satisfaction score, how often views are used, a 20-minute first build) | **Not for 1.0.** These measure how well the product lands after release. Nobody should wait on them.                                                                                                                              | Not for 1.0 — `docs/PROJECT_BRIEF.md` §7                                                                                                             |

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
- **#500, #504, #505, #501** — the faults being fixed or measured in this same batch.

Counting this list as a blocker or not is your call. None of them loses data.

## What 1.0 promises afterwards

These are what the first number protects. If a change breaks any of them, the first number goes up.

1. **The web API under `/api/v1`**, as described by its published OpenAPI document. That includes the
   public links that guests use (`/api/v1/share/*`).
2. **The file formats the product writes and reads**, including the hidden SchedulePoint layout field inside
   exported files (ADR-0156).
3. **The settings an operator uses** — the environment variables in `.env.example` and the Docker Compose files.

These are **not** promised: the staff console (`/api/v1/staff/*`, already declared separate in
`docs/API.md`), the database layout, and the internal code packages.

Two different numbers move for two different reasons:

- The **package version** (`api` 1.x.x, `web` 1.x.x) goes up a major step when something above breaks.
- The **address version** (`/api/v1`) only moves for a breaking change to the web API itself, which needs its
  own written decision and a migration note.

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
   (`docker-publish.yml:128-139`). The "major.minor" tags (`1`, `1.0`) are not produced on this path; they
   only apply to the old `v*` tag trigger (`docker-publish.yml:4-10`).
4. Your server needs nothing. It follows `latest` by default (`docker-compose.release.yml:74`), the automatic
   updater pulls it, and a server pinned to a 0.x version stays put.

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
