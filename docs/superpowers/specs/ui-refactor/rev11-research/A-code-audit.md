# A. Code audit: new UI (`obsidian/ui/next`, `obsidian/runtime`) vs old UI (`obsidian/ui`)

Worktree `.worktrees/ui-refactor-slice3`, branch `ui-refactor-slice3`, HEAD `13fb8008`. Read-only audit.
Paths below: `next/…` = `obsidian/ui/next/…`, `rt/…` = `obsidian/runtime/…`, old files are relative to `obsidian/ui/`.

## 0. The headline

1. **The old UI already had one screen for both places.** `ProjectBlocks.ts:32` builds the note's block as
   `new CalendarScreen(app, root, deps, { view: false, keys: this.scope, note: () => this.path })`. The leaf and the note
   run the same `CalendarScreen`, the same layouts, the same drag, the same quick entry. They differ through
   `ScreenPlace` (`CalendarScreen.ts:104-111`) at about 10 spots (§4).
2. **The new UI has no leaf at all.** Everything above the drivers is typed on `BlockModel`
   (`next/model/block.ts:19-51`). The model carries `note: string` (l.21), the lists are `BlockLists` (l.150-153), and
   the view is the D5 board's block (`next/view/Block.tsx:38-79`). There is one host, `BlockHost` (`next/host/block`),
   and the only switch is `NewScreens { newBlock }` (`obsidian/composeRuntime.ts:12-14`).
3. **Nothing of the main screen exists in `next/`**: the ribbon and paging (old `ScreenPager`, `Swipe`, `ScreenTracks`,
   `ColumnSwitch`), the divider (`Divider`, `SnapGlide`, `listWidth`), All columns (`layouts/ColumnsLayout`), the
   timeline (`Timeline`, `drag/TimelineDrop`, `PinchZoom`, `DayNav`, `DayPeek`, `AllDayRow`, `timelineLayout`), the
   projects tree panel (`projects/TreePanel`, `ProjectTree`, `TreeLift`, `ProjectDrops.TreeDrop`, `FilterTitle`), the
   sources popover, the event menu, the Done column and the docked panel.
4. **The runtime (`obsidian/runtime`) is clean and generic.** `HostSession` explicitly names "the leaf, a note's
   block, the settings tab" (`rt/HostSession.ts:25`). Nothing in it knows the block.

## 1. Classification of every module (80 files)

Legend:
- **G**: generic, usable as is by any place.
- **P-type**: place-shaped only by its types (`BlockModel` / `BlockMsg` in a signature). A rename or a narrower
  input type fixes it; the logic is generic.
- **P-logic**: place-shaped in its logic or data shape.
- **H**: host-only, legitimately specific to embedding.

### 1.1 `next/model` (20)

| Module | Class | Evidence |
|---|---|---|
| answers.ts | G | `Need`, `Answers`, `resultOf`, `okResult`: plain data over the door. |
| assertNever.ts | G | |
| card.ts | G | `cardFace(item, day, stage)` l.66: a pure function of `TaskItem`. |
| commands.ts | G (note) | `Command<Msg>` is generic over `Msg`. `measureCarry` (l.39) returns `CarryGeometry`, which is single-stack (see carry.ts). `noteSearch` (l.37) is fine. |
| full.ts | G | `fullNeeds(layer, answers, filter)` l.100 takes the filter as an argument, not the block. |
| layers.ts | G (note) | `Layer` union l.9-14: viewMenu, moreMenu, taskMenu, full, sectionMenu. It is closed, and the leaf needs more layers (sources, event menu, projects panel). |
| lists.ts | G | `ListModel`, `funnelList`, `projectsList`, `withBranches`: one list model for any list. `FunnelListInput.column: DropColumn` l.121 has no timeline, which is correct for a list. |
| monthGrid.ts | G | |
| search.ts | G | `pickedRow(wide, search, answers)` l.79 takes `wide` as an argument. |
| section.ts | G | |
| select.ts | G | |
| taskMenu.ts | G | Over `TaskMenuLayer`/`MenuInput`. The doc says "over the block" (l.64, l.244: "the block is never the whole screen"), but there is no block type. |
| **block.ts** | **P-logic** | The root of the problem; see §2.1. |
| **carry.ts** | **P-logic** | `MeasuredList.column: DropColumn \| "projects"` l.15: no `timeline`, no tree. The geometry is "in the stack's content pixels" (l.3, l.23-32): one scroller for every list. `CarryTarget.drop` l.43 has only `list` and `projects`. |
| **carryPlace.ts** | **P-logic** | `import type { BlockLists } from "./block"` l.2. `listModelOf(lists: BlockLists, …)` l.15-20. `targetAt(carry, lists: BlockLists, …)` l.55. `sectionSlots` requires `lists.kind === "rows"` l.121. |
| **carryView.ts** | **P-logic** | Every function takes `BlockModel` (l.17, 33, 43, 49, 62, 73). `floatFace` re-flattens `BlockLists` l.66. `footAside` l.73-75: "the plus and the capsule", the block's foot. |
| **entry.ts** | **P-logic** (partly) | `EntryModel` and `barTiles` are generic. `entryLists(lists: BlockLists)` l.90-94, `entryLook(model: BlockModel, …)` l.97 (reads `noteView` l.98), `entryNeeds(model: BlockModel)` l.128, `withEntry(…, model: BlockModel)` l.202 and `drawnLists(model: BlockModel): BlockLists` l.248-254 are block-shaped. |
| **fullList.ts** | **P-logic** | `fullList(model: BlockModel)` l.12. `fullRowVars` fakes a `BlockLists`: `rowVars({ kind: "byProject", context: "full", list })` l.26, which shows the list type overloaded. |
| **menuNeeds.ts** | **P-logic** | `cardRows(model: BlockModel)` flattens `BlockLists` l.8-13. `menuScreen` reads `shownDay`/`screenView` of the block l.34-39. |
| **messages.ts** | **P-type** | `BlockMsg` l.34-69. Generic in content except `modePicked`/`subprojectsPicked` (l.46-47), whose update writes the note's own mode (update/block.ts:112). |

