# R9: architect and consistency review of the UI refactor spec, revision 14

Read-only review. Spec: `docs/superpowers/specs/2026-11-15-ui-refactor.md` (S), `ui-refactor/traceability.md` (T). Line numbers are those files' lines at `82370c30`. Packages checked in `.worktrees/ui-refactor-slice3-carry2/node_modules`: typescript 7.0.2 (exports `.`→version only plus `./unstable/*`; `--build`, `--composite` present; native `typescript-darwin-arm64`), preact 11.2.0 (`memo` only in `preact/compat`), vitest 5.0.5 (`module-evaluator.js` on `vite/module-runner`, `externalize` for deps), vite 8.3.5, esbuild 0.28.2, node 22.22.0, obsidian 1.14.4. Not installed: `@stryker-mutator/*`, `jscpd`.

Severity: **B** blocker (a builder must guess or the plan cannot be green), **H** high (a contradiction or contortion that will show up in code), **M** medium, **L** wording.

---

## 1. Blockers

**B1. Structural sharing is keyed wrong (S 230, 779).** 3a says a `TaskItem` cache keyed by (id, line text). A `TaskItem` (`core/application/contracts.ts:230-320`) holds much more than its line: `key` (with `index` in its section, `:132-137`, which shifts for every card below an insert), `subtasks`, `allSubtasks`, `progress`, `marks` (the subtask counter), `collapsed`, `description` (the lines under it), `parentText`, `parentKey`, `day`/`repeatDay` (today), `colors` (settings), `drawnOn`, `can`. With an (id, line) key, adding a subtask leaves the parent's counter stale and an insert at the top leaves every key below stale. With a correct key, an insert at the top of a list changes every key below it, so every card below re-renders. The budget at S 240 ("only the cards whose line changed or whose place moved") is then either broken or empty.
- **Fix:** split the answer into a positional part and a face.
  - The list answer carries the order and the keys (`rows: { id, key }[]`).
  - The card's face (`TaskItem` without `key`) is cached by (id, line, child lines, description lines, reading identity: settings and today).
  - Cards take the id and the face as props. An act carries the id, and the key is resolved at commit (`tasks.keyOf`, which P6 already does for pins).
- **Budget:** state it as "re-renders exactly the cards whose face changed".

**B2. The guards' reference manifest cannot exist during stages 3–6 (S 306 against G8 at S 683, 771).** S 306 says the reference is the manifest at the last release tag and at master's head. G8 keeps all new work off master until stage 7, and the last release tag predates the guards. Through every stage the reference is therefore empty, so every change counts as an addition and `guards:pin` classifies nothing.
- **Fix:** make the reference the manifest at the previous stage's merge commit on `ui-refactor`, recorded as a tag (`ui-refactor/stage-3b` …). Use master's head only after stage 7.

