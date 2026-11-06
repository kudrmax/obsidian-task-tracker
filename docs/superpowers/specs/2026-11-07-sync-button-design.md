# Sync button: the iPhone app asks Obsidian to sync

## Why

Obsidian Sync on iOS runs only while Obsidian is on screen. The iPhone app reads and writes the tasks file in the vault
folder, so it sees nothing the Mac wrote, and the Mac sees nothing the app wrote, until Max opens Obsidian. Obsidian is
working on background sync; until it ships, a button does the round trip: the app sends Max to Obsidian, Obsidian syncs,
and Obsidian sends him back.

## What Max sees

Approved on the iPhone canvas (https://claude.ai/artifact/TW5RCK9KbJcq68BkY4G2om, page «Синхронизация»): «Вариант 1 —
кнопка рядом с «⋯»», «Что происходит после тапа», «Если не получилось». The app's name on screen is **Tasks**
(`CFBundleDisplayName`); the link scheme stays `taskcalendar`, nobody sees it.

1. The app's top bar, right side: a **Sync** button (SF Symbol `arrow.triangle.2.circlepath`) before «⋯», stock iOS 26
   toolbar glass, the two in one capsule as iOS 26 groups trailing items. Present in Inbox, Soon and Today; not in Select
   Tasks' bar.
2. A tap opens Obsidian on the vault, wherever it was. iOS shows «‹ Tasks» in the status bar by itself.
3. While it waits, the plugin shows an Obsidian notice at the top: **«Syncing… back to Tasks when done»**, kept until the
   wait ends (then hidden). Phone only.
4. When Sync has finished, Obsidian hands the phone back to the app on its own. The app reads the file again (the board
   shows the Mac's changes) and rebuilds the reminders, as after any refresh. No alert, no toast on success.
5. Sync could not finish (paused, off in this vault, an error, or 45 s passed): Obsidian still hands the phone back, and
   the app shows a stock alert: title «Not Synced», the reason as its message, an OK button.
6. Obsidian can't be opened (not installed): the same alert at once, reason «Obsidian isn't installed».
7. Max leaves Obsidian before the end («‹ Tasks», the home screen, another app): the wait is cancelled at once and the
   notice hidden; nothing hands the phone back later, when Obsidian wakes up again. The app reads the file as it always
   does when it comes to the front.

## The links (the contract between the two frontends)

- App → Obsidian: `obsidian://task-calendar-sync?vault=<vault name>`. The vault name is the one the app already keeps
  (`UserDefaults` `vaultFolderName`, as Open in Obsidian uses).
- Obsidian → app: `taskcalendar://synced` when Sync finished, `taskcalendar://synced?error=<reason>` when it didn't. The
  reason is a short English sentence the app shows as is.

Reasons the plugin sends:

| Sync's state | `error` |
|---|---|
| no Sync in this vault (plugin off, or no remote vault: `uninitialized` / `disconnected`) | `Obsidian Sync is off in this vault` |
| `paused` | `Obsidian Sync is paused` |
| `error` | `Obsidian Sync reported an error` |
| not finished after 45 s | `Obsidian Sync didn't finish in 45 seconds` |

## In Obsidian (plugin, phone only)

A protocol handler `task-calendar-sync`, registered on every platform; it hands back to the app only when
`Platform.isIosApp` (on the Mac it just asks Sync to run). What Sync exposes, read from Obsidian 1.x's `app.js`:

- `app.internalPlugins.getPluginById("sync")`: `enabled`, `instance`.
- `instance.getStatus()`: `"uninitialized" | "disconnected" | "error" | "paused" | "syncing" | "synced"`.
- `instance.on("status-change", cb)` / `offref`: fires when any of those flips and on every step's text.
- `instance.requestSync()`: returns at once when a run is going (`syncing`), else runs until nothing is left.
- `instance.ready`: false from (re)connecting until the server's first answer, which itself calls `requestSync()`.
  After the phone wakes, the old socket is dead and the next run reconnects first.

Finished means: a run that started after the link came has ended, with `ready` true and the status `synced`, and no new
run started for a short quiet time (Obsidian on the phone notices the app's own writes to the file only after it wakes,
which may start one more run). These internals are not a public API: everything goes through one adapter in
`obsidian/infrastructure` that reads them defensively (a missing field is «Sync is off»), and the waiting rule is a
class with tests over a fake Sync.

## In the app

- The Sync button opens the link; `UIApplication.open` failing → the alert of point 6.
- `taskcalendar://synced` in `onOpenURL` (next to `RefreshLink`): read the board again and run `AppServices.shared.refresh()`;
  with `error`, show the alert. Parsing the link lives in `apple/Core` with tests, like `RefreshLink`.
- No progress UI of its own: while Sync runs the app is behind Obsidian.

## Docs

`docs/plugin/app.md` (the button, the round trip, the check list), `docs/plugin/notifications.md` (the lines saying the
phone learns of the Mac's changes only after leaving Obsidian: the button is the other way).

## Decisions

- **Obsidian: the quiet time is 3 s.** After a counted run ends `synced` with `ready`, the plugin hands back only if no
  new run starts within 3 s; a run in that time restarts the count when it ends. Obsidian-only.
- **Obsidian: a run already going when the link comes doesn't count.** The plugin lets it end, then calls
  `requestSync()` itself, and that run is the one judged. Obsidian-only.
- **Obsidian: only the status a run ends with is judged.** An `error` shown mid-run (a file retry) or left over from
  before the link is ignored (`requestSync()` clears it). A run that ends with `ready` false (the reconnect hadn't had the
  server's answer) is not judged either: the plugin waits for the next run, which Sync starts on the server's answer or
  on its own 30-second timer, inside the 45 s. Outside a run, `paused` or off end the wait at once. Obsidian-only.
- **Obsidian: a second link while waiting joins the first wait**: one notice, one hand-back. Obsidian-only.
- **Obsidian: the adapter's defaults.** Without `getStatus`, `requestSync`, `on` or `offref` (or with the core plugin
  disabled, or a status it doesn't know) Sync is off. `syncing` missing → a run is going when the status is `syncing`;
  `ready` missing → taken as true, so a renamed field can't hold every tap to the 45 s. Obsidian-only.
- **Obsidian: leaving is the page's `visibilitychange` with `document.hidden` true** (what iOS fires on «‹ Tasks», home,
  another app); the wait ends with nothing opened. Obsidian-only.
- **Obsidian: on the Mac the handler only calls `requestSync()`**: no notice, no wait, nothing opened.
- **Both: the reason is percent-encoded with `encodeURIComponent`** (spaces as `%20`, the apostrophe as is):
  `taskcalendar://synced?error=Obsidian%20Sync%20didn't%20finish%20in%2045%20seconds`. The app reads the decoded query
  item (`URLComponents.queryItems`) and shows it as is.
- **App: Sync is disabled while no vault is chosen.** Without a vault folder the app has no name to send and the board
  already shows «Can’t Read Your Tasks» with Open Settings; the button greys out, as Undo does with nothing to undo.
- **App: a `synced` link with `error` reads the board and rebuilds the reminders too**, then shows the alert: a run that
  stopped partway may still have brought changes.
- **App: `error` present but empty** (`?error=` or `?error`) still means Not Synced: the alert shows its title alone.
- **The reason is read form-encoded as well:** `+` and `%20` both read as a space (`URLSearchParams` writes `+`,
  `encodeURIComponent` writes `%20`), a literal plus comes as `%2B`; spaces around it are trimmed. The plugin may use
  either encoder.
- **The vault name in `obsidian://task-calendar-sync` is percent-encoded except letters, digits and `-._~`**, so a vault
  named with `&`, `+` or `=` reaches the plugin whole; the plugin reads it with `decodeURIComponent` (Obsidian's own
  `obsidian://` parsing does).
- **App: its own reason is written with the typographic apostrophe**, «Obsidian isn’t installed», as the app's other
  strings («Can’t Read Your Tasks»); the plugin's reasons are shown exactly as they come.
- **App: no waiting state.** The app does not remember that it sent Max to Obsidian: every `synced` link reads the board,
  and coming to the front without one reads the file as on any activation (point 7).
