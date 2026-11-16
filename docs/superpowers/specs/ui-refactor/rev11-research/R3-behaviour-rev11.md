# R3: behaviour check of revision 11

Read-only. Worktree `.worktrees/ui-refactor-spec11` at `690a0393`; revision 10 = `13fb8008`.
Scripts: `count.py`, `show.py` in this folder (`map.json` = every row id → its traceability line).

## 1. Traceability rerun

### My own counts (parsed from the inventories' tables, not their totals)

| Inventory part | Rows I count | File's claim |
|---|---|---|
| A.1 facts | 45 | 45 |
| A.2 state locations (17 domain tables) | 565 | 565 |
| B.1 / B.2 / B.3 / B.4 / B.5 | 142 / 244 / 135 / 174 / 124 = 819 | 819 |
| B.6 event sources | 180 | 180 |
| Behaviour A (A1–A16) | 203 | 203 |
| Behaviour B (B1–B3) | 84 | 84 |
| Behaviour C (C1–C8, no C1.16) | 84 | 84 |
| Behaviour D (D1–D5) | 52 | 52 |
| **Total** | **2032** | 2032 |

Parsing every first cell of the traceability tables (ranges and comma lists expanded, prefixes carried):
2032 distinct ids mapped, **0 missing, 0 unknown, 0 mapped twice.** The "exactly one place" claim holds.

Lines that named a place's host in revision 10: I find 23 by the phrases `host block`, `block host`, `settings-tab host`, `kind: "block"` (12 settings incl. the door table's `bindClientSecret`, 11 note); the rest of the file's "31 (20 note, 11 settings)" are note lines worded otherwise (`block key scope`, `BlockHeight`, `block focus`, `projectNoteView`, observers). Plausible.

### Mappings that are not plausible

Note rows moved to shared concerns are fine (adapter + `mount` for embedding; keys, focus, inline frame, gates for the rest). The weak ones are the **settings tab** rows:

1. **B.2.171-223 (53 rows) is one lump**, "the screen at `Places.settings()`". Several of its rows have **no owner in the frozen owner table**, and under deny-by-default (G3) they cannot be written anywhere:
   - B.2.218 `navigator.clipboard.writeText` (Copy the Scriptable script) — no row names the clipboard; `outside()` is `open`/`browse`/`runScript` only.
   - B.2.211-213 `GoogleAccount.isLoggedIn/login/logout`, B.2.217 `WorkCalendarSetup.scriptableLoader`, B.2.210 `bindClientSecret` — the door table says "the settings adapter", but G2 lets an adapter import only `ScreenHost`, `place`, `obsidian`; nothing routes these host services.
   - B.2.171, 173, 221-223 and B.3.115: the tab is built from Obsidian's `Setting`, `ExtraButtonComponent`, `setIcon`, `.setHeading()`, toggles, dropdowns, sliders. No owner may construct them (`overlay` has `Menu`/`Modal` only, `editors` CodeMirror/`MarkdownRenderer`/`Component`).
   - B.2.184, 191, 194 (`showPriorityColors` / `spec.preview` across all windows) and A.2.503-508 (card size tokens on `body`, a `<style>` per document): mapped to `chrome`, but row 4 gives **every** inline style and custom-property write to `motion`, and no row lists creating a `<style>` element.
