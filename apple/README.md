# Task Calendar for iPhone

Reminders for the Obsidian plugin [Task Calendar](https://github.com/kudrmax/obsidian-task-tracker): a task on a time rings as a silent notification or an alarm, and Done / snooze in it change the tasks file. The app has no storage of its own; it reads the file with the plugin's rules (`plugin/phone/task-calendar-phone.js`, the plugin is a submodule).

Setting it up on the phone: `plugin/docs/plugin/notifications.md`.

## Build

Xcode 26 or newer, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
git clone --recurse-submodules https://github.com/kudrmax/task-calendar-ios.git
cd task-calendar-ios
echo "DEVELOPMENT_TEAM = <your team id>" > App/Config/Team.xcconfig
xcodegen generate
open TaskCalendar.xcodeproj
```

The team id is in Xcode → Settings → Accounts (personal team). Tests of the logic: `swift test --package-path Core`.