### 1.2 `next/recognizers` (1)

| press.ts | G | A pure state machine over `PressInput` (l.67). It knows no list and no place. |
|---|---|---|

### 1.3 `next/update` (11): every function signature is `(BlockModel, …) => Step`, and `Step` is `[BlockModel, BlockCommand[]]` (update/block.ts:17-18)

| Module | Class | Evidence |
|---|---|---|
| **block.ts** | **P-logic** | `withMotion`/`rowsOf`/`sameRows` over `BlockLists` l.22-52. `modePicked` writes `tasks.setNoteViewMode` l.112, the note-only write; the leaf's is `setViewMode` (old `CalendarScreen.ts:1528`). `closeTop` pins `currentLists(model)` l.67. Its doc reads "A note's block (P2)" l.75. |
| **carry.ts** | **P-logic** | `listsOf(lists: BlockLists)` l.18-22, `cardRowOf` l.25, `without` l.47-53 branch on `rows`/`byProject`. `lifted` sends `startCarry([start, model.wide])` l.85. `dropped` admits `"timeline"` as an origin l.95 but nothing in `next/` can lift from a timeline. `droppedNow` reads `noteView(model)` l.305. `tapped` branches on `model.wide` for ⌘/Shift picks l.321-324. |
| **entry.ts** | **P-logic** | `columnOf(model)` over `entryLists(shownLists(model))` l.41-45. The rest is the core's entry protocol, which is generic. |
| **search.ts** | **P-logic** | Reads the filter as `noteView(model)?.filter?.node` l.57. `pickedRow(model.wide…)` l.41/44. The `revealed` branch sets `model.day` l.71, which assumes one day list. |
| **select.ts** | **P-logic** | `columnOf` over `listsOf(currentLists(model))` l.10-16. |
| **section.ts** | **P-logic** | `currentLists(model)` l.22. |
| **menu.ts** | P-type | All logic goes through `menuNeeds`/`taskMenu`. Block only by its signature. |
| **full.ts** | P-type | Generic full-card logic. `project` selects a project node l.108-111, the same as the leaf. |
| **ids.ts** | P-type | `remapIds(model: BlockModel, …)` l.29. |
| **fullActs.ts** | P-type | It returns `BlockMsg` only. |
| **acts.ts** | **P-logic** | `rowOf` flattens `BlockLists` l.9-14. The act vocabulary (`undo`, `more`, `view`, `plus`, `room`) is the block's foot l.24-73. |

### 1.4 `next/view` (13)