2. **A.2.501-502,509-512** says "the row reorder is a declared transition", while A15.11, B.3.114-117, B.6.92 and C3.19 say "the one carry". The reorder's state (`to`, the classes, the landing timer) belongs to `update/carry.ts` + `motion`, not to the place.
3. **B2.28 "settings rows step aside" → "the fold under a lift"** is the wrong cause. Today nothing folds: the rows the dragged row passes slide by one step (`RowReorder.ts:46-53`). `MotionCause` has no "rows step aside during a carry" member (decision 54: a carried card leaves a dashed place and "no other card moves").
4. **B.5.30,66,121 "block fit frame → `measure`", stage 3,4**: this contradicts decision 44 (the inline frame's height is the stylesheet's, nothing is measured for it), and the note is stage 5.
5. **Stale words** that read as other mechanisms: "JSX handlers → `input` Msgs" (2 lines) and "gone: Preact listeners" (A.2.547,551), against decision 45 (views take no handlers; `input` delegates by `act`); "layout component chosen by `layoutMode`" / "one layout component per `ViewChoice.layout`" (4 lines), against G1 (one `Screen` drawing `Layout.regions`).
6. **Stage 6's diff rule cannot hold.** "The same diff rule as stage 5": no pure owner but `layout`, no effect owner but `mount` and scroll's chain. The settings tab needs new kit parts (`SettingsRows`, a colour well, toggles, sliders, dropdowns), new messages (settings writes, page open/close, login, copy) and new effect reach (clipboard, the colour preview's style), none of which stage 4's regions list. Either the rule or stage 4's list is wrong.

## 2. Rewritten and revoked decisions: product before → after

| # | Product change | Declared? | Verdict |
|---|---|---|---|
| 12 | Polling only while a screen draws a calendar. With only a project note open, `calendar/google.json` stops being refreshed on that device. | Yes (old bug 5) | Matches `calendars.md` ("на каждом устройстве, где открыт календарь"). Low. |
| 19, 26, 31, 33, 35, 36, 37, 43, 57 | none (build, guards, e2e) | — | OK |
| 34, 46, 48, 58 | CSS state transitions become motion causes; same look | — | OK, if `fadeAside` keeps the old timing |
| 44, 56 | inline frame height, same rule | — | OK |
| 50, 55, 59 | same behaviour, owners renamed | — | OK |
| **51** | adds `blurEndsEntry` "on the phone". Today a blur ends the entry on **both** forms (`QuickEntryController.blurred`, desktop included, the window losing focus excepted). If the gate is off on the desktop, clicking another pane leaves the field open. | No | **Change unless the gate is on in both forms.** Medium-low. |
| **52** | the full card's project line "selects the project … gated where the filter is fixed". In a note the tap now does nothing; today it closes the card (and wrongly sets the main screen's filter). Also: `tasks.md` (Задача на весь экран) says the tap **opens the project's note in a new tab**; the code (`FullScreen.openProject` → `CalendarScreen.ts:1335-1338`) closes the card and filters to the project. Revision 11 keeps the code's version without saying the docs disagree. | No | **Undeclared change + an undecided docs/code contradiction.** Medium. Product question 1. |
| **53** | search in a note: a hidden task or one of another day opens on the full card; nothing of the main screen moves. Revision 10's 53 kept the old block's behaviour ("as the old block's"). | Yes (old bugs 1-3) | Visible in the note: today the note shows nothing new; now a full card opens. Product question 2. |
| **54** | "The carry is one, for every payload and place … the waiting place is a dashed outline". Applied literally: a **settings row** would leave a dashed place and the others would not move; today the row moves itself and the others step aside (`settings.md:9` "строка едет за пальцем, остальные расступаются"). The settings grip also starts on press with a finger (no hold); the card carry starts on a finger's hold (decision 40/54). A **tree row**: `screen.md:52` "строка едет за пальцем, линия показывает". | No | **High for settings rows**: the decision must keep each payload's look and start (row follows, others step aside, no hold on the grip). Check the tree row and timeline slot against today too. |
| 35, 43 revoked | no product effect | — | OK |

Nothing of revision 10's product behaviour is lost outright apart from 51, 52, 54 above; 53 is declared.

## 3. «Old bugs and contradictions, decided»

