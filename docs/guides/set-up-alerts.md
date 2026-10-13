# Setting up alerts (and proving they work)

**Who this is for:** whoever runs the SchedulePoint server. You do not need to be a developer. Every
step is a thing to copy, paste or click, and each one says what you should see.

**What you are setting up, in plain terms**

1. **A phone alert when email breaks.** SchedulePoint sends email for sign-up, invitations and
   password resets. If the mail service stops working, those all fail quietly and nobody is told. After
   this guide, your phone buzzes instead.
2. **A "dead man's switch".** SchedulePoint pings a website every 5 minutes to say "I'm alive". If the
   pings stop (the server is down, or the whole machine is off), that website alerts you. The first
   alert cannot cover this, because a server that is down cannot tell you it is down.

**Time needed:** about 30 minutes, most of it the test at the end.

**Why this matters:** this is the one job left on `docs/TECH_DEBT.md` #100. The code is built and
shipped, but both settings are empty on the server, so today an email failure reaches nobody. Nothing
in the repository can switch it on for you.

**Words used here**

- **`.env` file:** a plain text file next to `docker-compose.release.yml` on the server. It holds the
  settings SchedulePoint reads when it starts. (If you use Dockge, it is the stack's "Env" box.)
- **Container:** the running copy of the SchedulePoint server. "Recreate" means Docker stops the old
  copy and starts a new one so it reads your changed settings.
- **ntfy:** a free service that sends a notification to your phone when something posts to your private
  topic address.
- **healthchecks.io:** a free service that watches for pings and alerts you when they stop.

**Keep current:** if a name, path or setting in this guide stops matching the product, fix the guide
in the same change. The reference version of all this is
[`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), "Alerting on mail failures".

---

## Part 1: Get your two web addresses

You will end up with two addresses (URLs). Keep them somewhere private, such as a password manager.
**Never paste them into the repository, a chat, an issue or a screenshot.** Anyone who has the ntfy
address can send you fake alerts, and anyone who has the healthchecks address can silence the
dead man's switch.

### 1. The phone alert address (ntfy)

1. On your phone, install the **ntfy** app (Android: Google Play or F-Droid; iPhone: App Store).
2. Open it and tap **+** (subscribe to topic).
3. Type a topic name. Make it long and random, because on the free public server anyone who guesses
   the name can read it, for example `schedulepoint-` followed by 16 random letters and numbers. Leave
   the server as the default (`ntfy.sh`). Tap **Subscribe**.
4. Your alert address is `https://ntfy.sh/` followed by your topic name. Write it down. This guide
   calls it `<YOUR-NTFY-URL>`.
5. **Check it works.** On any computer, run this with your own address in place of the placeholder:

   ```bash
   curl -d "test from SchedulePoint setup" <YOUR-NTFY-URL>
   ```

   **You should see:** a notification on your phone within a few seconds saying "test from
   SchedulePoint setup". If not, check the topic name matches exactly and your phone allows
   notifications for the ntfy app.

### 2. The dead man's switch address (healthchecks.io)

1. Go to <https://healthchecks.io> and create a free account (or sign in).
2. Click **Add Check**. Name it `SchedulePoint`.
3. Set **Period** to **6 minutes**. SchedulePoint pings every 5 minutes, so the check must wait a
   little longer than that, or an ordinary slow ping would raise a false alarm.
4. Set **Grace Time** to **5 minutes** (how long it waits after a missed ping before alerting).
5. Under **Integrations** make sure there is a way to reach you that is **not email**. Use the ntfy
   integration, Pushover, SMS or a phone app. (Reason: if SchedulePoint's mail is broken, your own
   mail may not be the thing you want to rely on, and this check is meant to be independent.)
6. Copy the check's **ping URL**. It looks like `https://hc-ping.com/` followed by a long id. This guide
   calls it `<YOUR-PING-URL>`.

---

## Part 2: Switch it on

Do these on the server that runs SchedulePoint.

1. Open the `.env` file in the same folder as `docker-compose.release.yml`.
2. Find these two lines (they may be missing; if so, add them at the bottom) and fill them in with your
   own addresses. Keep the names exactly as shown, with no spaces around the `=`:

   ```bash
   MAIL_ALERT_URL=<YOUR-NTFY-URL>
   HEARTBEAT_URL=<YOUR-PING-URL>
   ```

3. Save the file.
4. Recreate the server so it reads them. From the folder that holds the compose file:

   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

   (Use the same `docker compose` command you normally use to start the stack, including any profile
   you add. If you use Dockge, press **Update** on the stack instead. Wherever this guide says
   "recreate the server", it means this step.)

   **You should see:** Docker lists the `api` service as "Recreated" or "Started", then returns to the
   prompt. If the API refuses to start, a mistyped address is the usual cause: SchedulePoint checks
   both addresses when it starts and refuses a malformed one on purpose. Run
   `docker compose -f docker-compose.release.yml logs api --tail 30` to read the reason, fix the line in
   `.env` and repeat step 4.

---

## Part 3: Check SchedulePoint sees them

1. Sign in to SchedulePoint with an account whose address is listed in `STAFF_EMAILS` in `.env` (the
   staff list) and whose email is **verified**, then open `/staff` on your site (for example `https://your-site.example/staff`).
2. Find the **Alerts and monitoring** box. Click **Alerts and monitoring** in the "On this page" list
   if you cannot see it.

   **You should see:**
   - Email failure alerts: **On**
   - Uptime check: **On**

   **If you see "Off: nobody is told when emails fail" or "Off: nothing notices if SchedulePoint goes
   down"**, that setting did not reach the server. Re-check the line's spelling in `.env`, then repeat
   Part 2, step 4.

3. **Check the dead man's switch.** Go back to your healthchecks.io page. Within about 5 minutes the
   check should turn **green** (status "Up"). SchedulePoint pings once as it starts and then every
   5 minutes.

   **You should see:** green. **If it is still grey after 10 minutes**, the server cannot reach out to
   the internet, or the address is wrong. Do not go on to Part 4. This ping and the phone alert travel
   the same way out of the server, so if this fails, the phone alert will fail too, and you have
   learned that without breaking anything.

---

## Part 4: Prove the phone alert works (break mail on purpose)

You will break outgoing mail for a couple of minutes, ask for one password reset, and see the alert.

**Be aware:** while mail is broken, any real email SchedulePoint tries to send (password resets,
email verification, invitations) fails, is **not** retried and is lost. Those failures also raise real
alerts, and the person waiting has to ask again. So do this at a quiet time, such as early morning
or a weekend, and be quick.

> **DO NOT SKIP the restore step (step 7).** If you stop in the middle, mail stays pointed at nothing
> and nobody can get a password reset or an invitation. The steps are in an order that gets you back
> to normal; do not leave halfway.

### Before you start

1. **Save a copy of your settings.** On the server, in the folder that holds `.env`, run:

   ```bash
   cp .env .env.pre-alert-test
   ```

   **If you use Dockge** there is no file to copy: select and copy the whole **Env** box into a note
   on your computer before you change anything.

   The copy holds your mail provider's password. Keep it out of git and out of chat, and delete it
   after the last step (`rm .env.pre-alert-test`). You will restore from it in step 7.

2. **Choose an address that has a SchedulePoint account**, such as your own sign-in address. This is
   important. SchedulePoint deliberately does nothing when you ask to reset the password for an address
   with no account (so strangers cannot find out who has one). If you use "any old address", no email is
   attempted, no failure happens, no alert is sent, and it looks exactly like a broken alert when it is
   not.

### The test

1. In `.env`, change the `MAIL_SMTP_URL=` line to this, which points mail at a door with nothing behind
   it:

   ```bash
   MAIL_SMTP_URL=smtp://127.0.0.1:1
   ```

   Leave the `MAIL_FROM=` line alone. Make sure there is only one `MAIL_SMTP_URL=` line in the file.

2. Recreate the server:

   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

3. Open your site's `/forgot-password` page (for example `https://your-site.example/forgot-password`),
   type the address with an account, and press the button **once**.

   (If the page shows "not found", the password-reset feature is switched off on your site, so the
   test cannot run until it is on.)

   **You should see:** the page says to check your email. That is normal. The page says the same thing
   whether or not the email went, again on purpose. No email will arrive.

4. Watch your phone. Within about a minute you should get **one ntfy alert** that reads
   `SchedulePoint: password_reset mail failed to send.` It names the kind of message but not the
   person's address, on purpose. A single failure sends only this short line, with no count. If you
   pressed the button more than once, a second summary arrives about 10 minutes later, such as
   `2 mail sends failed in the last 10 minutes (password_reset)`. That is expected. It may look like a small block of text with `"text":` and `"event":` in it
   because ntfy shows the message as it arrives; that is fine.

   **If nothing arrives after 3 minutes:** go straight to step 7 (restore), then see "If something
   goes wrong" below.

5. Open `/staff` and look at the **Mail** box.

   **You should see:** "Failed in the last hour" is **1** (or more), "Last failure" says a minute or
   so ago, and a row in the table shows the reset with a **Reason** (for example `ECONNREFUSED`). That is
   the permanent record, and it proves the failure was written down as well as announced.

6. Take the screenshot or note the time, so you can tell the person who asked (see "Tell us the result").

7. **Restore mail now. Do not skip.** Put your saved settings back:

   ```bash
   cp .env.pre-alert-test .env
   ```

   (Dockge: paste the Env text you saved back into the Env box.) Then recreate the server again:

   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

8. Prove mail works again: request one more reset on `/forgot-password` for the same address.

   **You should see:** the reset email arrives in that inbox, and **no** new phone alert. In `/staff`
   the Mail box's failure count stops growing. A late summary alert on your phone after the restore is
   normal if you pressed the button more than once or real mail failed during the test. It describes
   the broken period, not a new failure.

9. Delete the saved copy, since it holds a password: `rm .env.pre-alert-test`.

### If something goes wrong

- **No phone alert, but the heartbeat was green in Part 3:** first make sure you used an address that
  has an account. Then run
  `docker compose -f docker-compose.release.yml logs api --since 10m | grep mail_alert`. A line named
  `mail_alert.failed` means the server could not reach your ntfy address; `mail_alert.rejected` means
  ntfy answered but refused it. Send what it prints (it never contains your addresses) to whoever maintains SchedulePoint. Your ntfy address could be
  wrong; test it again with the `curl` command from Part 1.
- **The `/staff` Mail box shows no failure either:** mail was probably still pointing at the real
  provider. Check the `MAIL_SMTP_URL=` line really changed and that step 2 ran without errors.
- **Mail still does not work after step 8:** the settings were not restored. Run
  `cp .env.pre-alert-test .env` (Dockge: paste your saved Env text back) and recreate again. Check `/staff` Mail box says nothing is failing.
- **You want to switch an alert off:** clear the value (`MAIL_ALERT_URL=`), save and recreate. Behaviour
  returns to exactly what it was before this guide.

---

## Part 5: The old cron script

Earlier, a script (`scripts/watch-mail-failures.sh`) run from the server's scheduler (cron) did a worse
version of this job. **If you never installed it, do not install it now.** If it is already running,
leave it running until Part 4 has produced a phone alert; then remove its line from the server's
scheduler (`crontab -e`) and delete the script from the server.

---

## Tell us the result

When Part 4 works, tell the maintainers two things, so the tracking item can be closed on your
observation:

1. **The phone alert arrived** (with roughly the time).
2. **The healthchecks.io check is green.**

They close `docs/TECH_DEBT.md` #100 and update `CLAUDE.md` §17. Until you tell them, the item stays
open on purpose: a closed item would claim the alert reaches somebody when nobody has seen it do so.