| Module | Class | Evidence |
|---|---|---|
| Card.tsx | G | `Card`, `Title`, `Meta`, `Due`, `colourAttributes`. `CardAs` l.44 covers listed, float, lifted, whole and probe. |
| List.tsx | G | `List({ list: ListModel, kind, column, marks… })` l.44. `ListKind` l.22 is `row`, `projects` or `full`, with no place. |
| Sheet.tsx | G | `Backdrop`, `Placed` (anchored by `data-n-anchor`), `MenuGroup`. |
| icons.tsx | G | |
| entry/Bar.tsx | G | `Bar({ entry, wide, … })` l.42 takes plain props. |
| carry/SelectFoot.tsx | G | `SelectFoot({ picked })` l.5. |
| **Block.tsx** | **P-logic** | The D5 block: `Lists` switches on `rows`/`byProject` l.17-36; one `Stack` (`data-n-stack`) scrolls every list l.95-105; the capsule, view button, plus and full card are placed in the block frame l.60-76; `SearchInBlock` l.76. |
| **BlockRoot.tsx** | **P-logic** | The root class `tc-n-block`, `data-n-key="root/block"` l.17. |
| **Layers.tsx** | **P-logic** | `ViewMenu` anchors on `"view"`, `MoreMenu` on `"capsule"` (Search and Select tasks only) l.17-58, the block's foot. `Layers({ model: BlockModel })` l.99. |
| **search/Search.tsx** | **P-logic** | `noteView(model)?.searchPaths` l.82. `SearchInBlock` (the phone covers the block) l.121 and `SearchOver` hangs from `data-n-place="block"` l.143. |
| carry/CarryFloat.tsx | P-type | `{ model: BlockModel }` l.12. The logic is `floatFace`'s. |
| full/FullCard.tsx | P-type | `{ model: BlockModel }` l.21. The doc says "One task over the whole block" l.16. |
| menu/TaskMenu.tsx | P-type | `MenuProps.model: BlockModel` l.248, used only for `menuDrawing(model, layer)`. |

### 1.5 `next/drivers` (9)

| Module | Class | Evidence |
|---|---|---|
| chrome.ts | G | `Chrome.wide()` = `!Platform.isMobile` l.9-11. |
| focus.ts | G | `Focus.take/field/element/leave/inField`. |
| input.ts | G | `acts`, `presses`, `fields`, `typing`, `enter`, `escape`, `secondPress`, `timer` take any root. `shield` l.30-38 is what a note needs, but it is a generic utility. |
| islands.ts | G | `Islands`, `Editors`, `Rendered`, `obsidianTitleField`. `MountNode` is a plain node. |
| keys.ts | G | `Keys(app, el, on)` l.10-35 pushes a scope while the focus is inside `el`, which works for a leaf as well. `BlockKey` is only a name. |
| overlay.ts | G | One overlay node per window. |
| scroll.ts | G | `EdgeScroll(scroller, edges, scrolled)` l.18 and `Scroll.glide/glideTo` take any scroller. |
| **measure.ts** | **P-logic** | `Measure.stack(root)` finds a single `[data-n-stack]` l.38-41. `Measure.carry(stack)` measures every list against one stack l.78-97, with the column names hard-coded l.82 (`inbox\|soon\|day\|backlog\|projects`: no timeline, no tree). `watchPage` l.99-121 is host-only (it watches a note's page). `toShow` is generic. |
| **motion.ts** | P-logic (small part) | The row FLIP, leave, layers, menu placement, fly and `intoView` are generic. These parts are block-only: `before()` reads `root.firstElementChild` as "the frame" l.72-73; `holdWhileLeaving` l.82-94 and `holdHeight` l.421-424 make the block grow with its rows; `put`/`inline` l.190-199 handle "the room Live Preview keeps past the note's end" (host-only helpers). |

### 1.6 `next/host/block` (2)

| Module | Class | Evidence |
|---|---|---|
| NoteBlocks.ts | **H** | One block per Markdown view l.45-63. It decides whether a note shows a block with `tasks.projectNoteView` l.76, places the block among Live Preview and Reading view l.111-131, and handles `--tc-block-lift` and `flex-grow` on `.cm-content` l.120-129. Legitimately host. |
| BlockHost.tsx | **H**, but it holds generic logic | The host-only parts are mounting in `MountNode` l.149-150, `chromeRoom` l.162, `shield` on the frame l.258, and the `Keys` per frame l.262. The **screen controller is trapped in it** and would have to be copied for a leaf: `blockProgram` and `entryDoor` l.84-108; `draw()`, which orders motion, vars, islands, layers and menu placement, l.195-227; `feed`/`gesture`/`over` (press recognizer → carry messages, edge scroll, target reads) l.270-349; and `run(command)` (the effects interpreter) l.378-435. It is typed on `BlockModel`/`BlockMsg` throughout, and the initial model is `blockModel(note, Chrome.wide())` l.155. |

### 1.7 `obsidian/runtime` (23) and `composeRuntime.ts` (1)

| Module | Class | Evidence |
|---|---|---|
| Runtime.ts, HostSession.ts | G | HostSession l.25: "the leaf, a note's block, the settings tab". |
| dispatch/Program.ts, Store.ts, ViewAnswers.ts | G | `Program<Model, Msg>`, `Store<Model, Msg>`: generic over the screen. |
| events.ts | G | |
| lifecycle/ActionLog.ts, MinuteClock.ts | G | |
| network/CalendarLane.ts, VaultCalendarTexts.ts | G | |
| persistence/PendingLog, ProjectsScreenLink, Rebaser, Replay, SettingsLink, TasksVault, TasksWriter | G | |
| replica/Door, HostFacts, Replica, ReplicaCalls, refs, resolve | G | |
| **composeRuntime.ts** | **P-logic** (composition only) | `NewScreens { newBlock }` l.12-14 is a per-place switch. `feeds: []` l.38, because "the note's block shows no calendar … until the leaf moves over (slice 4)" l.28-29. |

### 1.8 Counts per class

| Class | Count | Modules |
|---|---|---|
| GENERIC | **49** | model 12, recognizers 1, view 6, drivers 7, runtime 23 |
| PLACE-SHAPED | **29** | 21 by logic: model/block, carry, carryPlace, carryView, entry, fullList, menuNeeds; update/block, carry, entry, search, select, section, acts; view/Block, BlockRoot, Layers, Search; drivers/measure, motion; composeRuntime. 8 by type only: model/messages; update/menu, full, ids, fullActs; view/CarryFloat, FullCard, TaskMenu |
| HOST-ONLY | **2** | NoteBlocks.ts; BlockHost.tsx (about 60% of it is generic controller logic) |

By lines: the 21 place-shaped-by-logic files in `next/` (without composeRuntime) total about 3,360 lines out of about 8,390 in `next/`.

## 2. The place-shaped spots that matter most

### 2.1 `BlockModel` is the screen's model, and it is a note's (`next/model/block.ts`)
- `note: string` l.21. `blockModel(note, wide)` l.63.
- `blockNeeds` reads `tasks.projectNoteView` with `[model.note, model.wide]` as the root of everything l.75. Every
  other need waits on it (`funnel = noteView(model)` l.80). The leaf's root read is `funnelView(wide)` (old
  `CalendarScreen.ts:1443-1444`).
