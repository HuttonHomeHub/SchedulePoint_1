# Back up and restore the database

**Who this is for:** whoever runs the SchedulePoint server. You do not need to be a developer. Every
step is a thing to copy and paste, and each one says what you should see and what to do if you do not.

**What you are setting up, in plain terms**

1. **A copy of the database every night.** SchedulePoint keeps the last 30 days of copies in a folder
   on the server. You do nothing after the set-up.
2. **A copy just before an update that changes the database.** SchedulePoint takes it by itself. If it
   cannot make the copy, it waits and does not change your data (Part 4).
3. **A safe way to check a copy** (Part 2) **and to restore one** (Part 3).
4. **The database is no longer reachable from other computers.** Only SchedulePoint's own containers can
   talk to it.

**Time needed:** about 25 minutes of set-up (Part 1), then 10 to 15 minutes for the practice check
(Part 2). Parts 3 and 4 are for the day you need them. Read them once now.

**Words used here**

- **Database:** where SchedulePoint keeps everything: organisations, users, plans and activities.
- **Copy:** one file that holds the whole database as it was at one moment. Its name ends in `.dump`.
- **Restore:** replace the live database with a copy.
- **Container:** a running part of SchedulePoint. The set-up adds one, called `backup`.
- **Compose file:** the text file on the server that lists SchedulePoint's containers. This guide calls
  it `docker-compose.release.yml`. If yours has another name (Dockge calls it `compose.yaml`), use that
  name wherever you see `docker-compose.release.yml`.
