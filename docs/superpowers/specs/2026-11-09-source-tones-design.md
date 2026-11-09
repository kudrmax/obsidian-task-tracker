# Source tones: the sources window says what matters

## Why

2026-11-09, Max: the sources window showed «Work calendar … 5 Nov 20:21» in orange, and the dot on the calendar button
was off. He took it for a bug. It wasn't: every calendar of the work file is also in the iPhone app's file, written
that morning, so the screen took them from there and the Scriptable file sat unused as the spare it is. But the window
painted a spare file's age in the same orange as a real problem, and the dot (which counts only the files the screen
uses) disagreed with it. «Сейчас оно путает.»

The rule now: **colour in the window means the same as the dot, and only what the screen relies on gets a colour.**
A file nothing on screen comes from is set apart as not in use and drawn in grey, whatever its age or error.

## What Max sees

Three codes, the same in the plugin's sources window and the app's Calendars screen:

| Code | When | Row | Dot on the calendar button (plugin) / badge on «⋯» → Calendars (app) |
|---|---|---|---|
| plain | a calendar on the open day comes from this file and the file is fresh | as today: time grey | none |
| **orange** | a calendar on the open day comes from this file and the file is older than Stale after | time orange (`--tc-stale`) | orange: Refresh now should help |
| **red** | as orange, and the source's last try failed (its problem: no answer, failed, …) | time orange, the problem line under the name red (`--tc-danger`) | red: Refresh was tried and failed, something needs a hand |
| not in use | no calendar on the open day comes from this file (a spare whose calendars a fresher file gives, a source with no file, Google not logged in, every calendar of it hidden) | under the caption **«Not in use»**, below the rows in use; icon, name and time in muted grey; its line (Exported from iPhone, not logged in, file missing…) grey too | none, whatever its age or error |

- The dot shows the worst code of the rows in use: red over orange. Nothing in use is old → no dot.
- A source in use with a fresh file and a failed last try (a network blip; the file is still under Stale after): plain,
  its problem line in grey. The screen is right; the next poll will try again.
- Order: rows in use first in their usual order (Google, iPhone, Work), then the caption and the rows not in use in the
  same order. All rows in use → no caption. All not in use → the caption first.
- The plugin's window: the caption is a row of its own, 13 px (`--tc-font-sub`) muted, the row padding's sides, with the
  same separator as the rows. Spare rows: icon and name muted. Everything else as on the «Источники календарей» board.
- The app's Calendars screen: the rows in use stay in «Sources»; the rows not in use go to their own Form section with
  the header «Not in use» and the footer «The timeline takes a calendar from these only when the files above go out of
  date.», right after «Sources» (Refresh Now and the access row stay in «Sources»). Orange row: orange time and the
  orange `exclamationmark.circle.fill` as today; red row: the problem line red and the symbol red. «⋯» keeps its badge and
  `calendar.badge.exclamationmark` for orange and red alike (a menu badge has one colour in iOS).

## The contract

`core/application/contracts.ts`, adding only (the door keeps its fields):

- `SourceStatus.used: boolean` — a calendar shown on the day comes from this file (the choice `CalendarChoice.day`
  already makes per calendar).
- `SourceStatus.tone: "plain" | "old" | "broken" | "spare"` — the row's code as above. The frontends draw it; they
  never combine `used`, `problem` and the age themselves.
- `DayEvents.alert: "none" | "old" | "broken"` — the dot: the worst `tone` of the rows in use.
- `DayEvents.statuses` comes in the window's order: in use first, then not in use, each in Google, iPhone, Work order.
- `SourceStatus.stale` and `DayEvents.stale` stay as they are for older callers; the frontends move to `tone` and
  `alert`. `DayEvents.stale` equals `alert !== "none"`.
- The door's wire (`PhoneCalls` `WireStatus`, `WireDayEvents`) carries the new fields.

## Docs

- `docs/plugin/calendars.md` «Окно источников»: the three codes and «Not in use» in Russian, and why a spare file's age
  doesn't matter.
- `docs/plugin/settings.md` «Stale after»: the dot is orange or red.
- `docs/plugin/app.md` (if it describes the Calendars screen): the «Not in use» section.
- `docs/design/README.md` «Источники календарей» and the palette row of `--tc-stale` / `--tc-danger`; the board
  `docs/design/canvas/Sources.dc.html` gets the caption, a spare row, an orange and a red dot.

## Decisions

(Filled by the agents as they find gaps.)

- Backend: «in use» is exactly the choice `CalendarChoice.day` makes: a source a shown calendar is taken from for the
  day, even when that calendar has no events that day. A calendar is chosen only from a file that covers the day, so a
  file whose window ends before the day is not in use.
- Backend: Google logged out with a file left from an old login that still gives a shown calendar is in use (its
  events are on screen): `old`/`broken` by its age like any other. With no file, as usual, it is spare.
- Backend: `statuses` are ordered Google, iPhone, Work by a fixed order, not by the order the host hands the files in.