- `noteView()` l.104 is imported by update/carry, update/search, model/entry and view/Search.
- `day: LocalDate | null` l.43 is one day list. The leaf has a day list plus a timeline plus day navigation.
- `pinned: BlockLists | null` l.48 and `motion.context` l.57-61 are generic ideas held in a block type.
- `rootVars` writes on the key `"root/block"` l.258-261.

### 2.2 `BlockLists` is the only shape of "what the screen shows" (l.150-153)
- It has two variants, `rows` (lists stacked under labels, `BlockRow` l.139-147) and `byProject`. There is no ribbon,
  no columns (`allColumns`), no Done, no timeline lane and no tree panel.
- `listsOf` builds `rows` from `rowColumns(view) = layout.stack?.lists ?? view.rows` l.134-136. It reads only the
  Rows mode's stack; the other layouts the core gives (`view.layout.columns`, ribbon) are ignored except for titles
  l.200.
- Code that flattens `BlockLists` by hand appears **8 times**: update/block.ts:35-37, update/acts.ts:9-12,
  update/carry.ts:18-22 (`listsOf`), model/block.ts:236 and :244, model/menuNeeds.ts:10, model/carryView.ts:66 and
  model/entry.ts:90-94. Each one must change for any new layout.
- carryPlace.ts:2 imports `BlockLists`. `listModelOf` l.15-20 and `sectionSlots` l.121 (`lists.kind !== "rows"`) tie
  the drop rules to the block's two variants.

### 2.3 The carry assumes one scroller and only list or projects targets
- The geometry is in "the stack's content pixels" (`next/model/carry.ts:3`, l.23-32). `Measure.stack` finds one
  `[data-n-stack]` (`next/drivers/measure.ts:38-41`), and `Measure.carry` measures every list against it l.78-97.
- On the leaf, each column scrolls by itself, and on the phone the ribbon slides between pages
  (old `ScreenPager`/`ScreenTracks`).
