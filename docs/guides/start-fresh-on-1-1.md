# Start fresh on 1.1.0

> **Used once, never rehearsed.** The owner's server was switched to 1.1.0 on 2026-11-09. The planned practice run
> ([`m4-rehearsal.md`](../specs/fresh-start-1-1/m4-rehearsal.md)) was skipped, and the owner chose to **discard the
> 1.0 data** instead of keeping it: with the stack stopped they moved the database folder aside, clicked
> **Update** in Dockge, signed up again on the empty database and later deleted the old folder
> (`docs/DECISIONS.md`, 2026-11-09). The steps below were corrected to match what happened there, in particular
> the **folder form** of each step (their database lives in a folder, not a named volume). Nobody has run every
> step end to end. It is kept for reference and for any other server still on 1.0.

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

**Which kind of database storage you have.** Look at the `db:` service in your compose file (in Dockge,
**Edit**). There are two forms, and some steps differ between them:

- **Named volume:** a line like `- db-data:/var/lib/postgresql/data`, plus a `volumes:` section at the bottom
  naming `db-data`. This is what `docker-compose.release.yml` ships with.
- **Folder (a "bind mount"):** a line like `- ./db:/var/lib/postgresql/data` or
  `- /apps/schedulepoint/db:/var/lib/postgresql/data`. The database is an ordinary folder on the server. The
  owner's server uses this form.

**Running as root.** If your terminal prompt starts with `root@` (for example a terminal that is root inside a
container, as on the owner's server), leave `sudo` out of every command below.

**Dockge's buttons.** **Update** fetches newer images and then starts the stack (`docker compose pull` then
`up -d`). **Deploy** saves and starts the stack with the images already on the server; it does **not** fetch a
new version. Where this guide says "fetch 1.1.0", that is **Update**.

**Time needed:** about 15 minutes before the release (Part 1), about 20 minutes on the day (Part 2) and about 10
minutes afterwards (Part 3). Part 4 is for the day you want to go back, and Part 5 is for 30 days later.

**You cannot lose data by following Parts 1 to 3.** Nothing in them deletes anything. The only deletion is in
Part 5, 30 days after you are happy.

---

## Part 1: Before you merge the 1.1.0 release (about 15 minutes)

Do this while SchedulePoint is still on 1.0.x. **Order matters:** the 1.1.0 backup tool can still check a copy made
by 1.0 (it prints a note that only 1.0 can restore it), but checking it now, with the 1.0 tool that made it, is the
simplest test that the copy can really be used to go back. After the switch you would be testing it with a newer
tool than the one that wrote it.

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

   The backups folder belongs to another user on the server (number 1000) and is private, so copying out needs
   `sudo`, and the copy you make then belongs to the administrator. Take both files in one go, then give them to
   yourself:

   ```bash
   sudo cp backups/<COPY-NAME> backups/<COPY-NAME>.sha256 ~/
   sudo chown "$USER" ~/<COPY-NAME> ~/<COPY-NAME>.sha256
   ```

   (Use the folder you set up in the back-up guide if it is not called `backups`. Then move those two files off the
   server.) If your terminal prompt starts with `root@`, leave `sudo` out.

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
   working** (the page shows an error, usually a 502, rather than a blank screen). That is expected. Confirm it
   with:

   ```bash
   docker compose logs --tail 20 api
   ```

   **You should see:** a first line starting `DATABASE REFUSED — SchedulePoint has not started and has not changed
the database, which was made by SchedulePoint 1.0 or earlier.`, then `Keep a copy of it and point SchedulePoint
at a new, empty database, or pin API_IMAGE_TAG and WEB_IMAGE_TAG to 1.0.0 (the release compose) to go back to
1.0.`, then `See docs/guides/start-fresh-on-1-1.md.` Look also for a line containing `boot.database_refused`.
   **Your old data is untouched.**

3. **Before you stop:** the `backup` service is not stopped by this refusal. It is deliberately not checked at
   boot, so on the old volume it keeps taking nightly copies of the 1.0 database. Stopping the stack in this step
   stops those backups too, and they stay stopped until step 7 starts the new stack. That is fine for a few
   minutes, but do not leave the stack stopped for days.

   Stop SchedulePoint. In Dockge click **Stop**. Or:

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

   Change nothing else, and click **Save**.

   **If your database is a folder instead** (see "Which kind of database storage you have" above), you do not
   edit the compose file at all. With the stack stopped (step 3), **move the folder aside** so that 1.1.0 finds
   no database where it looks and creates a new, empty one there. On the owner's server that was:

   ```bash
   mv /apps/schedulepoint/db /apps/schedulepoint/db-1.0-old
   ```

   Use your own folder's path (the part before `:/var/lib/postgresql/data` in the compose file; `./db` means the
   `db` folder beside the compose file). Add `sudo` in front unless you are root. Moving, not deleting, keeps the
   old database so you can go back (Part 4). If you are sure you want to throw the old data away, you may delete
   the moved folder later (Part 5); the owner did.

   **If you are unsure which form you have, stop and ask the maintainers.**

5. If you pinned the versions in Part 1, remove the two `API_IMAGE_TAG` and `WEB_IMAGE_TAG` lines from `.env`
   now.

6. Fetch 1.1.0 and **confirm the version before you start it** (2 minutes). The images are private, so if the
   server is not signed in to GitHub's registry (or `docker compose pull` says `unauthorized` or `denied`), sign
   in first, as the top of `docker-compose.release.yml` describes (the token needs `read:packages`):

   ```bash
   echo $GHCR_PAT | docker login ghcr.io -u <github-user> --password-stdin
   ```

   Then (in Dockge there is no button for the version check, so use the terminal for this step):

   ```bash
   docker compose pull
   docker compose run --rm --no-deps --entrypoint node api -e "console.log(require('./package.json').version)"
   ```

   **You should see:** `1.1.0`. If it prints `1.0.0`, the release has not published yet: wait and pull again.
   **Do not start until it says 1.1.0**, because 1.0.0 would build an old-style database on the new volume.