**B3. The recorded closure misses every input read through `fs` (S 306).** A Vite `transform` hook sees only modules that go through the module runner. Packages are externalised (Vitest 5's `externalize`), which the lockfile covers. Data read with `readFileSync`/`readdir` is not seen at all: `rows.json`, `tests/guards/fixtures/**`, `styles.css` for `styles.test.ts`, the inventories, `engines.ts` when the checker reads it through the TS API rather than importing it, and `mutation-floor.json`/`coverage-floor.json`.
- **Also contradictory:** S 311 says the floors sit "outside the manifest", but the release loads them, so a complete recorder would pin them.
- **Fix:** a setup file in the guard project and the Node loader wrap `fs.readFileSync`/`readdirSync`/`statSync` and record every path under the repo. List the floor files explicitly as an exclusion.

**B4. The rules are proven only on fixtures until the end of 3c2, then switched on all at once (S 780–782, 773).** Every stage claims "every check of §Guards green" (S 773), but in 3b and 3c1 the checker never runs on product code. So 3c1's structural review has nothing mechanical behind it, and the end of 3c2 turns into a big-bang fix. The code already in `obsidian/ui/next` has about 90 `noCompute` hits: `model/entry.ts` 14, `update/carry.ts` 10, `update/full.ts` 8, `model/taskMenu.ts` 8, `model/carryPlace.ts` 8. This is R7 H7 coming back as a time bomb.
- **Fix:** the rules apply to a `ported` list of folders. A concern's folder joins the list when it is ported in 3c1 or 3c2. Adding a folder is an addition, removing one is a weakening.

**B5. 3a's list of rules is incomplete, so 3c agents will stop on `noCompute` with no core rule to call (S 779).** The list covers `monthGrid`, `weekDays`, `stepPick`, `pickRange`, `sectionSpan`, `nearestSlot`, `branchPasses` and the field row. The same folders also compute the following, none of it named:
- the menu's tile rows and `four` (`model/taskMenu.ts:255,268-270`);
- the menu's split above/below (`view/menu/TaskMenu.tsx:298`);
- the card's stripes (`model/card.ts:81,89` `colors.length > 1`);
- the carried stack (`model/carryView.ts:69`);
- the drop line's width (`carryView.ts:45`);
- the month title from a sliced date (`taskMenu.ts:389-395`);
- the description's replace sequence (`update/full.ts:155`);
- the search row counter (`view/search/Search.tsx:95`).

T adds stage-4 rows that compute in the UI: `gridAt(hourPx)` (T 339), the now line's `--tc-y` (T 204) and `paintEvent` colour maths (T 265, `eventColors.ts`).
- **Fix:** have 3a run `noCompute` in report mode over today's `next/` and the T rows, and add every hit as a core rule or as a helper in `seq.ts` (see H1). Each stage-4 region opens with its own enumerated `backend` list.

**B6. The kit project's JSX types do not line up with the host (S 262–269).** The kit compiles `.tsx` against the type view, resolved by its `paths`. Its emitted declarations then say `JSX.Element` from the type view, while the host resolves the same specifier to the real `tc-jsx`, which is Preact's `VNode`. So `render(<Screen/>)` in the render engine needs `as unknown as`, which `hostAny` (S 664) refuses.

Composite projects also require declaration emit:
- today `core/tsconfig.json` and `tsconfig.next-pure.json` both set `noEmit: true` and `skipLibCheck: true`;
- `core/tsconfig.json` `extends ../tsconfig.json`, which becomes the host project.
- **Fix:** declare the type view's `JSX.Element` as an opaque `KitNode` brand, and have the render engine's row name one declared conversion function. Give each composite project `emitDeclarationOnly` with `outDir: .tsbuild/<project>` and `extends` a base config that is not the host project. Spike `tsc -b` on TS 7.0.2 in 3b before anything else; it has not been run.

## 2. Contradictions and leftovers

**H2. Neighbour views: idle against synchronous.** P2 (S 94) says every replica change recomputes every mounted need in the same loop. P9 (S 236) says neighbours and the other modes are a standing need computed at idle. Both cannot hold.
- **Fix:** see §3.

**H3. The 50 ms mode switch and the 16 ms task rule disagree.**
- S 244 allows "under 50 ms … no long task over 50 ms".
- S 850 also states 50 ms.
- Decision 42 (S 986) fails any trace with a task over 16 ms.
- The same trace cannot pass both.

**H4. `rules.*` "imported directly" in the traceability, against the gateway.** T 108–111 says the rules are "imported by `update/`, selectors and `motion`", T 170 "imported directly, P2 step 3", while C3 and the `gateway` rule say only `screen/rules.ts` may reach them.
- T 108 also says "edge speed are design tokens", while S 293 and S 417 make the speed the scroll engine's execution.
- T 130 describes stage 3 as "in revision 13 … branded units … 3c", with no 3c1 or 3c2.
- T 15 says "the core's hit test over the adopted rows", while T 972 and S 293 use the gateway's `within`.
- T 85 lists settings among the "recorded inputs", while P3 (S 137) says replays use the current settings.
- T 96 still says the loop ends with "render, drivers, focus".

**H5. Leftovers of revisions 11–13 not covered by the note at S 524.** The note covers only the revision-12 and revision-13 tables, and names five replaced items. Still stale:
- S 262: "has `--build`, `composite` and `--listFiles`, checked" (listFiles was dropped at S 679).
- S 796: "its geometry through the gesture concern's hit test … and units".
- S 991, decision 44: `Layout.variants.frame` (the revision-12 shape; the part is now per concern).
- S 554: "`AssertNoForeignFacts` (C1)".
- S 535, S 550: "`--listFiles` partition check".
- S 547, S 579: "no arithmetic or ordering in engines".
- S 560: "`deltaMode` by `units.fromWheel`".
- The revision-11 table states its kills in present tense with dropped mechanisms:
  - S 573: "pure code can compute no geometry outside the gesture concern";
  - S 574: "branded units … engines do no arithmetic";
  - S 595: "comparisons in `update/gesture/`";
  - S 603: "C3 units";
  - S 619: "units made only by engines".
- Decision 33's enumeration is gone (S 977), and the 100 % gates are gone (S 312, 559).
- The rejected-findings fixtures were moved to G9 (S 648, 685).

Fix: widen the note to cover every older table, or rewrite those cells to name the current part.

**H6. `WindowHost` holds state its own rule forbids.**
- S 283 and the `execute` rule (S 667) allow only `readonly` maps of handles.
- S 377 gives it changing state: the active screen, every screen's carry-target geometry and the `toDevice` routing.
- Its outside-press listener also lands in the wrong place. S 407 puts outside presses "on the window, through `WindowHost`", but the `events` rule (S 662) allows pointer listeners only in `engines/input.ts`.
- **Fix:** `WindowHost` keeps a `readonly Set<ScreenHost>` and asks the screens on demand. Each screen's geometry lives in its own `model.measured`, and the active screen is the one whose root last took input, answered by the screens. The outside press comes from one input-engine instance per window, which `WindowHost` holds as a handle.

**H7. The hover dwell has two sources.** S 293 makes the dwell a gesture token in `screen/tokens.ts` that equals the CSS. The core already owns it as `PROJECTS_HOVER_MS = 600` (`core/application/projectsScreen.ts:587`, exposed as `rules.constants`, `docs/door.md:290`), and the iPhone app uses that one. The hover-open is an outcome.
- **Fix:** the dwell token comes from the core through the gateway. Only slop, hold and edge zone stay design tokens.

**M1. A note's cells and `toDevice` collide.** S 301 says a note's cells assert every device key unchanged, but "Show on the main screen" from a note changes the projects screen via `toDevice`. Fix: scope the assertion to writes made with the note's own capability, and give the `toDevice` cell its own expectation.

**M2. The `answers` rule forbids every comparison in `obsidian/runtime/dispatch/`, yet P9's per-part caches there must compare part identities (S 231–232, 294, 671).** Fix: allow identity equality on replica parts and need ids.

**M3. `DoorMethods.writes` is a single value (S 779), but one call can write the tasks and the device at once** (a drop ending a carry, a reveal). Fix: `writes: readonly ("tasks" | "settings" | "device")[]`.

**M4. The trap's ledger flags Obsidian's own DOM.** The adopted settings rows (S 318) hold Obsidian's own toggles and dropdowns, which change their own classes. The ledger (S 316) judges every class mutation in the screen's subtree and will flag them. Fix: name adopted controls a library subtree, like the editors' islands.

**L1.** Hatches give `screen/layout.ts` an exception for `as` at S 313, but the rule table at S 677 omits it. `exceeds(d: Distance, t: GestureToken)` lets a distance be compared against the hold or dwell token, which are times. Fix: `GestureToken<"px" | "ms">` and an `elapsed` form only for timers, or no time token at all, since hold, dwell and second press are timers.

## 3. Performance

**Budgets above 16 ms:**
- the mode switch, 50 ms and "no long task over 50 ms" (S 244, 850);
- the warm cost of a new `EditorView`, 5–15 ms (S 235). It is still paid by the full card's description and the description peek, since only the title field is warm.

**Interactions with no budget at all:**
- a tap that opens a menu or the full card;
- a drop's landing;
- undo;
- a project or filter change, which is a context change that renders every card, like a mode switch, but has no precompute;
- a search keystroke;
- the day swipe's landing.

The owner wants "every interaction under 16 ms", but the spec budgets only five gestures.

**Is 50 ms structurally necessary?** For a cold render of a new context, yes: about 300 cards of Preact creation, style and layout at 4× CPU. That cannot be made to fit 16 ms. Computing the views at idle does not help, because a view costs about 1 ms warm; the cost is the DOM. 16 ms is reachable only if no interaction ever renders a context cold:
1. **Keep the alternatives mounted.** The place's other modes (from `layoutOf`) and the current mode's two neighbours stay as hidden subtrees with `content-visibility: hidden`. That property keeps their rendering state, so showing one is a class change plus the visible subtree's paint. iOS WKWebView support is from memory, not verified: check before relying on it.
2. **Key cards by id across contexts,** so a project or filter change reuses DOM nodes instead of creating them. P5 forbids animating across contexts, not reusing nodes.
3. **A write updates every mounted subtree in the same loop.** P9's memo keeps the cost proportional to the changed faces times about five subtrees. Budget a write, tap to paint, under 16 ms including that fan-out.
4. **Idle is used only for the first construction** of a subtree after a context change, chunked, and never for keeping one fresh.
5. **Not verified: `requestIdleCallback` on iOS.** I believe WKWebView historically lacked it (from memory, not checked). The time engine needs a fallback scheduler.

**Is "neighbours at idle" sound as written?**
- **Staleness:** no. If the neighbours are needs recomputed at idle, a swipe between a write and the next idle shows a neighbour from the previous replica, which breaks P3's "never mixes generations". The fix is point 3 above.
- **Memory:** fine. About five subtrees per main screen, none for notes (no day navigation, S 885–887). Notes must be excluded explicitly through `layoutOf`, or every open note pays the cost.
- **Three modes × places:** precompute only the current place's offered modes and the current mode's neighbours, never the full product.
- **A second swipe before idle:** it lands on an unbuilt neighbour. Build the next neighbour inside the settle's tail frames, within the 8 ms budget per frame, not at idle.

Also add per-interaction budgets: tap to open a menu or full card, drop, undo, filter or project change, search keystroke, each under 16 ms to paint. Keep the full card's description editor warm too.

## 4. Clean code: is "no arithmetic or ordering" clean?

The rule (S 291, 669) is right for decisions and wrong for plumbing. Slice 3's code shows what it forces:

| Kind | Today | What it forces |
|---|---|---|
| Counts and emptiness | `picked.length > 1` (`update/carry.ts:120,324`), `tiles.length > 0` (`taskMenu.ts:311`) | `> 1` has no equality form. Authors write `!== 0 && !== 1` or ask the core whether "many are picked". |
| Toggles | `!on` | Fine. |
| Stack top and pop | `layers.slice(-1).find(() => true)` (`model/layers.ts:19`), `stack.slice(0, -1)` (`update/full.ts:102`) | `-1` is a unary minus, so a literal-only exception still refuses it. The layer stack (P6) cannot be popped without the core. |
| List keys and counters | `row++` (`Search.tsx:95`), index callbacks | They become a core field or a key. That one is fine, since keys should be ids. |
| Act decoding | `value.slice(at + 1)` (`update/acts.ts:19-20`) | String slicing with a computed argument is refused, although it is not a decision. |

**Cleaner rule.**
- `noCompute` bans arithmetic and ordering only on operands whose type is `number` or `bigint`. String methods stay allowed. `slice`/`at` with integer literals, negatives included, is allowed.
- One exempt, closure-listed module, `screen/seq.ts`, holds data-agnostic collection plumbing: `last`, `withoutLast`, `isSingle`, `isMany`, `isEmpty`, `count`, `chunk` (the latter only if the core hands over the size).
- `seq.ts` is unit-tested, and its exports may not take a geometry brand or a core numeric field.

This keeps the guarantee: no geometry, landing, order or date in the UI. It removes the contortions, the same way `records.ts` removed the casts.

**The gesture machine's three predicates (S 293).**
- **Hold, dwell, second press:** timers, so no predicate is needed.
- **Edge scroll is not expressible.** `within(p, s)` needs the edge zone as a `MeasuredShape`, which takes arithmetic to build. The machine also "reports the depth" (S 417), which is a subtraction.
- **Pinch "step crossed"** needs the core (`zoomAfterPinch`) plus equality. That is fine, but say so.
- **Fix:** the measure engine makes the edge zones as `MeasuredShape`s (engine arithmetic is allowed). The machine reports only "in zone X", and the scroll engine computes depth and speed itself.

**`execute` in engines (S 282, 667) contorts the motion and scroll engines.** The following need an ordering or a numeric condition, and none of them decides anything:
- a glide's or spring's termination;
- a FLIP skip below 0.5 px;
- clamping the edge-scroll speed (`Math.min`);
- dropping a zero-length animation.

**Fix:** allow ordering and `Math` in engines. Forbid what matters instead: an engine creates a `Msg` only from the machine's outputs, an observer's measurement or a fixed lifecycle event. Engines' dispatch sites are then typed: an `EngineOut` union with no free payloads.

**`readers.ts`, one module per field (S 298).**
- **A variant has two natural readers:** the concern's handler, and the kit element that draws it. For example, `entry.bar` picks `KeyboardBar` or `Capsule`, while `update/entry` also behaves differently by it. "Drawing it is not a read" (S 298) is ambiguous, because a JSX ternary is a condition.
- **One module per field conflicts with "any files" per concern (S 287),** and it pushes every condition on `ViewChoice`/`topRow`/`panel` into `screen/layout.ts`, which becomes the god file R7 K3 warned about.
- **Fix:** one reader per (field, layer): one module in `update/<concern>/` and one kit component. `Place` and the chrome's place facts stay in `layout.ts` only.

**`WindowHost`:** see H6. It is stateless in rule but stateful in text. Make it a registry of handles that asks the screens.

## 5. Buildability against the installed packages

- **Project references, pure → kit → host, with Preact JSX:** see B6. Not run on TS 7.0.2. The `--build`/`--composite` flags exist (checked with `tsc --help --all`). Needs `emitDeclarationOnly`, a base config that is not the host, and the brand for `JSX.Element`.
- **The checker on `typescript/unstable/sync`:**
  - **It exists.** `Checker.getSymbolAtLocation`, `getAliasedSymbol`, `getTypeAtLocation`, `getResolvedSignature`, `getShorthandAssignmentValueSymbol` and `Snapshot.getProjects` are all in `dist/api/sync/api.d.ts`.
  - **It is synchronous RPC to the native `tsgo`** (`SyncRpcChannel`). Per-node calls over the whole bundle will be slow; use the array overloads (`getSymbolAtLocation(nodes[])`).
  - **It is `unstable`:** pin it exactly, as S 977 says.
  - **`.js` metafile inputs need `allowJs` in some project,** or the checker cannot type them.
  - **Unverified:** does `getDefaultProjectForFile` pick the right one of four composite projects for a file?
  - Spike all of this first in 3b.
- **The closure through Vite's module runner:** verified that Vitest 5.0.5 runs modules through `vite/module-runner`. But it misses fs reads (B3) and the config files (bundled by Vite, not transformed). `npm test` runs two configs (`vitest.config.mts`, `vitest.budget.config.mts`), so the plugin must be in both.
- **The trap over CDP with auto-attach:**
  - **From memory, not verified:** `Target.setAutoAttach` at page level does not attach new top-level popups. It must be sent on the browser-level session (`/json/version`'s `webSocketDebuggerUrl`), with `flatten`, then `Page.addScriptToEvaluateOnNewDocument` plus `Runtime.runIfWaitingForDebugger` on each attached page.
  - **From memory, not verified:** Obsidian popouts are about:blank `window.open` windows driven from the main realm, and `addScriptToEvaluateOnNewDocument` does not run on the initial about:blank document.
  - **Fix:** on `attachedToTarget`, also `Runtime.evaluate` the trap before resuming. Add a self-test cell that opens a popout and requires an "armed" report from it.
  - **Name the seams' hook:** how the injected script reaches the bundle's seams is unstated. It must be a declared global, owned by the host-services row in `reach`.
- **Stryker without the TS checker:**
  - **It is not installed.** The `@stryker-mutator/vitest-runner` 10.1.1 peer range `vitest >=2` is a declaration, not proof that it works with Vitest 5 and Vite 8; the runner uses Vitest's node API.
  - **Spike it in 3b.** Each mutant of `uiRules` re-runs fixtures through `tsgo` RPC, which is slow; scope the mutation to rule logic with the TS snapshot cached per run.
  - **jscpd is not installed** either, although S 651 lists it.

## 6. Migration

| Stage | Independently green? | Realistic? |
|---|---|---|
| 3a | Yes, on the core's tests. | The `TaskItem` key is wrong (B1) and the rule list incomplete (B5). |
| 3b | Green only on fixtures. | Too big for one agent: four projects, 17 checker rules on an unstable RPC API, the CSS allowlist, trap and ledger with CDP popouts, the closure with three recorders, `guards:pin`'s diff classification (it must tell "a scenario's assertions fewer" from a diff), Stryker, coverage, the freeze, `--ui=next`, the registry over 2,032 rows. Split into 3b1 (projects, `tc-jsx`, checker with reach/packages/noCompute/oneReader/slices, fixtures) and 3b2 (closure and pin, trap and ledger, Stryker, matrix registry). The registry's "every row maps to a member" cannot pass before the unions exist: scope it to the ported concerns. |
| 3c1 | Green only because the rules are off. | See B4. |
| 3c2 | Big-bang rule switch-on. | See B4. |
| 4 | Yes, region by region. | Each region needs a `backend` rules list first (B5). |
| 5 | Partly. | "Adds values to existing variants and nothing else" (S 784) clashes with old bug 11, which needs the core (`backend`), and with old bug 3's `entry.placeMoves: stay` (the written card leaving the list), which likely needs a new step. |
| 6 | Yes. | Needs M4 (the ledger on Obsidian's own controls). |
| 7 | Yes. | — |

**What a fresh agent would have to guess to build 3a from the spec alone:**
1. The `TaskItem` cache key and the split into position and face (B1).
2. `DoorMethods.writes` for calls that write several parts (M3); the `args` types for methods that take `unknown[]` today; whether `rules.*` and `rules.constants` entries are in `DoorMethods`. They are in `SPACES` (`PhoneCalls.ts:1270`).
3. The signatures of the new rules:
   - `weekDays`: from what? the week start setting?
   - `nearestSlot`: takes measured boxes in px, a shape the spec does not define;
   - `stepPick`: does it clamp or wrap?
   - the entry field's row: as which `EntryAnswer` field?
4. Where the 30 KB budget file comes from. Max's file is gitignored in `.e2e/fixture`, so a synthetic fixture is needed, and nothing names one.
5. The machine for "under 0.3 ms", and whether the 4× throttle applies.
6. How "ids, history and the projects screen keep identity when unchanged" is compared. A deep compare of the history on every call costs more than 0.3 ms.
7. Where the project-note index is invalidated. `DOOR_CACHE` (`PhoneCalls.ts:244`, `ReadingCache`, size 6) is keyed by text, settings and today, not by project notes.
8. Whether `docs/door.md` must document the new `rules.*`. It is the door's contract, and the iPhone will call `monthGrid`.
9. Whether the rules of B5's list are also 3a's.
