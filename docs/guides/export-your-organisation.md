# Export your organisation's data

**Who this is for:** an Org Admin of an organisation in SchedulePoint. You do not need to be a developer,
and you do not need to touch the server to follow this guide. You press one button and keep one file.

**What you are doing, in plain terms.** You are taking your own complete copy of everything SchedulePoint
holds for your organisation: the clients, projects, plans, activities, links, calendars, resources,
baselines, notes, members and the audit log. It comes as one ZIP file that you can keep, open in a
spreadsheet, or hand to another program. It does not change anything in SchedulePoint.

**Time needed:** about 10 minutes the first time, most of it checking the file. The download itself takes
seconds for a small organisation and a few minutes for a large one.

**You cannot break anything by following this guide.** Nothing in it deletes, moves or changes your data.
The file is made fresh each time and is not kept on the server.

**Words used here**

- **Org Admin:** a member whose role in the organisation is Org Admin. Only an Org Admin can export. If
  you are a Planner, Contributor or Viewer you will not see the link.
- **ZIP file:** one file that holds many files inside it, like a folder squeezed into a single package.
- **Spreadsheet file (CSV):** a plain table that Excel opens. Every table has one.
- **Program-readable file (JSON):** the same table written so another program can read it. This is the
  exact, complete copy. The spreadsheet files are a convenient view of it.
- **Manifest:** a list inside the ZIP of every file, how many rows it holds, and a check-code for each
  one, so you can tell the copy is complete.
- **Audit log:** SchedulePoint's list of what was removed or changed. Each export is recorded there.

<!-- Maintainers: if a name or message in this guide stops matching the product, fix the guide in the same
change. The reference version is docs/ORGANISATION_EXPORT_FORMAT.md (the file's exact layout) and
docs/DEPLOYMENT.md, "The organisation export". -->

---

## Part 1: Download the export (about 5 minutes)

### Step 1. Open the page

Sign in to SchedulePoint as an Org Admin. In the panel on the left, find the list of places in your
organisation (Clients, Calendars, Members and so on) and click **Export data**. It is the last one in the
list.

**You should see:** a page called **Export organisation data**, with a **Download export** button, and
two lists below it: **What is included** and **What is not included**.

**If you do not see Export data in the list:**

- You are not an Org Admin of this organisation. Ask an Org Admin to do it, or to change your role.
- The panel on the left is folded away. Click the **Show Project Explorer** button at the top of the
  narrow strip, or look for the icons in that strip: **Export data** (a download arrow) is the last one.
- You have more than one organisation. Check the name at the top of the panel and switch to the right
  one.

### Step 2. Press Download export

Click **Download export**, then wait. Do not close the page or go to another page until it is finished: leaving the page cancels the download.

**You should see:**

- The button changes to **Cancel**.
- A line under it says `Preparing your export…`, and beside it a number such as `3.2 MB received` that goes
  up every couple of seconds.
- When it is finished, the line says `Downloaded schedulepoint-export-… .zip (12.3 MB). Your browser has
saved it.` Your browser puts the file where it keeps downloads, usually the Downloads folder.

The file is named like this: `schedulepoint-export-acme-20261014T0930Z.zip`. The last part is the date and
time (in UTC) when the export was made, so each export has its own name.

**The copy shows your organisation as it stood at the moment you pressed the button.** Work other people
do while it is downloading is not in it, and it does not stop them working.

**If you change your mind**, press **Cancel**. The page says `Export cancelled.` and nothing is saved.

**If you see a red message instead**, see "If it stops" below.

### Step 3. Check that you have it

Open your browser's downloads (usually your Downloads folder) and look for the file. A small organisation is a few megabytes. A large one can
be tens of megabytes.

**You should see:** a file whose name starts `schedulepoint-export-` and ends `.zip`.

---

## Part 2: Open it and look (about 5 minutes)

### Step 1. Unpack the ZIP

On Windows: right-click the file and choose **Extract All…**, then **Extract**. On a Mac: double-click it.

**You should see:** a new folder with these inside it:

- `README.txt`: a plain-English guide to everything else. Read this first. It is short.
- `manifest.json`: the list of files with their row counts and check-codes.
- a `csv` folder: the spreadsheet files.
- a `json` folder: the program-readable files.

### Step 2. Open one spreadsheet

Open the `csv` folder and double-click `clients.csv`. It should open in Excel.

**You should see:** a header row of column names, then one row for each client in your organisation,
including any that are in Recently deleted. Names with accents or symbols should look right.

**If the letters look wrong** (for example `Ã©` instead of `é`), do not worry. Nothing is damaged. Open
Excel first, use **Data**, then **From Text/CSV**, choose the file, and set the file origin to **UTF-8**.

### Step 3. Look at what is in the list

Open `plans.csv` and `activities.csv` the same way. You should recognise your own plans and activities.
Money columns are in the smallest unit of the plan's currency (pence or cents, for example), and the
`README.txt` says so.

### Step 4. Remember where you put it

Move the ZIP somewhere you will find it again.

**This file is private.** It holds everyone's work, costs, and the names and email addresses of every
member. Keep it somewhere only the right people can open, such as an encrypted drive or your password
manager's file storage. Do not send it by ordinary email. Delete it when you no longer need it.

**This is the end of the check.** Tell whoever asked for it that it worked, or that you hit a problem and
what you saw.

---

## What is in the file, and what is left out

**Included:** your people, clients, projects, plans (including anything in Recently deleted), activities,
the links between them, steps, notes and each activity's change history, calendars, resources and
assignments, baselines, the share links that exist, and the organisation's audit log.

**Left out, on purpose**, and the manifest lists each one with its reason:

- **Passwords and sign-in sessions**, and the secret parts of invitation and share links. These are
  credentials belonging to individuals, not your organisation's work.
- **The internet addresses and browser details** in the audit log. The Audit log screen never shows
  them either.
- **Who has a plan open for editing right now.** It lasts for minutes and describes the present, not stored work.
- **The server's own technical records** (mail delivery, browser security reports and performance
  measurements). They belong to the server, not to your organisation.
