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

## The screen

Left: the tasks of the selected day (today: everything in Now that has no slot today). Right: the day’s timeline with calendar events and slotted tasks, or the Soon list (tasks without a date). Arrows change the day, a tap on the title returns to today, the divider between the columns can be dragged.

- Drag a task from the list onto the timeline to give it a time; drag it back to remove the time; drag inside the timeline to move it, pull the handle to resize it.
- Drag between the Soon list and the day list to move a task between Soon and Now (on another day: to set or remove its due date).
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
2. Google may say the app needs verification because `calendar.readonly` is a sensitive scope. You do not need to submit it: an unverified app in production keeps working for up to 100 users, the consent screen just keeps its “unverified” warning (Advanced → Go to …).
3. Log in once more in the plugin settings. Tokens issued after publishing do not expire; they are revoked only if you revoke them at <https://myaccount.google.com/permissions> or stay unused for six months.

## Work calendar (Exchange on the iPhone)

The plugin cannot read Apple’s calendars itself. A Scriptable script exports today’s and tomorrow’s events of every calendar on the phone to a JSON file in the vault; the plugin reads that file (Settings → Work calendar → File path, default `calendar/work.json`).

1. Install Scriptable, create a script named `Export Work Calendar`, paste [`scriptable/Export Work Calendar.js`](scriptable/Export%20Work%20Calendar.js).
2. Scriptable → Settings → File Bookmarks → **+** → pick the vault folder → name it `ObsidianVault`.
3. Run the script once: iOS asks for calendar access, the alert shows the number of events.
4. Shortcuts → Automation → **+** → App → Obsidian → Is Opened → Run Immediately, with the actions Scriptable “Create File Bookmark” (`ObsidianVault`, the vault folder) → Scriptable “Run Script” → `Export Work Calendar`. Add “Time of Day” automations for the hours you want refreshes at.
5. In the plugin settings, list the calendar titles to take from the file (empty: all of them), so Google calendars are not shown twice.

On the Mac the same file arrives through Obsidian Sync.

## Development

```bash
npm install
npm test
npm run build
```

`docs/design/README.md` is the approved design, `docs/superpowers/specs/` the spec, `docs/superpowers/plans/` the implementation plan. Builds are tried in a separate Obsidian with a scratch vault, never in the real one (see `CLAUDE.md`).
