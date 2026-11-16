# Red team: why "one mechanism" failed three times

Sources (line numbers as of 2026-11-16):
- **M** = `docs/superpowers/specs/2026-11-08-motion-design.md` (530 lines)
- **D** = `docs/superpowers/specs/2026-11-09-drag-one-mechanism-design.md` (239 lines)
- **U** = `docs/superpowers/specs/2026-11-15-ui-refactor.md`. Lines 1–478 match in `.worktrees/ui-refactor` and `.worktrees/ui-refactor-slice3`. Decisions 43–60 exist only in `.worktrees/ui-refactor-slice3` (lines 480–499). The `ui-refactor` worktree's copy stops at decision 42, so "Decisions 1–60" refers to the slice3 copy.
- **T** = `docs/superpowers/specs/ui-refactor/traceability.md`
- Code evidence is from `.worktrees/ui-refactor-slice3` (slice 3 as built).

---

## 1. Spec 1: Motion, 2026-11-08 (M)

| # | Where | What let a second mechanism in |
|---|---|---|
| M1 | §Why, M:8-9 | "A fix is a change of the mechanism that causes a whole class of jumps." Each class was given its own mechanism, so "one" meant one per class. The spec never says a concern exists once across the screens. |
| M2 | R2, M:58-60 | "one renderer that reconciles by id… Lists, the timeline's blocks, select mode and folding all draw through it." This is a list of places, not a rule. Note blocks, menus, the tree and search are not named. Decision 20 (M:280-281) then keeps the timeline "the same way by id", which is a parallel keying inside `Timeline`, not `KeyedRows`. |
| M3 | R2 vs `CalendarScreen.draw` | The renderer was added under the existing imperative screens. `CalendarScreen`, `TaskList` and `Timeline` kept their own `draw`. The spec has no step that removes the old draw paths and no list of what must be gone. Old and new rendering lived side by side. |
| M4 | R3, M:70-72; decision 33, M:333 | "every scroll the plugin makes goes through one smooth scroll (`scrollSmoothly`)". This is a sentence with no guard. Decision 22 (`ScrollHold`, M:286) and decision 33 (`ScrollGlide`) are already two scroll owners in one spec. |
| M5 | Decisions 22–33, M:286-336 | Each decision names a new class: `ScrollHold`, `Picks.pickNow`, `Overlay.handOver`, `PanelPages`, `DragSession`, `SnapGlide`, `ScrollGlide`. Nothing records which concern each class owns, or that it is the only one. |
| M6 | Decisions 57–61, M:457-477 | Interruption bugs were fixed per class: `LongPress.attach`, `DragSession.landNow`, `Overlay.fadeOut`, `ScreenPager.catch`. A cross-cutting concern (an input arriving during motion) became four local patches. |
| M7 | Decision 52, M:423-434 | "Two mechanisms met" for the day turn: this branch's `.turn` and master's `DayTurn`. The duplicate was found only at merge, by a human, and one was chosen. Nothing in the process would have caught it earlier. |
| M8 | Decision 26 vs decisions 8/11, M:215-221, 235-246, 304-309 | The plugin writes and then flies; the iPhone app asks `tasks.landing` first. Two ways to find where a drop lands were adopted on purpose, one per frontend. Parity is stated by "as decision N" cross-references, never by shared code. |
| M9 | Done when, M:525-530 | The criteria are re-measured jumps (behaviour) and "`tests/architecture…` untouched in strictness". No new guard, and nothing like "class X is the only caller of Y". |

---

## 2. Spec 2: Drag "one mechanism", 2026-11-09 (D)