- **`.env` file:** a plain text file next to the compose file. It holds your settings. (In Dockge it is
  the stack's "Env" box.)
- **Terminal:** the command window on the server. Open it in the folder that holds the compose file.
  In Dockge, that folder is usually `/opt/stacks/` followed by your stack's name.

**Keep current:** if a name, command or message in this guide stops matching the product, fix the guide
in the same change. The reference version is [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), "Backups".

---

## Part 1: Turn backups on (about 25 minutes, once)

Do these in order. Do **not** update the stack (step 5) before you have made the folder (step 2): if you
do, Docker makes the folder itself, owned by the wrong user, and the first update that changes the
database is held (Part 4).

### Step 1. Note whether you use a database tool from another computer (1 minute)

Have you ever connected a tool such as pgAdmin or DBeaver to this server from **another computer**?

- **No:** go on to step 2.
- **Yes:** it will **stop working** after step 5. This set-up closes the database's network door on
  purpose. Nothing in SchedulePoint needs that door. The `check` command in Part 2 replaces most uses.
  Carry on only if you accept that.

### Step 2. Make the backups folder (2 minutes)

In the terminal, in the folder that holds the compose file, run:

```bash
sudo install -d -o 1000 -g 1000 -m 700 backups
```

**You should see:** nothing printed. Then `ls -ld backups` shows a line that starts with `drwx------` and
has `1000 1000` in it.

**If not:** if it says `sudo: command not found`, you are probably logged in as the administrator
(root). Run the same command without the word `sudo`.

If you set `BACKUP_DIR` in `.env` (step 4), make that folder instead, with the same command and your
folder's path in place of `backups`.

### Step 3. Edit the compose file (10 to 15 minutes)

Open the compose file for editing. In Dockge, open the stack and click **Edit**. Make three changes,
then save.

**Change A. Add the `backup` container.** Paste this block under `services:`, on its own, with the same
indentation as the line `api:` (two spaces). Paste it exactly as it is. It is copied from
`docker-compose.release.yml`.

<!-- keep in step with docker-compose.release.yml backup service -->

```yaml
backup:
  image: ghcr.io/huttonhomehub/schedulepoint_1/api:${API_IMAGE_TAG:-${IMAGE_TAG:-latest}}
  restart: unless-stopped
  # The script is PID 1's only child; `init` reaps `sleep` and forwards `docker stop` to it.
  init: true
  user: '1000:1000'
  logging:
    driver: json-file
    options:
      max-size: '10m'
      max-file: '3'
  labels:
    com.centurylinklabs.watchtower.enable: 'true'
  depends_on:
    db:
      condition: service_healthy
  entrypoint: ['sh', '/app/backup/schedulepoint-backup.sh']
  command: ['schedule']
  # Database credentials only: no auth secret, no mail settings, no URLs.
  environment:
    PGHOST: db
    PGUSER: ${POSTGRES_USER:-app}
    PGPASSWORD: ${POSTGRES_PASSWORD:-app}
    PGDATABASE: ${POSTGRES_DB:-app}
    BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-30}
  volumes:
    - ${BACKUP_DIR:-./backups}:/backups
  read_only: true
  tmpfs:
    - /tmp
  cap_drop:
    - ALL
  security_opt:
    - no-new-privileges:true
  healthcheck:
    test: ['CMD', 'sh', '/app/backup/schedulepoint-backup.sh', 'health']
    interval: 5m
    timeout: 20s
    start_period: 10m
```

If your `api:` container uses a different `image:` line from the one in this block, make the `backup`
container's `image:` line identical to it, so the two always run the same version.

**Change B. Give the `api` container the backups folder.** Under `api:`, add these two lines. If `api:`
already has a `volumes:` line, add only the second line under it.

```yaml
volumes:
  - ${BACKUP_DIR:-./backups}:/backups
```

This is what lets the API take a copy before an update. Without it, updates work exactly as they did
before and no copy is taken.

**Change C. Close the database door.** Under `db:`, delete these two lines:

```yaml
ports:
  - '5432:5432'
```

Leave everything else in `db:` as it is. Your stack may not have these lines at all. If it does not,
there is nothing to delete.

**You should see:** the file saved, with no red error message in Dockge.

**If not:** the usual cause is indentation. YAML needs the spaces to line up, and it does not accept tab
characters. Compare with the other containers in the file and line yours up.

### Step 4. Optional: change the folder or how long copies are kept (0 to 2 minutes)

Skip this unless you want something other than the defaults. Add either line to `.env`:

```text
BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=30
```

- `BACKUP_DIR` is the folder on the server that receives the copies. It is relative to the compose file.
  Changing it later does not move copies already made.
- `BACKUP_KEEP_DAYS` is how many days of copies to keep, from 1 to 3650. Older copies are deleted, but
  only after a new copy has been made successfully, and never the newest one.

### Step 5. Update the stack (2 minutes)

In Dockge, click **Update**. In the terminal, run:

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

**You should see:** the `backup` container being created and the `db` and `api` containers being
recreated. SchedulePoint is unavailable for about a minute. Your data is kept: it lives in a separate
volume that the update does not touch.

### Step 6. Confirm it works, and fix it now if it does not (3 minutes)

Wait five minutes, then run:

```bash
cat backups/LAST-BACKUP.txt
docker compose -f docker-compose.release.yml ps
```

**You should see:** the first line of the file starts with `OK`, for example:

```text
OK — last backup 2026-10-15 02:00 UTC
File: schedulepoint-2026-10-15T0200Z.dump (14.2 MB), took 9 seconds
Copies kept: 1, oldest 2026-10-15. Free disk space: 182 GB.
```

The `ps` list shows `backup` with `(healthy)` beside it. In Dockge the `backup` container shows as
healthy. `backup` may show `starting` for up to about five minutes after the update, and longer on a very
large database, before it turns healthy. Wait and look again.

**If not, fix it now.** The same problem would hold the next update (Part 4). Run:

```bash
docker compose -f docker-compose.release.yml logs --tail 30 backup
```

The last lines say why. The most common reason is that the folder belongs to the wrong user. Fix that
with:

```bash
sudo chown -R 1000:1000 backups
sudo chmod 700 backups
docker compose -f docker-compose.release.yml restart backup
```

Then wait a few minutes and look at `LAST-BACKUP.txt` again. If it still does not say `OK`, send the
maintainers the log lines.

### Step 7. Save your `.env` file in a password manager (5 minutes)

**The backup does not include your `.env` file.** It holds your database password, your sign-in secret
and your mail settings. A rebuilt server cannot run SchedulePoint without it. Copy its contents into a
password manager now. Never paste it into the repository, a chat or an issue.

---

## Part 2: Check a backup without touching live data (10 to 15 minutes)

This is the practice. It loads a real copy into a temporary database next to the live one, shows you
what is in it, and deletes the temporary database. **It never changes the live database.**

1. Open a terminal on the server, in the folder with your compose file. (1 minute)
2. See the copies:

   ```bash
   docker compose -f docker-compose.release.yml run --rm backup list
   ```

   **You should see:** the copies, newest first, with sizes and dates. There should be one for last
   night, or the one from step 6. A copy taken before an update is marked `(before an update)`. (1 minute)

3. Check the newest copy:

   ```bash
   docker compose -f docker-compose.release.yml run --rm backup check
   ```

   **You should see:** a table with the number of organisations, users, clients, projects, plans,
   activities and audit events, in the copy and in the live database now. Small differences are normal
   if people worked since the copy was made. It ends with the line `CHECK PASSED`. It takes 3 to 10
   minutes, depending on the size of the database. (3 to 10 minutes)

   ```text
   Checking schedulepoint-2026-10-15T0200Z.dump ...

                    in this copy in the live database
   organizations               3                    3
   users                      12                   12
   ...
   CHECK PASSED
   ```

4. Write down the date, the name of the copy and the words `CHECK PASSED`. Tell the maintainers. (2 minutes)
5. If it says `CHECK FAILED`, run step 3 again with the previous copy's name from step 2, for example
   `... backup check schedulepoint-2026-10-14T0200Z.dump`. Then report both results. (5 minutes)

**Weekly (1 minute):** glance at Dockge. The `backup` container should say healthy. Or open
`backups/LAST-BACKUP.txt`; its first line should start with `OK`.

---

## Part 3: Restore the live database from a copy (about 15 minutes for a small database)

Read this now. Do it only when you need it. A restore **replaces the live database**. Work done after
the copy was made is not in it.

It is safe to start. Before anything changes, the command loads the copy into a new database and checks
it. It then takes a safety copy of the database you have now. The swap is the very last step, and the
database you had is **kept**, not deleted.

1. Tell your users that SchedulePoint is going down. (1 minute)
2. Stop SchedulePoint. The database stays up:

   ```bash
   docker compose -f docker-compose.release.yml stop api web backup
   ```

3. See the copies and choose one:

   ```bash
   docker compose -f docker-compose.release.yml run --rm backup list
   ```

4. Restore it. Put the copy's file name in place of `<COPY-NAME>`:

   ```bash
   docker compose -f docker-compose.release.yml run --rm backup restore <COPY-NAME>
   ```

   It asks you to type `RESTORE`. Type it and press Enter. Wait for `RESTORE FINISHED`. (3 to 10 minutes)

   **If you see `RESTORE REFUSED`:** the live database has not been changed. The message says why. Two
   common reasons are that something is still connected (do step 2 again) and that the copy was made by a
   newer version of SchedulePoint than the one installed (update SchedulePoint first).

5. Start SchedulePoint again (Dockge: **Update**):

   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

   If the copy is older than the installed version, SchedulePoint brings it up to date as it starts. It
   takes a copy of the restored database first, so that step can be undone too. (2 minutes)

6. Sign in and open a plan you know. Check that the work you expect is there. (5 minutes)
7. If something is wrong, do not delete anything. The database from before the restore is kept under the
   name the command printed (it contains `_before_restore_`). Tell the maintainers; they can swap it back
   in one step.
8. After a week, if all is well, delete the kept one with the command the restore printed. It starts
   `docker compose exec db psql`. (1 minute)

---

## Part 4: If an update is held (10 to 20 minutes)

Read this now. Do it only when you need it.

**What this is.** Before an update that changes the database, SchedulePoint takes a copy first. If it
cannot make the copy (nearly always because the disk is full), it **stops and waits**. It does not change
your data. This is on purpose: an update with a database change is the moment you most want a copy.

**A slower update is not a held one.** An update that includes a database change can take longer if it
runs while the nightly copy is being made. It waits for its turn; it does not fail. Give it a few minutes.

**What you will see.** SchedulePoint stops answering after an update. In Dockge, the `api` container keeps
restarting. Nothing is lost.

1. Find out why (1 minute):

   ```bash
   docker compose -f docker-compose.release.yml logs --tail 20 api
   ```

   The last line starts with `UPDATE HELD` and says why. For example:

   ```text
   UPDATE HELD — SchedulePoint did not update the database because the safety copy could not be made: disk nearly full (needs 28 MB, 11 MB free). Your data has NOT been changed. Fix that (for a full disk, free some space) and SchedulePoint will carry on by itself, or go back to the previous version. See the backup guide, "If an update is held".
   ```

   The same text is in `backups/UPDATE-HELD.txt`.

2. **If the disk is nearly full**, make room (5 to 15 minutes). Either remove old Docker images:

   ```bash
   docker image prune
   ```

   or delete the **oldest** copies. This lists the folder with the oldest first:

   ```bash
   ls -lhtr backups | head -20
   ```

   Delete a few of the oldest `schedulepoint-2…dump` files, each with its `.sha256` file. Put the file
   name in place of `<OLD-COPY>`, and put `sudo` in front if it says permission denied:

   ```bash
   rm backups/<OLD-COPY> backups/<OLD-COPY>.sha256
   ```

   Never delete the newest copies. Within a few minutes SchedulePoint takes the copy and finishes the
   update **by itself**, and `UPDATE-HELD.txt` disappears. Docker retries on its own; you run nothing.

3. **If you cannot fix it now, go back to the version you had** (5 minutes). Find the previous API
   version number in `apps/api/CHANGELOG.md` in the repository (the one just below the newest), or ask the
   maintainers. Add this line to `.env`, with that number in place of `<PREVIOUS-VERSION>`, and update
   the stack:

   ```text
   API_IMAGE_TAG=<PREVIOUS-VERSION>
   ```

   Going back works because the update never changed the database, so the old version matches it
   exactly. When the cause is fixed, **remove that line** so updates carry on again.

4. If neither works, tell the maintainers and send them the `UPDATE HELD` line.

---

## Optional: set a database password (about 10 minutes)

Do this only if your `.env` has no `POSTGRES_PASSWORD` line. Then the database password is the built-in
`app`. It is not required. With the database door closed, only containers on the server can reach it.

**Do not just change `POSTGRES_PASSWORD` in `.env`.** The database reads that setting only when it is
first created. On an existing installation, changing the file alone leaves the database's real password
unchanged, and SchedulePoint then cannot connect and goes down. You need both steps below, one straight
after the other.

1. Make a password of letters and numbers only (symbols break the connection address). This makes one:

   ```bash
   openssl rand -hex 24
   ```

   This guide calls it `<NEW-PASSWORD>`. Keep it in your password manager.

2. Change it inside the database. If your database user is not `app`, use your `POSTGRES_USER` value in
   place of `app` (twice):

   ```bash
   docker compose -f docker-compose.release.yml exec db psql -U app -d postgres -c "ALTER USER app PASSWORD '<NEW-PASSWORD>';"
   ```

   **You should see:** `ALTER ROLE`.

3. Add this line to `.env` and update the stack straight away (Dockge: **Update**):

   ```text
   POSTGRES_PASSWORD=<NEW-PASSWORD>
   ```

4. Check it worked: SchedulePoint opens, and this shows `BACKUP FINISHED`:

   ```bash
   docker compose -f docker-compose.release.yml run --rm backup now
   ```

**To undo it:** run step 2 again with the old password (`app` if there was none), put the old line back
in `.env` (or remove the line), and update the stack. If you are ever locked out, step 2 still works,
because that command goes in through the database container itself.

---

## What this does not protect against

- **Losing the server's disk, or the whole server.** The copies live on the **same disk** as the
  database. If the disk fails, you lose both. Setting `BACKUP_DIR` to a folder on a second disk or a
  network drive helps. Ask the maintainers to help you with it.
- **Losing your `.env` file.** It is not in the backup (Part 1, step 7).
- **Someone getting into the server or reading the copies.** The copies are **not encrypted**. They
  contain every user's password hash and sign-in sessions, as well as all your plans. The folder is
  readable only by its owner. Do not email the copies, upload them or put them on a shared drive as they
  are.
- **A copy nobody has checked.** A copy you have not tested is a hope, not a backup. Do Part 2.

**Adding an off-site copy later.** Each copy is one finished `schedulepoint-….dump` file with a
`.sha256` file beside it. Any tool that copies those two files out of the backups folder can make an
off-site copy: a sync to your network drive, or a sync to cloud storage. Two rules for whoever sets it
up: **encrypt the copies before they leave the server**, and **check an off-site copy the way Part 2
checks this one**. This is not built yet (`docs/TECH_DEBT.md` #509).
