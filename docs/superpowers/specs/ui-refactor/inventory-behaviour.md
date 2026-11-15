# UI refactor — inventory of user-visible behaviour

What the Obsidian plugin's screen does today, item by item, so the refactor can keep every one of them. Not a review: no
opinions, no recommendations. Paths are relative to the repository root; `ui/` means `obsidian/ui/`. Line numbers are
of the `ui-refactor` worktree as of commit `0b18fa6c`.

Sources walked: every file under `obsidian/ui/` (the prototype under `ui/next/` — `Store.ts`, `KeyedList.tsx`,
`motion.ts` — is imported by nothing in production and is left out), `obsidian/main.ts`, `styles.css`,
`docs/plugin/*.md` (`screen.md`, `tasks.md`, `settings.md`, `calendars.md`), `docs/design/README.md` (cited as
`README:<line>`) and the decisions list of `docs/superpowers/specs/2026-11-12-projects-one-view-design.md` (cited as
`D<n>`).

Platform column: **D** desktop (mouse, trackpad, keyboard), **P** phone (finger), **B** both.

Tokens referred to (all in `styles.css` 700–712): `slide` 300ms, `collapse` 150ms, `menu` 200ms, `fly` 180ms, `snap`
120ms, `fade` 160ms, `keyboard` 300ms; `ease-out` = `cubic-bezier(0.2, 0.8, 0.2, 1)`, `ease-in-out` = CSS
`ease-in-out`, `ease-keyboard` = `cubic-bezier(0.12, 0, 0.44, 0.99)`. Code thresholds are `LAYOUT` in `ui/design.ts`
120–174: press tolerance 8px, mouse drag start 4px, double click 250ms, slow speed 0.08 px/ms, careful 100ms, auto-scroll
edge 40px / 12 px per frame / dwell 250ms, drop hysteresis 6px, trackpad sweep 60px, rubber band stiffness 0.55, field
16px over the bar, panel edge 24px, plus ring reach 24px. Long press delay is a setting (default 250ms,
`settings.md:52`). The core's hover pause over a tree row is `PROJECTS_HOVER_MS` 600ms
(`core/application/projectsScreen.ts:580`).

---

## A. Inputs and gestures

### A1. Opening the screen

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A1.1 | Click ribbon icon | B | Obsidian's left ribbon | Opens (or reveals) the Task Calendar tab | `obsidian/main.ts:66`, `openView` 192 | screen.md:3 |
| A1.2 | Command «Open Task Calendar» | B | Command palette / hotkey | Same as A1.1 | `obsidian/main.ts:67` | screen.md:3 |
| A1.3 | Open a note with an attached project | B | Any Markdown view (Live Preview or Reading) | A block with that project's view appears after the note's text | `ui/ProjectBlocks.ts:119-176` | screen.md:97-99 |
| A1.4 | Several tabs / popout window | D | Workspace | Each tab is its own screen; a change in one shows in the other; popout windows get card size and status-bar tracking of their own | `ui/cardSize.ts:23`, `ui/StatusBarRoom.ts:23`, `obsidian/main.ts:147` | screen.md:3 |