| # | Where | What let a second mechanism in |
|---|---|---|
| D-1 | Title, D:1; §Out of scope, D:100-103 | "Drag: one mechanism (iPhone)". The plugin's drag is explicitly out of scope. "One mechanism" was scoped to one host. |
| D-2 | D:65-69 | `tasks.dropPreview` is added and "`tasks.landing` stays". Two core answers for one question live side by side by design. |
| D-3 | D:90-91 | "The calendar keeps its own `UIDropInteraction`". A second drop path inside the spec that claims one. Decision 3 (D:126-131) adds a third: a "board-level drop interaction" for the bars. |
| D-4 | D:94-95 | "What stays custom must be named in the report with why". Custom code is allowed if it is reported. It is not forbidden, and nothing tracks it later. |
| D-5 | Decisions 1, 17, D:118-121, 200-207 | The premise (the stock iOS drag) was reversed during the work: "the board's own drag replaces the system's drag session". The listed removals (D:92-94, `BoardDrop`, `ListGeometry`, `EdgeScroll` and others) were not revisited. Decisions 6 (`SpringZones`) and 13 (`EdgeScroll`) bring hand-made geometry and edge scrolling back under new names, which is root cause D1 again. |
| D-6 | Decision 14, D:174-176 | The drop preview is computed "off the main thread… its own JavaScript context". This is a second core instance with its own state. Nothing keeps it the same as the board's context except the read that follows. |
| D-7 | Decision 20, D:216-217 | "iPhone only: the plugin's own order of blocks is its frontend's matter." The divergence is written down as policy. |
| D-8 | Root cause D4, D:38-41; Checks, D:105-114 | D4 names about 20 flags in four owners as "the regression engine". The checks are unit, core and simulator behaviour only. No check fails if a flag or a second owner survives (for example, counting the owners of carry state). |
| D-9 | Decision 9 vs decision 22, D:149-152, 220-223 | The section drag's landing is redefined twice within the spec. Section drag stays a variant of card drag, held together by decisions rather than by one controller. |

---

## 3. Spec 3: UI refactor, revision 10 + decisions 43–60 (U)

### 3a. Principles, migration and process

