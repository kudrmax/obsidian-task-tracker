# C. One screen, several places: the map

Goal: the UI is **one screen built once**. Each place it appears in is that screen with a different **`Place`**, and a `Place` is pure data. This file lists every region and feature, says where it appears, lists every difference in behaviour (not only in looks) between places and platforms, and says whether the difference can be data. It ends with a closed `Place` type.

Sources, in order of authority: `docs/plugin/*` (cited `screen.md:N`, `tasks.md:N`, `README.md:N`, `calendars.md:N`), `docs/design/README.md` (`design:N`), the specs (`2026-11-12-projects-one-view-design.md` decisions cited `D<n>`; `2026-11-15-ui-refactor.md` cited `R-spec`), `docs/superpowers/specs/ui-refactor/inventory-behaviour.md` (cited `inv A2.11` etc.), and the code in the `ui-refactor` worktree (cited `path:line`; `ui/` = `obsidian/ui/`, `core/` = `core/application/`).

## 0. The places and the axes

| Place | Host | How it is made | What it reads |
|---|---|---|---|
| **Main screen, desktop** | Obsidian leaf (`TaskCalendarView`, `ItemView`), also in a popout window | ribbon icon / command «Open Task Calendar» (`obsidian/main.ts:66-67`); several tabs allowed, all share the device state (`screen.md:3`) | `tasks.funnelView(wide=true)` (`CalendarScreen.ts:1444`) |
| **Main screen, phone** | the same leaf in Obsidian mobile | same | `funnelView(wide=false)` |
| **Note block, desktop** | `.tc-project-block` inserted into a Markdown view: after `.cm-contentContainer` in Live Preview, first in `.mod-footer` in Reading view (`ProjectBlocks.ts:160-176`) | one per Markdown view whose note is attached to a project (`ProjectBlocks.ts:127-145`; the core's `projectNoteView(path) !== null`; `D7` says how a note belongs to a project) | `tasks.projectNoteView(path, wide=true)` (`TaskReads.ts:191-199`) |
| **Note block, phone** | same, Obsidian mobile | same | `projectNoteView(path, wide=false)` |

Today the code has **three different axes**, mixed together:

1. **Which place** — `ScreenPlace { view: boolean; keys?: Scope; note?: () => string }` (`CalendarScreen.ts:103-111`). In practice `note !== undefined` decides almost everything, and `view` is only used for `is-block`, the head lead and the panel (`CalendarScreen.ts:325, 1481, 1585`). The comment on `view` («a note's block doesn't [show the undo capsule]») is stale: the capsule is built for every place (`CalendarScreen.ts:433-438`), and docs and `D29` put Undo in the block.
2. **Form factor** — `!body.classList.contains("is-mobile")`, read in six places (`CalendarScreen.ts:264, 409, 856, 1449`, `ProjectBlocks.ts:132`) and in CSS (`body.is-mobile` / `body:not(.is-mobile)`, about 40 rules). The core calls it `wide` (`contracts.ts:1394-1411`). It is **not a width**: an iPad is `is-mobile`, so it is "phone"; a narrow desktop sidebar leaf is "wide". The only measured width rule is the docked panel giving way below 390 (`D79`).
3. **Input kind per event** — `e.pointerType === "mouse"` (`Swipe.ts:179`, `LongPress.ts:88`, `PinchZoom.ts:67`, `FreeRoomDoubleClick.ts:13`, `PlusButton.ts:61`, `DragController.ts:150, 173, 188`), plus modifier keys (`Platform.isMacOS ? metaKey : ctrlKey`, `CalendarScreen.ts:265`).

Axis 3 is input, not configuration: it stays a field of each gesture message (an iPad with a mouse, a Mac with a touch screen). Axes 1 and 2 are the `Place`.

The core already returns much of the per-place answer as data: `FunnelView.panel` (null in a note), `filter.clearable`, `topRow`, `searchPaths`, `plus`, and `ViewChoice.{modes, wheel, ribbon, layout, context, plates, subprojects}`, where `layout` already drops the timeline column and sets `stack.scrolls=false` for a note (`viewLayout.ts`). **The `Place` must feed the core these inputs and not repeat its answers.** Today it passes two booleans, `wide` and `note`.

Legend used below: **D** = desktop, **P** = phone; "yes / no" = the feature appears in that place. **Data?** — `✓ data` (the difference already is or can be a field), `core` (already a field of the core's answer), `input` (a per-event fact, not a Place field), `✗` (does not reduce to data; see §2), `bug?` (most likely an accident of the old code; see §3).

---

## 1. Inventory

### 1.1 Frame, header, modes

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Opening | ribbon icon, command | same | made by itself when a note attached to a project is shown, in Live Preview and in Reading view; never written into the note; gone when the note stops being a project's | same | `screen.md:3, 99`; `ProjectBlocks.ts:119-183`; inv A1.3 | ✗ host adapter (§2.1) |
| Several instances | several tabs and popouts, which share device state; card size and status bar room per window | tabs | one block per Markdown view showing the note | same | `screen.md:3`; inv A1.4; `ProjectBlocks.ts:84-90` | host |
| Size | fills the leaf; each list scrolls by itself | same | as tall as its content, up to `--tc-block-max-h: min(640px, 78vh)`; past that the stack scrolls as one; the 12-px inset frame with a hairline and radius 14 | same | `screen.md:99`; `D29, D80, D82`; `styles.css:398, 1710-1719`; `BlockHeight.ts` | ✓ `frame` (+ core `stack.scrolls`) |
| View modes offered | Two columns, All columns, Rows, By project | Columns («Columns»), Rows, By project | Rows, By project | Rows, By project | All columns is wide-only; the label is «Columns» when narrow; a note offers no ribbon (`viewModes.ts:42-45, 81`); `screen.md:83-88, 99`; `D5, D6` | core (from `wide`, `note`) |
| Default and kept mode | Two columns; `state.view`, one for every filter | same | Rows; `state.noteView`, one for every note | same | `viewModes.ts:48-56`; `D49`, `D6` | core (slot chosen by `view.source`) |
| A kept mode that is not offered falls back | All columns kept on desktop, opened on phone → Columns | — | — | — | `D5`, inv D1.13 | core |
| Subprojects row in the view menu | yes, for a project/folder with subprojects | yes | yes, the same device setting | yes | `screen.md:95, 99`; `viewModes.ts:88`. The block's `firstView` passes `branches: false` (`TaskReads.ts:204`, `viewModes.ts:108`), so the menu lacks the row before the first read | core (bug? minor) |
| Top row (folder button, filter title) | when a filter is set or the mode has no column titles | same | never | never | `D22`; `FunnelView.topRow` (`contracts.ts:1170`); `TaskReads.ts:198` | core |
| Folder button / head lead | yes | yes | no | no | `CalendarScreen.ts:1481-1486, 1583-1585` | ✓ `tree` |
| Filter title and cross | title + cross; tapping the title opens the project menu (Rename, Folder, Attach note, Delete) | same | no title, no cross, no project menu | same | `screen.md:39, 61-66, 99`; `filter.clearable=false` (`TaskReads.ts:198, 228`); `buildPanel` skipped (`CalendarScreen.ts:1585`) | ✓ `filter` + core `clearable` |
| Folder marks on cards | yes without a filter; hidden under a filter | same | hidden (the filter is always set) | same | `screen.md:42, 147` | core (follows from the filter) |
| Done / done project drawn by project whatever the mode | yes | yes | yes, if the note's project is done | yes | `screen.md:59`; `viewChoice` `closed` | core |
| Missing tasks file | box «No tasks file at …» + Create file | same | no block (`projectNoteView` is null without a file) | same | `contracts.ts:1398-1400`; inv D4.2 | core |
| Context change drawn still | filter, mode, Subprojects | same | mode, Subprojects | same | `viewContext` adds `"note"` instead of the node (`viewModes.ts:63-66`); `screen.md:94`; `D52` | core |
| Theme | follows Obsidian; event colours per theme | same | same | same | `screen.md:162` | chrome (not Place) |

### 1.2 Calendar: timeline, events, day

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Timeline column | in Two columns (Now–calendar), All columns, Rows, By project | same, except All columns | **no** | **no** | `screen.md:99` («календаря нет»); the core drops the column (`viewLayout.ts` `note ? []`). The old screen still **builds** `.tc-right`, the timeline and the all-day rows, and hides them with CSS (`styles.css:1713`); `DayData` still fetches events for a block (`CalendarScreen.ts:229`) | ✓ `calendar` (bug?: built and hidden) |
| Google / work events, all-day rows, event menu | yes | yes; Open in Calendar opens at the start time on iPhone, on the day with a search on Mac | no | no | `calendars.md:64` (the D/P difference is in `outside()`, not the screen) | ✓ `calendar`; the D/P open is host |
| Now line, overdue tasks riding it | today | today | no | no | `screen.md:137` | ✓ `calendar` |
| Zoom | Ctrl/⌘+wheel, trackpad pinch | two-finger pinch | no | no | `screen.md:138`; inv A4.12-13 | input + ✓ `calendar` |
| Snap step by zoom | 30/15/5 min | same | — | — | `screen.md:139` | — |
| Task block on the timeline: menu | click | tap | — | — | inv A4.1 | — |
| Task block: select + stretch dots | right click, or a mouse held for the delay | long press (haptic), and a move > 8 px hands off to a drag | — | — | inv A4.4-4.9 | input |
| Task block: drag | mouse past 4 px, at once | after the long press | — | — | inv A4.5-4.6 | input |
| Task block: double click → Rename | yes | no | — | — | inv A4.2 | input |
| New slot by a long press on empty canvas | long click / drag | long press | — | — | `tasks.md:18`; inv A4.11 | input |
| Day navigation (‹ › and title → today) | over the day column (Two columns) or over the timeline (other modes) | same; the arrows are narrower | **no** (the `.tc-head` is hidden, `styles.css:1713`) | no | `screen.md:126-127`; `styles.css:1669` | ✓ `days` |
| Day turned by a swipe | Two columns, trackpad | Two columns, finger | no | no | `screen.md:93, 124` | core `ribbon` + input |
| **The block's day list** | — | — | the 4th row is the selected day: **today**. The quick bar's Date (`QuickEntryController.ts:744-757` → `showDay` → `select`, `CalendarScreen.ts:420-423`) and a search find on another day (`CalendarScreen.ts:886`) **change the block's day, with no arrows to come back** until a reload or the day boundary | same | — | **bug?** → `days: "today"` (§3) |
| Calendar sources (wheel long-press, dot) | with the wheel | with the wheel | no wheel | no wheel | `screen.md:107-108`; `calendars.md:50` | core `wheel` |
| Opening anchor (now at the middle, other days at the hour from settings) | yes | yes | — | — | `screen.md:134` | — |

### 1.3 Ribbon, wheel, swipe, dividers

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Ribbon (Inbox–Soon, Soon–Now, Now–calendar, days on the right, Done on the left) | Two columns | Columns | no | no | `screen.md:7-26, 116-128`; `ViewChoice.ribbon = twoColumns && !note` | core |
| Halves at Inbox and Soon, divider only at Now–calendar | yes | yes (guarded in the app by `RibbonColumns`) | — | — | `screen.md:25`; CLAUDE.md «asked twice» | core rule |
| Wheel | Two columns; arrow keys when focused | Two columns; it sits off-centre right, beside the view button between Undo and plus | no (view button alone) | no | `screen.md:90, 101-108`; inv A7.13; `styles.css:1638-1641` | core `wheel`; position ✓ `form` |
| Swipe | two-finger trackpad sweep (60 px in 100 ms, glide ignored) | finger, one step per swipe, `swipeLanding` | none, no rubber band | none | `screen.md:93, 124`; `D28, D63`; inv A7.1-7.3 | core `layout.swipe` + input |
| Rubber band past the end | yes | yes | no | no | `screen.md:93` | core |
| Ribbon divider (Now–calendar) | drag, slow-near-middle snap with a tick | same, haptic tick | — | — | `screen.md:25`; inv A8.1-8.2 | — |
| Still layouts' divider before the timeline (All columns, Rows, By project) | yes | **yes** (code: `StillLayout.ts:60-75` with no platform check; `screen.md:87` «Rows везде … за разделителем») | no (`viewLayout` `divider: !note`) | no | inv A8.3 marks it D only: an error in the inventory | core `layout.divider` |
| Share saved per device, shared by Two columns and All columns | yes | yes | — | — | `D25` | — |
| Done column (search only) | Two columns | Columns | no: a Done find opens on the full card | no | `screen.md:114`; `CalendarScreen.ts:884` | core `ribbon` |
| Funnel place kept on the device | written by the wheel, swipe, search | same | **written too** by a search reveal (`CalendarScreen.ts:887` `setMode` → `setFunnelPlace`), which moves the **main screen's** place from inside a note | same | **bug?** → `writesPlace` (§3) |

### 1.4 Projects panel and filter

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Panel | docked on the left, slides in and moves the columns with it; «Projects» title; tree divider (width kept); stays until the button closes it; gives way below 390 | slides over the lists from the left, the rest dimmed, under the bottom row; a pick closes it; tapping the dim closes it | none | none | `screen.md:33-37`; `D23, D26, D64, D79`; `panel.docked = wide`, `dimCloses` (`TaskReads.ts:178`) | core (from `wide`) + ✓ `tree` |
| Tree rows: tap, fold, long-press lift (project reorder / nest) | mouse drag lifts | long press lifts | — | — | `screen.md:45-52`; inv A9.4 | input |
| Card held at the left edge brings the panel out for that carry | (edge reported; the core acts only when narrow) | yes | — (CarryReport runs only with a panel: `CalendarScreen.ts:293`) | — | `tasks.md:143`; `D20, D27`; `CarryReport.ts:42-49` | core + ✓ `tree` |
| Card held over a row for 600 ms opens it | yes | yes | — | — | `tasks.md:144-148`; `D11, D39, D65` | — |
| Carry state | `startCarry(start, wide)` | same | **also started** for every drag in the block (`CalendarScreen.ts:1043-1046`), writing the device's carry, whose `under` is the **main screen's** filter | same | bug? harmless today → `tree` gates the carry (§3) |
| Search find hidden by the filter clears the filter | yes (`screen.md:114`) | yes | **clears the main screen's filter** (`CalendarScreen.ts:881` `clearProjectFilter`), while the block stays on its project and the found card is not there | same | **bug** → `filter: "fixed"` (§3) |

### 1.5 Lists, sections, subprojects

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Funnel lists: Inbox over Backlog, Soon, the day list | per mode | per mode | in Rows: Inbox, Backlog, Soon, Today, each with a small label | same | `screen.md:91, 99` | core `layout.columns` |
| Rows heights | lists share the room; each scrolls and ends on a whole card; the entry room rule (`D59, D69`) | same; the phone keeps room over the bar | each list as tall as its cards; the stack scrolls as one inside the frame; no drop room under a carried card | same | `screen.md:91`; `D29, D80, D82`; `RowsLayout.ts:29-30, 65-67, 98, 112, 215, 228` | core `stack.scrolls` |
| Row entry room | the capsule's room under the field | room over the bar at the list's end | as on desktop; the keyboard room is 0 (`styles.css:1711`) | the keyboard room is 0 | `styles.css:1698-1700, 1711` | ✓ `form` × `frame` (P block unverified, §3) |
| By project parts | the node's parts; without a filter, by top project, No project last; timeline beside | same | the note's project alone, the whole width | same | `screen.md:54-59`; `ByProjectLayout.ts:10-11` | core |
| «No tasks» plates | under a filter and in Rows; none in Two or All columns without a filter | same | always (the filter is always set) | same | `ViewChoice.plates`; `D18, D37` | core |
| Sections: tap header → menu; lift by long press / drag | mouse drag | long press | same as main | same | `tasks.md:99-104`; inv A3 | input |
| Subtask fold by a tap on the counter | yes | yes | yes | yes | `tasks.md:114` | — |
| Edge fades on scroll | lists, timeline, tree | same | the stack's fade; the foot fade backs the controls | same | `screen.md:27`; `D80` | ✓ `frame` |
| Double click on free room → new task at the end | funnel lists (`FunnelLists.ts:75`), mouse only | — | Rows' lists, mouse | — | `tasks.md:19`; not attached in By project (`ByProjectLayout` has none): an accident, undocumented | input; bug? minor |

### 1.6 Cards, full card, entry, menus, search, selection

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Card tap → task menu | click; right click; double click (second press within 250 ms) → Rename | tap | as main D | as main P | `tasks.md:3, 52`; `screen.md:163-164`; inv A2.1-2.5 | input |
| Folder mark tap → filter by that project; tooltip | hover tooltip on Mac | — | no mark (filtered) | — | `screen.md:147`; `TaskCard.ts:108-116` | core + input |
| Lifted copy title selectable | mouse drag | long press + handles | same | same | `tasks.md:45` | input |
| Task menu, its pages (Section, Project, Repeat, date, reminder), confirmations | Enter confirms, Escape closes | — | same | same | `tasks.md:45-66`; inv A12 | input (keys) |
| Menus' host | body overlay over the window (`Overlay.ts:58-87`) | same | same: menus leave the block | same | — | — |
| **Full card** | over the view; on Mac a centred column | over the view | `.tc-sheet` is `position:absolute; inset:0` in the screen root (`styles.css:1465`, `FullScreen.ts` root = `contentEl`): **confined to the block's frame**, at most 640 px / 78 vh tall | same | `tasks.md:155-172`; `design:361` | ✗ / bug? → `sheets` (§2.4) |
| Quick entry field | in place; Tab / Shift+Tab, Escape, Option+Tab; the **capsule** bar beside the field | buttons in the **bar over the keyboard**; a blur from closing the keyboard ends the entry | as main D | as main P, with `--tc-keyboard-room: 0` | `tasks.md:23-39`; `README design:249-277`; inv A13.3-13.14, A15.9; `QuickBar.ts:139-141` | ✓ `form` (two bar components chosen by data) |
| Quick bar Place → other day | turns the wheel; opens the day | same | turns nothing (no ribbon) but **opens the day in the block** | same | `QuickEntryController.ts:744-757` | bug? → `days` |
| Plus: tap | the day column's end (Inbox at Inbox–Soon); in By project the node's part | same | Rows: Today's end; By project: the note project's part | same | `tasks.md:15`; `QuickEntry.ts:452-460` (shown lists, not the device place) | core |
| Plus: drag into lists / timeline / tree | all | all; the left edge brings the panel out | lists only | lists only | `tasks.md:16-17, 152`; `PlusChoice` | core `plus` + ✓ `calendar`, `tree` |
| Search | ⋯ → Search, ⌘F; a panel at the top centre over the view; arrows + Enter | a field over the keyboard, results above it, Cancel | ⌘F while the block holds the focus; the panel hangs from the **block's** top, its room the block's height (`SearchWindow.ts:136-142`) | as main P | `tasks.md:204-212`; inv A11.8-11.12 | ✓ `form`; placement → `sheets` |
| Search shows project paths | under a filter | same | always (`searchPaths: true`, `TaskReads.ts:198`) | same | `tasks.md:153` | core |
| Search reveal | goes to the find's place/day, rings it, clears a hiding filter | same | **see bugs**: moves the main screen's place, clears the main screen's filter, changes the block's day | same | `CalendarScreen.ts:872-890` | bug → §3 |
| Select tasks (⋯) | yes | yes | yes | yes | `tasks.md:188-193` | — |
| ⌘-click / Shift-click selection and the bulk menu beside the column | yes (`BulkController.desktop()` = `!is-mobile`) | no | yes | no | `tasks.md:195-200`; `design:304` («только десктоп») | ✓ `form` |
| Undo | capsule; ⌘Z/⌘⇧Z while the leaf is active | capsule | capsule; ⌘Z/⌘⇧Z/⌘F only while the focus is in the block (pushed `Scope`; the note's editor never sees them) | capsule | `tasks.md:216-220`; `ProjectBlocks.ts:31-70` | ✗ host keys (§2.1) |
| Hover styles, focus rings | yes | no | yes | no | `styles.css:785-789` | ✓ `form` |
| Haptics | none | Capacitor light impact | none | yes | `haptics.ts` (chosen by what the host has, not the place) | host |

### 1.7 Drag between lists, sections, calendar, tree

| Feature | Main D | Main P | Block D | Block P | Behaviour differences (cite) | Data? |
|---|---|---|---|---|---|---|
| Lift | mouse past 4 px at once | long press (setting, 250 ms) + haptic; a move > 8 px first cancels it; a second finger cancels it | same | same | `tasks.md:72`; inv A2.11-2.14 | input |
| Targets | lists, section plates, column titles, timeline, tree rows | same + left edge | lists, plates, Rows labels? (titles exist only as `titleOf`), no timeline, no tree | same | `tasks.md:72-92`; inv A6 | ✓ `calendar`, `tree` + core layout |
| Auto-scroll at an edge | list / timeline scroller | the bottom edge is the wheel row's top | the block's stack scroller. **The note's own scroller is never scrolled**: a card held at the window's edge while the block runs off-screen does not bring the rest of the block in (not verified on screen) | same | `AutoScroll.ts:17-22`; `D70` | ✗ geometry of the host (§2.2) |
| Drop room under the finger | Rows: at the list's end, inside its scroll | same | none (`D82`) | none | `RowsLayout.ts:65-67` | core `stack.scrolls` |
| Flights (drop, back, sink into a folded header) | yes | yes | yes | yes | `tasks.md:74` | — |
| Section lift | yes | yes | yes | yes | inv A3.2 | — |
| Carry to the tree, hover-open | yes | yes, plus the edge | no | no | `tasks.md:143-148` | ✓ `tree` |

### 1.8 Animations (only where places differ)

All B-table motions (inv B1-B3) run the same in every place where their region exists. The differences:

| Motion | Main D | Main P | Block | Data? |
|---|---|---|---|---|
| Strip scrub, wheel settle, `is-switching` (B1.17, B2.3-2.7, B2.33, B3.1-3.4, B3.19-3.20) | Two columns | Columns | never (no ribbon) | core `ribbon` |
| Day slide (B3.2) | yes | yes | never | ✓ `days` |
| Panel: docking slide with the columns (B2.32-2.33, B3.21) | yes | — | — | core `docked` |
| Panel: overlay slide + dim (B2.30-2.31) | — | yes | — | core |
| Quick bar ride on the keyboard (B2.25, B3.9) | — | yes | phone: keyboard room 0 | ✓ `form` × `frame` |
| Desktop capsule appear/leave (B1.11-1.12, B2.26) | yes | — | desktop | ✓ `form` |
| Search open/close (B2.29) | panel | sheet | as the platform; placed over the block | ✓ `form` |
| Rows height transitions (B2.35-2.36, B3.22) | rows share the room | same | rows grow; the block's height follows by `BlockHeight` observers (C1.17) | core `stack.scrolls` + host |
| Timeline motions (B1.6-1.8, B3.12, B3.24, B3.26) | yes | yes | never | ✓ `calendar` |

---

## 2. Differences that do not reduce to data, and proposals

**2.1 Embedding and keys (host, not Place).** The leaf is an `ItemView`. Its keys belong to its `Scope` while the tab is active. The block is a DOM node that the plugin places into CodeMirror's sizer or Reading view's footer, then re-places on mode and page changes (`ViewWatch`) and lifts by Live Preview's `padding-bottom` (`--tc-block-lift`). It stops `mousedown/click/dblclick` from reaching the editor and pushes its `Scope` on focus-in and pops it on focus-out (`ProjectBlocks.ts:31-70, 160-176`). This is lifecycle and DOM plumbing, so it cannot be a field.
*Proposal:* the two **host adapters** (`next/host/leaf`, `next/host/noteBlock`, as R-spec P8 already plans) own all of it. They mount the same `Screen` with a `Place` value, and they send `placeChanged` (the note renamed, `ProjectBlocks.ts:100-103`) and `keys` messages. `Place` names the key policy (`keys: "tab" | "focus"`) only so that the `keys` driver can pick one of its two behaviours.

**2.2 Outer scroll and height.** The block is inside the note's scroller. Its height is its content's (`BlockHeight` measures the children, not `scrollHeight`, `D80`), and the note scrolls past it. Auto-scroll and reveal-into-view therefore have two scrollers to reach: the block's stack, then the note's. Today only the inner one is handled. This is geometry (R-spec P4), not configuration.
*Proposal:* `Place.frame = "inline"` tells the `measure` and `scroll` drivers to report the host scroller's rect as a geometry input, and to chain an auto-scroll that has hit the stack's end to the host scroller. The height constraint (`maxHeight`) is a measured input too: a CSS token (`--tc-block-max-h`) read by `measure`, not a number in `Place`.

**2.3 Phone vs desktop chrome components.** Bar over the keyboard vs capsule beside the field, search sheet vs top panel, overlay vs docked tree. These are not parameters of one component: they are two components. They reduce to data only as a choice, `form`, which the view switches on. Their inner behaviours (blur ends the entry on the phone, `QuickEntryController.ts:804-808`; arrow keys in the desktop search) stay inside each variant. This is legitimate. **Rule to adopt:** `form` picks the chrome variant; `pointer` (per event) picks gesture recognition. Today `BulkController.desktop()` decides ⌘-click by `form` while the drag decides by `pointer`. Both must hold: a modifier click needs a keyboard (`form=desktop`) and a mouse event.

**2.4 Sheets confined to the block.** The full card and the desktop search are placed relative to the screen root, so in a block they live inside a frame of at most 640 px and 78 vh. A long description or subtask list becomes a scroll inside a scroll, and the search hangs from wherever the block's top is, which may be off-screen. No doc or board shows a full card in a block (`T6Note`/`D5Note` show the block itself). This is not a deliberate difference.
*Proposal:* `Place.sheets: "screen" | "host"`. `"host"` mounts the full card and the search over the enclosing Obsidian view (the Markdown leaf's content). Whether it should look like that is a **design question for Max**, because no board shows a full card opened from a block.

---

## 3. Doc vs code contradictions and likely bugs

The block shares the device's `ProjectsScreenState` with the main screen, and the old code lets it write fields it has no business writing:

1. **A search in a block clears the main screen's filter** (`CalendarScreen.ts:881`): `filterHides(item, noteNode)` → `clearProjectFilter()`. The block keeps its project (`projectNoteView` ignores `selected`), so the find is still not shown, and the main screen has lost its filter. Doc: `screen.md:114` says a hiding filter is cleared, which cannot apply to a fixed filter. *Fix:* `filter: "fixed"` → a find the block cannot show opens on the full card, as a Done find already does without the ribbon (`CalendarScreen.ts:884`).
2. **A search in a block moves the main screen's funnel place** (`setMode` → `setFunnelPlace`, `CalendarScreen.ts:887, 815`). The same happens in the main screen's Rows / All / By project modes, where it silently changes the place Two columns will return to. *Fix:* `writesPlace` is false in the block, and the core takes the place only when `ribbon` is true.
3. **The block's day can be moved away from today, with no way back**: the quick bar's Date and a search find on another day call `select(date)` (`CalendarScreen.ts:420-423, 886`), but the block has no arrows (`styles.css:1713`). *Fix:* `days: "today"` → the write lands and the field goes to the end of Today, or the task is shown by a ring/notice. This needs a product decision only if Max wants to see other days in a block.
4. **The block starts carries** in the device's carry state for every drag (`CalendarScreen.ts:1043-1046`), with `under` = the main screen's filter. CarryReport is gated by the panel, so the panel never comes out, but a block drag and a main-screen drag in another tab overwrite each other's carry. *Fix:* a carry is started only when `tree` is true.
5. **The block builds a hidden calendar**: `.tc-right`, the timeline, the all-day rows and `DayNav` are built and then hidden by `.is-note > :is(.tc-right, .tc-head, .tc-divider) { display:none }` (`styles.css:1713`), and `DayData` fetches events for it. *Fix:* with `calendar: false`, none of these are rendered.
6. **Stale comment**: `ScreenPlace.view` says the block has no undo capsule (`CalendarScreen.ts:105`). The code builds it for every place (433-438), and `D29` and `screen.md:99` put Undo in the block.
7. **`screen.md:39` vs `D22`**: the doc says that without a project the folder button stands in the column titles' row and there is no extra row. `D22` and the core (`topRow`) also show the top row in modes without column titles (Rows, By project) without a filter. The doc misses that case.
8. **`screen.md:99` lists the block's bottom row as «отмена, кнопка вида и плюс»**. `D29` and the code also have ⋯ (Search, Select tasks) in the Undo capsule. The doc omits it.
9. **The inventory** (`inv A8.3`) marks the still layouts' divider desktop-only. The code (`StillLayout.ts:60-75`) and `screen.md:87` have it on the phone too.
10. **`wide` is a platform, not a width**: an iPad gets the phone's overlay panel and no All columns, and a narrow desktop sidebar leaf gets a docked panel (it gives way only below 390, `D79`) and is offered All columns. The docs only say «Mac» and «телефон», so this is not a contradiction, but the name misleads. Keep the rule and rename the input `form`.
11. **The block's first frame** lacks the Subprojects row (`firstView` with `branches: false` for a note, `TaskReads.ts:204`).
12. **Double click on free room** works in funnel and Rows lists but not in By project parts (`FunnelLists.ts:75` only). `tasks.md:19` says «колонки», so this is undocumented either way.
13. Not verified on screen: the phone block's quick bar with `--tc-keyboard-room: 0` (`styles.css:1711`), and auto-scroll of the note during a block drag (§2.2). Both need the phone check in the test Obsidian.

---

## 4. The `Place` type

Design rules:

- `Place` holds what the **host** knows. What the **core** decides from it (offered modes, the panel's docking, top row, wheel, ribbon, plates, layout columns, `stack.scrolls`, plus targets) stays in the core's answer, and the screen never re-derives it.
- The core's `(wide, note)` booleans become `place.form` and `place.view` passed through the door.
- No field is a component or a callback. A note's path is data, and a rename arrives as `placeChanged`.
- No field reads like «isBlock». Each field names **one capability**, so the screen asks «is there a calendar?», never «am I a note?».

```ts
/** Where the one screen is shown. Closed, pure data; made by a host adapter, changed only by `placeChanged`. */
export interface Place {
	/** The host's form factor (Obsidian's `is-mobile`; an iPad is "phone"). Passed to the core as `wide`, which picks the
	 * offered modes («Columns» vs «Two columns», All columns), the docked or overlay panel and the narrow top row; picks the
	 * chrome variants: keyboard bar vs desktop capsule, search sheet vs panel, hover and focus rings, ⌘-click selection.
	 * Never decides a gesture: the pointer kind travels with each event. */
	readonly form: "phone" | "desktop";

	/** What the screen reads and which device slot its mode lives in.
	 *  funnel: `funnelView`, the device's chosen node as the filter, `setViewMode` (state.view).
	 *  note:   `projectNoteView(path)`, the note's project as a fixed filter, `setNoteViewMode` (state.noteView);
	 *          the core then offers Rows and By project only, drops the timeline column and makes the rows grow (`stack.scrolls` false). */
	readonly view: { readonly source: "funnel" } | { readonly source: "note"; readonly path: string };

	/** How the screen sits in its host. fill: the whole leaf, its own lists scroll, fades at the view's edges.
	 *  inline: inside a document; as tall as its content up to the measured max (`--tc-block-max-h`), the stack scrolls as
	 *  one, the host's scroller is an outer scroller for auto-scroll and reveal (§2.2), the 12-px inset frame. */
	readonly frame: "fill" | "inline";

	/** The day timeline, its all-day rows, events, the now line, zoom, timeline drops and new slots. false: none of these is
	 *  rendered or fetched (today they are built and hidden). The core's layout already has no timeline column for a note. */
	readonly calendar: boolean;

	/** Whether the shown day can change. any: arrows, title → today, day swipes, a find or a typed task opening its day.
	 *  today: the day list is always today's; a write for another day lands without moving the view (§3.3). */
	readonly days: "any" | "today";

	/** The projects tree: the folder button, the panel (docked/overlay per the core), tree drops, tree lift, the left-edge
	 *  reveal, and therefore whether a drag starts a device carry (`startCarry`). */
	readonly tree: boolean;

	/** The filter's ownership. chosen: the device's node; title, cross, project menu; a find it hides clears it.
	 *  fixed: the note's node; no title, cross or menu; a find it hides opens on the full card and never touches the device's filter. */
	readonly filter: "chosen" | "fixed";

	/** Whether the screen writes the device's funnel place (`setFunnelPlace`) and opens at `firstPlace`. Only the main screen;
	 *  and even there the core should take a place only while the ribbon shows (§3.2). */
	readonly writesPlace: boolean;

	/** Where full-screen sheets (the full card, the desktop search) mount. screen: over the screen root.
	 *  host: over the enclosing Obsidian view, not cut by an inline frame (§2.4; needs a board). Menus always use the window overlay. */
	readonly sheets: "screen" | "host";

	/** How the screen's keys (⌘Z, ⌘⇧Z, ⌘F) are held: tab: the leaf's Scope while active; focus: a Scope pushed while the
	 *  focus is inside, and presses stopped from the host editor. Read by the `keys` driver only. */
	readonly keys: "tab" | "focus";
}

/** The two places, the only constructors. */
export const mainScreen = (form: Place["form"]): Place => ({
	form, view: { source: "funnel" }, frame: "fill", calendar: true, days: "any",
	tree: true, filter: "chosen", writesPlace: true, sheets: "screen", keys: "tab",
});
export const noteBlock = (form: Place["form"], path: string): Place => ({
	form, view: { source: "note", path }, frame: "inline", calendar: false, days: "today",
	tree: false, filter: "fixed", writesPlace: false, sheets: "host", keys: "focus",
});
```

Not in `Place`, on purpose:

| Kept out | Where it lives | Why |
|---|---|---|
| Pointer kind (`mouse` / `touch` / `pen`), modifiers | each input message | per event; iPad with mouse |
| Window / popout, theme, keyboard inset, status bar, safe area | `chrome` driver messages | change at runtime, per window |
| Widths, heights, max height | `measure` messages | geometry is input (P4) |
| Offered modes, wheel, ribbon, swipe, divider, columns, stack, plates, top row, docked, dim closes, plus targets, search paths | the core's `FunnelView` / `ViewChoice` | the UI decides nothing |
| Haptics engine | runtime port | what the host has, not where it is |