| # | Against `docs/plugin/` (or code where silent) | Verdict |
|---|---|---|
| 1 | Docs silent on search in a note; `screen.md:114` (clear the filter) cannot apply to a fixed project. Today: the main filter is cleared invisibly and the note shows nothing. | Fix is right for the main screen. **What the note shows instead is a product question** (Q2). |
| 2 | Invisible side effect; docs silent | OK |
| 3 | `screen.md:99`: no day navigation in a note. The decision covers a find and a written card, **not the open field**: with the bar's place set to another day, `tasks.md` says "Поле переезжает в конец выбранного … дня"; in a note there is no such day list. Unspecified. Suggest By project's rule (`tasks.md`: "поле остаётся на месте, а задача пишется в выбранный список"). | Gap, not a question |
| 4 | Invisible; docs silent | OK (technical: the note's drop must not need the core's carry state) |
| 5 | `calendars.md` "где открыт календарь" | OK |
| 6, 7, 8, 9, 10, 11 | docs wording / code agrees | OK |
| 12 | **New behaviour**: double click in By project and in a note's lists. `tasks.md:19` says "конец этой колонки"; in By project the free room is under the last section, so "which section" is undecided. | Small; decide "the section double-clicked, else the last part"; not worth Max |
| 13 | matrix cells; docs silent | OK |
| 14 | Kept, **plus a new scroll** (the note scrolls the block's top into view before the desktop search opens). Additive, declared | OK |
| missing | the full card's project line, docs vs code (see 52) | **Add to the table** |
| missing | the settings tab's look (Obsidian's own `Setting` rows today) | **Add**: keep Obsidian's look (rework keeps behaviour), say so, give it an owner |

## 4. The settings tab as a third place

Inventory rows of the settings tab: A.2.438, 501-502, 509-512 (and 503-508 as their output); B.2.171-223; B.3.114-117; B.6.62-66, 92; A15.11; B2.28; B3.25; C1.24; C3.19. All are mapped once.

Covered with a plausible owner: row reorder (carry, geometry, drop flight), wrap on narrow width (`measure`), page open/close (`overlay`'s `Modal`), notices (`hostServices`), field writes (entry), calendar toggles (door).

Not covered or at risk:
- **Look**: built with Obsidian's `Setting` components today; revision 11 draws it with kit `SettingsRows` under `.task-calendar` with a scoped reset that "neutralises Obsidian's control styles" (P7). Nothing says the native look stays, and nothing may call `Setting`.
- **No owner**: clipboard copy, Google login/logout/status, the client-secret binding, the Scriptable loader text, the colour preview's style across windows (see §1.1).
- **Reorder look and start** (§2, decision 54; B2.28's cause).
- **Keys**: `Places.settings()` has `keys: "focus"` (a `Scope`, presses kept from the host). Today the tab registers no scope. With the key table, ⌘Z in the settings could undo a **task**, and Escape (which closes Obsidian's settings) could be taken by the layer stack. Settings needs no key table (a gate), and presses must reach Obsidian.
- **Frame**: `frame: "fill"` ("each list scrolls by itself"); the tab scrolls in Obsidian's settings pane, as a note scrolls in its view.
- **The behaviour inventory has one input row for the tab (A15.11)**: the colour well's live preview ("пока двигаешь, меняется карточка рядом; сохраняется, когда закрываешь выбор"), the code field (save on blur/Enter, an invalid code reverts), swatches, bins, Add buttons, sliders, dropdowns, More's three rows, a page closing with the settings, the login row's three texts, Copy + its notice — exist only as effect rows (B.2/B.6). The G5 matrix built from the behaviour inventory will not exercise them. Add them to the inventory before stage 6.

## Product questions (plain words)

1. In a task opened full-screen, a tap on the project name under the title: should it **open the project's note in a new tab** (as the help pages say) or **show the main screen filtered to that project** (as the plugin does today)? And inside a project note's block, the same tap?
2. In a project note's block, search finds a task of **another project** or **another day**, which the block cannot show: open that task **full-screen right in the note** (the spec's choice), or **switch to the main Task Calendar tab** on that task?
