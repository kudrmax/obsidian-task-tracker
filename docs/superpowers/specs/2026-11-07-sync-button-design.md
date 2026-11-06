# Sync button: the iPhone app asks Obsidian to sync

## Why

Obsidian Sync on iOS runs only while Obsidian is on screen. The iPhone app reads and writes the tasks file in the vault
folder, so it sees nothing the Mac wrote, and the Mac sees nothing the app wrote, until Max opens Obsidian. Obsidian is
working on background sync; until it ships, a button does the round trip: the app sends Max to Obsidian, Obsidian syncs,
and Obsidian sends him back.

## What Max sees

1. The app's top bar, right side: a **Sync** button (SF Symbol `arrow.triangle.2.circlepath`) before «⋯», stock iOS 26
   toolbar glass, the two in one group as iOS 26 groups trailing items. Present in Inbox, Soon and Today; not in Select
   Tasks' bar.
2. A tap opens Obsidian on the vault. Obsidian's own sync icon spins; the plugin adds nothing on screen while it works.
3. When Sync has finished, Obsidian hands the phone back to the app on its own. The app reads the file again (the board
   shows the Mac's changes) and rebuilds the reminders, as after any refresh.
4. Sync could not finish (paused, off in this vault, an error, no network, or 45 s passed): Obsidian still hands the phone
   back, and the app shows a stock alert: title «Not Synced», the reason as its message, an OK button.
5. Obsidian can't be opened (not installed): the same alert, reason «Obsidian isn't installed».

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

- The Sync button opens the link; `UIApplication.open` failing → the alert of point 5.
- `taskcalendar://synced` in `onOpenURL` (next to `RefreshLink`): read the board again and run `AppServices.shared.refresh()`;
  with `error`, show the alert. Parsing the link lives in `apple/Core` with tests, like `RefreshLink`.
- No progress UI of its own: while Sync runs the app is behind Obsidian.

## Docs

`docs/plugin/app.md` (the button, the round trip, the check list), `docs/plugin/notifications.md` (the lines saying the
phone learns of the Mac's changes only after leaving Obsidian: the button is the other way).

## Decisions

(filled by the frontends)