### A2. Cards in lists (funnel columns, rows, by project)

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A2.1 | Tap / click | B | Card body | Opens the task menu over the card (after the column smooth-scrolls the card into full view) | `ui/drag/DragController.ts:128-131`, `ui/menu/LiftedMenu.ts:58-74` | tasks.md:3, 45; README:128 |
| A2.2 | Tap on the subtask counter `2/5` | B | `.tc-count` on a card | Folds / unfolds its open subtasks (writes `📁`), haptic tick, no menu | `ui/CalendarScreen.ts:840-845`, `ui/TaskCard.ts:125` | tasks.md:114 |
| A2.3 | Tap on the folder mark (and a little around it) | B | `.tc-project-mark` | Selects that project (the task's first) as the filter, no menu; in select mode it picks the card instead | `ui/CalendarScreen.ts:1214-1219`, `ui/TaskCard.ts:120`; order in `DragController.ts:129` | screen.md:147; D30 |
| A2.4 | Right click | D | Card | Menu for the picked cards if the card is picked among several, else the task menu | `ui/drag/DragController.ts:108-115`, `ui/BulkController.ts:101-123` | tasks.md:3; screen.md:164 |
| A2.5 | Double click | D | Card | First click opens the menu; a second press within 250ms anywhere closes it and renames the card in place (press and click swallowed) | `ui/drag/DragController.ts:187-189`, `ui/menu/TaskMenu.ts:594-610` | tasks.md:52 |
| A2.6 | Cmd-click (Ctrl-click off macOS) | D | List card | Toggles the card in the desktop selection | `ui/BulkController.ts:108-111`, `ui/CalendarScreen.ts:263` | tasks.md:197 |
| A2.7 | Shift-click | D | List card, with a selection | Extends the selection from the anchor to this card in the same column | `ui/BulkController.ts:112-116`, `ui/TaskSelection.ts:94-102` | tasks.md:197 |
| A2.8 | Click on a selected card (several selected) | D | Card | Opens the bulk menu beside the column | `ui/BulkController.ts:117-120`, `ui/menu/BulkMenu.ts:96-101` | tasks.md:198 |
| A2.9 | Plain click with a selection | D | Unselected card | Clears the selection, then the card's own menu | `ui/BulkController.ts:121-122` | tasks.md:200 |
| A2.10 | Tap in Select tasks mode | B | List card | Toggles its pick; no menu | `ui/BulkController.ts:103-106` | tasks.md:190 |
| A2.11 | Long press (setting, default 250ms), finger held within 8px | P | Card | Lifts the card: haptic, card becomes a dashed place, subtasks fold under it, a copy follows the finger; picked cards go along as a stack | `ui/drag/LongPress.ts:85-131`, `ui/drag/DragController.ts:119-127, 307-355` | tasks.md:72; README:84 |
| A2.12 | Mouse drag past 4px | D | Card | Same lift as A2.11 at once (no wait) | `ui/drag/LongPress.ts:104-108` | tasks.md:3 |
| A2.13 | Finger moving > 8px before the delay | P | Card | Cancels the press (it is a scroll or a swipe) | `ui/drag/LongPress.ts:109` | — |
| A2.14 | Second finger anywhere during a press | P | Card | Forgets the press (it becomes a pinch); lifting is not a tap | `ui/drag/LongPress.ts:51-53` | — |
| A2.15 | Card redrawn during a press | B | Card kept by key | The press continues with the new listeners; a card removed from the page never fires | `ui/drag/LongPress.ts:43-48, 124-131` | tasks.md:74 |
| A2.16 | Tap on a card in Done | B | Done column (ribbon) | Counter folds, else task menu; right click menu; no drag | `ui/CalendarScreen.ts:819-837` | screen.md:114 |
| A2.17 | Tap on a card in by project that cannot move (Done, done project) | B | By project | Counter folds, else menu; no drag | `ui/CalendarScreen.ts:1021-1029` | tasks.md:142 |
| A2.18 | Mouse double click on free room | D | A list's area or list element itself (not a card or header) | Opens the new-task field at the end of that column; finger double tap ignored | `ui/FreeRoomDoubleClick.ts:12-17`, `ui/layouts/FunnelLists.ts:75` | tasks.md:19 |
| A2.19 | Tap on «No tasks» plate of an empty section | B | `.tc-group-empty` | Opens the field in that section | `ui/layouts/FunnelLists.ts:53`, `ui/TaskList.ts:359-366` | tasks.md:21, 101 |
| A2.20 | Tap on the plate of an empty list (filter / rows) | B | `.tc-list-empty` | Opens the field at the list's end | `ui/TaskList.ts:353-357`, `FunnelLists.ts:58` | screen.md:41, 91; D18 |
| A2.21 | Tap on a by-project part's plate | B | By project | Opens the field in that part | `ui/CalendarScreen.ts:1549`, `ui/projects/ProjectTasks.ts:214-218` | screen.md:58 |
| A2.22 | Tap on the lifted copy's title | B | Card copy over the menu blur | Title text is selectable (mouse drag, finger long press + handles); menu stays | `styles.css:1202` | tasks.md:45 |
| A2.23 | Tap on a link in the copy | B | Menu copy | Menu closes, link opens (note in new tab, URL in browser); never from the card itself | `ui/menu/TaskMenu.ts:224-230`, `CalendarScreen.ts:1434-1437` | — |

### A3. Section headers

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A3.1 | Tap | B | `.tc-group-head` of a real section | Section menu: Rename (in place), Remove section; none for No section | `ui/drag/GroupDrag.ts:53`, `ui/CalendarScreen.ts:1176-1185`, `ui/menu/GroupMenu.ts:19-35` | tasks.md:103 |
| A3.2 | Long press / mouse drag | B | Header of a section that can move (No section too) | Lifts the whole section: its cards fold, header copy with a stack and count follows the finger, a dashed slot opens between sections at the nearest slot | `ui/drag/GroupDrag.ts:46-116`, `SectionSlots` 138-180 | tasks.md:104; README:241 |
| A3.3 | Rename: Enter / Escape / blur | B | Field over the header | Enter renames, Escape cancels, blur per `SectionNameEntry` | `ui/CalendarScreen.ts:1188-1205`, `ui/GroupNameField.ts:26-33` | tasks.md:103 |
| A3.4 | New section name (menu → Section → New section) | B | Field at the end of the column, card waiting under it | Enter creates the section with the card; anything else puts the card back | `ui/CalendarScreen.ts:1154-1173` | tasks.md:99 |

### A4. Timeline

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A4.1 | Tap / click | B | Task block | Task menu (with open subtasks stacked between copy and panel) | `ui/drag/DragController.ts:151-153` | tasks.md:68 |
| A4.2 | Double click | D | Task block | Rename (same as A2.5) | `DragController.ts:187-189` | tasks.md:52 |
| A4.3 | Tap on folder mark | B | Task block | Filter by project | `DragController.ts:152` | screen.md:147 |
| A4.4 | Finger long press | P | Task block | Haptic; block selected (dots shown), menu opens over what shows, without scrolling the timeline; finger held keeps the screen | `DragController.ts:150, 203-245`, `TaskMenu.ts:202` | tasks.md:74, 95 |
| A4.5 | After A4.4, finger moves > 8px | P | Task block | Menu closes, selection drops, drag starts at once (hold handed to drag, no free moment) | `DragController.ts:204-208`, `ui/gestures.ts:17-21` | tasks.md:95 |
| A4.6 | Mouse drag past 4px | D | Task block | Drag starts (grab offset kept, not card middle) | `DragController.ts:150, 180-184` | — |
| A4.7 | Mouse held still for the delay (long click) | D | Task block | Select with menu | `DragController.ts:154` | — |
| A4.8 | Right click | D | Task block | Select with menu | `DragController.ts:136-143` | — |
| A4.9 | Press on a dot of the selected block | B | `.tc-grip` on block or on its copy over the menu | Stretch: top dot moves start, bottom dot moves end, snapped; dot on the copy closes the menu first | `ui/kit/Grips.ts:14-23`, `DragController.ts:198-200, 248-256, 454-498`, `Timeline.ts:174-180` | tasks.md:95 |
| A4.10 | Tap / long press / long click / right click | B | Event block | Event menu (Open in Calendar) | `DragController.ts:159-178`, `ui/menu/EventMenu.ts` | README:300 |
| A4.11 | Long press / mouse long click / mouse drag | B | Empty timeline canvas (not block, event, drop line) | New-slot target follows the finger; let go opens the field in that slot; pointercancel closes it | `DragController.ts:259-299`, `TimelineDrop.ts:49-56` | tasks.md:18 |
| A4.12 | Two-finger pinch | P | Timeline | Scales the hour around the fingers' midpoint minute; stops where released; saved per device | `ui/PinchZoom.ts:66-99`, `CalendarScreen.ts:977-992` | screen.md:138 |
| A4.13 | Ctrl/Cmd + wheel, trackpad pinch | D | Timeline | Zoom: 100 wheel units double/halve the hour; settles 150ms after the last event | `ui/PinchZoom.ts:111-125` | screen.md:138 |
| A4.14 | Any touch or wheel | B | Anywhere / timeline | Drops the timeline's held minute (opening anchor) | `ui/Timeline.ts:149, 171-172` | — |
| A4.15 | Pointerdown elsewhere | B | Document, capture | Clears the block selection unless on the selected block, its dots, the copy, a panel or the backdrop | `CalendarScreen.ts:467, 891-895` | — |

### A5. Plus button

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A5.1 | Tap | B | `.tc-plus` | Field at the end of the day column (Inbox at Inbox–Soon; the node's part in by project; nothing in Done or on a folder's own part) | `ui/quick/PlusButton.ts:74-78`, `QuickEntryController.ts:283-287` | tasks.md:15, 151; D44 |
| A5.2 | Keyboard activation (click with `detail 0`) | D | Focused plus | Same as tap | `PlusButton.ts:36-38` | — |
| A5.3 | Drag past 8px (no long press) | B | Plus | Carries the plus itself; ring left at its place; drop line in lists, slot line on the timeline, gap line in the tree | `PlusButton.ts:68-72`, `QuickEntryController.ts:290-334`, `DragController.ts:361-398` | tasks.md:16-17; README:255 |
| A5.4 | Plus let go on its own ring (within radius + 24px) | B | `.tc-plus-ring` | Cancel: plus flies back, nothing opens | `ui/quick/PlusRing.ts:32-37, 58-60` | — |
| A5.5 | Plus let go in a list gap | B | List | Field opens at the gap, level by distance right of the list's middle; plus lands in the field and fades | `QuickEntryController.ts:521-534`, `drag/PlusFloat.ts:21-25` | tasks.md:16 |
| A5.6 | Plus let go on the timeline | B | Timeline | Field opens in that slot, no duration | same | tasks.md:17 |
| A5.7 | Plus let go on a column title | B | — | Not a target (titles take cards only) | `ListDrop.ts:453-455` | tasks.md:92 |
| A5.8 | Plus let go in a by-project part | B | By project list | Field opens where its card will land (`projectsPlusPlace`) | `ProjectDrops.ts:194-198`, `QuickEntryController.ts:314-334` | tasks.md:151; D83, D87 |
| A5.9 | Plus let go in the tree gap | B | Panel showing | Panel stays out, «Project name» field at that gap and depth; Enter creates and selects | `CalendarScreen.ts:1098-1133`, `projects/TreePanel.ts:92-109` | tasks.md:152; D27 |
| A5.10 | Plus held at the left edge (24px) | P | — | Core slides the panel out for this carry | `projects/CarryReport.ts:42-49` | D27; tasks.md:143 |
| A5.11 | Plus held over a tree row | B | Panel | Only unfolds the row (never selects) | core via `CarryReport` | D39 |
| A5.12 | Plus tap while hidden (field open / drag) | B | — | Ignored | `PlusButton.ts:37, 58` | — |

### A6. Dragging a card (after lift)

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A6.1 | Move | B | Anywhere | Copy follows (kept in window margin); target under the finger previews; tree rows make the copy ride above the finger at its own width | `drag/DragSession.ts:70-84`, `drag/FloatingCard.ts:83-112` | tasks.md:72 |
| A6.2 | Over a list | B | List area (and up to 40px above it for a title above) | Drop line at the gap picked by the copy's middle; level by finger x against the list's middle, 20px per step; hysteresis 6px; refused place shows no line | `drag/ListDrop.ts:149-208` | README:85, 229; tasks.md:78 |
| A6.3 | Over an empty section's plate | B | Plate | Plate lights (`is-hot`), no line | `ListDrop.ts:200-203, 240-245` | tasks.md:101 |
| A6.4 | Over a column title | B | Title of Inbox/Soon/Backlog/day | Title lights like a plate; drop goes to that list's end, project unchanged | `ListDrop.ts:452-464` | tasks.md:88, 92 |
| A6.5 | Over the timeline | B | Timeline box | Line with the snapped start time at the copy's top (grab offset kept) | `drag/TimelineDrop.ts:40-46` | README:88 |
| A6.6 | Held at a list/timeline edge (40px) for 250ms, heading for it | B | — | Scrolls the list under the card, faster closer to the edge (up to 12 px/frame); a card carried across the edge does not scroll it; phone bottom edge is the wheel row's top | `drag/AutoScroll.ts:7-96` | tasks.md:90; README:86; D70 |
| A6.7 | Over a tree row | B | Panel | Row fills with the drop colour if it takes the task (not All, Done, folders) | `projects/ProjectDrops.ts:114-123` | tasks.md:143 |
| A6.8 | Held over a tree row for 600ms | B | Panel | Core opens it: filters by that node (same mode), unfolds the branch; lists redrawn still under the card | `projects/CarryReport.ts:29-64`, `CalendarScreen.ts:150-158, 1513-1516` | tasks.md:144-148; D11, D39, D65 |
| A6.9 | Held at the left edge (24px) | P | — | Panel slides out for this carry | `CarryReport.ts:43` | tasks.md:143; D20 |
| A6.10 | Let go on a target | B | — | Drop written first, then the copy flies to where the card really is; card hidden until the copy lands; into a folded group the copy sinks into the header | `DragSession.ts:86-114`, `CalendarScreen.ts:1137-1151`, `ArrivingCard.ts` | tasks.md:74 |
| A6.11 | Let go nowhere / pointercancel / Escape | B | — | Filter put back as at the lift (if a hover opened another), copy flies back to the dashed place, card shows | `DragSession.ts:161-191`, `DragController.ts:428-434` | tasks.md:148, 200 |
| A6.12 | Let go on the cross ring (several cards carried) | B | Plus's place | Puts all back; over it the stack turns see-through | `BulkController.ts:137-141`, `PlusRing.ts:40-43` | — |
| A6.13 | Let go on a tree row | B | Panel | Every carried task's shown-under project becomes the row's; place in the funnel unchanged; ends Select tasks | `CalendarScreen.ts:1066-1072` | tasks.md:143; D43 |
| A6.14 | Let go among by-project cards | B | By project | Written by `dropInProjects`; the landing card is drawn at the line's place before the write is read | `CalendarScreen.ts:1078-1091` | tasks.md:139-141; D84 |
| A6.15 | Another drag started while a copy still flies | B | — | Old copy lands at once (same task: old copy removed), new drag starts clean | `DragSession.ts:54-56`, `DragController.ts:308, 363` | tasks.md:74 |
| A6.16 | A redraw mid-drag | B | — | Lists don't redraw under a gesture (parts wait for idle); a held card opening another node redraws still at once | `ui/ScreenParts.ts:16-27`, `CalendarScreen.ts:471-474` | tasks.md:74 |
| A6.17 | iOS lost lift (element replaced) | P | — | A new primary finger ends the held gesture as cancelled | `DragController.ts:506-512` | — |
| A6.18 | View closed mid-drag | B | — | Drag aborted, copy removed, nothing left | `DragController.ts:98-102`, `DragSession.ts:128-135` | D66 |
| A6.19 | Card lifted from a timeline | B | Timeline | Lifted block leaves the stack; others close over it | `DragController.ts:313, 320`, `Timeline.ts:574-608` | — |

### A7. Swipe, wheel (column switch), day turning

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A7.1 | Finger drawn sideways past 8px (more x than y) | P (touch/pen only) | Content of the screen in Two columns, not on a field, the quick bar, a section name field, the movable divider, the full screen | Screen follows the finger to at most the next place/day; release: on to the next if past half or flicked (core `swipeLanding`), else back; one swipe = one step | `ui/Swipe.ts:178-218`, `ScreenPager.ts:58-88` | screen.md:124; CLAUDE.md «RibbonPaging» |
| A7.2 | Vertical finger move | P | — | Stays a scroll | `Swipe.ts:199-201` | — |
| A7.3 | Two-finger horizontal trackpad scroll | D | Same as A7.1 | Follows the stroke; steps on a 60px sweep in 100ms, on reaching the full distance, or when the glide (4 shrinking moves) begins; glide after it is ignored; next stroke recognised after 150ms by reversal or a 1.5× rise; ends 150ms after the last event | `Swipe.ts:122-176` | screen.md:124 |
| A7.4 | Ctrl/Cmd + wheel | D | — | Not a swipe (zoom) | `Swipe.ts:123` | — |
| A7.5 | Past the row's end | B | Leftmost place / no next | Rubber band: gives less and less, springs back | `ScreenTracks.ts:27-48`, `RibbonLayout.ts:107` | screen.md:93 (only in two columns) |
| A7.6 | Finger down while the screen still runs to its place | B | — | The run is not stopped (`stand()` is a no-op); the tap goes to what it hit; the swipe hold is released at once | `Swipe.ts:259-265`, `ScreenPager.ts:91` | screen.md:124 |
| A7.7 | New swipe during a run (or during an arrow turn) | B | — | Catches the screen where seen and draws on from there; queued turns dropped | `ScreenPager.ts:102-111`, `CalendarScreen.ts:699-710` | screen.md:127 |
| A7.8 | Swipe in other modes or in a note block | B | — | Nothing (no swipe attached, no rubber band) | `CalendarScreen.ts:591` | D28, D63 |
| A7.9 | Tap an icon outside the window | B | Wheel | Turns to the nearest place showing it; icon in the window does nothing | `ColumnSwitch.ts:199-210` | screen.md:105; README:34 |
| A7.10 | Quick swipe on the wheel | B | Wheel | Exactly one place | `ColumnSwitch.ts:174-197` | screen.md:106 |
| A7.11 | Slow drag on the wheel (slower than 0.08 px/ms for 100ms) | B | Wheel | Turns freely (careful stays for the rest of the drag), settles to the nearest place | `ColumnSwitch.ts:149-197`, `ui/CarefulPace.ts` | screen.md:106 |
| A7.12 | Long press on the wheel while the calendar shows | B | Wheel | Sources popover (click after it swallowed) | `ColumnSwitch.ts:136, 143-147` | screen.md:107; calendars.md:50 |
| A7.13 | Arrow Left / Right | D | Wheel focused | One place left / right | `ColumnSwitch.ts:109-115` | — |
| A7.14 | Wheel drag cancelled (pointercancel) | B | — | Snaps back to the current place | `ColumnSwitch.ts:191` | — |
| A7.15 | Wheel / swipe away from Done | B | — | Leaves Done for Inbox; Done disappears until the next search | `CalendarScreen.ts:774-792` | screen.md:114 |
| A7.16 | Tap ‹ / › | B | Day title row | Previous / next day: day slides in its column, title and hours stand, 300ms | `ui/DayNav.ts:17-19`, `CalendarScreen.ts:328-331, 699-771` | screen.md:126-127 |
| A7.17 | Tap the day title | B | Day title | Back to today in one step toward today (no intermediate days) | `CalendarScreen.ts:331` | screen.md:126-127 |
| A7.18 | Repeated taps on arrows / title mid-turn | B | — | Each waits for the previous turn (and for the screen to draw the day, ≤1s), then turns on | `CalendarScreen.ts:699-719` | screen.md:127; D51 (screen) |
| A7.19 | Switching days or places with a field open | B | — | Field is committed (as a tap elsewhere) and its writes land first; a place chosen in the bar turns the wheel without ending the field | `CalendarScreen.ts:676-679`, `QuickEntryController.ts:381-384, 744-757` | — |

### A8. Dividers

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A8.1 | Drag | B | Ribbon divider at Now–calendar | List width 110–280 (wider window: down to 110 of calendar); saved as share per device | `ui/Divider.ts:56-94`, `RibbonLayout.ts:69-79` | screen.md:25; README:51 |
| A8.2 | Slow near the middle | B | Any movable divider | Glides into the middle with a haptic tick and glides out; fast passes by (core `dividerAt`) | `Divider.ts:67-81`, `motion/SnapGlide.ts` | screen.md:25 |
| A8.3 | Drag | D | Still layouts' divider before the timeline (All columns, Rows, By project) | Sets the lists' share against the timeline; middle = four equal columns in All columns; shared with Two columns | `layouts/StillLayout.ts:60-78` | screen.md:86, 92; D25 |
| A8.4 | Drag | D | Tree panel's divider | Tree width; lists give way live; saved per device | `projects/TreePanel.ts:60-72` | screen.md:35 |
| A8.5 | — | B | Fixed halves dividers (Inbox|Soon, Soon|Now) | Not draggable; swipes may start on them | `RibbonLayout.ts:93-96`, `Swipe.ts:67` | screen.md:25 |

### A9. Projects panel, filter, tree

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A9.1 | Tap folder button | B | Top left / titles row | Opens / closes the panel; filled while open; disabled while a field is open | `CalendarScreen.ts:1584, 1519-1522, 424-426` | screen.md:33; D48 |
| A9.2 | Tap a row | B | Tree | Selects the node (All clears); tap on the selected row folds / unfolds its branch; phone closes the panel on pick | `projects/ProjectTree.ts:85`, `CalendarScreen.ts:1603` | screen.md:47-50; D8, D53, D55 |
| A9.3 | Tap the dim | P | Beside the panel | Closes the panel without a pick | `projects/TreePanel.ts:43`, `CalendarScreen.ts:1604-1606` | screen.md:36; D26 |
| A9.4 | Long press / mouse drag on a project row | B | Tree (not done projects) | Lifts the project: row clone rides below the finger, line shows gap and depth (sideways steps nest / un-nest); let go moves it | `projects/TreeLift.ts:29-78` | screen.md:52 |
| A9.5 | Tap filter title | B | Over the tasks | Project menu (not for All / No project / Done) | `projects/FilterTitle.ts:26-28`, `CalendarScreen.ts:1222-1253` | screen.md:61 |
| A9.6 | Tap the cross | B | Beside the filter title | Clears the filter | `FilterTitle.ts:29`, `CalendarScreen.ts:1587` | screen.md:39 |
| A9.7 | Project menu: Rename → Enter / Escape | B | Title becomes field | Renames (tree and every `🗂️`), Escape cancels | `CalendarScreen.ts:1235-1242`, `FilterTitle.ts:47-59` | screen.md:63 |
| A9.8 | Folder switch tap | B | Project menu | Knob slides, menu closes, write runs; disabled with reason when the project has tasks | `menu/MenuPanel.ts:193-211`, `GroupMenu.ts:81` | screen.md:64 |
| A9.9 | Attach note… | B | Project menu | Obsidian fuzzy note search; pick attaches | `projects/NoteSearch.ts`, `CalendarScreen.ts:1243` | screen.md:65 |
| A9.10 | Note name / Detach | B | Project menu | Opens note in new tab / removes link | `CalendarScreen.ts:1244-1247` | screen.md:65 |
| A9.11 | Delete project → Cancel / Delete | B | Project menu | Question in place of the row; Delete removes the project | `GroupMenu.ts:90-100` | screen.md:66 |

### A10. View button and its menu

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A10.1 | Tap | B | Round view button | «View» menu with modes, current checked; Subprojects row when offered | `ui/ViewButton.ts:25-28`, `menu/ViewMenu.ts:30-54` | screen.md:81-95 |
| A10.2 | Pick a mode | B | View menu | Mode set (main screen or note block's own); filter untouched | `CalendarScreen.ts:1525-1527` | D49 |
| A10.3 | Tap Subprojects | B | View menu | Toggles the device setting, menu closes | `CalendarScreen.ts:1530-1532` | screen.md:95 |

### A11. Bottom row, select mode, search

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A11.1 | Tap Undo | B | Capsule | One step back (dim when nothing); conflict notice | `ui/BottomCapsule.ts:23-31`, `CalendarScreen.ts:937-941` | tasks.md:216-220 |
| A11.2 | Tap ⋯ | B | Capsule | Menu over the capsule: Search, Select tasks | `BottomCapsule.ts:32`, `menu/MoreMenu.ts` | README:340 |
| A11.3 | Search | B | ⋯ menu | Search window takes over the same sheet | `MoreMenu.ts:32`, `CalendarScreen.ts:848-865` | tasks.md:204 |
| A11.4 | Select tasks | B | ⋯ menu | Select mode: circles slide in; capsule becomes cross + count; plus becomes ⋯ | `BulkController.ts:83-86` | tasks.md:188-193 |
| A11.5 | Cross / Esc | B | Select capsule / keyboard | Leaves select mode (Esc only when no bulk menu is open) | `BulkController.ts:76, 149-151` | tasks.md:193 |
| A11.6 | Tap count or ⋯ | B | Select mode | Bulk menu over the button (dim when none picked) | `BulkController.ts:77-78, 168-215` | tasks.md:192 |
| A11.7 | Press outside cards | D | Document, capture | Clears a desktop selection (not in select mode, not with the menu open, not on cards / copies / panels / float) | `BulkController.ts:154-158`, `CalendarScreen.ts:469` | tasks.md:200 |
| A11.8 | Typing | B | Search field | Fuzzy search; only the latest answer drawn; «No tasks found» | `search/SearchWindow.ts:55, 99-113` | tasks.md:206-211 |
| A11.9 | ↑ / ↓ / Enter | D | Search field | Move the picked row (first preselected), Enter opens it | `SearchWindow.ts:115-134` | tasks.md:205 |
| A11.10 | Click a row | B | Results | Closes, then reveals the task: place / day / Done, ring, unfolds, clears a hiding filter | `SearchWindow.ts:93-97`, `CalendarScreen.ts:872-888` | tasks.md:212; D19, D36 |
| A11.11 | Cancel / backdrop / Esc | B | Search | Closes | `SearchWindow.ts:66, 87-90`, `Overlay.ts:28-36` | tasks.md:205 |
| A11.12 | Cmd+F | D | View or block focused | Opens search | `TaskCalendarView.ts:37`, `ProjectBlocks.ts:37`, `CalendarScreen.ts:923-926` | tasks.md:204 |
| A11.13 | Cmd+Z / Cmd+Shift+Z | D | View or block focused, not in a field | Undo / redo; in a field it stays the field's | `TaskCalendarView.ts:35-36`, `CalendarScreen.ts:929-934` | tasks.md:217 |
| A11.14 | Cmd+Z / Cmd+Shift+Z | D | Search input, section / project name field | Undoes typing in that field (`execCommand`) | `ui/fieldUndo.ts:5-12` | screen.md:158 |
| A11.15 | Any press | B | Document, capture | Clears the found-card ring | `CalendarScreen.ts:468` | tasks.md:212 |

### A12. Menus (task, bulk, section, project, event, view, more, sources)

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A12.1 | Tap the backdrop | B | `.tc-backdrop` | Closes ("away"); a field in a stack keeps its text | `menu/Overlay.ts:34-36`, `QuickEntryController.ts:549-554` | tasks.md:64 |
| A12.2 | Escape | D | Document, capture | Closes the topmost overlay; a field with `data-owns-escape` takes it (back a page) | `Overlay.ts:28-33, 179-181` | tasks.md:64, 132 |
| A12.3 | Enter while a question is asked | D | Task menu | Confirms | `TaskMenu.ts:186-191, 426-431` | tasks.md:64 |
| A12.4 | First pick | B | Any tile / row | Menu closes, action runs after the fade (later picks ignored); actions asked meanwhile wait for it | `ui/kit/Panel.ts:16-91`, `CalendarScreen.ts:899-915` | tasks.md:5; D81 |
| A12.5 | Pick that types (Rename, Add description, Add subtask, New section, project Rename / Attach) | B | Task / section / project menu | Field opens in the same tap (iOS keyboard) | `Panel.ts:83-90`, `TaskMenu.ts:351-357`, `GroupMenu.ts:29, 79` | tasks.md:5 |
| A12.6 | Label tile | B | Task / bulk / quick bar flag panel | Toggles, menu stays and is redrawn (copy recoloured) | `TaskMenu.ts:409-423`, `BulkMenu.ts:164-176` | tasks.md:49 |
| A12.7 | Project page rows | B | Task / bulk menu | Toggle stays; No project closes; New project… name page (Enter, Escape back) | `TaskMenu.ts:482-529` | tasks.md:57, 127-132 |
| A12.8 | Repeat page | B | Task menu | Changes shown at once, written once on close; Remove repeat closes | `TaskMenu.ts:550-571` | tasks.md:184 |
| A12.9 | Pick a date | B | Task / bulk menu | Month picker; ‹ › months; Remove due date | `menu/MonthPicker.ts:40-66`, `menu/DatePage.ts` | tasks.md:50 |
| A12.10 | Reminder page | B | Task menu | Kinds, checked; pick sets and closes | `TaskMenu.ts:532-544` | tasks.md:53 |
| A12.11 | Subtask card in a timeline menu's stack | B | Stack under the copy | Its own menu over the same sheet | `TaskMenu.ts:315-325` | tasks.md:68 |
| A12.12 | Tap description peek / link in it | B | Over the copy | Full screen / opens the link | `menu/DescriptionPeek.ts:37-39` | tasks.md:66 |
| A12.13 | Refresh now | B | Sources popover | Refreshes calendars | `sources/SourcesPopover.ts:49` | calendars.md:50 |

### A13. Quick entry field and bar

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A13.1 | Typing | B | Field (Obsidian editor, one line, wraps) | State updated; field followed into sight | `quick/MarkdownTitleField.ts:44-65`, `QuickEntryController.ts:774-779` | tasks.md:23-31 |
| A13.2 | Enter (and Shift+Enter) | B | Field | Saves, opens the next empty field below; on empty field ends (subtask: outdents first) | `MarkdownTitleField.ts:58`, `QuickEntryController.ts:793-798` | tasks.md:25-26 |
| A13.3 | Escape | D | Field | Closes without saving | `MarkdownTitleField.ts:59` | tasks.md:28 |
| A13.4 | Tab / Shift+Tab | D | Field | Indent / outdent | `MarkdownTitleField.ts:60` | tasks.md:27 |
| A13.5 | Option+Tab | D | Field | Toggles section-name mode (taken ahead of Obsidian hotkeys) | `MarkdownTitleField.ts:69-72` | tasks.md:31 |
| A13.6 | IME commit key (isComposing or keyCode 229) | B | Field | Not treated as Enter/Escape/Tab/Option+Tab | `quick/TitleField.ts:43-48`, `MarkdownTitleField.ts:40-43, 49-54` | — |
| A13.7 | `[[` | B | Field | Obsidian note suggest; while open, Enter/Escape/Tab are the suggest's | `markdown/EmbeddedEditor.ts:117-123` | tasks.md:30 |
| A13.8 | Line-changing hotkeys (⌘L, lists, headings, quotes, swap lines…) | D | Field and description editor | Swallowed (do nothing) | `markdown/lineCommands.ts:8-61`, `EmbeddedEditor.ts:121` | screen.md:157 |
| A13.9 | Paste / drop with line breaks | B | Field | Breaks become spaces | `MarkdownTitleField.ts:131-135` | screen.md:157 |
| A13.10 | Tap elsewhere | B | Document click, capture | Saves and ends; not when on the field, its row, its editor's suggest/toolbar, the bar and its panels, or the plus; ignored right after the press that opened the field | `QuickEntryController.ts:195-198, 261-265, 150-154` | tasks.md:28 |
| A13.11 | Field loses focus (keyboard dismissed) | P | — | Ends the entry unless a redraw gave focus back or a bar field (project name) took it | `QuickEntryController.ts:804-808` | — |
| A13.12 | Press on the bar | B | Bar, section capsule, their panels | Never steals focus (pointerdown/mousedown prevented) | `quick/QuickBar.ts:178-184` | — |
| A13.13 | Section button | B | Bar (phone first; desktop own capsule) | Toggles section-name mode | `QuickBar.ts:116` | tasks.md:31 |
| A13.14 | ← / → shift buttons | P (desktop shows titles with keys) | Bar | Outdent / indent | `QuickBar.ts:120-121, 132-134` | tasks.md:27 |
| A13.15 | Flag, Project, Repeat, Place buttons | B | Bar | Open one panel at a time (same button closes); press outside closes | `QuickBar.ts:123-126, 325-351` | tasks.md:33-39 |
| A13.16 | Level tile / label tile | B | Flag panel | Level sets and closes; label toggles and stays | `QuickBar.ts:402-409` | tasks.md:35 |
| A13.17 | Place tile / Date | B | Place panel | Field moves to that list's end, wheel turns; Date opens a picker; another day writes first, then opens the day | `QuickBar.ts:470-495`, `QuickEntryController.ts:744-757` | tasks.md:38 |
| A13.18 | Project row / New project… | B | Project panel | Sets the field's project; name page; Escape / back returns focus to the field | `QuickBar.ts:426-462` | tasks.md:36 |
| A13.19 | Repeat panel controls | B | Repeat panel | Rule changed at once, panel restands; Remove repeat closes | `QuickBar.ts:412-423`, `repeat/RepeatPanel.ts:30-99` | tasks.md:175-182 |
| A13.20 | Rename via menu | B | List card → field in place; timeline card → field over the card; calendar menu stack card → field in the stack | Enter / tap away saves, Escape cancels | `QuickEntryController.ts:365-374`, `Timeline.ts:487-491` | tasks.md:52 |
| A13.21 | Add subtask on a timeline-only task | B | Calendar menu | Menu stays; field as last row of its stack | `QuickEntryController.ts:347-358`, `TaskMenu.ts:269-278` | — |
| A13.22 | Wheel / touchmove on the screen | B | Root, capture | Marks a hand scroll: a hand scroll of the field's list stops following the field | `QuickEntryController.ts:167-179, 188, 240` | D78 |

### A14. Full screen task

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A14.1 | Close | B | Top left | Back to main screen | `full/FullScreen.ts:107` | tasks.md:169 |
| A14.2 | Escape | D | Document | Closes, unless something on it is focused or a backdrop exists | `FullScreen.ts:478-485` | tasks.md:169 |
| A14.3 | Done | B | Top right, shown while typing | Blurs, saves description | `FullScreen.ts:108, 464-475` | tasks.md:166 |
| A14.4 | Tap circle | B | Subtask card | Toggles done (crossed, stays) | `FullScreen.ts:250-256` | tasks.md:162 |
| A14.5 | Tap subtask card (and its counter) | B | List | Its menu (Open full screen inside) | `FullScreen.ts:257` | tasks.md:161, 163 |
| A14.6 | Parent line | B | Over title | Up one level | `FullScreen.ts:115, 261-274` | tasks.md:164 |
| A14.7 | Project line | B | Under title | Close and filter by that project | `FullScreen.ts:120, 237-240`, `CalendarScreen.ts:1333-1336` | tasks.md:172 |
| A14.8 | Typing in the description | B | Editor | Saved 600ms after the last key | `FullScreen.ts:286-303` | tasks.md:123 |
| A14.9 | Undo, ⋯, plus | B | Bottom row | Undo; task's own menu over the capsule; new last subtask (Enter continues, empty ends, tap away / Done saves, Escape cancels) | `FullScreen.ts:129-130, 393-396` | tasks.md:167 |
| A14.10 | Rename via ⋯ | B | Title becomes the field | Enter / tap away saves, Escape cancels | `FullScreen.ts:421-455` | tasks.md:168 |

### A15. Note block, global handlers

| # | Input | Plat. | Where | What it does | Handler | Doc |
|---|---|---|---|---|---|---|
| A15.1 | mousedown / click / dblclick | B | Note block | Stopped at the block (editor doesn't move its cursor) | `ProjectBlocks.ts:42` | — |
| A15.2 | Pointerdown | B | Note block | Focuses the block (no scroll) so its keys apply | `ProjectBlocks.ts:43-45` | — |
| A15.3 | Focus in / out | B | Note block | Pushes / pops the block's key scope (Cmd+Z, Cmd+Shift+Z, Cmd+F) | `ProjectBlocks.ts:46-49, 35-37` | — |
| A15.4 | touchmove | P | Screen root | Default prevented while a gesture holds the screen or with 2+ fingers (no scroll mid-drag, no page zoom); stopped from reaching Obsidian's side-panel swipes | `CalendarScreen.ts:462-466` | — |
| A15.5 | touchstart / touchend / touchcancel | P | Screen root | Stopped from reaching Obsidian | `CalendarScreen.ts:466` | — |
| A15.6 | Window focus / visibility visible / active leaf change | B | — | Calendars poll wakes; missed minute ticks; day check | `CalendarScreen.ts:455-461, 501-505` | — |
| A15.7 | Theme change (`css-change`) | B | — | Events redrawn in the theme's colours | `CalendarScreen.ts:475` | — |
| A15.8 | View resize | B | — | Layout frame, field re-revealed, tick catch up | `CalendarScreen.ts:535-540`, `TaskCalendarView.ts:49-51`, `ProjectBlocks.ts:101` | — |
| A15.9 | Phone keyboard will show / hide | P | Window events | Bar rides the keyboard; view marked `is-keyboard-up` | `ui/Keyboard.ts:24-42` | README:258 |
| A15.10 | Create file | B | Missing-file box | Creates the tasks file | `CalendarScreen.ts:1682-1686` | — |
| A15.11 | Settings rows: drag grip | B | Settings tab (priorities, labels, presets) | Row follows, others step aside, let go settles in snap then reorders | `ui/RowReorder.ts:20-79` | settings.md:9 |

### A16. Arbitration (who wins, hand-offs)

| # | Rule | Handler | Doc |
|---|---|---|---|
| A16.1 | One gesture at a time: drag, hold, resize, new slot, pinch, swipe, wheel drag, divider, section lift, tree lift, naming each `claim` the screen; a second one doesn't start | `ui/gestures.ts:2-33` | — |
| A16.2 | Hold → drag hand-off with no free moment (`pass`) | `gestures.ts:17-21`, `DragController.ts:207` | — |
| A16.3 | LongPress and the plus don't start while the screen is busy; LongPress tap is not delivered while busy | `LongPress.ts:86, 116, 128`, `PlusButton.ts:58` | — |
| A16.4 | A swipe settling still counts as free for a new swipe; any finger down while it settles releases its claim before the target sees it | `Swipe.ts:237-265` | screen.md:124 |
| A16.5 | Swipe ignores mouse pointers; LongPress ignores non-primary pointers and non-left buttons | `Swipe.ts:179`, `LongPress.ts:86` | — |
| A16.6 | Finger moving sideways first becomes a swipe; vertical stays scroll; LongPress on the same finger cancels at 8px | `Swipe.ts:196-205`, `LongPress.ts:109` | — |
| A16.7 | Wheel drag claim fails → press dropped and its click swallowed | `ColumnSwitch.ts:157-161` | — |
| A16.8 | Divider claims on pointerdown (prevents default) | `Divider.ts:57-63` | — |
| A16.9 | Pinch claims when the second finger lands; a new primary finger ends the pinch | `PinchZoom.ts:66-75` | — |
| A16.10 | Grip pointerdown stops propagation (no lift of the block under it) | `kit/Grips.ts:17-20` | — |
| A16.11 | Canvas LongPress declines presses on blocks, events, the drop line | `DragController.ts:264` | — |
| A16.12 | Naming a section / project / new project name holds the screen (`naming`) so no redraw takes the field | `CalendarScreen.ts:81, 1123, 1158, 1189, 1236` | — |
| A16.13 | Project menu refuses to open while busy | `CalendarScreen.ts:1225` | — |
| A16.14 | Redraws asked while busy wait and are flushed together when idle; the minute tick waits too | `ScreenParts.ts`, `CalendarScreen.ts:471-494` | — |
| A16.15 | The writes run one after another in asked order, after any menu pick still closing | `CalendarScreen.ts:899-915`, `Panel.ts:23-55` | D77, D81 |
| A16.16 | Escape order: field-owned Escape > overlay > drag cancel (capture, stops propagation) > select mode (only without menu) > full screen (only unfocused, no backdrop) | `Overlay.ts:28`, `DragController.ts:429-434`, `BulkController.ts:149-151`, `FullScreen.ts:478-485` | — |
| A16.17 | Tap order on a card: select / Cmd / Shift pick > project mark > counter > menu | `DragController.ts:129` | — |

---

## B. Motions

Approval column: a citation means the motion is described in an approved doc or decision; «code only» means it is not
described in the docs walked (its intent is in the code's comment).

### B1. WAAPI (`element.animate`)

| # | Trigger | What moves | Duration / easing | Where | Approval |
|---|---|---|---|---|---|
| B1.1 | A row appears in a keyed drawing with motion (card, header, plate, landing mark, field row) | Height, min-height, margins (from −gap), opacity from 0; rows below slide with it | `collapse` / `ease-out` | `motion/Motion.ts:87-103`, `KeyedRows.ts:175` | tasks.md:5 |
| B1.2 | A row leaves | Fades to 0 at the half, then folds height/margins to 0 (2 × `collapse`), fill forwards, then removed | 2 × `collapse` / `ease-out` per half | `Motion.ts:109-136`, `KeyedRows.ts:89-97` | tasks.md:5 |
| B1.3 | A mark-only row (section landing slot) or a lifted card's place leaves | Folds and fades at once | `collapse` | `Motion.ts:130`, `KeyedRows.ts:95` | D76 |
| B1.4 | A kept row's place changed (FLIP) | Translate from old box to new, width interpolated if the level changed | `collapse` / `ease-out` | `Motion.ts:146-158`, `KeyedRows.ts:176-181` | tasks.md:5 |
| B1.5 | A row coming back while leaving | Leave cancelled, row stays | — | `Motion.ts:139-143`, `KeyedRows.ts:66-72` | code only |
| B1.6 | Timeline block moved / resized by a redraw or a layout pass | top / left / height | `collapse` (stretch: `snap`) / `ease-out` | `Motion.ts:167-175`, `Timeline.ts:349-353, 594, 548, 558` | tasks.md:95 (snap) |
| B1.7 | Timeline block new | Opacity 0 → 1 | `collapse` | `Motion.ts:195-198`, `Timeline.ts:352` | code only |
| B1.8 | Timeline block gone | Opacity → 0, then removed | `collapse` | `Motion.ts:201-206`, `Timeline.ts:334` | code only |
| B1.9 | Plate replaced by first card / field | Only the room under the stand-in grows (margin-bottom) | `collapse` | `Motion.ts:187-192`, `TaskList.ts:230-241` | D76, D82 |
| B1.10 | Quick bar panel closes | Panel fades, then removed | `collapse` | `QuickBar.ts:345`, `Motion.disappear` | code only |
| B1.11 | Desktop quick bar / section capsule appear | Opacity 0 → 1 | `menu` | `QuickBar.ts:194-200` | README:249-277 (desktop capsule) |
| B1.12 | Desktop quick bar / section capsule leave | Opacity 1 → 0, fill forwards, then hidden | `collapse` | `QuickBar.ts:203-224` | same |
| B1.13 | Float copy created from a card of another width | Width from the card's width to its own | `fly` | `drag/FloatingCard.ts:40-44` | code only ("never in one frame") |
| B1.14 | Menu panel page change (menu ↔ Section / Project / Repeat / picker / question / label redraw) | Width, height, translate from the old box, opacity from 0 if new; split upper part folds height → 0 | `menu` / `ease-out` | `menu/PanelPages.ts:26-90` | code only |
| B1.15 | Section copy lands | Translate to header top-left with `scale(1, 0)` (folds shut) | `fly` | `drag/GroupDrag.ts:205-207` | README:241; tasks.md:104 |
| B1.16 | Section copy flies back / sinks / vanishes | Translate / translate + fade / fade | `fly` | `GroupDrag.ts:209-221` | tasks.md:104 |
| B1.17 | Strip swipe between places | Paused animation of left/margin-left/width/padding/gap of every strip part and the day arrows, scrubbed by the finger (1000ms timeline, linear) | scrubbed | `ScreenTracks.ts:143-181` | README:79 |
| B1.18 | Subtask stack field row in a calendar menu | Grows in (B1.1) | `collapse` | `TaskMenu.ts:276` | code only |

### B2. CSS transitions (`styles.css`)

| # | Selector (line) | Property | Token | Trigger | Approval |
|---|---|---|---|---|---|
| B2.1 | `.task-calendar > .tc-fade` (837) | height | `slide` / in-out | Field opens (desktop: shrinks to chrome room 839; phone: bar height 845) | README:33, 276 |
| B2.2 | plus, capsule, select button, wheel (853) / hidden (854) | opacity, transform scale(`--tc-menu-scale`), visibility delayed | `collapse` / out | Drag, field open, select mode | tasks.md:74; README:162 |
| B2.3 | `.tc-seg.is-settling`, pill (880) | left, width | `slide` / in-out | Wheel shown at a place | README:34 |
| B2.4 | `.tc-seg.is-settling .tc-seg-reel` (881) | left | `slide` | same | README:34 |
| B2.5 | `.tc-seg.is-settling .tc-seg-icon` (882) | transform, opacity (icons shrink/fade by depth) | `slide` | same | README:34 |
| B2.6 | `.tc-popover` (893, closing 896) | opacity, transform (rise + scale) | `menu` in / `collapse` out | Sources popover | README:194 |
| B2.7 | `.task-calendar.is-switching` strip parts + day arrows (957) | left, margin-left, width, padding, gap | `slide` / in-out | Wheel tap / place change (300ms class) | README:79 |
| B2.8 | `.tc-card, .tc-group-head` (983); `.tc-list > .tc-card` (1238) | height, margin, opacity, transform (+ padding, background in lists) | `collapse` / out | Fold of subtasks / section on lift (`is-folded`), select padding, selection fill | README:228, 241, 341 |
| B2.9 | `.tc-group-drop` (992) | margin | `collapse` | Section landing slot | README:241 |
| B2.10 | `.tc-group-empty` (993) | height, margin, opacity | `collapse` | Plate fold on section lift | README:242 |
| B2.11 | `.tc-list-drop` (1028) | transform, opacity | `snap` / out | Drop line moves to a new gap; fades in (or grows out of the plus) | README:85 |
| B2.12 | `.tc-list-drop-bar` (1031) | width | `snap` | Drop line level change (left end only) | README:85 |
| B2.13 | `.tc-drop` (1147) | top | `snap` | Timeline drop line steps between grid times | README:88 |
| B2.14 | `.tc-float-plus.is-flying` (1161) | transform, opacity | `fly` | Plus flies into the field or back | README:255 |
| B2.15 | `.tc-float.is-flying` (1163), `.is-sinking` (1167) | transform, width, height, background, shadow, opacity | `fly` (sinking opacity in-out) | Card copy lands / flies back / sinks into a header | tasks.md:74 |
| B2.16 | `.tc-float-under` (1169), `.tc-float-count` (1252) | opacity | `fly` | Stack layers and count fade at landing | README:228 |
| B2.17 | `.tc-backdrop` (1187, closing 1191) | opacity | `menu` / `collapse` | Overlay open / close | README:138 |
| B2.18 | `.tc-level` (1192, 1194) | filter (shadow) | `menu` / `collapse` | same | README:138 |
| B2.19 | `.tc-lifted, .tc-seg-copy, .tc-control-copy, .tc-menu-subtasks, .tc-menu-field` (1195, 1221) | opacity | `menu` / `collapse` | same | README:138, 300 |
| B2.20 | `.tc-pick` (1235) | width, margin, border-width, opacity, background | `collapse` | Select mode circles slide in; picked fill | tasks.md:190; README:341 |
| B2.21 | `.tc-progress-dot` (1240) | opacity | `collapse` | Hidden in select mode | README:341 |
| B2.22 | `.tc-desc-peek` (1257, 1261) | opacity, transform | `menu` / `collapse` | Description peek; `is-away` hides | README:292 |
| B2.23 | `.tc-panel` (1267, 1273) | opacity, transform (rise + scale 0.94) | `menu` / `collapse` | Menu panel open / close | README:138 |
| B2.24 | `.tc-menu-switch` (1319), knob (1321) | background, transform | `snap` | Folder switch toggled | screen.md:64 |
| B2.25 | `.tc-quick-bar.is-gliding` (1398) | transform | `keyboard` / ease-keyboard | Phone bar rides the keyboard | README:258 |
| B2.26 | `.tc-quick-bar.is-desk`, `.tc-quick-mode` (1404-1405) | opacity, visibility | `collapse` | Desktop capsule away (field scrolled off / idle) | code only |
| B2.27 | `.tc-sheet` (1465) | opacity, transform (rise) | `fade` | Full screen opens / closes | README:361 |
| B2.28 | `.tc-level-row.is-shifting` (1481) | transform | `snap` | Settings rows step aside | settings.md:9 |
| B2.29 | `.tc-search` (1505, 1507), desktop (1519) | opacity, transform | `menu` / `collapse` | Search open / close | README:329 |
| B2.30 | Phone `.tc-tree-panel` (1617-1618) | transform (slides in from left), visibility delayed | `slide` / in-out | Panel opens / closes on phone | screen.md:36 |
| B2.31 | Phone `.tc-tree-dim` (1619-1620) | opacity | `slide` | Dim with the panel | screen.md:36 |
| B2.32 | Desktop `.is-docking .tc-tree-panel` (1627-1628) | transform | `slide` | Docked panel slides in / out | screen.md:35; D64 |
| B2.33 | `.is-docking` strip parts, stage, wheel, view button, capsule, filter, fade, stage columns, arrows (1629) | left, margin-left, width, padding, gap | `slide` | Columns move with the docked panel as one motion (class held 300ms; not on the first drawing) | D64 |
| B2.34 | `button.tc-view-btn` (1636); with settling wheel (1642) | opacity, transform / left | `collapse` / `slide` | Hidden in select / entry (1643); moves with the wheel | D24 |
| B2.35 | `.tc-row` (1682) | height (with code-set `transition-delay` while a card fades) | `collapse` | Rows mode heights | D60, D67, D76 |
| B2.36 | `.task-calendar.is-redrawn …` (1672), `.tc-rows-stack.is-still > .tc-row` (1683) | transition: none | — | Another context drawn / room changed: heights jump into place | D52, D61 |
| B2.37 | `button.tc-btn:active` (782) | opacity → `--tc-pressed` (no transition) | — | Press | README:281 |

### B3. rAF loops, timers and scroll glides

| # | Trigger | What moves | Timing | Where | Approval |
|---|---|---|---|---|---|
| B3.1 | Swipe released / arrow turn | Screen runs to the next place / day or back; time scaled by the remaining distance | `slide` × share, cubic ease-out `1-(1-t)^3`; safety timer +100ms | `ScreenPager.ts:70-88, 130-138` | screen.md:124, 127 |
| B3.2 | Day track follow | Day list and timeline day layers translate with `clip-path` window; next day's from the side; header switches name at half way | per frame | `ScreenTracks.ts:54-113`, `CalendarScreen.ts:758-761` | screen.md:125, 127 |
| B3.3 | Strip track follow | Scrubs B1.17; wheel turns along (`follow`) | per frame | `ScreenTracks.ts:170-174`, `ColumnSwitch.ts:222-226` | README:34, 79 |
| B3.4 | Rubber band | Strip parts translate `edgeGive` | per frame | `ScreenTracks.ts:22-48` | screen.md:93 |
| B3.5 | Divider into / out of the middle | Width glides from shown to target (retargets mid-glide); release waits for the glide | `snap` / `ease-out` via rAF | `motion/SnapGlide.ts:27-73`, `Divider.ts:79-93` | screen.md:25 |
| B3.6 | Menu opening over a partly hidden card | Column scrolls the card into full view first; a finger taking the column cancels the menu | `collapse` / `ease-out` (rAF) | `menu/inView.ts:55-67`, `motion/SmoothScroll.ts`, `LiftedMenu.ts:58-74` | README:128 |
| B3.7 | Search reveals a card | List / timeline scrolls the card into view (next frame after drawing) | `collapse` | `FoundCard.ts:7-14, 38` | tasks.md:212 |
| B3.8 | Field opens / moves / grows | List / timeline scrolls the field ≥16px over the phone bar (desktop: room for the capsule); repeated when the field's grow animation ends | `collapse` / `ease-out` (ScrollGlide) | `QuickEntryController.ts:597-666` | D78; tasks.md:9 |
| B3.9 | Keyboard slides in / out | Bar glides from the keyboard's rise; list scrolls with the keyboard | `keyboard` / ease-keyboard | `QuickEntryController.ts:448-456`, `QuickBar.ts:252-264`, `Keyboard.ts` | README:258 |
| B3.10 | Field in a calendar menu over the keyboard | Copy, stack and field row raised | instant | `TaskMenu.ts:243-248`, `LiftedMenu.ts:99-103` | code only |
| B3.11 | Auto-scroll at edges | scrollTop += up to 12 px / frame | rAF | `drag/AutoScroll.ts:57-82` | README:86 |
| B3.12 | Pinch / ctrl-wheel | Timeline laid out once per frame at the newest scale, minute under the fingers kept | rAF | `CalendarScreen.ts:977-985`, `Timeline.ts:248-253` | screen.md:138 |
| B3.13 | Float copy / plus flies | CSS transition (B2.14-15) awaited by timer `fly` + 20ms | timer | `FloatingCard.ts:119-146`, `PlusFloat.ts:46-52` | tasks.md:74 |
| B3.14 | Overlay show / add part | `is-shown` added on the next frame so the transition runs | rAF | `Overlay.ts:65-97` | README:138 |
| B3.15 | Overlay close | Parts removed after `collapse` | timer | `Overlay.ts:151-171` | README:138 |
| B3.16 | Window panel show (`Panel.show`) | Forced layout then `is-shown` (grows in) | — | `kit/Panel.ts:137-140` | code only |
| B3.17 | View menu | Placed again on the next frame (layout settling) | rAF | `ViewMenu.ts:53` | code only |
| B3.18 | Full screen open / close | `is-shown` next frame; removed after `fade` | rAF / timer | `FullScreen.ts:134, 213-214` | README:361 |
| B3.19 | Wheel `is-settling` | Class held `slide` ms | timer | `ColumnSwitch.ts:213-219` | README:34 |
| B3.20 | Ribbon `is-switching` | Class held `slide` ms | timer | `RibbonLayout.ts:136-145` | README:79 |
| B3.21 | Docking | `is-docking` held `slide` ms | timer | `CalendarScreen.ts:1498-1507` | D64 |
| B3.22 | Rows fit | Heights set next frame; re-measured after delay + 2 × `collapse` + 32ms | rAF / timer | `RowsLayout.ts:97-153` | D76 |
| B3.23 | Scrolled list shrinking | Room held under the last row for 2 × `collapse`, then given back as the user scrolls up | timer + scroll | `motion/ScrollHold.ts:9-54` | tasks.md:5 |
| B3.24 | Now line | Moves every minute; overdue tasks ride it | interval 60s | `CalendarScreen.ts:476, 483-490`, `Timeline.ts:377-381` | screen.md:137 |
| B3.25 | Settings row reorder | Released row settles, then DOM reorder after `snap` | timer | `RowReorder.ts:53-74` | settings.md:9 |
| B3.26 | Timeline opening anchor | Minute held at its fraction (now: 0.5; other days: top at hour) through resizes until touched | ResizeObserver | `Timeline.ts:259-305`, `CalendarScreen.ts:1677-1680` | screen.md:134 |
| B3.27 | Ask confirmation inside a menu | Question scrolled into view, browser smooth | browser | `TaskMenu.ts:401` | code only |
| B3.28 | Search arrow keys | Picked row scrolled into view (nearest) | instant | `SearchWindow.ts:133` | — |
| B3.29 | Section name field, tree name field | `scrollIntoView` nearest | instant | `CalendarScreen.ts:1172`, `TreePanel.ts:107` | — |

---

## C. Layout rules: every DOM measurement

Kind: **content** = depends on sizes only the browser knows (text width, wrapping, fonts, real element boxes in the
window); **state** = derivable from state, settings, core rules or tokens; **mixed** = both. Token reads
(`tokenMs`/`tokenPx`, `getComputedStyle(...).getPropertyValue("--tc-…")`) are listed in C8.

### C1. Screen frame and layouts

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C1.1 | `CalendarScreen.ts:574-575` | panel `offsetWidth`, root `clientWidth` | Stage width (view less docked panel) for list widths | mixed (view width is the browser's) |
| C1.2 | `CalendarScreen.ts:442` | root `clientWidth` | Rubber band distance | content (window) |
| C1.3 | `CalendarScreen.ts:750, 755` | day lane / timeline column `offsetWidth` | Day track distances | content (window) |
| C1.4 | `CalendarScreen.ts:1650, 1673` | timeline `getBoundingClientRect().top`, `scrollTop` | Keep hours still when the all-day rows of the new day differ | content |
| C1.5 | `CalendarScreen.ts:1662` | `offsetHeight` | Forced reflow to end `is-redrawn` after one frame | — (flush) |
| C1.6 | `RibbonLayout.ts:107` | root `clientWidth` | Edge track width | content |
| C1.7 | `ScreenTracks.ts:152-159, 188-191` | `getComputedStyle` left / margin-left / width / padding / gap of every strip part at both places | Keyframes for the scrubbed strip and its distance (Soon's travel) | mixed (CSS computes from tokens and window width) |
| C1.8 | `StillLayout.ts:92` (via `stageWidth`) | stage width | Column widths from the core (`layoutWidths`) | mixed |
| C1.9 | `RowsLayout.ts:75` | ResizeObserver on the stack | Refit rows still when the room changes | content |
| C1.10 | `RowsLayout.ts:112-117` | stack `clientHeight`, padding-bottom, row margin-top, each row's height | Room for `stackedLists` | content |
| C1.11 | `RowsLayout.ts:123` | fade probe `offsetHeight` | Fade room in `stackedLists` | state (token box) |
| C1.12 | `RowsLayout.ts:136` | `is-leaving` children | Delay rows while a card fades | state |
| C1.13 | `RowsLayout.ts:157-162` | field row, label `offsetHeight`, list padding, field resting height, entry probe | Typing heights when lists share the room | content (field wraps) |
| C1.14 | `RowsLayout.ts:178-205` | label height, list rect, row-gap, every in-flow child (computed position, bounding height, margins, resting rect), `::after` content and height, padding | Each list's wanted height and card stops (whole cards) | content |
| C1.15 | `RowsLayout.ts:216` | root `clientWidth` − stage width | Foot fade left edge past the rows column | mixed |
| C1.17 | `BlockHeight.ts:43-71` | scroller and root rects, block/root `offsetHeight`, children rects/margins, `::after`, paddings; Mutation + Resize observers | Note block height = its content (not `scrollHeight`) | content |
| C1.18 | `ProjectBlocks.ts:170` | `.cm-content` padding-bottom (inline) | `--tc-block-lift` over Live Preview's end room | content (Obsidian sets it) |
| C1.19 | `ViewWatch.ts:16` | MutationObserver of the note view | Re-place the block on mode / page change | content |
| C1.20 | `StatusBarRoom.ts:15-68` | MutationObserver, status bar inline style | `tc-status-bar-shown` on body (bottom row room) | content (Obsidian chrome) |
| C1.21 | `projects/TreePanel.ts:52-59` | ResizeObserver, panel `offsetWidth` | Lists re-framed for the docked panel's width | content |
| C1.22 | `TreePanel.ts:61, 68-69` | tree column `offsetWidth`, root `clientWidth` | Tree divider width, max, centre | mixed |
| C1.23 | `ColumnSwitch.ts:135` | icon `offsetWidth` | Finger px per wheel place | state (token width) |
| C1.24 | `SettingsTab.ts:425-432` | ResizeObserver, rows `scrollWidth` vs `clientWidth` | Settings rows wrap when one line overflows | content |

### C2. Lists, scroll edges, scroll hold

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C2.1 | `ScrollEdges.ts:15-34` | ResizeObserver; `scrollHeight`, `clientHeight`, `scrollTop` | Top / bottom fade classes and depths (lists, timeline, tree) | content |
| C2.2 | `ScrollHold.ts:28-44` | `scrollTop`, `clientHeight`, `scrollHeight` | Room kept under the last row while rows fold | content |
| C2.3 | `KeyedRows.ts:120` | every child's rect before a moving drawing | FLIP from (B1.4) | content |
| C2.4 | `Motion.ts:16-24, 31-43, 48, 77, 90, 117, 150, 189, 205, 217` | easing token, current transform matrix, rect, parent row-gap, margins, height, opacity, top/left/height of absolutes | Timing, resting boxes of moving rows, grow/leave keyframes, FLIP | content |
| C2.5 | `dom.ts:49-62` | transforms of the element and its ancestors | Resting top of the bar (phone) | content |
| C2.6 | `TaskList.ts:141`, `ProjectTasks.ts:262` | `edges.update()` (C2.1) after each drawing | Fades follow content that changed without a scroll | content |
| C2.7 | `ProjectTasks.ts:175` | sets `scrollTop = 0` | Another node drawn from the top | state |
| C2.8 | `ProjectTree.ts:57, 72` | tree `scrollTop` | Kept across redraws | state |
| C2.9 | `DayPeek.ts:39-51, 117, 122` | frame and root rects, computed padding; list `scrollTop` | Next day's columns stand exactly over the shown ones, same list scroll | content |

### C3. Drag and drop hit tests

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C3.1 | `DragController.ts:181` | card rect | Grab offset (timeline: finger to top; list: card middle) | content |
| C3.2 | `DragController.ts:310, 336, 365` | source rect, `getClientRects` (still visible) | Float origin, flight home | content |
| C3.3 | `ListDrop.ts:151-152` | area rect, list rect | Hit test (and reach above for the title) | content |
| C3.4 | `ListDrop.ts:298-323` (`readFrame`, `offsetTop/Left/Width/Height` of every node, computed `--tc-subtask-indent`, `--tc-drop-dot`) | Measured once per drag in content pixels | Gap under the copy's middle, levels, headers, dashed place | mixed (heights are the card-size setting; two-line cards and headers are content) |
| C3.5 | `ListDrop.ts:214` | plate rect | Plus landing into a plate | content |
| C3.6 | `ListDrop.ts:457-458` | title and area rects | Column title hit | content |
| C3.7 | `drag/listFrame.ts:11-35` | list rect, scroll, client offsets | Content ↔ client coordinates | content |
| C3.8 | `AutoScroll.ts:17-22` | wheel row (`.tc-seg`) top | Phone bottom edge for auto-scroll | content |
| C3.9 | `DropLine.ts:28, 32` | dot token, forced reflow | Line starts at the plus, then moves | state + flush |
| C3.10 | `TimelineDrop.ts:35-45`, `Timeline.ts:211-219` | timeline and canvas rects (held during a drop or stretch) | Timeline hit test, minute under y | content |
| C3.11 | `Timeline.ts:528-536` | items and canvas rects | Where a dropped / new task rests (plus landing) | content |
| C3.12 | `ProjectDrops.ts:17-33, 42-52, 61-77` | each tree row rect, tree rect, `getClientRects` | Row under finger, gap at y, depth by x, gap line | content |
| C3.13 | `CarryReport.ts:42-49` | root and tree rects | Left-edge zone (24px), row under finger | content |
| C3.14 | `GroupDrag.ts:65, 75, 119-126` | header rect; every header top; last node bottom; list top | Section slots, grab, flight home | content |
| C3.15 | `TreeLift.ts:44, 56` | row rect, `window.innerWidth` | Clone size, kept inside the window | content |
| C3.16 | `FloatingCard.ts:42-75, 85, 125, 143` | float `offsetWidth`, rect height, stack inset token | Float width animation, stack layer widths, count badge, held-at, reflow before flight | content (title width) |
| C3.17 | `PlusRing.ts:46` | ring rect | Cancel hit and plus home | content |
| C3.18 | `PlusFloat.ts:22, 48` | plus `offsetWidth`, reflow | Scale into the field | content |
| C3.19 | `RowReorder.ts:30-36` | each settings row rect | Steps and target index | content |
| C3.20 | `wholeCard.ts:16, 24-77` | window size, title `clientWidth`, text width via `Range`, lines height, paddings | Copy stretched to the whole title (float and menu), wraps and grows down in the menu, events wrap | content |

### C4. Timeline

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C4.1 | `Timeline.ts:165-170` | ResizeObserver | Frame cache drop, whole-day refit, anchor held | content |
| C4.2 | `Timeline.ts:237-245` | `clientHeight`, computed padding-bottom | Whole-day hour height, visible height | content (window) |
| C4.3 | `Timeline.ts:248-253` | rect top, canvas `offsetTop` | Zoom anchor | content |
| C4.4 | `Timeline.ts:288-297` | canvas `offsetTop`, `offsetHeight` | Anchor scroll and room | mixed |
| C4.5 | `Timeline.ts:280-286` | `scrollTop` after set | Room under a short day so scroll holds | content |

### C5. Menus and overlays

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C5.1 | `inView.ts:33-48, 57` | each ancestor's overflow-y, rect, paddings; item rect | Which column scrolls, what of the card shows, how far to scroll | content |
| C5.2 | `LiftedMenu.ts:80-88` | shown part, window room | Copy position (kept in the column and window) | content |
| C5.3 | `MenuPanel.ts:226-230` | label `scrollWidth` vs `clientWidth` | Long labels fade (`is-long`) | content |
| C5.4 | `MenuPanel.ts:240-252` | safe-area probe paddings, window size | Room for menus | content (safe area) |
| C5.5 | `MenuPanel.ts:272-314` | panel `offsetWidth/Height`, each group's `offsetTop` | Above / below / split, max-height scrolling | content |
| C5.6 | `TaskMenu.ts:305` | stack rect bottom | Panel anchored under the subtasks | content |
| C5.7 | `PanelPages.ts:40-42, 70` | part rects before/after | Morph keyframes (B1.14) | content |
| C5.8 | `DescriptionPeek.ts:43-105` | menu `offsetHeight`, upper `offsetWidth`, window size, peek `offsetWidth`, text `scrollHeight` vs `clientHeight` | Side of the peek, max height, cut mark | content |
| C5.9 | `BulkMenu.ts:76-107` | each picked card rect, column rect, panel width | Copies of picked cards, panel beside the column | content |
| C5.10 | `GroupMenu.ts:21, 70`; `MoreMenu.ts:25`; `ViewMenu.ts:34-39`; `SourcesPopover.ts:33-57` | anchor rects, panel width, wheel's custom properties | Copy and panel positions | content |
| C5.11 | `kit/Panel.ts:138` | rect (reflow) | Grow-in starts shrunk | flush |
| C5.12 | `SearchWindow.ts:137-142` | root rect | Desktop search panel centred over the view | content |

### C6. Quick entry

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C6.1 | `QuickEntryController.ts:185, 191` | ResizeObserver on root and on the field's scroller | Re-reveal the field on view / list size change | content |
| C6.2 | `QuickEntryController.ts:625-630` | root, scroller, field rects | Follow the field into sight, place the bar | content |
| C6.3 | `QuickEntryController.ts:608` | field `getAnimations()` | Re-reveal once the field's growth ends | state (motion) |
| C6.4 | `QuickEntryController.ts:678-683` + `ObsidianChrome.ts:12-27` | status bar rect | Room above Obsidian's status bar | content |
| C6.5 | `QuickBar.ts:241, 268, 289-311` | parent rect, mode capsule width, bar rect, panel `offsetHeight`, resting top | Desktop capsule beside / over the field, panel side, bar room | content |
| C6.6 | `QuickBar.ts:256` | rect (reflow) | Glide starts from the old place | flush |
| C6.7 | `QuickBar.ts:285` | `innerHeight` | Bar docked over a menu's blur at the view's bottom | content |
| C6.8 | `QuickBar.ts:320-323` | label `scrollWidth` vs `clientWidth` | Long place name fades | content |
| C6.9 | `Keyboard.ts:44-49` | event's `keyboardHeight` or `--keyboard-height` | Bar rise | content (Obsidian) |

### C7. Other

| # | Where | Reads | Decision | Kind |
|---|---|---|---|---|
| C7.1 | `FoundCard.ts:7-14` | scroller and card rects | Scroll the found card into view | content |
| C7.2 | `CalendarScreen.ts:569, 1447`; `ProjectBlocks.ts:132` | `body.is-mobile`, `theme-light` classes | Wide vs narrow, theme | state (Obsidian's flags) |

### C8. Token reads (read from CSS each time)

| # | Where | Token |
|---|---|---|
| C8.1 | `design.ts:177-181` (`tokenMs`/`tokenPx`) used in `CalendarScreen.ts:442, 1504`, `ColumnSwitch.ts:216`, `RibbonLayout.ts:141`, `RowsLayout.ts:131`, `Overlay.ts:162`, `FullScreen.ts:214`, `ScrollHold.ts:28`, `SmoothScroll.ts:18`, `SnapGlide.ts:32`, `Keyboard.ts:40`, `FloatingCard.ts:66, 130, 145`, `PlusFloat.ts:51`, `DropLine.ts:28`, `QuickEntryController.ts:664`, `LiftedMenu.ts:107`, `DescriptionPeek.ts:45, 59, 69, 80`, `MenuPanel.ts:243`, `BulkMenu.ts:99, 107`, `GroupMenu.ts:25, 74`, `MoreMenu.ts:29`, `ViewMenu.ts:39`, `wholeCard.ts:16, 29, 70`, `RowReorder.ts:72` | durations, easings, `--tc-menu-gap`, `--tc-whole-margin`, `--tc-fade-card`, `--tc-fade-block`, `--tc-stack-step-x`, `--tc-drop-dot`, `--tc-desc-peek-max` |
| C8.2 | `ListDrop.ts:320-322` | `--tc-subtask-indent`, `--tc-drop-dot` from the list |
| C8.3 | `Motion.ts:16`, `SnapGlide.ts:35`, `SmoothScroll.ts:30`, `QuickEntryController.ts:665` | `--tc-ease-out` |
| C8.4 | `SourcesPopover.ts:37-38` | wheel's window custom properties copied to its copy |

---

## D. Screens, modes, places

### D1. View modes × places × filters

| # | Mode | Platform | Places / pages | Columns | Swipe | Wheel | Divider | Doc |
|---|---|---|---|---|---|---|---|---|
| D1.1 | Two columns («Columns» on the phone) | B | Inbox–Soon, Soon–Now, Now–calendar (default Today), days to the right, Done left of Inbox (search only) | Inbox over Backlog (halves, own titles), Soon, day list, timeline; halves at Inbox and Soon, divider only at Now–calendar | Yes (pages) | Yes, view button beside it | Ribbon divider | screen.md:7-26, 112-128; `RibbonLayout.ts` |
| D1.2 | All columns | D only | none | Inbox over Backlog, Soon, day list (equal widths set by the divider), timeline the rest | No | No (view button alone, centred) | Before the timeline | screen.md:86, 92; `ColumnsLayout.ts` |
| D1.3 | Rows | B | none | Inbox, Backlog, Soon, day list stacked with small labels; timeline beside with the day title and arrows | No | No | Before the timeline | screen.md:87, 91; `RowsLayout.ts` |
| D1.4 | By project | B | none | Parts by subproject (or by top project without filter, No project last), stage marks right; timeline beside | No | No | Before the timeline | screen.md:54-59, 88; `ByProjectLayout.ts` |
| D1.5 | Filter: none / All | B | — | All tasks; folder button in the titles row; no title or cross | — | — | — | screen.md:39, 47; D53 |
| D1.6 | Filter: project | B | — | Only its tasks (with subprojects while Subprojects is checked); title + cross over the columns; no folder marks on cards | — | — | — | screen.md:31, 39, 42, 95; D10 |
| D1.7 | Filter: folder | B | — | Only subprojects' tasks; no own part; plus off its own part | — | — | — | screen.md:68-75 |
| D1.8 | Filter: No project | B | — | Tasks without project; by project = one part | — | — | — | screen.md:54; D54 |
| D1.9 | Filter: Done / done project | B | — | Drawn as by project whatever the mode; button keeps showing the chosen mode | — | — | — | screen.md:59; D54 |
| D1.10 | Subprojects row | B | View menu | Shown only for a project / folder with subprojects | — | — | — | screen.md:95 |
| D1.11 | Mode kept per device; filter kept per device; place kept per device; mode / filter independent | B | — | — | — | — | — | screen.md:26, 39, 81; D49; memory «independent controls» |
| D1.12 | Another context (filter, mode, Subprojects, first read) drawn still in place; same context changes move | B | — | — | — | — | — | screen.md:94; D52, D61 |
| D1.13 | Kept mode not offered (All columns on the phone) falls back | B | — | — | — | — | — | D5 |
| D1.14 | One layout mounted at a time: a mode change destroys the old layout and mounts the next; the timeline keeps its scroll | B | — | — | — | — | — | `CalendarScreen.ts:582-592` |

### D2. Panel

| # | State | Platform | Behaviour | Doc |
|---|---|---|---|---|
| D2.1 | Docked panel | D | Left of the lists, «Projects» title, tree, divider; lists share the rest; wheel/view button centre on the lists; Undo capsule at the tree inset; gives way on narrow views (lists ≥ 390, tree ≥ list least) | screen.md:35; D23, D79 |
| D2.2 | Overlay panel | P | Slides over the lists from the left, rest dimmed; under the bottom row; pick closes | screen.md:36; D14, D26 |
| D2.3 | Panel brought out by a carry | B | Not kept; closes when the carry ends (except while naming a new project) | D8, D39 |
| D2.4 | Open state kept per device (button's only) | B | — | screen.md:37 |
| D2.5 | Top row | B | Shown while a filter is set or the mode has no column titles (rows, by project); otherwise the folder button sits in the titles row before the first title | D22 |
| D2.6 | Tree rows | B | All, projects (tiles top level, lines deeper with branch lines), No project, Done; folded tile peeks, folded line `…`; selected filled; grey names for no open tasks | screen.md:47-51 |
| D2.7 | Missing tasks file inside the panel | B | `is-missing` | `TreePanel.ts:86` |

### D3. Note block

| # | Behaviour | Doc |
|---|---|---|
| D3.1 | At the end of a note attached to a project, in Reading view (footer) and Live Preview (after content); never written into the note; none for notes without a project | screen.md:99; D7; `ProjectBlocks.ts:160-176` |
| D3.2 | Modes Rows (default) and By project; kept once for all notes; Subprojects row shared with the main screen | screen.md:99; D6 |
| D3.3 | No tree, no calendar, no cross, no swipe, no rubber band; bottom row (Undo + ⋯, view button, plus) inside the frame | D28, D29, D63 |
| D3.4 | Height = its content (lists not scrolling), up to the CSS max; refit not during a drag; no drop room | D29, D80, D82; `BlockHeight.ts` |
| D3.5 | Follows note renames, mode switches, view closes | `ProjectBlocks.ts:113-116, 148-154, 178-183` |
| D3.6 | Its own key scope while focused; presses don't reach the note | `ProjectBlocks.ts:31-70` |

### D4. Other screens and states

| # | State | Behaviour | Doc / code |
|---|---|---|---|
| D4.1 | Before the first read | View and place from the device (`firstView`, `firstPlace`); first cards drawn at once; panel doesn't slide on first drawing | D38, D40; `CalendarScreen.ts:325-326, 1501` |
| D4.2 | Missing tasks file | Lists and timeline hidden, box «No tasks file at …» + Create file | `CalendarScreen.ts:1639-1644, 1682-1686` |
| D4.3 | Empty list under a filter, in rows, in by project | «No tasks» plate (core words); two columns without filter: empty stays empty | D18, D33, D37 |
| D4.4 | Empty section | Header + dashed plate | tasks.md:101 |
| D4.5 | Done column | Only via search; wheel pill on Inbox alone; any move leaves it | screen.md:114 |
| D4.6 | Found task | Ring until any press; list scrolled to it; folded parent unfolds; hiding filter cleared; Done find outside two columns opens full screen | tasks.md:212; screen.md:114 |
| D4.7 | Full screen | Over the whole view (desktop: centred column); back to a level up when the task vanishes, closes when none | tasks.md:155-172 |
| D4.8 | Search | Phone: field over the keyboard, results over it, Cancel; desktop: panel top centre | tasks.md:205 |
| D4.9 | Select tasks mode | Circles on list cards, not timeline; bottom row swapped; wheel and swipe still work | tasks.md:188-193 |
| D4.10 | Field open (entering) | Plus, wheel, view button hidden; foot fade shrinks; phone bar over the keyboard, Obsidian's mobile toolbar hidden; folder button locked | `styles.css:767, 839-845, 854, 1643`; D48 |
| D4.11 | Dragging | Plus and capsule fade; `is-dragging` | tasks.md:74 |
| D4.12 | Menus | Task, bulk, section, project, event, view, more, sources; one sheet handed between ⋯ and Search, task and subtask | README:133-160, 300 |
| D4.13 | Hidden view / popout | Minute tick and day check deferred until shown | `CalendarScreen.ts:483-505` |
| D4.14 | Day relation | Today: now line, now-anchored open; other days: hour from settings; past day: no sections | screen.md:24, 134 |
| D4.15 | Calendar dot on the wheel | Orange / red per source status | screen.md:108 |
| D4.16 | Theme | Follows Obsidian; event colours computed per theme | screen.md:162 |

### D5. Settings that change the screen

| # | Setting | Effect on screen | Where |
|---|---|---|---|
| D5.1 | Card height, card gap | Body tokens; timeline restacked | `settingsEffect.ts:18`, `cardSize.ts`, `CalendarScreen.ts:562` |
| D5.2 | List share (divider), tree width, zoom | Frame redrawn; per device | `settingsEffect.ts:19`, `viewSettings.ts` |
| D5.3 | Tasks file, sections presets, No section name, priorities, labels, several-labels paint | Frame and lists redrawn | `settingsEffect.ts:20-26` |
| D5.4 | Long press delay | Every LongPress, wheel hold | `CalendarScreen.ts:229, 266, 379, 1593` |
| D5.5 | Zoom levels | Pinch bounds, whole-day fit | `CalendarScreen.ts:950-965` |
| D5.6 | Day starts at | Day change event: screen reopens on today | `CalendarScreen.ts:511-520` |
| D5.7 | Scroll to hour | Opening scroll of non-today days | `CalendarScreen.ts:1677-1680` |
| D5.8 | Section headings names | Column titles, place button, tiles | settings.md:62 |
| D5.9 | Calendars shown, stale after | Events, wheel dot | settings.md:41-44 |

---

## Counts

| Table | Rows |
|---|---|
| A. Inputs and gestures (A1–A16) | 4 + 23 + 4 + 15 + 12 + 19 + 19 + 5 + 11 + 3 + 15 + 13 + 22 + 10 + 11 + 17 = **203** |
| B. Motions (B1–B3) | 18 + 37 + 29 = **84** |
| C. Layout measurements (C1–C8) | 23 + 9 + 20 + 5 + 12 + 9 + 2 + 4 = **84** |
| D. Screens, modes, places (D1–D5) | 14 + 7 + 6 + 16 + 9 = **52** |
