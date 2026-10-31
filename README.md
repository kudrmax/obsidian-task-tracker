# Task Calendar

A task list next to a day timeline, inside Obsidian. One markdown file is the only truth: the plugin reads it on every change and writes it back line by line, so editing the file by hand is always fine. Drag a task onto a time, see your Google and work calendars beside it. Built for the iPhone first.

## The file

Default path `TODOs Tasks.md` (Settings → Tasks file). Second-level headings are the sections; the plugin uses three of them and leaves everything else untouched:

```markdown
## Inbox
## Now
## Soon
## Backlog
## Done
```

A task is a list item with a checkbox. Two optional fields at the end of the line:

```markdown
- [ ] Call the doctor
- [/] Write the report ⏰ 2026-10-30 14:00-15:00
- [ ] Buy tickets 📅 2026-11-03
- [x] Done task
- [-] Won’t do
```

- `📅 YYYY-MM-DD` is the **due date**: you set it (task menu or the task screen). It is shown next to the task and never removed automatically.
- `⏰ YYYY-MM-DD HH:MM-HH:MM` is the **slot**: the plugin sets it when you drop a task on the timeline. When that day is over, the slot is removed.
- `[/]` is “in progress”, `[x]` done, `[-]` won’t do. Done and won’t-do tasks move to the top of Done at once.
- A Soon task whose due date (or slot) has come moves to the top of Now.
- Nested lines under a task travel with it.
- A third-level heading inside Inbox, Now or Soon is a **section** (`### Evening`). Tasks above the first one are outside any section; once that group is moved lower, its heading is `### No section` (Settings → Sections). A section the plugin finds empty is removed. A task that gets a time leaves its section, and so does a Now task that gets a later day. A Soon task keeps its section with a due date, and when its day comes it moves to Now’s section of the same name (made if Now has none).

## The screen

Left: the tasks of the selected day (today: everything in Now that has no slot today). Right: the day’s timeline with calendar events and slotted tasks, or the Soon list (tasks without a date). Arrows change the day, a tap on the title returns to today, the divider between the columns can be dragged.

- Drag a task from the list onto the timeline to give it a time; drag it back to remove the time; drag inside the timeline to move it, pull the handle to resize it.
- Drag between the Soon list and the day list to move a task between Soon and Now (on another day: to set or remove its due date).
- **Sections.** A column shows the sections of the list its tasks are in: Inbox and Soon their own, the day column Now’s for today and Soon’s for a later day. So you can open tomorrow in the evening and sort its tasks into Morning, Evening and so on; in the morning they are in Now in the same sections. While a task is dragged, zones show under Inbox, Soon and the day column (today or later): the preset sections that list doesn’t have yet (Settings → Sections) and “New section”. Drop a task on a preset to start that section with it. Drop it on “New section” and type the name: Enter makes the section, an empty name or a tap elsewhere puts the task back. Once a list has a section, the tasks outside any get a “No section” header of their own. Drag a task into a gap to put it in that section. A section that empties goes away, its header too.
- Long press a task for its menu: In progress, Done, Won’t do, Due date, Rename, Delete.
- “New task” opens the task screen: a title and three tiles, Soon / Now / Date. A long press on an empty spot of the timeline creates a task at that time.
- Pinch to zoom the timeline; the drag step follows the grid.
- The calendar button in the day row gets an orange dot when a source is stale; tap it (with the calendar already shown) to see the sources and refresh them, or pull the timeline down.

## Google Calendar

The plugin reads your Google calendars through the Calendar API (read-only). You create a Google Cloud project once; the login works the same on the Mac and on the phone, and the token syncs between your devices through Obsidian Sync (it lives in the plugin’s `data.json`, which Sync carries with “Installed community plugins”).

1. Open <https://console.cloud.google.com/>, create a project (any name).
2. APIs & Services → Library → “Google Calendar API” → Enable.
3. APIs & Services → OAuth consent screen → External → fill in the app name and your email → Save. Add your own Google account under Test users.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Web application**. Under Authorized redirect URIs add exactly `https://kudrmax.github.io/obsidian-task-tracker/auth.html` → Create. Copy the Client ID and Client secret.
5. In Obsidian, on either device: Settings → Task Calendar → Google Calendar → paste both → **Log in**. The browser opens; Google warns that the app is unverified → Advanced → Go to … → allow. Google sends the browser to the redirect page, which opens Obsidian again; a notice says you are logged in.
6. Below the login, tick the calendars you want to see.

The redirect page is [`docs/auth.html`](docs/auth.html), served by GitHub Pages: it only passes the code on to `obsidian://task-calendar`, stores nothing and talks to no one else.

### Keep the login from expiring

