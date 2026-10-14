# Switch on the recycle bin's 90-day clear-out

**Who this is for:** whoever runs the SchedulePoint server. You do not need to be a developer. Every
step is a thing to copy and paste, and each one says what you should see and what to do if you do not.

**What this does, in plain terms**

When someone deletes a client, project or plan in SchedulePoint, it goes to **Recently deleted** and
can be restored. At the moment it stays there **for ever**, because the clear-out is switched off.
Switching it on means: an item that has sat in Recently deleted for 90 days is **permanently
removed**, together with everything inside it (a client's projects, their plans, the activities in
those plans, and their logic, notes, baselines and resource assignments). **Nothing in SchedulePoint
can bring it back afterwards.** Only a backup copy can.

**Read these four facts before you start**

1. **The 90 days count from the day each item was deleted**, not from the day you switch it on. If
   your server has been running for a year, everything already older than 90 days is removed
   **within about a minute of the switch**, in one go. There is no grace period. That is why Part 1
   has you read the list first.
2. **You can look before you leap.** Part 1 prints the exact list of what would go, and changes
   nothing.
3. **You need a tested backup.** Part 2 is only for a server where the backup guide's Part 1 and
   Part 2 are done and you wrote down `CHECK PASSED`. If not, do that first:
   [`back-up-and-restore.md`](./back-up-and-restore.md).
4. **Switching it off again is easy, but it brings nothing back.** Part 3.

**Time needed:** Part 1 (the preview) about 20 to 40 minutes, on any day. Part 2 (switch-on day)
about 45 to 60 minutes, at a quiet time. Part 3 (switching off) 3 minutes. Part 4 (getting something
back) about 15 minutes, for the day you need it. Read Parts 3 and 4 once now.

**Words used here**

- **Clear-out:** the 90-day removal described above. Its setting is called
  `RETENTION_HIERARCHY_ENABLED`.
- **Compose file, `.env` file, terminal, `sudo`, `<PLACEHOLDER>`, stack:** as in the backup guide's
  "Words used here". In short: you run every command in the folder that holds `compose.yaml`
  (`cd /opt/stacks/YOUR-STACK-NAME`), and a word in angle brackets is a blank for you to fill in,
  including the brackets. If a Docker command says `permission denied`, put `sudo` in front of it.
  Only if your compose file has another name, add `-f <name>` after `docker compose` in every command.
- **Copy:** one backup file that holds the whole database as it was at one moment.

**Keep current:** if a name, command or message in this guide stops matching the product, fix the guide
in the same change. The reference version is [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), "Deleted work";
the decision is [ADR-0193](../adr/0193-a-permanent-delete-is-previewed-by-the-code-that-performs-it.md).

---

## Part 1: Look at the list (about 20 to 40 minutes, on any day before switch-on)

Nothing in this part changes anything. The command only reads.

1. Check the update has arrived (2 minutes). In Dockge, open the SchedulePoint stack. The command in
   step 2 only exists in a recent version of the `api` container. If step 2 says it cannot find the
   file, the update has not arrived yet: wait, or ask the maintainers.
2. Open a terminal on the server, in the folder with your compose file, and run the preview (5
   minutes):

   ```bash
   docker compose exec api node dist/cli/clear-out-preview.js
   ```

   **You should see:** a report that starts like this. The second line must say **OFF**:

   ```text
   SchedulePoint clear-out preview — 2026-10-20 14:03 UTC
   The clear-out is OFF on this server. Period: 90 days.

   If it were switched on now, these would be permanently removed:

   Organisation "Acme Builders"
     Client  "Northgate"  deleted 2026-06-01 (51 days past)  with 2 projects, 5 plans, 812 activities
   ```

   and ends with `Nothing has been changed.` If nothing is old enough yet it says
   `Nothing is past its 90 days. Nothing would be removed if it were switched on now.`

   **If not:**
   - `The clear-out is ON on this server`: it is already switched on. Do not carry on with Part 2;
     tell the maintainers.
   - `Could not reach the database` or `The preview could not be completed`: nothing was changed.
     Send the line to the maintainers.
   - A message about invalid settings: send it to the maintainers.