- **Other organisations' people and events.** You only ever get your own.

**What this is not.** It is a copy to keep and to read, not a way to move a plan to another SchedulePoint.
Loading an export back in is not supported. Your database backup
([`back-up-and-restore.md`](back-up-and-restore.md)) is the way to restore SchedulePoint itself.

---

## If it stops

Nothing is saved when an export stops, and nothing is damaged. Read what the page says, then find it here.

| What the page says                                                                           | What it means, and what to do                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Only an Org Admin can export this organisation's data.`                                     | Your role is not Org Admin. Ask an Org Admin to do it.                                                               |
| `This organisation was not found.`                                                           | You are not a member of it, or it was deleted. Check the organisation name at the top of the left panel.             |
| `An export is already being prepared for this organisation. Try again when it finishes.`     | Someone (possibly you, in another tab) has an export running. Wait a few minutes and try again.                      |
| `The server is busy with other exports right now. Try again in a few minutes.`               | Other organisations are exporting at the same time. Wait a few minutes and try again.                                |
| `Too many exports in a short time. Try again in about 10 minutes.`                           | You can start 3 exports in 10 minutes. Wait 10 minutes.                                                              |
| `The download stopped before it finished. Nothing was saved. Try again.`                     | The connection dropped part-way. See "A long export stops part-way" below.                                           |
| `The export could not be prepared. Try again; if it keeps failing, tell your administrator.` | The server had a problem before it began. Try once more. If it fails again, send the maintainers the time you tried. |
| `Couldn't reach the server. Check your connection and try again.`                            | Your internet connection, or SchedulePoint is down. Check you can still load another page in SchedulePoint.          |

### A long export stops part-way

A large organisation can take several minutes to export. If the page says `The download stopped before it
finished. Nothing was saved. Try again.` and it was not your connection, tell whoever runs your server
about it: the two likely causes are in the next part.

#### For whoever runs the server

- **A service in front of SchedulePoint gives up waiting.** If you use Cloudflare, its default is to cut a
  connection that has been quiet for about 100 seconds. SchedulePoint's own web container waits up to 11
  minutes, so the cut is Cloudflare's. In practice a small or medium organisation finishes well inside
  100 seconds and is not affected. If a big one keeps stopping near the 100 second mark, tell the
  maintainers which service is in front of your server, and what plan it is on.
- **The server was restarted during the export.** An automatic update (Watchtower) or a restart drops
  the download. To check: in Dockge, open the SchedulePoint stack and look at the status of the `api`
  container in the list. `Up 3 minutes` with a time later than when the export started means it was
  recreated, and the export was cut by that. Wait for it to settle and try again.

Every attempt that started is recorded in the Audit log as **Organisation data exported**, with the
outcome **Succeeded** or **Failed**. A failed row says it stopped before it finished, which is also what
a **Cancel** records.

### While an export runs

An export holds a consistent picture of the database open until it finishes. That is how it stays
complete without stopping anyone from working. It is limited to **10 minutes** and the server runs at most
two exports at once, so it cannot pile up. If a person starts an export and leaves their laptop asleep
with the download unfinished, the server lets it go after at most 10 minutes. You do not need to do
anything about it.

If you need help, send the maintainers the time you tried, the message on the page, and a screenshot of
the **Organisation data exported** row in the Audit log.