- The target kinds are `list` and `projects` only (carry.ts:15, 40, 43; measure.ts:82). There is no timeline drop
  (old `drag/TimelineDrop.ts`), no tree drop (old `projects/ProjectDrops.ts:90 TreeDrop`) and no "a held card opens
  another node" behaviour (old `CalendarScreen.drawCarried`).
- `BlockHost` builds exactly one `EdgeScroll` over that stack l.304. The old screen made one `AutoScroll` per drop
  target (`drag/ListDrop.ts:102`, `drag/TimelineDrop.ts:27`).

### 2.4 The note's own writes are in update
- `modePicked` → `tasks.setNoteViewMode` (update/block.ts:112). The old screen chose this by place
  (`CalendarScreen.ts:1528`).
- The root read is `tasks.projectNoteView` (model/block.ts:75).

### 2.5 The view is the D5 board, not a screen
- `Block.tsx` places the lists in one `Stack`, the foot (capsule, view button, plus) and the full card in one frame
  l.42-79.
- `Layers.tsx` anchors the View and More menus to `"view"` and `"capsule"` l.17-58. The More menu offers only Search
  and Select tasks.
- `BlockRoot.tsx:17` sets the class `tc-n-block`.
- The block frame grows with its rows (motion.ts:72-94, 421-424; model/block.ts:277 `holdsHeight`).

### 2.6 The screen controller lives in a host
- `BlockHost` holds the press → gesture → carry plumbing (l.270-349), the effects interpreter (l.378-435) and the draw
  pass ordering (l.195-227). A leaf host would have to repeat all of it.

## 3. Per-concern inventory: where each is implemented, and how many separate implementations

"Impl." counts separate mechanisms. A shared helper used by several callers counts once.

