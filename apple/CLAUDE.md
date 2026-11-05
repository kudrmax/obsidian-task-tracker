# Task Calendar for iOS

## Installing on the iPhone

`~/Applications/Install TaskCalendar.app` (Launchpad: «Install TaskCalendar») builds `origin/master` from GitHub in Release and installs it on Max's iPhone over Wi-Fi or a cable, renewing the free 7-day signature. Max starts it with a click; Claude runs it whenever a build should reach the phone:

```bash
"$HOME/Applications/Install TaskCalendar.app/Contents/Resources/install.command"
```

Only what is on `origin/master` gets in: the installer warns about local commits that are not pushed and builds without them. So push master before running it.