3. Read the list (5 to 15 minutes). It has two parts:
   - **"If it were switched on now, these would be permanently removed":** everything here goes
     within a minute of switch-on. It is every organisation on the server, with what is inside each
     item.
   - **"Due within the next 7 days":** these go in the week after switch-on, one hourly run at a
     time.

   It lists the oldest 200 items and says how many more there are. The totals line at the bottom
   counts all of them. If it says the first run takes only part of it, a large list simply clears
   over several hours; that is expected.

4. **For anything you want to keep, restore it.** Sign in, open **Recently deleted** in that
   organisation, and press **Restore** on the item. If it is in an organisation you are not a member
   of, ask that organisation's admin. (2 to 5 minutes per item.) Run the command from step 2 again:
   a restored item has gone from the list.
5. Optional: tell your users the date you plan to switch it on, so nobody is surprised. (5 minutes)
6. **The day before switch-on (2 minutes):** tell the maintainers the date, so that no new version of
   SchedulePoint is released that day. The switch should be the only thing that changes.

---

## Part 2: Switch-on day (about 45 to 60 minutes; do it at a quiet time)

**Stop here unless you have `CHECK PASSED` from today** (step 2). This switch permanently destroys
work, and a copy is the only way back.

1. Open a terminal in the folder with your compose file. Take a fresh copy (2 to 10 minutes):

   ```bash
   docker compose run --rm backup now
   ```

   **You should see:** a line starting `BACKUP FINISHED` with the copy's name.

   **If not:** stop. Send the output to the maintainers, and see the backup guide, Part 1 step 6.

2. Check the copy (3 to 10 minutes):

   ```bash
   docker compose run --rm backup check
   ```

   **You should see:** a table, and at the end the line `CHECK PASSED`. **If you do not see
   `CHECK PASSED`, stop here** and send the output to the maintainers. Write down the copy's name
   (for example `schedulepoint-2026-10-20T0915Z.dump`): it is the way back if anything is removed that
   should not have been. Part 4 uses it.

3. Run the preview again and read it once more (3 to 10 minutes). Someone may have deleted something
   since Part 1. Restore anything you have changed your mind about.

   ```bash
   docker compose exec api node dist/cli/clear-out-preview.js
   ```

   Keep this output. You will send it to the maintainers in step 11.

4. Check your compose file passes the setting through (3 minutes). In Dockge, open the stack and click
   **Edit**. Under `api:` then `environment:`, look for this line:

   ```text
   RETENTION_HIERARCHY_ENABLED: ${RETENTION_HIERARCHY_ENABLED:-false}
   ```

   **If it is not there, stop** and ask the maintainers. Without it, the setting never reaches
   SchedulePoint and nothing will happen.

5. Switch it on (3 minutes). In Dockge, open the stack's `.env` (the "Env" box), add this line, click
   **Save**, then click **Deploy**:

   ```text
   RETENTION_HIERARCHY_ENABLED=true
   ```

   **Do not click Update.** Update also installs new versions, and the switch should be the only
   change today. The only values accepted are `true` and `false`; anything else stops SchedulePoint
   from starting. SchedulePoint restarts and is unavailable for about a minute.

6. Read the log (5 minutes). In Dockge, click the `api` box and read its log, or run:

   ```bash
   docker compose logs --tail 100 api
   ```

   **You should see, within about two minutes:** a line containing `hierarchy expiry ARMED` (it is
   logged as a warning, on purpose), and then one line containing `expired a deleted subtree` for each
   item the list showed.

   **If not:** a line containing `hierarchy expiry is not armed` means the setting did not reach
   SchedulePoint. Check step 4 and step 5, or switch it off again (Part 3) and tell the maintainers.
   A line containing `can NEVER expire` or `hierarchy expiry failed` means one item could not be
   removed. Nothing else is harmed. Send the line to the maintainers.

