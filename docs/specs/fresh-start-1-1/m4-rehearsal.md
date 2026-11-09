# Fresh start 1.1 — the practice run (M4-T2)

- **Status:** Ready for the product owner to run — 2026-11-09. Results are recorded in the table at the end.
- **Why it is a checklist and not a log:** this needs Docker, and the cloud session that built 1.1.0 cannot run
  Docker. The owner chose (2026-11-09) to have CI run the automated checks on the pull request — including the image
  job's "Refuse a pre-1.1 database" step — and to run this practice by hand on a spare machine.
- **Plan:** [`implementation-plan.md`](./implementation-plan.md) M4-T2. **Guide being tested:**
  [`docs/guides/start-fresh-on-1-1.md`](../../guides/start-fresh-on-1-1.md).

## In short

You set up a **throwaway** copy of SchedulePoint 1.0 on a spare machine, put a little data in it, then follow the
real guide exactly as you will on the day — and check that 1.1.0 refuses the old database without touching it, that
a fresh start works, and that going back to 1.0 shows your data again. If any step of the guide is wrong or unclear,
write it down in the table at the end: the guide gets fixed before the release.

**Never run this on your real server.** It uses its own project name (`sp-practice`) so it cannot touch your real
SchedulePoint, but a spare machine removes any doubt. About 60–90 minutes, most of it waiting.

## What you need

- A machine with Docker and Docker Compose (Docker Desktop is fine), `git`, and about 5 GB free.
- A copy of this repository on the branch `claude/backwards-compat-review-7oczdw`.
- No real email is needed: in practice, sign-up confirmation links are printed in the API log.

## Part A — Build the 1.1.0 test images (15–25 minutes)

The release images do not exist yet, so build them from the branch and give them a test name.

```sh
git clone https://github.com/HuttonHomeHub/SchedulePoint_1.git sp-practice && cd sp-practice
git checkout claude/backwards-compat-review-7oczdw
docker build -f apps/api/Dockerfile -t ghcr.io/huttonhomehub/schedulepoint_1/api:1.1-candidate .
docker build -f apps/web/Dockerfile -t ghcr.io/huttonhomehub/schedulepoint_1/web:1.1-candidate .
```

✅ Both builds finish with no error.

## Part B — A practice 1.0 with some data (15 minutes)

1. Make a practice folder with a copy of the release compose file and a `.env` built from `.env.example` (any
   passwords; set `STAFF_EMAILS` to the address you will sign up with). Turn backups on exactly as
   [`docs/guides/back-up-and-restore.md`](../../guides/back-up-and-restore.md) Part 1 says (the `backup` service and
   the API's `/backups` mount).
2. Start **1.0.0**:

   ```sh
   export API_IMAGE_TAG=1.0.0 WEB_IMAGE_TAG=1.0.0
   docker compose -p sp-practice -f docker-compose.release.yml up -d
   ```

3. Open it, sign up (the confirmation link is in `docker compose -p sp-practice logs api`), create an organisation,
   a client, a project and a plan with three activities and two links. Recalculate. Capture a baseline.
4. Note what you made: _______________________

✅ The plan shows its activities on the diagram.

## Part C — Follow the guide, Part 1 (before you merge)

Follow **guide Part 1** steps 1–4 word for word on the practice copy (use `-p sp-practice` on every
`docker compose` command). Skip step 5 (pinning) the first time.

✅ `BACKUP FINISHED`, then `CHECK PASSED`. The copy and its `.sha256` file are copied out of the backups folder.

## Part D — 1.1.0 meets the old database (the refusal)

This stands in for "you merged and the automatic update fetched 1.1.0".

```sh
export API_IMAGE_TAG=1.1-candidate WEB_IMAGE_TAG=1.1-candidate
docker compose -p sp-practice -f docker-compose.release.yml up -d
docker compose -p sp-practice logs api --tail 40
```

Check, and tick each:

- [ ] The API stops (keeps restarting) and its log says the database was made by SchedulePoint 1.0, points at
      `docs/guides/start-fresh-on-1-1.md`, and shows **no password or connection string**.
- [ ] The log has `boot.database_refused` with reason `pre_1_1_lineage`.
- [ ] The log does **not** say it is applying database migrations or starting the API.
- [ ] **No new file** appeared in the backups folder while it kept restarting (list it before and after a few
      minutes).
- [ ] The web page shows the app is unavailable (expected).

## Part E — Follow the guide, Part 2 (on the day) and Part 3 (after you sign up)

Follow **guide Part 2** from step 3 and **Part 3** word for word. Keep using the `1.1-candidate` tags instead of
"fetch 1.1.0" in Part 2 step 6. **The app will still show version 1.0.0** in practice: the number only becomes 1.1.0
when the release is cut, so a test build cannot show it. Note whether guide Part 2 step 6's version check would
have confused you; that is worth a guide fix.

- [ ] After the volume rename the API starts and its log has `boot.database_accepted`.
- [ ] You can sign up again, confirm, create an organisation; the staff console is there (`STAFF_EMAILS`).
- [ ] Make a tiny plan, recalculate, capture a baseline, and open the baseline comparison — it works and says
      nothing about "older baselines" or "not recorded".
- [ ] **Export data** (in the organisation's side rail; Org Admin) downloads a zip whose `manifest.json` says `formatVersion` **3.0**.
- [ ] Guide Part 3 step 4: `BACKUP FINISHED`, then `CHECK PASSED` on the **new** database.
- [ ] `check` on the **1.0** copy from Part C still loads and counts it, and says it can only be restored with 1.0.

## Part F — Follow the guide, Part 4 (going back to 1.0)

Follow **guide Part 4** word for word.

- [ ] With the volume name put back and the tags at `1.0.0`, 1.0 starts and shows the client, project and plan
      from Part B.
- [ ] Then switch forward again (volume `db-data-1-1`, candidate tags): the 1.1 data from Part E is still there.

## Part G — Clean up

```sh
docker compose -p sp-practice -f docker-compose.release.yml down -v
```

This deletes only the practice copy's volumes.

## Results

Fill this in and send it back (a photo is fine). "Guide fix" means a step whose words were wrong, missing or unclear.

| Part | Passed? | What happened / guide fix needed |
| ---- | ------- | -------------------------------- |
| A    |         |                                  |
| B    |         |                                  |
| C    |         |                                  |
| D    |         |                                  |
| E    |         |                                  |
| F    |         |                                  |

**Ran on:** (machine, date) _______________ · **Docker / Compose versions:** _______________
