# Feature Spec: The CI browser install retries instead of stalling

- **Status:** Approved (product owner, 2026-10-23: "Time limit + retry"; then "Keep the packages", D4–D6)
- **Author(s):** Claude (for the product owner)
- **Date:** 2026-10-23
- **Tracking issue / epic:** none — a CI step, one milestone
- **Roadmap link:** none (a tooling decision a planner cannot act on; ADR-0136 precedent)
- **Related ADR(s):** ADR-0105 (a CI step change is a spec trigger), ADR-0138 (the four web shards)

ADR-0105 makes a change to a CI step a trigger for a spec, however small. This is that spec.

## 0. Evidence

| #   | Claim                                                                                                                   | Established by                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | The "Install Playwright browsers" step normally takes about two minutes.                                                | Passing shards on PR #1113 (run 39977297138): every web job that passed went from that step to the tests in minutes.                                                                                                                                                                             |
| E2  | It stalled for the job's whole 30 minutes on six runs, before any test.                                                 | `docs/HANDOFF.md` (2026-10-23) records four: shard 1 on #1109, #1110 and #1111 and shard 4 on #1112, plus one more that session; the sixth is job 120495141492 on #1113, whose step 11 ran 15:20:40–15:49:55 and was cancelled, steps 12+ skipped.                                               |
| E3  | A re-run of the same commit passes.                                                                                     | Every one of those re-runs passed in about 16 minutes (HANDOFF.md).                                                                                                                                                                                                                              |
| E5  | The stall is apt fetching ~142 MB of system packages from a slow mirror, and the first version's retries could not run. | Job 120522287516 on #1114 (first version): `Need to get 142 MB of archives`; one 5.6 MB font took 2 min (16:17:17 → 16:19:19); attempt 1 was killed at 6 min, then attempts 2 and 3 failed in seconds on `Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 3331 (apt-get)`. |
| E6  | Retries resume but cannot outrun a mirror that stays slow.                                                              | Job 120552492072 on #1116 (D1–D3 shipped): `Need to get 142 MB` → `121 MB/142 MB` after try 1 → `85.2 MB/142 MB` after try 2; all three tries hit 6 minutes and the step failed at 18 minutes.                                                                                                   |
| E4  | It is not the fifth-shard trigger.                                                                                      | No test was slow; no test ran.                                                                                                                                                                                                                                                                   |

## 1. What changes

- **D1.** The step runs the same command under `timeout --kill-after=15 360`, up to three times, and
  fails only if all three fail.
- **D1a.** After a failed try it stops any leftover `apt-get` (`sudo pkill -TERM -x apt-get`), waits up
  to 60 s for `apt-get`/`dpkg` to exit, and runs `sudo dpkg --configure -a`. The first version of this
  change assumed `timeout`'s process-group signal would reach apt; E5 shows it does not, because
  Playwright runs apt-get through `sudo`, which starts it in its own session. apt keeps the packages
  it already fetched in its cache, so each try resumes the download.
- **D2.** The step gets `timeout-minutes: 20` as a ceiling (3 × 6 minutes plus slack), so even a
  retry loop that misbehaves cannot spend the job's 30-minute budget.
- **D3.** Each failed try prints a `::warning::` annotation, so a retry is visible on the run's
  summary instead of silent.

- **D4** (added 2026-10-23, second answer). Before the install, `actions/cache/restore` brings back
  `~/apt-archives`, and the install step copies those `.deb` files into `/var/cache/apt/archives`,
  so apt finds them and downloads only what is missing. The key is
  `playwright-apt-<ImageOS>-<ImageVersion>-<hash of pnpm-lock.yaml>`, restoring by prefix: a new runner
  image starts a fresh set, and a lockfile change still brings back most packages.
- **D5.** When the exact key missed, the job runs `apt-get autoclean` (dropping packages no longer
  installable, so the set does not grow without bound), copies the `.deb` files to `~/apt-archives`,
  and saves them with `actions/cache/save` straight after the install, so a later red test does not
  lose them. Parallel shards race to save the same key; the losers only log that it exists.
- **D6.** D1–D3 stay: a run with an empty or stale cache still gets the time limit and retries.

Nothing else changes: the command, the browsers installed, the shard layout and every test step are
as they were.

## 2. Alternatives

- **Cache the browsers** (`~/.cache/ms-playwright`, keyed on the Playwright version). Offered first
  and not chosen: `--with-deps` still runs apt, so it would not remove a stall in the system
  packages. After E6 the owner chose caching apt's packages instead (D4–D6), which is the part that
  stalls.
- **Do nothing and re-run.** Costs about 30 minutes per stall.

## 3. Acceptance

- The CI run on the PR that ships this passes, with the web shards' install step completing.
- `pnpm check:ci-roster` and the rest of `pnpm prepush` pass (the step's name is unchanged).
- If a try is ever killed, the run shows the warning and the next try's success.