7. Start it. In Dockge click **Update** (after the pull in step 6, **Deploy** works too). Or:

   ```bash
   docker compose up -d
   ```

   **You should see:** the log reports the first database set-up being applied, then the API starting
   (`docker compose logs --tail 30 api`). **Success is** that the SchedulePoint sign-in page loads. The first start
   on an empty database takes a few minutes: the web container waits for the API to report healthy, which can take
   up to 5 minutes. (about 3 to 5 minutes)

   **Check it worked:**

   ```bash
   docker volume ls
   docker compose ps
   ```

   `docker volume ls` should list a volume ending `_db-data-1-1` (your stack's name first, for example
   `mystack_db-data-1-1`), and the old `_db-data` beside it. **Folder form:** instead, `ls /apps/schedulepoint`
   (your stack folder) shows a new `db` folder beside the moved `db-1.0-old`. `docker compose ps` should show `db`, `api` and
   `backup` as `(healthy)` and `web` as `Up`. (`backup` can read `starting` for up to 10 minutes after a start;
   that is normal.) The database password for the new volume is the one in your `.env`, so nothing needs
   typing.

   **If the log says the mail transport is not reachable** (for example "SMTP verification timed out"): on the
   owner's server this happened once on the very first start and cleared after a stack restart (Dockge
   **Restart**, or `docker compose restart`). If it still says so after a restart, check the mail settings in
   `.env`.

   **If the page does not load** after 5 minutes:

   ```bash
   docker compose logs --tail 50 db api
   ```

   and send the maintainers what it prints.

   **Optional: pause the automatic update around the day.** Instead of pinning versions (Part 1 step 5), you can
   put `WATCHTOWER_MONITOR_ONLY=true` in `.env` and apply it. The updater then only reports that a new version
   exists and fetches nothing. Take the line out again afterwards. The pinning in Part 1 step 5 is still the
   method this guide uses.

---

## Part 3: After you sign up (about 10 minutes)

1. Open SchedulePoint and **sign up again** with the same email address. Confirm your email: mail is still set
   up in `.env`.
2. Create your organisation again.
3. `STAFF_EMAILS` still applies, but **only to a confirmed address**: the staff console stays hidden until you
   have clicked the link in the confirmation email, even when `AUTH_REQUIRE_EMAIL_VERIFICATION=false`. Sign out
   and in again after confirming. If the email is slow, wait for it (on the owner's server it arrived late). As a
   last resort for **your own** address only, you can mark it confirmed in the database; this is what the owner
   did, and it is safe only because you are vouching for an address you control:

   ```bash
   docker compose exec db psql -U app -d app -c "UPDATE users SET email_verified = true WHERE email = '<YOUR-EMAIL>';"
   ```

   (Use your `POSTGRES_USER` and `POSTGRES_DB` values if they are not `app`. `UPDATE 1` means it worked.)

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
2. In the compose file, put the volume name back to `db-data` in both places. **Folder form:** move the folders
   instead, keeping the 1.1 one: `mv /apps/schedulepoint/db /apps/schedulepoint/db-1-1` then
   `mv /apps/schedulepoint/db-1.0-old /apps/schedulepoint/db` (your paths; `sudo` unless root). This is possible
   only while the old folder still exists.
3. **Switch the 90-day clear-out off before 1.0 starts.** In `.env` set:

   ```text
   RETENTION_HIERARCHY_ENABLED=false
   ```

   Why: the clear-out is on for your server, and on start-up it permanently deletes anything that has sat in the
   recycle bin for more than 90 days. The old database may hold such items, and 1.0 would remove them the moment it
   starts. Turn it back on (`true`) only when you have decided to stay on 1.0 on purpose.

4. In `.env`, add:

   ```text
   API_IMAGE_TAG=1.0.0
   WEB_IMAGE_TAG=1.0.0
   ```

5. Pull and start (`docker compose pull`, then `docker compose up -d`, or **Update** in Dockge). If the pull says
   `unauthorized` or `denied`, sign in first with the `docker login ghcr.io` command from Part 2 step 6. Then
   check it worked:

   ```bash
   docker compose ps
   ```

   `db`, `api` and `backup` should read `(healthy)` and `web` `Up`. Open SchedulePoint and sign in as you did
   before: your old plans are there.

6. Check the 1.0 copy with its own name. Do not leave the name out: with no name the tool takes the **newest**
   copy, which may be one made by 1.1, and says it "was made by a newer version" and fails.

   ```bash
   docker compose run --rm backup check <COPY-NAME-FROM-PART-1>
   ```

   **You should see:** `CHECK PASSED`.

7. Pinned versions stop automatic updates. Remove the two lines when you want to move forward again.
8. You need the backup file from Part 1 only if the old volume has been lost. A copy made by 1.0 is restored with
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

Find the old volume. Its name ends in `db-data` (for example `mystack_db-data`), not `db-data-1-1`. Check that
nothing is using it (this should print only the heading line, with no containers under it):

```bash
docker ps -a --filter volume=<OLD-VOLUME-NAME>
```

Then:

```bash
docker volume rm <OLD-VOLUME-NAME>
```

**You should see:** the name printed back. If it says the volume is in use, you have the wrong one: do nothing
and ask the maintainers.

**Folder form:** delete the moved folder instead. Check the path twice: it must be the **old** one, never the
`db` folder SchedulePoint is using.

```bash
rm -rf /apps/schedulepoint/db-1.0-old
```

(Your path; `sudo` in front unless you are root.) The owner did this soon after the switch, by choice.

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
