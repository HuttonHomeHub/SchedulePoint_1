# Start fresh on 1.1.0

> **DRAFT.** This guide was written before 1.1.0 exists. Milestone M4's dress rehearsal runs every step on a
> throwaway stack and corrects it. **Do not follow it on your real server until that note is gone.**

**Who this is for:** whoever runs the SchedulePoint server. You do not need to be a developer. Every step is a
thing to copy and paste, and each one says what you should see and what to do if you do not. The words used here
(copy, compose file, `.env`, stack, terminal, `sudo`, `<PLACEHOLDER>`) mean what they mean in
[`back-up-and-restore.md`](./back-up-and-restore.md), and "How to open a terminal" there works here too. Every
command is run in the folder that holds your compose file.

**What happens, in plain terms**

1. Version 1.1.0 is a clean start. It needs a **new, empty database**. Everything stored today (your account,
   Wood Group, its clients, projects, plans, calendars, resources, notes, baselines, guest links and the audit
   log) is **not carried over**. You have said it is all test data.
2. The old database is **not destroyed**. It stays on your server, untouched, and you also keep a copy as a file.
3. If you merge the 1.1.0 release before doing anything else, SchedulePoint **refuses to start** and says so in
   plain words. That is on purpose: it changes nothing in your old data.
4. What stays: your `.env` settings (passwords, mail, `STAFF_EMAILS`, alerts, the 90-day clear-out switch),
   nightly backups, and the product itself.

**Time needed:** about 15 minutes before the release (Part 1), about 20 minutes on the day (Part 2) and about 10
minutes afterwards (Part 3). Part 4 is for the day you want to go back, and Part 5 is for 30 days later.

**You cannot lose data by following Parts 1 to 3.** Nothing in them deletes anything. The only deletion is in
Part 5, 30 days after you are happy.

---

## Part 1: Before you merge the 1.1.0 release (about 15 minutes)

Do this while SchedulePoint is still on 1.0.x. **Order matters:** a 1.1.0 backup tool will not check a copy made
by 1.0.

1. Check everything is healthy (1 minute):

   ```bash
   docker compose ps
   ```

   **You should see:** every container with `(healthy)` or `Up`. If not, stop and ask the maintainers.

2. Take a copy now (3 to 10 minutes). Wait for `BACKUP FINISHED`:

   ```bash
   docker compose run --rm backup now
   ```

3. Check that copy (3 to 10 minutes). Wait for `CHECK PASSED`:

   ```bash
   docker compose run --rm backup check
   ```

   **If it does not say `CHECK PASSED`: stop.** Send the maintainers what it printed. Do not go on.

4. Write down the copy's name, then copy that file and its `.sha256` file **out of the backups folder** to
   somewhere safe (a USB stick, your own computer, cloud storage) (2 minutes). The nightly tidy-up deletes copies
   older than 30 days, so a file left in the folder will eventually go:

   ```bash
   docker compose run --rm backup list
   ```

   The newest name is the one you just made, for example `schedulepoint-2026-11-20T0930Z.dump`.