| # | Where | What allows a second implementation, or old and new side by side |
|---|---|---|
| U1 | Migration table, U:350-356 | **Migration by host.** Slice 3 is "The note block, whole, behind `newBlock`"; slice 4 is "The leaf as a new screen behind `newScreen`… region by region". Each slice is asked to deliver a complete place, not a shared concern. The traceability's promise that slice 3 builds "the shared parts the leaf reuses" (T:122, T:128, "3, 4 means built for the block and then mounted in the leaf") is not in the spec, has no test, and the carry rows are split so the leaf's half is slice 4 (T:285-305: drop lines, `TimelineDrop`, `CarryReport`, `TreeDrop` are slice 4). |
| U2 | U:348; decision 43, slice3:482 | **Flags per place.** `newBlock` and `newScreen` are two flags. Decision 43 makes `newBlock` "a device value of its own", and `main.ts` mounts `NoteBlocks` instead of `ProjectBlocks`. The spec's guarantee is that the flags switch together, not that the code is shared. |
| U3 | Architecture, U:200-207 | The tree is split by layer (`model/ update/ view/ drivers/ host/`), not by concern. Nothing says "carry lives in `update/carry.ts` and nowhere else". "`Msg` (one union)" (U:201) is the only uniqueness claim, and no guard checks it (see H7). |
| U4 | P1, U:49-55 | "One model" is never defined as one model type for every place. Slice 3 built `BlockModel` with `note` and `pinned: BlockLists` (`model/block.ts:18-50`). T:178 had proposed `model.place = {kind: "block", …}`, but T's vocabulary is "a proposal" (T:57-59) and binds nothing. |
| U5 | P2 step 3, U:63 | "**Each screen** has a pure selector, `needs(model)`". Per-screen needs are sanctioned, which is why `blockNeeds` exists. The leaf's `needs` will rebuild the same list needs (funnel, sections) with nothing to share. |
| U6 | P2 step 4, U:67 | "Render, then the drivers, then focus last". It never says **who** runs this sequence. In slice 3 the host does it: `BlockHost.draw` (`host/block/BlockHost.tsx:197-226`) orders `motion.before`, `render`, `motion.after`, `holdHeight`, `fadeAway`, `layers`, `editors.sync`, `placeField` and `focusNow`. A leaf host will write its own frame pipeline. |
| U7 | P8, U:190; decision 26, U:459; decision 31, U:464 | "A host mounts, owns…", and "A host makes its **stores**" (plural). The host owns the command interpreter (`BlockHost.run`, about 15 command kinds at `BlockHost.tsx:381-440`), so every place writes its own effect runner. Several stores per host are allowed, which allows several timelines per screen. |
| U8 | P6, U:159-177 | "A stack of modal layers plus at most one pointer gesture". This is per model. Nothing says the carry is one statechart for every place. Decision 54 (slice3:493) defines "**The carry in the block**", with "`carryAt` is never called (a block has no tree)" and geometry "from offsets in the stack's content pixels". That is a block-shaped carry the leaf cannot reuse. |
| U9 | Decisions 44, 50, 53, 54, 56, 58, 59 (slice3:483-498) | Each slice-3 decision is phrased "in the block": the block's height, "the search in the block", "the carry in the block", "a field opened in the block grows the block". Each of these concerns now has a block-specific definition the leaf must redo. |
| U10 | §How it is built, U:424-427 | **Reviews check behaviour against principles.** "A fresh reviewer gets the diff, the principles and **that part's** traceability rows, and finds where the code breaks a principle". The reviewer of slice 4 never sees slice 3's code, and no principle says "one implementation per concern", so a second carry breaks nothing a reviewer can name. U:427 then requires every finding to be answered "by naming the principle or the inventory row", and no such principle exists. |
| U11 | Tests §6, U:398; decision 57, slice3:496 | **The e2e check is old against new, per place.** `npm run e2e -- block` compares the new block with the old block. A leaf run would compare the new leaf with the old leaf. Two independent implementations that each match the old one both pass. There is no cross-place comparison, such as the same carry seen in the block and in the leaf. |
| U12 | Done when, U:417-420 | The criteria are traceability, green guards, QA and "`CalendarScreen` is gone". No criterion says each concern has exactly one owner, or that no file or type is named after a place outside `host/`. |
| U13 | T:15, T:20-24 | **The traceability maps rows to concept names** ("carry gesture `target`", "`measure`"), not to code symbols, and it was checked only for "0 rows unmapped and 0 mapped twice". That checks that every row was mapped, not that the code is unique. Two code paths can satisfy one row. |
| U14 | Guards §Scope, U:298-300; decision 35, U:471 | **The freeze is lines per directory, and "Shrinking passes".** The old code may stay whole until slice 7. Allowances need only a commit and a 10-character reason. Slices 5–7 ship with the old screen's code, `createServices` and the old settings tab (slice 6) still in the bundle. T:53-54 confirms that after the switch, until slice 7, `createServices` still runs for `main.ts`, and that the old settings tab runs on old services until slice 6. U:348's "old and new never run side by side for Max" is therefore false for the settings tab in release 5. |
| U15 | Guards, U:302-318 | **Every guard is about layers or the host's API.** These are purity, door calls, timers, DOM work per driver, exhaustiveness, windows and deny-by-default. None is about uniqueness: no "one export per concern", no "no place-named symbol outside `host/`", no "the leaf host and the block host use the same update", no limit of one subclass or instance per driver. |
| U16 | Decision 34, U:470; `styles.test`, U:320-324 | The CSS rules forbid layout-property transitions and size changes under state. They allow `opacity`/`transform` transitions on `is-…` states. Slice 3 already ships one: `styles.css` line 2110-2111 (`.tc-n-block.is-carrying > :is(.tc-n-plus, .tc-n-capsule)` with `transition: opacity…, transform…`). This is a second motion engine beside the `motion` driver. It never reports `motionSettled`, the frame recorder cannot tell its cause, and P5 named "CSS transitions on state classes" as a defect (U:40). |
| U17 | Decision 33, U:469 ("`drivers/<driver>` (a folder or a file named for it)") | `placeOf` (`tests/uiRules.ts:50-57`) maps any file under `drivers/motion/` to the `motion` driver. Any number of FLIP, scroll or measure implementations can sit in the right folder. |
| U18 | P3, U:134; `PURE_RULES`, `tests/uiRules.ts:67-83` | The guard keeps the list of pure rules exact, but never requires their use. `update/` may compute its own drop place without `placeAt`/`levelAt`. `uiDecides.test.ts` trips only on task-field comparisons, not on geometry rules redone. |
| U19 | Code evidence, as built | `drivers/keys.ts:3` `BlockKey`; `drivers/measure.ts:37-78` (`Measure.stack`, "the stack of the block's lists", `Measure.carry(stack)`); `drivers/scroll.ts:3` (EdgeScroll on "block's stack"); `drivers/motion.ts:76, 420` (the block frame's height hold); CSS root `tc-n-block`. **The drivers' APIs are shaped by the block.** The leaf will add parallel methods for columns, the ribbon and the tree. |
| U20 | Code evidence: host holds interaction state | `BlockHost` holds `pressed: PressState`, `finger`, `edge`, `focusing`, `frame` and `drawnSeq` (`BlockHost.tsx:134-141`). It also computes the carry target from the pointer itself (`BlockHost.tsx:336-348`: `Measure.inStack`, `sectionSlotAt`, `ringNear(Measure.anchor…)`, `targetAt`) and arms the long-press timer (`:273`). That breaks P1 and P2 (facts in the model, decisions in `update`). No guard covers host state or host decisions, because hosts are judged only on the host API they reach (decision 33). The leaf host will hold its own press state and its own hit test. |

### 3b. Concrete code changes that add a second mechanism and pass every guard and test the spec defines

Each change was checked against U:298-330, decisions 33–36, and `tests/uiRules.ts` and `tests/architecture.test.ts` as built.

| # | Concern | Change | Why it passes |
|---|---|---|---|
| H1 | columns & lists, drag | Add `model/leaf.ts` (`LeafModel`, `LeafLists`), `update/leafCarry.ts` (a copy of `update/carry.ts` extended with `carryAt`, the tree and the timeline) and `messages.ts` with `LeafMsg`. | Pure, imports only contracts and pure rules. `assertNever` is used on `LeafMsg`. No guard compares unions or update modules. |
| H2 | motion / frame order | Add `host/leaf/LeafHost.tsx` with its own `draw()`: render, then `focus`, then `motion.after` (a different order), and its own `run(command)` interpreter. | Hosts may call drivers. U:67 does not name who orders the phases. `hostLifecycle` only counts leaks. Register it in `HOSTS` and it passes. |
| H3 | motion | Add `drivers/motion/ribbonFlip.ts` with its own WAAPI FLIP and its own settle timer. | `placeOf` sees driver `motion`. The WAAPI, geometry reads and timers are allowed there. The e2e recorder judges outcomes, not who animated. |
| H4 | motion | `.task-calendar .tc-n-col.is-entering { transition: opacity …, transform … }` below `/* next */`. | Opacity and transform are not size properties (decision 34). Slice 3 already does this (`styles.css:2110`). |
| H5 | timeline | The leaf host calls `session.store(...)` twice, one store for the lists and one for the timeline and panel, each with its own `update`. | Decision 31 allows "stores". P2's loop is per store. A carry between them goes through host glue. |
| H6 | measurement | `Measure.leafColumns(root)` beside `Measure.carry(stack)`. Each host converts coordinates its own way (`inStack` vs `inColumn`). | The geometry reads are in `measure`, which is allowed. The guard has no rule of one geometry model. |
| H7 | drag target | The leaf host computes `targetAt` from `this.finger`, as `BlockHost.tsx:336-348` does, but with its own column-hit logic before calling `placeAt`. | The host reaches only drivers and pure selectors. Decisions made in hosts are not checked. |
| H8 | keys | `drivers/keys.ts`: `type LeafKey = …` and a second `Keys.leaf(…)` with its own scope ordering. | It is still the keys driver, using `Scope`. |
| H9 | scroll | `drivers/scroll/RibbonGlide.ts` beside `Scroll.glideTo` and `EdgeScroll`. | It sits in the scroll folder. "Every programmatic scroll" in `scroll` is satisfied. |
| H10 | focus | The leaf host keeps its own `focusing` field and its own `focusNow` timing (`BlockHost.tsx:139, 231-233`). | Host state is never checked, and `.focus(` still lives in `focus`. |
| H11 | entry | `update/leafEntry.ts` runs `entryJobStep` with its own `coming` and look rules (decision 51 puts the look in the host's `entryDoor`, `BlockHost.tsx:83-88`). | The core's job order is used, so P3 and P7 hold. The UI glue around it is duplicated. |
| H12 | menus | `view/menu/LeafMenu.tsx` and `update/leafMenu.ts` with their own placement (`groupsAbove` redone for columns). | Views and update are pure, and the overlay host still mounts them. |
| H13 | search | `update/leafSearch.ts` reveals through `tasks.reveal` but with its own scroll-into-view command, apart from decision 53 ("the search in the block"). | It is per screen by design (P2 `needs`). |
| H14 | sections | `update/leafSection.ts` copies the decision 59 lift for the leaf's columns. | Pure. |
| H15 | lists | `selectors/leafRows.ts` builds `CardRow`/`HeadRow` from `ColumnSections` again instead of using `model/lists.ts` `funnelList`. | No rule of one list builder. |
| H16 | old and new | A freeze allowance (decision 35) with a commit and a 10-character reason lets `obsidian/ui/TaskList.ts` grow to fix a leaf bug while the new leaf is built, so both are maintained. | This is allowed by design. |
| H17 | anywhere | Put DOM work outside `obsidian/ui/next`, for example `obsidian/composeRuntime.ts` or a new `obsidian/leafChrome.ts` that sets body classes or scroll positions. | `uiRules` covers only `obsidian/ui/next` (U:298). `architecture.test` checks imports, not DOM reach, for root files. |
| H18 | flags | `newScreen` added as a second device key next to `task-calendar:new-screens`, read separately in `main.ts`. | Decision 43 already sets this pattern. Nothing checks "one flag". |
| H19 | reviews | Slice 4's reviewer gets slice 4's diff and the leaf's traceability rows (U:425). The duplicate of H1 lives in files the reviewer has, but the original is not in the diff. | It is invisible by process. |
| H20 | e2e | Both new block and new leaf match their old counterparts within tolerance (decisions 41 and 57). | The comparison is per place. |

**Severity ranking** (how likely it is to happen, and how much it would split):
1. U1/U2 + H1 (migration by host; a model and update per place): the root, and it already happened.
2. U6/U7/U20 + H2/H7/H10 (the host as the frame pipeline, effect runner and hit tester, unguarded): every concern's glue gets copied per place.
3. U15 (no uniqueness guard at all) + H17 (guard scope stops at `ui/next`).
4. U10/U11/U13 (reviews, e2e and traceability check behaviour or mapping, never structure) + H19/H20.
5. U16 + H4 (CSS state transitions as a second motion engine; already in slice 3).
6. U17/U19 + H3/H6/H8/H9 (the folder test and block-shaped driver APIs invite parallel methods).
7. U5/U8/U9 (per-screen `needs` and block-phrased decisions 43–60).
8. U14 + H16 (the freeze lets the old code live and grow; the old settings tab ships beside the new screens).
9. U18 + H15 (pure rules listed, not required).
10. U2 + H18 (flag per place).

---

## 4. Common root cause (≤5 sentences)

All three specs stated "one mechanism" as a principle and then sliced, owned and verified the work by place: the iPhone vs the plugin, the block vs the leaf, root-cause class R2 vs R3. Each slice was asked to finish a whole place, so it built a whole mechanism for that place. No artifact ever named the single code owner of each concern (a module, a type) for every place to import. Every check that existed (frame recorders, old-vs-new e2e, principle reviews of one diff, layer and DOM-API guards, traceability that counts rows) tests behaviour or layering, and two correct copies pass all of them. A duplicate could only be noticed by a person reading two places at once, and the process never put the two places in front of one reader or one test.
