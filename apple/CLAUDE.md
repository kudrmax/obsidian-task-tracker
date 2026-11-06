# Task Calendar for iOS

## Installing on the iPhone

`~/Applications/Install TaskCalendar.app` (Launchpad: «Install TaskCalendar») builds `origin/master` from GitHub in Release and installs it on Max's iPhone over Wi-Fi or a cable, renewing the free 7-day signature. Max starts it with a click; Claude runs it whenever a build should reach the phone:

```bash
"$HOME/Applications/Install TaskCalendar.app/Contents/Resources/install.command"
```

Only what is on `origin/master` gets in: the installer warns about local commits that are not pushed and builds without them. So push master before running it.

## Reading the phone without opening the app

Opening Task Calendar runs a sync, which wipes the evidence of why reminders went wrong: read the phone from the Mac instead. The iPhone must be on a **cable** and unlocked (over Wi-Fi `devicectl` often reports it unavailable).

- The app's saved state (the latest sync, alarm ids): `xcrun devicectl device copy from --device <id from xcrun devicectl list devices> --domain-type appDataContainer --domain-identifier com.kudrmax.taskcalendar --source Library/Preferences/com.kudrmax.taskcalendar.plist --destination <scratch>/prefs.plist`, then `plutil -p`.
- The system log: `log collect --device-udid` needs root, so use `pymobiledevice3` from a venv in the scratchpad: `pymobiledevice3 syslog collect --start-time <epoch> <out>.logarchive`, then `log show <out>.logarchive --predicate …`.
- Shortcuts automations log in `siriactionsd` (`com.apple.shortcuts:Triggers`): `App.InFocus: BundleID: …, isStarting: …` names the app a trigger watches and says whether it fired. The intents log in the app's own process (`com.apple.appintents`: `SyncRemindersIntent.perform() finished`).
- 2026-11-06: reminders stopped updating because the «Update Reminders» automation watched Task Calendar itself instead of Obsidian closing; the log showed it in a minute.