7. Run the preview a third time (3 minutes):

   ```bash
   docker compose exec api node dist/cli/clear-out-preview.js
   ```

   **You should see:** `The clear-out is ON on this server`, and
   `Nothing is past its 90 days. Nothing is waiting to be removed.` If it still lists items, a large
   list is being cleared over the next hours: run it again later. Anything marked
   **OVERDUE — send this output to the maintainers** has been waiting far longer than it should:
   send them the output.

8. Check it in the product (5 minutes). Sign in. Open your organisation's **Audit log** and find a
   **Permanently deleted** row, by **System**, for each item that was removed. Then open **Recently
   deleted**: it now says "Deleted items are kept for 90 days, then permanently removed", and each row
   shows how many days it has left.

9. Write down the date and the copy's name from step 2.

10. Tell the maintainers (2 minutes): the date, the copy name, and the preview output from steps 3 and 7.

---

## Part 3: Switch it off (3 minutes)

In Dockge, open the stack's `.env`, change the line to:

```text
RETENTION_HIERARCHY_ENABLED=false
```

Click **Save**, then **Deploy** (not Update). Or delete the line: off is the default. The log then
shows `hierarchy expiry is not armed`, and nothing is removed from then on.

**Switching it off brings nothing back.** Items already removed are gone from the live database.
Part 4 is the only way to get one back. Items still in Recently deleted stay there and are never
removed while it is off.

---

## Part 4: Something was removed that should not have been (about 15 minutes)

You can only get it back from a copy, so what you get back is the database **as it was when that copy
was made**. **All work done since the copy is lost**, including everyone's work today. A nightly copy
is usually the best one; the copy you wrote down on switch-on day (Part 2 step 2) is the one taken just
before anything was removed.

Do these in order. **The first step matters:** the clear-out checks for overdue items every time
SchedulePoint starts. A restored database starts up with the item back in Recently deleted, still
dated before the 90 days. If the clear-out were still on, SchedulePoint would remove it **again**
within a minute.

1. **Switch the clear-out off first.** Part 3 above. Wait for the Deploy to finish.
2. Restore the copy: the backup guide's **Part 3**
   ([`back-up-and-restore.md`](./back-up-and-restore.md)). Use the copy name you wrote down.
3. Sign in, open **Recently deleted** in the organisation, and **Restore** the item. It is now a
   normal item again.
4. Decide whether to switch the clear-out on again. If you do, restore everything else you want to
   keep first, and repeat Part 2 from step 1 so you have a fresh tested copy. A restored item that is
   still in the bin and still older than 90 days is removed again the moment you switch on, so restore
   each one out of the bin **before** that.

---

## What "permanently removed" does not mean

**It means removed from the live database. It does not mean removed from your backups.**

- Nightly copies are kept 30 days (`BACKUP_KEEP_DAYS`), so a removed item stays in the copies for **at
  least 30 days after it is removed**.
- **Sometimes much longer.** Pruning never deletes the newest copy of each kind. The newest "before an
  update" copy can be months old if no update has changed the database since, and still holds
  everything as it was then.
- A restore keeps the database it replaced, named with `_before_restore_` in it, until someone drops it
  by hand. That database still holds whatever it held then.
- **The audit log keeps the item's name for ever.** Each removal writes a **Permanently deleted** row
  naming the item, and the audit log refuses deletion by design.
- **So a request to erase a client's data completely is not met by the clear-out alone.** It also
  needs the matching copies deleted or waited out, and the name in the audit log is not removable. That
  is not built; ask the maintainers before you promise anyone otherwise
  (`docs/adr/0085-privacy-operations.md`).

The same fact is the safety net: for at least 30 days after an item is removed, a copy can bring it
back, at the cost of all work done since that copy (Part 4).
