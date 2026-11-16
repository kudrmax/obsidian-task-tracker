# R6: a year of hurried feature work against revision 13

Red team, read-only. Read: the spec (revision 13, whole), `CLAUDE.md`, `docs/plugin/` (screen, settings, tasks), `tests/uiRules.ts` (today's rev-10 checker, whose machinery rev 13 reshapes in stage 3b), the code in `obsidian/ui/next/` and `obsidian/ui/SettingsTab.ts`. Not read: `rev11-research/`.

Attacker: a fresh, capable, hurried agent doing ordinary feature work. It never read the spec's history, copies close code, adds a flag, reaches for a library, takes the first fix an error message suggests, and runs `npm run guards:pin` when a test says the closure changed, the way it runs `--update` on snapshots.

Checks traced for every task: **P** the three compiler projects; **U** the `uiRules` checker; **T** type tests (`closed.ts`, `ROUTES`/`Disjoint`, `AssertNoForeignFacts`); **C** the CSS allowlist (decision 34); **M** the matrix (`rows.json` → registry, equal-variant comparison); **R** the trap and its ledger; **V** manifest/closure/visibility; **G9** the structural review.

## Counts

| Verdict | Count | Tasks |
|---|---|---|
| SAFE | 4 | 25, 30, 31, 32 |
| CAUGHT | 7 | 4, 6, 7, 16, 26, 27, 28 |
| LEAK | 15 | 1, 2, 3, 5, 9, 10, 12, 14, 15, 17, 18, 19, 20, 22, 24 |
| FRICTION | 6 | 8, 11, 13, 21, 23, 29 |

Plus three systemic findings (S1–S3) and the buildability notes (B1–B9).

The leaks fall into eight root causes. Each fix below works at the level of a principle:

| Root | Tasks | Principle-level fix |
|---|---|---|
| **L1** Pure code may do arithmetic on any number that has no unit brand: minutes, durations and counts from the core, `Date` parts, loop counters | 2, 15, 24, (9) | "Pure code passes numbers along and does not compute them." The checker's taint rule already follows `.length`/`indexOf` through bindings. Widen its sources to every number read from a `contracts.ts` type, from `Date`, from an array callback's index parameter, from `entries()`/`keys()`, or from a `for` counter. Operators on a tainted operand are legal only in `units.ts`, the gateway and `records.ts`. Take `Date` out of the pure and kit projects (a checker rule, since `lib: es2024` declares it). `monthGrid` moves to the gateway, or the core gives the grid. |
| **L2** The C4 exemption for the gesture folder lets any decision live there | 3, (20) | Narrow the comparing operations by type, not by folder: `exceeds(a: Px, t: GestureToken)` and `within(p: Point, b: MeasuredBox)`. A threshold that decides an outcome (commit or snap back, postpone or not) can then only come from the gateway (`rules.cardSwipeCommits`). Change the checker's message too: "a decision → add a core rule; a gesture parameter → a `--tc-gesture-` token". |
| **L3** "One consumer per variant" is stated but nothing checks it | 1, 20 (and the pointer kind, 9b) | Reuse C4's place-fact rule. A field of a `Layout` part, and the pointer's kind, may be read in exactly one module, recorded in `tests/guards/engines.ts`-style data, so a second reader fails. A variant then picks between two implementations at one point only. |
| **L4** Overlay and hover content can be drawn outside the layer stack | 12, 14 | Anything drawn over other content is a layer: `position: absolute/fixed`, `z-index` and `inset` are allowed in the CSS only on the kit's `Layer` element (a `tc-n-layer…` class). A state or a user-action pseudo-class may style only its own element: no combinator follows it, which extends decision 34's "a variant styles its own element" to states and `:hover`. The `mouseover`/`mouseenter`/`pointerenter` family goes to `input` explicitly, and any event type not on the ownership list is denied everywhere. |
| **L5** The host project has escape hatches the pure project lacks | 17, 5, 22 | In the host project, ban an expression of type `any` used as a call target or a member's object, and ban `as any`/`as unknown as`. Give private Obsidian APIs a home: one typed declaration file per engine row (`engines/<row>.private.d.ts`), allowed by the ambient-declaration rule and counted as a guard file, so the API resolves to a declaration owned by that row. |
| **L6** Capabilities and writes are listed by call | 19 | Derive `PlaceWrite` from data, not from a list of door calls. Every write to a device-scoped key (`DEVICE_KEYS`, typed from `core/settings.ts`) and every door method the coverage map marks `writes: "device"` needs the capability. A new device key or method is then covered when it is added. |
| **L7** Logic zones outside pure, kit and engine | 2, 5 | (a) The runtime: a need is exactly one door method from the typed coverage map, and `ViewAnswers` holds no code per kind of need (a checker rule over `obsidian/runtime/dispatch/`). (b) The settings tab: it draws a door view (`settings.page`: rows, what each offers, what is disabled, messages) and sends raw control values to `settings.*` door methods. The checker allows no comparison or branch on answer values in `host/settings.ts` except an exhaustive switch on a row's kind. |
| **L8** Library and class surface that the table names too loosely | 16→17, 22, 27 | The engine table names packages exactly (no `@codemirror/*`) and APIs one by one (not "Obsidian" as a package). CodeMirror's extensions form a closed `EditorSpec` in the editors row, like `AnimationSpec`. The strings `tc-n-`, `tc-m-` and `task-calendar` are owned by the kit, motion and mount modules: the checker rejects such a literal anywhere else. |

## The tasks

Each task gives: the shortest natural implementation; the trace through the checks; the verdict.

### 1. "In a project note, sections should collapse with an animation." LEAK (L3); its CSS route is CAUGHT

- **Natural:** a `collapsed` set in the sections slice, a chevron on the kit's `SectionHead`, `.is-collapsed .tc-n-rows { height: 0; transition: height .2s }`, and `if (place.content.source.kind === "note")` in `update/section`.
- **Trace:**
  - C fails twice: `transition` outside `tc-m-`, and `height` under a state.
  - U fails: a place read outside `layout.ts`.
  - Both messages lead the right way: rows that leave (P4, the `rows` cause) and a variant in `Layout.section`.
- **What then ships:** `section.collapse: "animated" | "none"`, read in `update/section` (toggle), in the keys concern (Enter on a head), in the `Screen` region selector (hiding the rows), and in the full card's subtasks. Four consumers of one flag.
  - Nothing checks "one consumer" (C4 states it; it is not in §Guards).
  - M compares only equal-variant cells, so the note and the main screen are never compared on collapse.
  - jscpd sees no copy.
- **Fix:** L3. This is exactly a "flag per place", which the threat model lists as ordinary development.

### 2. "Add a week view to the calendar." LEAK (L1, L7a); widths CAUGHT

- **Natural:**
  - Copy `monthGrid.ts` into `weekDays(day)`: `new Date(y, m, d - (weekday + 6) % 7 + i)`.
  - A new region `week` in `layoutOf`.
  - Each day's events through a new need `weekEvents`, which the agent computes inside the runtime's `ViewAnswers` by looping `calendars.events` over seven days and filtering.
  - Widths through `rules.layoutWidths` (Px arithmetic fails U, which points to the gateway: CAUGHT, correct).
- **Trace:**
  - The date arithmetic is on bare numbers and `Date`. It is not unit-branded and not index-derived, so U is silent.
  - `Date` is in `lib: es2024`. Only `new Date()` without arguments is banned (today's `HOST_WORK` "clock or chance").
  - The runtime is in the host project, and only engines carry the "no arithmetic" rule, so the runtime is a free logic zone.
  - M: the new union members (`week` region, new messages) demand `rows.json` rows. The agent adds them and pins (V), which is routine, see S1.
- **Ships:** "which days a week shows, from which weekday" is a rule the iPhone app would have to write again (CLAUDE.md's test). It lives in the UI and in the runtime.
- **Fix:** L1 and L7a.

### 3. "On the phone, swipe a card left to postpone it." LEAK (L2)

- **Natural:**
  - In `update/gesture/machine.ts`, a horizontal drag on a card beyond `exceeds(dx, half(cardWidth))` emits `cardSwipe(key, "postpone")`; under that, the card snaps back.
  - The card follows the finger through the transient channel (`.tc-m-cardSwipe { translate: var(--tc-t-x) }`).
  - `postpone` is a door call.
  - The agent first writes `if (form === "phone")` there. U rejects the chrome place fact, so it moves the check to a variant `gesture.cardSwipe: "postpone" | "none"` (correct).
- **Trace:**
  - The unit rule's message says "`exceeds`/`within` only in `update/gesture/`". It tells the agent to put the decision in the gesture folder, and there it is legal.
  - "Past half the card commits" is a landing rule (C3: "a landing… the flick threshold" are the core's). Here it is computed in the UI beside the core's `swipeLanding`.
  - P, T, C, M and R: all green.
  - The swipe-once test covers only list swipes.
- **Fix:** L2.

### 4. "The settings tab gets a reorderable list of tags." CAUGHT

- **Natural:** copy the old `RowReorder` idea into `host/settings.ts`, with `rowEl.addEventListener("pointerdown", …)` and an index swap.
- **Trace:**
  - U: a `pointer*` listener belongs to `input`.
  - U: arithmetic in an engine (row 13 is an engine).
  - U: `RowReorder` is old UI and is not importable.
  - The messages lead to `Places.rows(list)`. The agent adds `"tags"` to the `rows` list union, the registry demands rows (M), and backend gives `settings.moveTag`.
- **The one mechanism results.** The `rows.json` addition is a pin (S1).
- **Gap:** `dragstart`, `dragend` and `dragenter` have no owner in the listener list. Name them, or deny unlisted types (L4).

### 5. "Tag names must be unique, with an error under the field." LEAK (L7b)

- **Natural:** in `host/settings.ts`, `onChange(v => { if (tags.some(t => t.name === v.trim())) showError(); else service.renameTag(i, v) })`.
- **Trace:**
  - `uiDecides` covers only task fields.
  - The engine rules ban arithmetic and ordering comparisons, but equality is allowed (C2: "equality stays").
  - `as`/`any` are allowed in the host project.
  - All green.
- **Ships:** a validation rule ("what counts as the same") in the UI. CLAUDE.md puts it in `application`.
- **Fix:** L7b.

### 6. "The full card opens as a side panel on desktop." CAUGHT

- **Natural:** `form === "desktop" ? <SidePanel/> : <FullCard/>` in `Screen.tsx`.
- **Trace:**
  - U: a form read outside `layout.ts`. It leads to `full.presentation: "sheet" | "side"` in the `full` part.
  - The narrower lists need `layoutWidths` with a panel input. Px arithmetic fails U, so it goes to the core: correct.
  - The panel's slide is the existing `panelSlide` cause.
  - M: a new variant value needs its own scenarios.
- **Correct path.** Watch L3: `presentation` will be read by `full`, keys (Escape) and layout. One consumer is not checked.

### 7. "A Done column with a fade-out." CAUGHT

- **Natural:** `.tc-n-card.is-done { opacity: 0; transition: opacity .3s }`, or `@keyframes` on the base class.
- **Trace:** C fails: time-driven properties only under `tc-m-`, never with a state. The motion cause `rows`/leave (decision 48) already fades a leaving row.
- **The message names the rule.** It should also name the cause to use ("a leaving row: the `rows` cause's leave").

### 8. "Drag a task from the note block onto the main screen's calendar." FRICTION

- **Why:**
  - Each Markdown view and each leaf is its own `ScreenHost` with its own store and carry.
  - The note's `carry.device` is `silent`, and it holds no `PlaceWrite`.
  - The hit test sees only its own screen's measured boxes.
  - No concern spans screens.
- **The natural hacks:**
  - Flip the note to `report`: M's note cells, "device carry unchanged", fail. Correct, but it blocks a product request.
  - Native HTML5 drag-and-drop: blocked by the kit view (`draggable`) and by the unowned `dragstart`.
  - So the feature has no home.
- **Fix:** a window-level carry owned by the runtime's session layer. One carry per window, every mounted `ScreenHost` registers its targets' boxes and drop rules, and the originating screen's gesture machine hit-tests across the registered screens. State it as a principle: a concern that can span screens (carry, outside press, focus across screens, task 29's intents) has one owner above `ScreenHost`.

### 9. "A keyboard shortcut to move a card up." LEAK (L1, ordinal sources)

- **Natural:**
  - A key-table entry `Alt+ArrowUp → moveUp(key)`.
  - In `update/select` or `update/carry`: `const i = rows.findIndex(r => r.key === key); door("tasks.moveBefore", rows[i-1].key)`.
- **Trace:**
  - U catches `findIndex` arithmetic, and the message points to a core ordinal rule: correct.
  - The very next natural rewrite passes: `rows.map((r, i) => …)`, `for (const [i, r] of rows.entries())`, `rows.at(i - 1)` with `i` from `entries()`, or `rows.reduce((prev, r) => r.key === key ? prev : …)`.
  - Index-callback parameters, `entries()` and `for` counters are not taint sources.
- **Fix:** L1. Also ban element access with a computed numeric index, and `at`/`slice`/`splice` with non-literal arguments, in pure and kit code: an element is reached by iteration or by identity, and its neighbour comes from the core.

### 10. "A command 'Move to Today' with a hotkey." LEAK

- **Natural:**
  - In `host/registration.ts`: `addCommand({ id, hotkeys: [{ modifiers: ["Alt"], key: "t" }], callback: () => activeHost.command({ kind: "toToday" }) })`.
  - `toToday` is added to `HostCommand`, and `ScreenHost` maps it to a message.
- **Trace:**
  - Obsidian's hotkeys are a second key path beside the keys concern's table.
  - They are not under `keys.policy` (the note's `focus` policy, the settings' `none`) and not in the matrix's keys × place cells.
  - The "active screen" is chosen in `registration.ts`, a place decision outside `layout.ts`.
  - The existing `undo`/`redo`/`find`/`newTask` commands are the precedent the agent copies. U, P and M are green.
- **Fix:** a `HostCommand` enters the keys concern as a key intent and passes through the same table and policy. `registration.ts` declares command ids without hotkey defaults. The matrix's keys cells include commands per place.

### 11. "Highlight today's column with a pulse." FRICTION, with a LEAK fallback

- **Natural:** `@keyframes pulse` on `.is-today`.
- **Trace:**
  - C fails (keyframes only under `tc-m-`, never with a state). Correct.
  - The motion engine runs one spec per cause, and every cause runs once (P5). An endless ambient animation has no home. The same goes for a spinner while calendars load, or the sources dot breathing.
- **The fallback that passes everything:** a time-engine `after(600, pulseTick)` re-armed by its own handler, toggling `is-pulse-on`, with `opacity` under the state. Opacity is a paint property, the ledger explains the class write as the render engine's, and there is no CSS time. Motion is done by timer and state outside the motion engine.
- **Fix:**
  - A closed `AmbientSpec` in the motion engine, started by a kit prop `ambient: "pulse" | "none"`.
  - The checker forbids a pure handler that issues a timer command whose message is its own kind (a self-re-arming loop), except the minute clock.
  - The ledger explains a render write only when its model change came from input, a door answer, a broadcast or a timer of at least one minute.

### 12. "A mini-calendar popover in the entry bar." LEAK (L4; `AssertNoForeignFacts` unbuildable as stated)

- **Natural:**
  - `entry.pickerOpen: boolean` and `entry.pickedDay: LocalDate` in the entry slice.
  - `<MonthGrid/>` drawn inside the bar's kit element and lifted above it by `position: absolute; bottom: 100%` (base CSS, not under a state).
  - Escape handled in the entry concern ("close the popover, else end the entry").
  - The outside press wired to the entry.
- **Trace:**
  - C: `position: absolute` is not under a state, so it is legal.
  - The layer stack is bypassed: no Escape order, no pins, no `layerGone`.
  - T's `AssertNoForeignFacts` cannot see `pickedDay: LocalDate` as `context.day`'s fact, because TypeScript is structural and an alias is not a nominal type. It works only if the agent happens to reuse the fact's brand.
  - All green.
- **Fix:** L4. For facts: every slice field's declared type must be declared in its own `model/<concern>.ts` (the checker sees the alias symbol). Holding another concern's fact then needs an import that the checker sees. A fresh alias of the same base type remains G9's question; state that honestly.

### 13. "A second window shows the main screen." FRICTION

- **Natural:** `workspace.getLeaf("window")` with the view. The leaf adapter mounts a `ScreenHost` at `Places.main()`.
- **Trace:**
  - U catches the bare `window`/`document` and leads to `ownerDocument`: correct.
  - The trap is injected per realm (needs B5).
  - The time engine is one runtime module (`obsidian/runtime/lifecycle/Time.ts`). Its `requestAnimationFrame` belongs to the main window. With the main window minimised or occluded, the popout's motion and glides stall or throttle. An agent that writes `ownerDocument.defaultView.requestAnimationFrame` in the motion engine is rejected (the time engine owns frames), so the only way out is through the guard.
- **Fix:** the time handle is per realm. `ScreenHost` takes a frame clock bound to its screen's window. Runtime timers (the minute) stay on the main window.

### 14. "A hover preview of a task on desktop." LEAK (L4)

- **Natural:**
  - Each card renders a hidden `<Preview>` child (kit element `tc-n-preview`).
  - `.tc-n-card:hover .tc-n-preview { visibility: visible }`, with `.tc-n-preview { position: absolute }` in the base CSS.
- **Trace:**
  - C allows `visibility` under a user-action pseudo-class (paint allowlist).
  - Decision 34 restricts only variant classes to their own element, not states or `:hover`.
  - The fact "which task is previewed" lives in the DOM's `:hover`, not in the model (P1 broken).
  - There is no layer, no keys, no accessibility. There is a render cost on every card (P9 budget counts re-renders, not size).
  - M has no row because no union grew. The ledger has no mutation to explain.
  - All green.
- **Fix:** L4. Hover becomes the gesture machine's dwell (a hold token on the time engine), emitting `hovered(key)` to a layer.

### 15. "The note block grows a calendar strip." LEAK (L1); the product change is correctly VISIBLE

- **Natural:**
  - `calendar: true`, `days: "today"` in `Places.note`, and a new kit `Strip`.
  - Event positions `units.ratio(ev.startMinute, MINUTES_PER_DAY)` with `left` from a custom property.
  - The overlap stacking copied from the timeline's selector.
- **Trace:**
  - The variant change makes M's note column fail (old bug 5, "nothing drawn"). `rows.json` is edited and pinned, and the lead reports it: tier 3 working as designed for a real product change.
  - The strip's geometry, though, is arithmetic on bare core minutes (`contracts.ts` numbers are exempt from the unit rule), converted into a `Ratio` by a generic `units.ratio`.
  - The layout rule for events (the core's `eventLeft` and `stackTasks`) is written again in the UI.
  - jscpd catches only a verbatim copy.
- **Fix:** L1. Also, `units.ratio` and `scale` take units only, never a bare `number`.

### 16. "Confetti when Today is emptied" (`canvas-confetti`). CAUGHT, VISIBLE

- **Trace:**
  - U: an npm package no row names.
  - The agent's next move is to add it to the motion row in `tests/guards/engines.ts` and pin. That is a guard change, listed in the commit and in the release notes, and reported. Tier 3 works.
- **Gap:** the message should say "a frozen-table change: the lead must report it", so a hurried agent does not treat it as a fixture update.

### 17. "Typing `/` in the entry offers commands" (`@codemirror/autocomplete`). LEAK (L8)

- **Natural:** `extensions: [autocompletion({ override: [commandSource] })]` in `engines/editors.ts`.
- **Trace:**
  - The editors row names `@codemirror/*`, so U is green.
  - `autocompletion()` brings its own default keymap (arrows, Enter, Escape), its own tooltip (a popup outside the layer stack), and its own focus and scroll handling.
  - The ledger judges the editors island by subtree, so all of it is "explained".
  - A second layer, a second key table, all green.
- **Fix:** L8. Packages named exactly, CodeMirror extensions a closed `EditorSpec`. A suggestion list is a kit layer fed by a core `entry.suggest` answer.

### 18. "Open the plugin's settings from ⋯" (Obsidian private API). LEAK (L5)

- **Natural:** `(this.app as any).setting.open(); (this.app as any).setting.openTabById("task-calendar")` in `obsidian/hostServices.ts`, or in `ScreenHost`.
- **Trace:**
  - The `as`/`any` bans hold only in the pure and kit projects.
  - In the host project, the checker resolves declarations, and `any` has none. Every member after it is invisible to the deny-by-default rule.
  - The same pattern hides `(el as any).animate(…)` or `(view as any).containerEl.style` in any engine.
  - The spec bans ambient declarations outside the JSX views, so the agent has no legal typed route. `as any` is the only route, and it is quiet.
- **Fix:** L5.

### 19. "Filter tasks by a label from the panel." LEAK (L6)

- **Natural:**
  - `labelFilter` as a new device value (like the list share), written through the runtime's generic `updateSettings(patch)` command (decision 7) from `update/context`.
  - The core's view takes it from the device settings.
- **Trace:**
  - `PlaceWrite` guards only the listed calls (`selectProjectNode`, place/day writes, `startCarry`/`carryAt`/`endCarry`), and a settings patch is not among them.
  - So a note's search or panel can write the device's label filter: report C's old bug 1 again, for a new fact.
  - M's note cells assert "the device's filter, place and carry unchanged", which is not the new key.
  - All green.
- **Fix:** L6. M's note cells assert all device-scoped keys unchanged, derived from `DEVICE_KEYS`.

### 20. "On the iPad, show two columns side by side when wide." LEAK (spec gap)

- **Natural:**
  - In the token block (`@media` is allowed there): `@media (min-width: 900px) { body { --tc-ribbon-cols: 2 } }`.
  - `.tc-n-ribbon { grid-template-columns: repeat(var(--tc-ribbon-cols), 1fr) }`.
- **Trace:**
  - C allows `@media` inside the token block.
  - "No custom property set under a state is read by a non-paint property" covers states, and an `@media` in the token block is not defined as a state.
  - So a form and size decision ships in CSS, outside `layout.ts`, and against decision 10 (`wide` is a platform). All green.
- **Fix:**
  - The token block's `@media` may only test `prefers-*`.
  - Any other condition in it is a state, and its custom properties are readable only by paint properties.
  - Width-driven layout goes through `rules.layoutWidths`.

### 21. "Show today's open-task count in Obsidian's status bar" / "Add as task" in the file menu. FRICTION

- **Why:**
  - `addStatusBarItem` and `workspace.on("file-menu")` have no row.
  - The count needs a view and a subscription, and `registration.ts` has no model.
  - Obsidian's own `Menu` is banned outright, though adding an item to Obsidian's file or editor menu is a legitimate host integration, not a second menu mechanism.
- **The natural hack:** a door call and a replica subscription inside `registration.ts`. The replica is reachable nowhere, so it is blocked, and the feature has no home.
- **Fix:**
  - A surface that shows data is a `ScreenHost` at a place (`Places.statusBar()`, an inline frame with one region).
  - The registration row may add items to the `Menu` Obsidian hands to `file-menu`/`editor-menu` (`menu.addItem`), never construct a `Menu`. Its callback sends a `HostCommand`.

### 22. "A live preview of a card in settings when the card size changes." LEAK (L8)

- **Natural:** in `host/settings.ts` (the tab's own DOM): `containerEl.createDiv({ cls: "task-calendar" }).createDiv({ cls: "tc-n-card is-two-line", text: "Sample" })`, so that the next CSS styles it.
- **Trace:**
  - `cls` in Obsidian's `createDiv` options is not a class write that U sees: it is an option object, not `classList`.
  - C styles it, because `.task-calendar` is the leftmost compound.
  - The result is a second card renderer in the host, unmatched by jscpd (DOM calls against TSX). All green.
- **Fix:** L8, the class strings owned by the kit. The preview is a `ScreenHost` at a `Places.preview()` drawing kit cards.

### 23. "The ribbon glides with a spring." FRICTION, with a LEAK in the closure

- **Why:**
  - Engines may not do arithmetic or ordering.
  - Frame-by-frame glides (the scroll engine) and FLIP deltas (motion) need `from + (to - from) * ease(t)`.
  - The only legal home is a new function in `units.ts` (`units.spring`, `units.ease`), so motion logic accumulates in the unit module.
- **The leak:**
  - `units.ts`, `layout.ts`, `records.ts` and `update/gesture/` are exempt from rules by path, yet they are product files.
  - The spec calls only the gateway a guard file.
  - If the closure is "what the commands load", it holds the whole product (vitest loads it), so every commit pins: S3.
  - If product inputs are subtracted, these exempt files change silently. Widening an exemption zone is invisible.
- **Fix:**
  - Every file a rule exempts by path is a guard file: the checker's exemption list produces those closure members.
  - The closure is "loaded minus the metafile's inputs plus the exempt files".
  - Easing and spring math is a closed `AnimationSpec` kind that the motion engine hands to the platform (`Element.animate` with `linear()` easing from tokens). For scroll glides, the gateway gives sampled offsets per frame index.

### 24. "A card shows a ring of done subtasks." LEAK (L1)

- **Natural:** `units.ratio(marks.count.done, marks.count.all)`. Or `done / all` straight into a `--tc-ring` custom property through the layout part.
- **Trace:** bare core numbers, not branded, not index-derived. All green.
- **Ships:** "what share is done" is computed in the UI, and the iPhone app would compute it again.
- **Fix:** L1. The core gives `marks.progress`.

### 25. "Tap the day title to go back to today." SAFE

`context.goToday` issues a `placeWrite` with the `PlaceWrite` from its `Layout` part. In a note the part has none, and the note has no title anyway. The core's day rule lands it; the day-turn cause moves it.

### 26. "A card's colour animates when its priority changes." CAUGHT

`transition: background-color` on the card fails C. A cause `recolor` must be added: a closed union member, so M demands its row. Correct and visible.

### 27. "A right-click menu on calendar events with Copy link" (Obsidian `Menu`). CAUGHT, conditionally

- **Caught if** the engine table allows Obsidian per API.
- **Not caught if** it allows Obsidian per package. Seven rows (keys, editors, mount, chrome, host services, settings chrome, registration) name "Obsidian", and with a package-level reading `new Menu()` passes in any of them.
- The spec says both "host packages" and "effect APIs only it reaches". It must say the allowlist is per declaration (as `uiRules` does today, `obsidianExport([...])`). That is L8.

### 28. "Scroll the timeline to now when it opens, smoothly." CAUGHT

`scrollTo({ behavior: "smooth" })` fails `ScrollSpec`. `scroll-behavior` CSS fails C. A `scrollIntoView` outside the scroll engine fails U. The glide is the scroll engine's.

### 29. "In the note block, the card's menu offers 'Show on the main screen'." FRICTION

- **Why:** there is no path from one screen to another. `ScreenHost`'s surface is lifecycle only, and the note has no `PlaceWrite`.
- **The natural hack:** give the note's `context` part a `PlaceWrite` in `layout.ts`. M's note cells fail. The agent then edits the cell's assertion and pins, which is visible but buries a product change in a guard change.
- **Fix:** the cross-screen owner of task 8. A capability-typed `toDevice` intent that the runtime delivers to the main screens as a broadcast, with the main screen's own `PlaceWrite` doing the write.

### 30. "A card Sync just added flashes." SAFE

A keyed add within one context, the `rows` cause's fade-in (decision 48).

### 31. "Select mode shows '3 selected'." SAFE

`picked.length` displayed, with no arithmetic. The words are the core's.

### 32. "A haptic tick when a carried card crosses into another list." SAFE

The carry's target-change message issues a `haptic` command, which the chrome engine runs (Capacitor is in its row).

## Systemic findings

**S1. The guard closure contains data that every feature changes.** `rows.json`, the registry and the engine table are in the closure. Every new message kind, motion cause, region or variant value adds rows (tasks 1, 2, 3, 4, 6, 15, 26), so almost every feature pins. The visibility tier (the pin's list, the release notes, the lead's report to Max) then reports every feature as a guard change, and the one that weakens a guard is lost in the noise: a row turned into `notOffered`, or an assertion edited (task 29).

**Fix:** split a guard's data by direction.
- Additions to `rows.json`, meaning new rows with scenarios, are checked by a machine and pinned silently.
- A change that removes coverage is a guard change, reported: a row deleted, a scenario turned into `notOffered`, an assertion relaxed, a row added to the engine table, a rule's code or an exemption.
- `guards:pin` classifies the diff and prints only the weakening part.

**S2. Exempt product files are not guard files.** See task 23.

**S3. How the closure is computed.** `npm test` runs under vitest 5.0.5 (the version in `node_modules`). By memory, not checked: vitest evaluates test and source modules through Vite's module runner, not Node's ESM loader, so Node's loader hooks (`module.register`) do not see the source graph. The "computed closure" then misses exactly the setup files, helpers and fakes it means to hold.

**Fix:** record the closure with a Vite plugin (`load`/`transform` hooks) inside the vitest config, with the esbuild metafile for the build and loader hooks only for the plain Node scripts (release, e2e). Then subtract the product inputs (S2).

## Buildability (TS 7.0.2, Preact 11.2.0, esbuild 0.28, vitest 5, Obsidian mobile, CDP)

- **B1. Projects: buildable.** `tsc` 7.0.2 here has `--listFiles` (checked: it lists files for `tsconfig.next-pure.json`), plus `-b` and `composite`. But `view/Screen.tsx` (pure, with empty `IntrinsicElements`) imports kit components (kit's type view). In one program, the pure project would type-check kit sources against the pure JSX view and fail on every `<div>`. It also breaks "each program holds only its partition". **Needs project references:** kit `composite` emitting `.d.ts`, pure referencing them, built with `tsc -b`. The spec does not say so.
- **B2. `AssertNoForeignFacts<Model>`: not buildable as a type test** against the natural route. TypeScript is structural, and type aliases are not nominal, so a new field of the base type is invisible. Make it a checker rule over alias symbols and imports (task 12).
- **B3. The one JSX runtime and `memo`.** If `tc-jsx` "re-exports Preact's `jsx`", the raw kit function reaches Preact unwrapped, so "render wraps them in `memo` where it registers them" never happens. `tc-jsx`'s `jsx` must map `type` through the render engine's registry. Buildable, but not as stated.
- **B4. The closure through Node loader hooks under vitest: S3.**
- **B5. The trap in popouts: buildable**, with CDP `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true })`, then `Page.addScriptToEvaluateOnNewDocument` on each new target before it resumes. A per-page `addScriptToEvaluateOnNewDocument` alone does not reach a window opened later. The spec should name it.
- **B6. The phone form is emulated.** CDP cannot attach to Obsidian on iOS (WKWebView). The trap, the matrix's phone cells and the budgets run in desktop Chromium with `emulateMobile`. The real keyboard, momentum, rubber band, safe areas and Capacitor haptics are covered only by Max's 5-minute checklist. The spec says so for the checklist. The "both forms" claims of G5 should say "the emulated phone form".
- **B7. Mutation testing over the guards.** Stryker's TypeScript checker plugin is built on the stable `typescript` API, and TS 7's JS API is `typescript/unstable/sync`. By memory, not checked: run Stryker with the vitest runner and no TS checker. Each mutant rebuilds a TS program over the bundle (seconds), so the ratchet run is long. Run it incrementally (`--incremental`), not on every `npm test`. Buildable with that scoping.
- **B8. "No arithmetic in engines" with FLIP and glides.** This is only buildable if engines may call `units.*` and those functions grow the math (`delta`, easing). Task 23 covers it.
- **B9. The engine table per package or per API: L8, task 27.** Per API is buildable (today's `uiRules` already does it). Per package is not a guard.
- **The ledger, by subtree, with a 1 s input window and clamps: buildable** in Chromium (MutationObserver plus wrapped engine entry points, with time-window attribution of the render engine's synchronous flush). **Synchronous `preventDefault`: buildable** with Preact's `debounceRendering` flushed inside the event.