| Concern | NEW (`next/`) | New impl. | OLD (`obsidian/ui`, without `next/`) | Old impl. |
|---|---|---|---|---|
| **Column/list layout** | List model `model/lists.ts` (funnelList l.135, projectsList l.149). Lists of the screen `model/block.ts:150-221` (`BlockLists`: rows and byProject only). Drawing in `view/List.tsx:44` and `view/Block.tsx:17-36, 95-105`. | **1** (block Rows/ByProject only) | `layouts/ModeLayout.ts:27` interface with `mountLayout.ts:10`, implemented by `RowsLayout`, `ColumnsLayout`, `ByProjectLayout` (all `extends StillLayout`) and `RibbonLayout`; `FunnelLists.ts:47`; `LayoutHost.ts`. List renderers: `TaskList.ts:94` (also used by `FullScreen.ts:121`, `DayPeek.ts:80`, `RibbonLayout.ts:53`) and `projects/ProjectTasks.ts:56`. Strip and pager: `ScreenTracks`, `ScreenPager`, `Swipe`, `ColumnSwitch`, `Divider`, `listWidth`. | 1 layout mechanism with 4 layouts; **2** list renderers (TaskList, ProjectTasks) |
| **Drag (carry) and drop placement** | `recognizers/press.ts`, `model/carry.ts`, `model/carryPlace.ts` (`targetAt` l.55, `sectionSlotAt` l.133), `model/carryView.ts`, `update/carry.ts` (cards l.56, plus l.201, section l.236), `drivers/measure.ts:78`, `host/block/BlockHost.tsx:283-349`, `view/carry/CarryFloat.tsx`. Cards, plus and sections share one model. | **1** (targets: list and projects only) | Loops: `drag/DragController.ts` uses `DragSession` (l.332, 374) and `LongPress`; `drag/GroupDrag.ts:71` has its own `DragSession`; `projects/TreeLift.ts:40-60` has its own float and move loop; `RowReorder.ts` (settings) is its own. Targets behind `DropTarget` (`drag/DropTarget.ts:83`): `ListDrop`/`CardListDrop`, `ProjectsListDrop` (`projects/ProjectDrops.ts:172`), `TimelineDrop`, `TreeDrop` (`ProjectDrops.ts:90`), `SectionSlots` (`GroupDrag.ts:138`). Plus: `quick/PlusButton`, `drag/PlusFloat`, `quick/PlusRing`. | **4** drag loops; 5 drop targets on 1 interface |
| **Motion** | `drivers/motion.ts` (`Motion`: rows l.53-161, layers l.236, menu l.433, fly l.349, `intoView` l.207). Cause in `update/block.ts:25-32`. | **1** | `motion/Motion.ts`, `motion/KeyedRows.ts`, `motion/SnapGlide.ts`, `menu/Overlay.ts` (fades by CSS class), and direct `.animate(` in `ScreenTracks`, `quick/QuickBar`, `drag/FloatingCard`, `drag/GroupDrag` (×5), `menu/PanelPages` (×2). Also `easing.ts`, `FramePass.ts`, `CarefulPace.ts`, `PointerSpeed.ts`. | **about 8** |
| **Measurement** | `drivers/measure.ts` (`stack`, `anchor`, `row`, `inStack`, `carry`, `toShow`, `watchPage`); `drivers/motion.ts` reads boxes itself (`before` l.53-74, `measureMenu` l.538, `place` l.277, `besideField` l.620). | **2** (measure driver, and motion's own reads) | `getBoundingClientRect` in **40** files. Observers: `ScrollEdges:15`, `BlockHeight:7-19`, `projects/TreePanel:52`, `quick/QuickEntryController:185,191`, `ViewWatch:7-16`, `StatusBarRoom:15-19`, `Timeline:146,165`, `layouts/RowsLayout:40,75`. Helpers: `cardSize`, `wholeCard`, `drag/listFrame`, `motion/Motion.restingRect/boxOf`, `quick/barPlacement`, `menu/inView`, `timelineLayout`. | **no single mechanism** (about 10 helpers and 40 readers) |
| **Scroll** | `drivers/scroll.ts` (`EdgeScroll` l.18, `Scroll.glide` l.91, `Scroll.glideTo` l.98), `Motion.intoView` (motion.ts:207), `Measure.toShow` (measure.ts:130). | **1** driver, with 2 smooth paths: native `scrollTo({behavior:"smooth"})` in BlockHost l.400-401 and the frame glide l.411 | Edge scroll in `drag/AutoScroll.ts:40`. Smooth scroll in `quick/ScrollGlide.ts:27` and `motion/SmoothScroll.ts:15` (one glide underneath). `motion/ScrollHold.ts`, `ScrollEdges.ts`, `FoundCard.ts:12-13`, `menu/inView.ts:62`. Raw `scrollTop` writes: `Timeline.ts:252-296`, `DayPeek.ts:117,122`, `projects/ProjectTree.ts:72`, `projects/ProjectTasks.ts:175`, `menu/PanelPages.ts:35`, `quick/QuickEntryController.ts:656`. Native `scrollIntoView`: `CalendarScreen.ts:1174`, `projects/TreePanel.ts:107`, `search/SearchWindow.ts:133`, `menu/TaskMenu.ts:401`. | **4** mechanisms (AutoScroll, glide, hold, edges) and **about 10** ad hoc spots |
| **Focus** | `drivers/focus.ts` (`take`, `field`, `element`, `leave`, `inField`); `drivers/islands.ts` `Islands.place` gives the field its focus. | **1** | Each part focuses itself: `GroupNameField.ts:34`, `CalendarScreen.ts:1432`, `markdown/EmbeddedEditor.ts:100,105`, `quick/MarkdownTitleField.ts:116`, `ProjectBlocks.ts:44`, `quick/QuickEntryController.ts:197-806` (6 spots), `full/FullScreen.ts:149-473` (5 spots), `quick/QuickField.ts:73`, `search/SearchWindow.ts:72`. | **about 9** |
| **Keyboard** | `drivers/keys.ts` (`Keys` scope l.10, field scope l.40, `lineKeys` l.119); `drivers/input.ts` (`enter`, `escape`, `fields`, `typing`). | **1** | Screen keys are registered twice, identically, by place: leaf `TaskCalendarView.ts:34-37` and note `ProjectBlocks.ts:31-37`. Also `markdown/ObsidianMarkdown.ts:28-34`, `markdown/lineCommands.ts:52`, `quick/MarkdownTitleField.ts:67-86`, `GroupNameField.ts:26`, `ColumnSwitch.ts:109`, `CalendarScreen.ts:472` (bulk), `fieldUndo.ts:6`, `full/FullScreen.ts:133`, `drag/DragController.ts:444` (Escape), `search/SearchWindow.ts:57`, `menu/TaskMenu.ts:430` (Enter), `menu/Overlay.ts:61`. | **about 14** handlers, 2 of them place copies |
| **Text entry** | Engine: `model/entry.ts` and `update/entry.ts` (the core's `entry.*` protocol). Field: `drivers/islands.ts` (`obsidianTitleField` l.292). Bar: `view/entry/Bar.tsx`. Other fields: the section name (`view/List.tsx` `data-n-field="section"`, `update/section.ts`) and the search (`input.typing`). The full card's subtask entry goes through `updateEntry` (`update/full.ts:9`). | **1** engine, 3 field kinds | `quick/QuickEntryController.ts` (819 lines) with `QuickBar`, `QuickField`, `TitleField`, `MarkdownTitleField`, `EntryRows`, `barPlacement`, `WriteQueue`. **A second engine in `full/FullScreen.ts`** (its own `QuickEntrySession`, `QuickField`, `WriteQueue`, l.1-12). Other fields: `GroupNameField.ts`, `projects/TreePanel.ts` (project name), the `SearchWindow` input. | **2** engines, about 4 field kinds |
| **Task menu** | `model/taskMenu.ts`, `model/menuNeeds.ts`, `update/menu.ts`, `view/menu/TaskMenu.tsx`, `view/Sheet.tsx`, placed by `Motion.menu` (motion.ts:433). One task and bulk are one menu (`layer.bulk`). | **1** | `menu/TaskMenu.ts` (619 lines) with `MenuPanel`, `PanelPages`, `DatePage`, `MonthPicker`, `quickMoves`, `repeat/RepeatPanel`, `DescriptionPeek`, `LiftedMenu`, `Overlay`. **A separate `menu/BulkMenu.ts`** for picked tasks. Other menus on the same Overlay: `GroupMenu`, `MoreMenu`, `ViewMenu`, `EventMenu`, `SectionChooser`, `sources/SourcesPopover`. | **2** task menus (TaskMenu, BulkMenu) on 1 overlay |
| **Search** | `model/search.ts`, `update/search.ts`, `view/search/Search.tsx` (`SearchInBlock` l.121 and `SearchOver` l.137: two drawings of one model). | **1** | `search/SearchWindow.ts`, `search/searchRows.ts`, `FoundCard.ts` (reveal). (`projects/NoteSearch.ts` searches the vault's notes, a different thing.) | **1** |
| **Full card** | `model/full.ts`, `model/fullList.ts`, `update/full.ts`, `update/fullActs.ts`, `view/full/FullCard.tsx`, `drivers/islands.ts` `Editors`. | **1** | `full/FullScreen.ts`, `markdown/EmbeddedEditor.ts`, `markdown/ObsidianMarkdown.ts`. | **1** |
| **Sections** | `model/section.ts`, `update/section.ts`, `view/Layers.tsx:61-80` (`SectionMenu`), `view/List.tsx` (head and name field), lifting a section in `update/carry.ts:236-282` with `carryPlace.sectionSlots` l.118. | **1** | `menu/GroupMenu.ts`, `GroupNameField.ts`, `drag/GroupDrag.ts` (`SectionSlots`, `SectionFloat`), `menu/SectionChooser.ts`. Headers are drawn in both `TaskList.ts` and `projects/ProjectTasks.ts`. | 1 (headers drawn by **2** renderers) |
| **Selection** | `model/select.ts`, `update/select.ts`, `view/carry/SelectFoot.tsx`, `carryView.rowMarks` l.17-27, `update/carry.ts:317-335`. | **1** | `TaskSelection.ts`, `BulkController.ts`, `menu/BulkMenu.ts`. (`Timeline`'s `is-selected` is the open menu's mark, not a pick.) | **1** |

Summary: within the block, the new code is close to one mechanism per concern. Measurement is split in two, between
`Measure` and `Motion`. Scroll has two smooth paths. The old UI duplicates drag (4 loops), motion (about 8), focus
(about 9), keyboard (about 14), entry (2 engines), task menu (2) and list renderers (2). The old UI did **not**
duplicate by place: one `CalendarScreen` served both.

## 4. Where the old UI branches on the place

### 4.1 Note vs leaf (`ScreenPlace`, `CalendarScreen.ts:104-111`)

| Spot | What it does |
|---|---|
| `ProjectBlocks.ts:32` | The note's block is `new CalendarScreen(…, { view: false, keys: this.scope, note: () => this.path })`. |
| `CalendarScreen.ts:325` | `if (!this.where.view) root.classList.add("is-block")` |
| `CalendarScreen.ts:328`, `:1454` | `firstView(this.wide(), this.where.note !== undefined)` |
| `CalendarScreen.ts:398`, `:1313`, `:1327` | The title field and markdown get the note's key scope (`this.where.keys`). |
| `CalendarScreen.ts:1443-1444` | The root read: `projectNoteView(note(), wide)` vs `funnelView(wide)`. |
| `CalendarScreen.ts:1481-1482`, `:1486`, `:1490` | `is-note` class. `main` hides the filter title (`filterTitle.render(main ? filter : null)`) and the head lead. |
| `CalendarScreen.ts:1528` | `setNoteViewMode` vs `setViewMode`. |
| `CalendarScreen.ts:1585` | The projects button, filter title and tree panel only on the leaf (`if (!this.where.view \|\| this.where.note) return`). |
| Host-only, old: `ProjectBlocks.ts` (whole), `BlockHeight.ts` (the block grows with its rows), `ViewWatch.ts` | Embedding. |
| Keys duplicated by place | `TaskCalendarView.ts:34-37` vs `ProjectBlocks.ts:31-37` (same three keys). |
| CSS | `styles.css:1711-1712` (`.task-calendar.is-note`, `.tc-project-block`). `is-block`/`is-note` appear 10 times in total. |

### 4.2 Phone vs desktop

The old UI reads `wide`/`desktop` from the body's `is-mobile` class, three times over:
`CalendarScreen.ts:264`, `:409`, `:856`, `:1448-1449`. It also reads it in `ProjectBlocks.ts:132`.

| Spot | What it does |
|---|---|
| `CalendarScreen.ts:265` | `Platform.isMacOS` chooses ⌘ or Ctrl. |
| `BulkController.ts:107-108` | ⌘-click picks on the desktop only. |
| `quick/QuickEntryController.ts:639` | The field's room limit (desktop vs keyboard). |
| `quick/QuickBar.ts:139-149`, `:199`, `:212`, `:239-249`, `:308` | The bar's layout, docking, motion and room. |
| `search/SearchWindow.ts:48`, `:59`, `:112` | Desktop panel vs phone sheet; arrow walk. |
| `quick/MarkdownTitleField.ts:11` | `.mobile-toolbar`. |
| `listWidth.ts`, `Keyboard.ts`, `haptics.ts` | Phone bounds, the keyboard slide, haptics. |
| Pointer type, mouse vs finger | `drag/DragController.ts:150`, `:173`, `:188`; `drag/LongPress.ts:88`; `quick/PlusButton.ts:61`; `Swipe.ts:179`; `PinchZoom.ts:67`; `FreeRoomDoubleClick.ts:13` |

The new code reads phone vs desktop once: `Chrome.wide()` (drivers/chrome.ts:9) into `BlockModel.wide`
(BlockHost.tsx:155, NoteBlocks.ts:76). It branches at `update/carry.ts:85`, `:321-324`; `update/search.ts:41`, `:44`;
`model/search.ts:79`; `view/search/Search.tsx:122`, `:138`; and `view/entry/Bar.tsx:52-91`. Mouse vs finger is decided
once, in `recognizers/press.ts` (`gesture.mouse`).

## 5. What is safely reusable for one mechanism

- **The whole runtime** (23 files) as is: `Program`/`Store`/`HostSession` are generic over Model and Msg.
- **The pure leaf models:** `lists.ts` (ListModel, funnelList, projectsList, withBranches), `card.ts`, `taskMenu.ts`,
  `full.ts`, `search.ts`, `section.ts`, `select.ts`, `layers.ts`, `monthGrid.ts`, `answers.ts`, `commands.ts`.
- **The core-protocol parts of** `entry.ts` (EntryModel, barTiles) and of `carryPlace.targetAt`'s rule calls. The
  latter needs the list lookup injected instead of `BlockLists`.
- `recognizers/press.ts`.
- **The view leaves:** `Card.tsx`, `List.tsx`, `Sheet.tsx`, `icons.tsx`, `entry/Bar.tsx`, `carry/SelectFoot.tsx`.
- **The drivers** `focus`, `input`, `keys`, `islands`, `overlay`, `scroll`, `chrome`, and `motion` without its
  block-frame height parts.
- **Needs only a type rename** (logic generic): update/menu, full, ids, fullActs; view/TaskMenu, FullCard, CarryFloat;
  model/messages.
- **Must be reshaped for a screen with many lists:**
  - `BlockModel` → a screen model with a place (`note` or `leaf`) and a `ScreenLists` that carries every layout the
    core's `view.layout` gives;
  - the 8 hand-written flatteners of `BlockLists`;
  - `CarryGeometry`, `Measure.carry` and the single `EdgeScroll`, which need per-list scrollers and timeline and tree
    targets;
  - `withMotion` and `sameRows`;
  - `Block.tsx`, `Layers.tsx` and the foot;
  - the generic controller part of `BlockHost` (gesture, over, run, draw), which should move out of the host so a leaf
    host only mounts.
