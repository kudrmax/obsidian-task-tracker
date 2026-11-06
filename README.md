# Task Calendar

A task list next to a day timeline, inside Obsidian. One markdown file is the only truth: the plugin reads it on every change and writes it back line by line, so editing the file by hand is always fine. Drag a task onto a time, see your Google and work calendars beside it. Built for the iPhone first.

**Full documentation (in Russian): [docs/plugin/README.md](docs/plugin/README.md)** — what makes this task manager different, how a day goes with it, the file, the screen, every action, settings, and how an agent should edit the tasks file. This README keeps the short English overview and the Google setup.

## The file

Default path `TODOs Tasks.md` (Settings → More → Tasks file). Second-level headings are the sections; the plugin uses three of them and leaves everything else untouched:

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
- Tap a task for its menu: status, priority, Today / Tomorrow / Pick a date, Rename, Reminder, description, Repeat, Section, Add subtask, Open in Obsidian, Delete. A long press lifts it for a drag.
- The plus adds a task right in the list: tap it, or drag it between cards or onto the timeline; Enter saves and opens the next field. A long press on an empty spot of the timeline adds a task at that time.
- Pinch to zoom the timeline; the drag step follows the grid.
- The calendar button in the switch gets an orange dot when a source is stale; with the calendar shown, a long press on the switch opens the sources window: when each was last updated, and Refresh now.

## Google Calendar

The plugin reads your Google calendars through the Calendar API (read-only). You create a Google Cloud project once; the login works the same on the Mac and on the phone, and the token syncs between your devices through Obsidian Sync (it lives in the plugin’s `data.json`, which Sync carries with “Installed community plugins”).

1. Open <https://console.cloud.google.com/>, create a project (any name).
2. APIs & Services → Library → “Google Calendar API” → Enable.
3. APIs & Services → OAuth consent screen → External → fill in the app name and your email → Save. Add your own Google account under Test users.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Web application**. Under Authorized redirect URIs add exactly `https://kudrmax.github.io/obsidian-task-tracker/auth.html` → Create. Copy the Client ID and Client secret.
5. In Obsidian, on either device: Settings → Task Calendar → More → Calendars → paste both into Client id and Client secret → Account → **Log in**. The browser opens; Google warns that the app is unverified → Advanced → Go to … → allow. Google sends the browser to the redirect page, which opens Obsidian again; a notice says you are logged in.
6. Below the login, tick the calendars you want to see.

The redirect page is [`docs/auth.html`](docs/auth.html), served by GitHub Pages: it only passes the code on to `obsidian://task-calendar`, stores nothing and talks to no one else.

### Keep the login from expiring

While the project’s publishing status is **Testing**, Google makes every refresh token expire after 7 days, whatever the app does. To stop that:

1. APIs & Services → OAuth consent screen → **Publish app** → Confirm. The status becomes **In production**.
2. If the console asks for the app's details first (Branding): home page `https://kudrmax.github.io/obsidian-task-tracker/`, privacy policy `https://kudrmax.github.io/obsidian-task-tracker/privacy.html`, authorized domain `kudrmax.github.io`; both pages live in [`docs/`](docs/). Google may say the app needs verification because `calendar.readonly` is a sensitive scope. You do not need to submit it: an unverified app in production keeps working for up to 100 users, the consent screen just keeps its “unverified” warning (Advanced → Go to …).
3. Log in once more in the plugin settings. Tokens issued after publishing do not expire; they are revoked only if you revoke them at <https://myaccount.google.com/permissions> or stay unused for six months.

## Work calendar (Exchange on the iPhone)

The plugin cannot read Apple’s calendars itself. A Scriptable script exports the events of every calendar on the phone, from yesterday to two weeks ahead (meetings you declined left out), to a JSON file in the vault; the plugin reads that file (Settings → Work calendar → File path, default `calendar/work.json`).

The export itself comes with the plugin and updates with it; Scriptable holds only a short script that runs it, pasted once. Setup, step by step, with how to check it: [docs/plugin/work-calendar.md](docs/plugin/work-calendar.md).

## Reminders (iPhone)

A task put on a time reminds at its start, on the phone, through the Task Calendar iPhone app in [`apple/`](apple/), which reads the tasks file with the plugin's own rules: it runs the same core (`phone/task-calendar-phone.js`, built from `src/phone`) in JavaScriptCore. The marker before the time picks the kind: `⏰` a quiet notification that repeats until Done or a snooze, `🚨` an alarm, `🔕` none. Due dates alone do not remind.

Setup, step by step: [docs/plugin/notifications.md](docs/plugin/notifications.md).

## Development

One repository, one core, several frontends. The core (`src/domain`, `src/application`, the door in `src/phone`) is TypeScript; the Obsidian plugin bundles it into `main.js`, and the Apple apps in `apple/` run it in JavaScriptCore as `phone/task-calendar-phone.js`. The rules of the tasks file exist once, in the core.

```bash
npm install
npm test             # the core and the plugin
npm run test:apple   # the Swift side, against the same core
npm run build
```

### The iPhone app

Xcode 26 or newer, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cd apple
echo "DEVELOPMENT_TEAM = <your team id>" > App/Config/Team.xcconfig
xcodegen generate
open TaskCalendar.xcodeproj
```

The team id is in Xcode → Settings → Accounts (personal team).

`docs/plugin/` is the plugin's documentation (setup guides), `docs/design/README.md` is the approved design, `docs/superpowers/specs/` the spec, `docs/superpowers/plans/` the implementation plan. Builds are tried in a separate Obsidian with a scratch vault, never in the real one (see `CLAUDE.md`).