5. **Optional: stop the automatic update first.** Normally you do nothing here. If you want to merge the release
   now and switch later, put these two lines in `.env` (in Dockge, the stack's "Env" box), then apply them
   (`docker compose up -d`, or **Deploy** in Dockge):

   ```text
   API_IMAGE_TAG=1.0.0
   WEB_IMAGE_TAG=1.0.0
   ```

   Pinned versions stop all automatic updates until you remove the lines. Remember to remove them in Part 2.

---

## Part 2: On the day (about 20 minutes)

1. Merge the "Version Packages" pull request for 1.1.0. Wait until the release page shows `api-v1.1.0` and
   `web-v1.1.0`. (about 10 minutes)

2. **If you did not pin the versions:** within about five minutes SchedulePoint fetches 1.1.0 and **the app stops
   working**. That is expected. Confirm it with:

   ```bash
   docker compose logs --tail 20 api
   ```

   **You should see:** "SchedulePoint 1.1 needs a new, empty database. This database was made by SchedulePoint
   1.0 or earlier. Nothing has been changed." **Your old data is untouched.**

3. Stop SchedulePoint. In Dockge click **Stop**. Or:

   ```bash
   docker compose stop
   ```

4. **Make 1.1.0 use a new database.** Open the compose file (in Dockge, **Edit**). First keep a spare: copy all
   the text into a file on your own computer. Then find the database's volume name `db-data` and change it to
   `db-data-1-1` in **two places**. It looks like this before:

   ```text
   services:
     db:
       volumes:
         - db-data:/var/lib/postgresql/data

   volumes:
     db-data:
   ```

   and like this after:

   ```text
   services:
     db:
       volumes:
         - db-data-1-1:/var/lib/postgresql/data

   volumes:
     db-data-1-1:
   ```

   Change nothing else, and click **Save**. If your stack keeps its database in a folder (a line such as
   `./db:/var/lib/postgresql/data`) instead of a named volume, change that folder name to a new one such as
   `./db-1-1`. **If you are unsure which you have, stop and ask the maintainers.**

5. If you pinned the versions in Part 1, remove the two `API_IMAGE_TAG` and `WEB_IMAGE_TAG` lines from `.env`
   now.

6. Fetch 1.1.0 and **confirm the version before you start it** (2 minutes):

   ```bash
   docker compose pull
   docker compose run --rm --no-deps --entrypoint node api -e "console.log(require('./package.json').version)"
   ```

   **You should see:** `1.1.0`. If it prints `1.0.0`, the release has not published yet: wait and pull again.
   **Do not start until it says 1.1.0**, because 1.0.0 would build an old-style database on the new volume.

7. Start it. In Dockge click **Deploy**. Or:

   ```bash
   docker compose up -d
   ```

   **You should see:** the log reports the first database set-up being applied, then the API starting
   (`docker compose logs --tail 30 api`). **Success is** that the SchedulePoint sign-in page loads. (about 3
   minutes)

---

## Part 3: After you sign up (about 10 minutes)

1. Open SchedulePoint and **sign up again** with the same email address. Confirm your email: mail is still set
   up in `.env`.
2. Create your organisation again.
3. `STAFF_EMAILS` still applies: once your email is confirmed the staff console is available as before.
4. Take and check the first copy of the new database:

   ```bash
   docker compose run --rm backup now
   docker compose run --rm backup check
   ```

   **You should see:** `BACKUP FINISHED`, then `CHECK PASSED`.

5. Backups and the 90-day clear-out carry on without any change: the settings are in `.env`. There is nothing in
   the recycle bin, so nothing will be removed.
6. Any guest link you shared before no longer works. Make new ones if you need them.

---

## Part 4: If you need to go back

Your old data is exactly as you left it. **Do these in this order: the volume first, then the versions.** A 1.0.0
SchedulePoint started on the new volume would try to build an old-style database on top of a 1.1 one.

1. Stop SchedulePoint (Dockge **Stop**, or `docker compose stop`).
2. In the compose file, put the volume name back to `db-data` in both places.
3. In `.env`, add:

   ```text
   API_IMAGE_TAG=1.0.0
   WEB_IMAGE_TAG=1.0.0
   ```

4. Pull and start (`docker compose pull`, then `docker compose up -d`, or **Deploy** in Dockge). Sign in as you
   did before: your old plans are there.
5. Pinned versions stop automatic updates. Remove the two lines when you want to move forward again.
6. You need the backup file from Part 1 only if the old volume has been lost. A copy made by 1.0 is restored with
   the 1.0.0 image (`backup restore <file>`, in [`back-up-and-restore.md`](./back-up-and-restore.md), Part 3).

The rollback to 0.106.0 and 0.202.0 described in [`docs/RELEASE_1_0.md`](../RELEASE_1_0.md) does **not** apply
across this release.

---

## Part 5: After 30 days, remove the old database (2 minutes)

Only when 1.1.0 has run 30 days and you have not needed to go back. **This deletes the old database for good.**
Your file from Part 1 is then the only copy.

```bash
docker volume ls
```

Find the old volume. Its name ends in `db-data` (for example `mystack_db-data`), not `db-data-1-1`. Then:

```bash
docker volume rm <OLD-VOLUME-NAME>
```

**You should see:** the name printed back. If it says the volume is in use, you have the wrong one: do nothing
and ask the maintainers.

---

## What this does not protect against

- **The copy is on the same server as the database** (and your own copy of the file is only as safe as where you
  put it). Lose the server and the old volume together and only your file survives.
- **Everything saved before the switch is not in 1.1.0.** There is no tool that moves old plans across, by
  decision. The old database is for going back, not for importing.
- **`.env` is not in any copy.** Keep it in a password manager (back-up guide, Part 1 step 7).
- **If you start 1.0.0 on the new volume, or 1.1.0 on the old one,** you get an error or a refusal, not a
  half-working system. Stop, put the volume line right, and start again.
- **Browser sessions and saved links** from before the switch stop working; sign in again.

**Keep current:** if a command or message here stops matching the product, fix the guide in the same change. The
design is [`docs/specs/fresh-start-1-1/`](../specs/fresh-start-1-1/feature-spec.md) and
[ADR-0215](../adr/0215-a-fresh-start-is-a-new-database-and-the-image-refuses-the-old-one.md).