While the project’s publishing status is **Testing**, Google makes every refresh token expire after 7 days, whatever the app does. To stop that:

1. APIs & Services → OAuth consent screen → **Publish app** → Confirm. The status becomes **In production**.
2. If the console asks for the app's details first (Branding): home page `https://kudrmax.github.io/obsidian-task-tracker/`, privacy policy `https://kudrmax.github.io/obsidian-task-tracker/privacy.html`, authorized domain `kudrmax.github.io`; both pages live in [`docs/`](docs/). Google may say the app needs verification because `calendar.readonly` is a sensitive scope. You do not need to submit it: an unverified app in production keeps working for up to 100 users, the consent screen just keeps its “unverified” warning (Advanced → Go to …).
3. Log in once more in the plugin settings. Tokens issued after publishing do not expire; they are revoked only if you revoke them at <https://myaccount.google.com/permissions> or stay unused for six months.

## Work calendar (Exchange on the iPhone)

The plugin cannot read Apple’s calendars itself. A Scriptable script exports the events of every calendar on the phone, from yesterday to two weeks ahead (meetings you declined left out), to a JSON file in the vault; the plugin reads that file (Settings → Work calendar → File path, default `calendar/work.json`).

The export itself comes with the plugin: it keeps it in its own folder (`.obsidian/plugins/task-calendar/work-calendar-export.js`) and updates it with every release. Scriptable holds only a short script that runs it, [`scriptable/Export Work Calendar.js`](scriptable/Export%20Work%20Calendar.js), pasted once.

1. Install Scriptable, create a script named `Export Work Calendar`, paste the script from Settings → Work calendar → Scriptable script → **Copy**.
2. Scriptable → Settings → File Bookmarks → **+** → pick the vault folder → name it `ObsidianVault`.
3. Run the script once: iOS asks for calendar access, the alert shows the number of events.
4. Shortcuts → **+** → a shortcut named `Export Work Calendar` with two actions: Scriptable “Create File Bookmark” (`ObsidianVault`, the vault folder) → Scriptable “Run Script” → `Export Work Calendar`, Run In App off. The plugin and the automations below run this shortcut.
5. Shortcuts → Automation → **+** → App → Obsidian → Is Opened → Run Immediately → Run Shortcut `Export Work Calendar`: the events are fresh every time Obsidian opens.
6. The same with Time of Day, Run Immediately, one automation per hour you want a refresh at (iOS has no “every hour”), for example 9:00 to 19:00.
7. In the plugin settings, list the calendar titles to take from the file (empty: all of them), so Google calendars are not shown twice.

On the iPhone, pulling the timeline down (or Refresh now in the sources window) runs the shortcut too: Shortcuts comes up for a moment and returns to Obsidian with the new events. On the Mac the same file arrives through Obsidian Sync.

## Notifications (iPhone)

A task put on a time rings on the phone at its start: the task’s title, its time below, a tap opens Obsidian. A Scriptable script reads the tasks file with the plugin’s own parser and keeps one pending notification per unfinished task with a slot in Now and Soon; a task moved, unslotted, done or cancelled loses its old one on the next run. Due dates alone do not notify.

1. Scriptable → **+** → a script named `Task Notifications`, paste [`scriptable/Task Notifications.js`](scriptable/Task%20Notifications.js). If the plugin’s tasks file, section names or markers differ from the defaults, change them in `SETTINGS` at its top.
2. The `ObsidianVault` file bookmark from the work calendar setup serves this script too.
3. Run it once: iOS asks to allow notifications; the alert shows how many tasks are ahead.
4. Shortcuts → Automation → **+** → App → Obsidian → **Is Closed** → Run Immediately, with the actions Scriptable “Create File Bookmark” (`ObsidianVault`, the vault folder) → Scriptable “Run Script” → `Task Notifications`. Leaving Obsidian is when the file holds your last changes and those synced from the Mac: Obsidian syncs only while it is open, so a task put on a time on the Mac reaches the phone the next time you open and leave Obsidian there.
5. To make them hard to miss: Settings → Notifications → Scriptable → Sounds on, Banner Style **Persistent** (the banner stays until you swipe it). For every Focus you use during the day: Settings → Focus → the Focus → Apps → Allowed Apps → **+** → Scriptable, or it rings silently.

The script is built from `src/scriptable` by `node scriptable/build.mjs` (part of `npm run build`); a test fails when the committed script is stale.

## Development

```bash
npm install
npm test
npm run build
```

`docs/design/README.md` is the approved design, `docs/superpowers/specs/` the spec, `docs/superpowers/plans/` the implementation plan. Builds are tried in a separate Obsidian with a scratch vault, never in the real one (see `CLAUDE.md`).
