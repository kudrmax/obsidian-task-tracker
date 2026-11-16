# R8 — a year of hurried feature work against revision 14

Red team, read-only. Read: the spec (revision 14) without its finding table until the verdicts below were formed, `CLAUDE.md`, `docs/plugin/` (headings, `screen.md`), `obsidian/ui/next`, `obsidian/runtime`, `tests/uiRules.ts`, `tests/uiDecides.test.ts`, `styles.css`. Not read: `rev11-research/`.

Threat model as the spec states it: a capable, hurried, fresh agent; shortest path to green; copies nearby code; adds a flag; reaches for a library; quietly disables what is in its way when that is easy. No sabotage.

Checks traced for every task: construction (one `Model`/`Msg`/`update`/`ScreenHost`, four `tsc -b` projects); checker rules `reach`, `events`, `packages`, `hostAny`, `ambient`, `classes`, `execute`, `rearm`, `noCompute`, `gateway`, `answers`, `oneReader`, `placeWrite`, `slices`, `moduleState`, `boundaries`, `hatches`; the kit type view; `closed.ts`; CSS allowlist (decision 34); `uiDecides`; the matrix (G5); the trap and ledger; budgets; `guards:pin` classification; G9.

## Counts

| Verdict | Count |
|---|---|
| SAFE | 10 |
| CAUGHT | 11 |
| LEAK | 11 (9 distinct causes) |
| FRICTION | 6 |
| **Total** | **38** |

---

## LEAK

### 1. Tree: sort subprojects alphabetically (and search results by title) — LEAK (L1)
- **Natural code** (`update/tree/` or `regionsOf`): `children.toSorted((a, b) => a.name.localeCompare(b.name))`.
- **Trace:** `noCompute` forbids arithmetic and *ordering operators on a number*; there is none here (`localeCompare` returns a number that goes straight back to `toSorted`, no operator). Not `slice/at/splice/with/fill`. `gateway`, `oneReader`, `uiDecides`: nothing. The matrix compares one concern's logs across equal-variant cells. It would see a different order only if a scenario's fixture happens to have unsorted names and somebody wrote the expectation from the core.
- **Ships:** the order of the tree is decided in the UI. The Swift app keeps the file's order, so the two frontends differ. C3 says "never computes **or orders**", but the rule only names numeric operators.
- **Same family:** `toReversed()`, `sort()` with no comparator, `Intl.Collator`, `findLast`, `reduce`. `substring`/`charAt`/`padStart(n)`/`Array.from({ length: n })` are not on the `slice`-family list either.
- **Fix (principle):** turn `noCompute` from a deny-list into an **allowlist of operations in pure and kit code**: `map`, `filter`, `find`, `some`, `every`, `includes`, `flatMap`, `join`, `===`, `!`, a literal index. Anything that reorders, accumulates or addresses by position is not on it, whether it works on numbers or not. Order comes from the core like every other decision. The allowlist is then the one place the rule can grow, and growing it is a weakening.

### 2. Keyboard: j / k move the selection to the next / previous card — LEAK (L2)
- **Natural code** (`update/keys/`), after `xs[i + 1]` fails `noCompute`:
  ```ts
  let prev: Key | null = null;
  for (const k of regionKeys) { if (k === selected) return prev; prev = k; }
  ```
- **Trace:** no arithmetic, no ordering operator, no numeric index. `moduleState` covers only module scope; a local `let` is legal. C3 says "its neighbour comes from the core". Nothing makes that so, because "reached by iteration" is explicitly allowed.
- **Ships:** neighbour logic in the UI. It skips nothing a core neighbour rule would skip: folded subtasks, leaving rows, sections.
- **Fix:** the same allowlist as L1, with no `let` and no `for…of` that carries state between iterations in pure code (pure code is `const` and expressions). Plus a core `neighbours(view, key)` answer the key table reads.

### 3. Undo toast with a live countdown ("Undo · 5…4…3") — LEAK (L3)
- **Natural code:** first tries `hostServices.notice()` with a DOM fragment. CAUGHT by `reach` (no DOM building in the hostServices row), and the message leads to a kit layer. Then the countdown: `tickA` handler issues `after(1s, tickB)`, `tickB` issues `after(1s, tickA)`. The seconds left are literal labels carried in the messages, or a core rule.
- **Trace:** `rearm` refuses a handler whose timer's message is **its own kind**. A two-kind ping-pong is not its own kind. `noCompute`: no arithmetic if the label comes from the core.
- **Ships:** a second repeating clock beside the runtime's minute and `AmbientSpec`. That is exactly what C2's "repeating work has one home" forbids.
- **Fix:** `rearm` checks for **any cycle** in the graph of message kind → timer command → message kind, across all pure handlers, not only a self-loop. A ticking display gets a named home: a runtime clock broadcast at a declared granularity (like `minute`), or an `AmbientSpec`.

### 4. Paste several lines into the entry → several tasks — LEAK (L4)
- **Natural code:** `paste` is not in the editors row. `events` denies it, so the agent adds it to the row: a weakening, reported. That part is fine. Then in `update/entry/`: `text.split("\n").map(line => door("tasks.create", [line, place]))`.
- **Trace:** no rule ties a door method to the concern or session that owns it. `DoorMethods` marks only `writes`. `tasks.create` is not a device write, so `placeWrite` is silent. No arithmetic.
- **Ships:** a second entry path that skips `entry.*` and `entryJobStep`. Where the task lands, its date tokens and trimming are decided twice. Undo gets N steps.
- **Fix:** each door method in `DoorMethods` gets an **owner concern**, or a session (`entry`, `carry`, `settings`). A command carrying the method can be built only in that concern's folder, the same shape as `slices`. This is narrower than the rejected R4 F4: it covers **writes** (decisions), not effects like focus or scroll. Adding a method with its owner is a silent addition; changing an owner is a weakening.

### 5. Search: "Create task '<query>'" when nothing is found — LEAK (L4)
- Same route as #4: `update/search/` issues `tasks.create` directly. What a new task's place, project and filter are is decided outside the entry. Same fix.

### 6. View menu: "Hide done subtasks" (a new device toggle) — LEAK (L5)
- **Natural code:** add `hideDone` to `SETTINGS_FILE.device`. `PlaceWrite` covers it by data (good). Then in `regionsOf`: `cards.filter(c => !c.item.done || !model.context.hideDone)`. If the field is `closed` or `completed`, or the agent writes `.filter(c => c.item.open)`, the `uiDecides` regex list does not match it.
- **Trace:** `uiDecides` is an **enumerated regex list** of today's `TaskItem` fields. A positive `.filter(c => c.item.open)` matches no pattern, and any new field is in no pattern. `oneReader` covers `Place`, chrome place facts, `Layout` fields and the pointer kind. A **device setting or model field that selects behaviour** is not in it, so `hideDone` can be read in any module. `noCompute`: nothing.
- **Ships:** a filtering rule in the UI. The Swift app would have to write it again.
- **Fix:** C4 by **type, not by list**. In pure and kit code, a value whose declared type is a core answer type (`TaskItem` and the other answer types) may not be the operand of a condition or a predicate callback (`filter`/`find`/`some`/`every`), except fields the core declares as decisions (`can.*`, a `kind` discriminant). And every model field that comes from settings is a selector of behaviour with one reader. This retires `uiDecides`' regex list for `next/`.

### 7. Project tree: a badge with the count of open tasks under a project — LEAK (L5)
- **Natural code:** `subtree.flatMap(p => p.tasks).filter(t => t.open).length`, drawn as a number. The `.length` is legal (drawn, not computed). The predicate is the leak.
- **Ships:** "what counts as open" is decided in the UI, which CLAUDE.md names explicitly. Same fix as #6. The count is a core answer field.

### 8. Entry bar: a different hint text in the capsule than in the keyboard bar — LEAK (L6)
- **Natural code:** the entry concern passes `parts.entry.bar` to the kit as a prop: `<Bar mode={parts.entry.bar} />`. In `Bar.tsx`: `{mode === "capsule" ? <Hint …/> : null}`. Or, in another `update/` file: `const { bar } = parts.entry; if (bar === "capsule") …`.
- **Trace:** `oneReader` records readers **per field** ("passing a value along is not a read"). A prop `mode` declared in `BarProps`, or a destructured local, is a different declaration, and the spec has no dataflow tracking. The variant now selects behaviour at two points.
- **Fix:** **a selector of behaviour is a type, not a field.** Each variant's closed union is declared once (`model/layout.ts`), and `oneReader` keys on the type's alias symbol: any condition on a value of that type, wherever it is stored, counts. A structurally equal literal union declared elsewhere fails (`closed.ts`). The same type key covers the destructuring and the prop. Chrome facts added later (for example `reducedMotion`, see #22) get covered by type the day they are added.

### 9. All-day row: a new list of all-day events, keyed by index — LEAK (L7)
- **Natural code:** `events.map((e, i) => <EventChip key={i} … motion="none" …/>)`, copied from any React snippet.
- **Trace:** passing `i` along is legal: no arithmetic, and it is not an index access. The kit types `key` as whatever Preact takes. The frame recorder may catch a wrong row moving, but only in a cell where events reorder.
- **Ships:** a second identity scheme beside P1's (keys given when the message makes the row). With `motion` set to a cause, rows animate the wrong elements.
- **Fix:** the kit's `key` is a branded key type, made only by the identity concern or from a core id. A number is not assignable to it. The kit's type view closes `key` the way it closes `class`.

### 10. Refactor: "extract a helper" `clampIndex(i, n)` shared by keys and search — LEAK (L8)
- **Natural code:** `noCompute` rejects `Math.min` in `update/`. The agent looks for the exempt module and puts the helper in `screen/rules.ts`, the gateway. That module is exempt and already holds many small functions.
- **Trace:** C3 says "each export is one call of one core rule", but no rule in the checker's table enforces the gateway's body. A change to the gateway is a closure change. Every new core rule touches the gateway too, and the pin's silent list (rows, cells, readers, fixtures) does not include gateway exports. So **every routine core-rule addition is reported as a weakening**, and this one hides among them.
- **Ships:** UI arithmetic in the one exempt file, classified as the same weekly noise as legitimate additions.
- **Fix:** a `gateway` clause the checker enforces: each export's body is exactly one call of an imported core function, with its parameters passed through unchanged (an AST shape). Such an export is a **silent machine-checked addition**. Anything else in the gateway is a weakening. Visibility then has signal, not noise.

### 11. "Speed up search": cache the search need's answer per query in `ViewAnswers` — LEAK (L9)
- **Natural code** (`obsidian/runtime/dispatch/ViewAnswers.ts`): `switch (need.kind) { case "search": if (need.query === last.query) return last.answer; … }`.
- **Trace:** `answers` allows "an exhaustive `switch` on a kind" in `dispatch/`, and `need.query === last.query` compares need arguments, not "an answer's or a control's value". P9 says a need declares the replica parts it reads and that `ViewAnswers` has no code per kind. That is prose: the checker allows per-kind code through the switch.
- **Ships:** a second, per-kind caching policy. The search goes stale when Sync changes a task's title, because the cache key ignores the replica parts.
- **Fix:** in `dispatch/`, no branch on a need's kind at all. A need's identity and the parts it reads are data from `DoorMethods` (`reads: [...]`, typed per method), and one generic cache uses them. A new need is then a `DoorMethods` entry and nothing else.

---

## FRICTION

### 12. "This list is slow": memoise `regionsOf` per column — FRICTION (F1)
- **Natural code:** `const cache = new WeakMap()` at the top of `screen/layout.ts`. CAUGHT by `moduleState`, which is right.
- **Problem:** there is nowhere to go next. P9 says "each region memoised on the slices and parts it reads", but no mechanism is named. Pure code may not hold a cache, `tc-jsx` memoises components only, and the runtime does not know `regionsOf`. A hurried agent turns regions into components (to get `tc-jsx`'s memo) or gives up.
- **Fix:** name one **selector memoiser** in the host. Selectors are declared as data, each with its input slices, and `ScreenHost` memoises them generically by those slices. `regionsOf`'s regions, `needs(model)` and `geometryOf` all go through it.

### 13. Motion: skip a FLIP when the move is under half a pixel (a shimmer fix) — FRICTION (F2)
- **Natural code** (`engines/motion.ts`): `if (Math.abs(dx) < 0.5) return;`. CAUGHT by `execute` (no ordering in engines), which is right in principle.
- **Problem:** the threshold is execution, not a product outcome. The gesture predicates are typed for gesture tokens. "A core rule for sub-pixel tolerance" is absurd, and the agent's remaining option is contorted (`dx === 0`).
- **Fix:** engines get **execution tolerances** the way the gesture machine gets tokens: named constants in the engine's closed spec (`AnimationSpec.minDelta`), compared only through one predicate (`exceeds(Distance, ExecutionToken)`), whose tokens cannot reach a product outcome.

### 14. Full card: a progress bar of done subtasks; a project's own colour on its cards — FRICTION (F3)
- **Natural code:** `width: ${done / total * 100}%`. CAUGHT by `noCompute` and by the kit type view (no `style`), which is right. The core can give the fraction, and the colour is user data.
- **Problem:** there is no named path from a model value to a **per-element CSS value**. The render engine writes "static custom properties (layout at rest)" only from `geometryOf`'s geometry. A fraction or a user's hex is not geometry. Classes are closed literals. Typed CSS `attr()` is not in WebKit, so it does not work on iOS. The agent either pushes the value through `geometryOf` (wrong concern) or adds a `<style>` per value in `chrome` (by memory, unchecked: works, but scatters).
- **Fix:** a closed kit prop for data-driven custom properties (`vars: { fill: Fraction; tint: Hex }`), typed per token name the CSS declares, written by the render engine only on a change. `styles.test` checks the token exists. One path covers progress, project colours, label colours and event colours.

### 15. Accessibility: high-contrast (`forced-colors`); a phone-only shadow — FRICTION (F4)
- **Natural code:** `@media (forced-colors: active) { … }`, or `body.is-mobile .tc-n-card { box-shadow: … }` as `styles.css` does today (`:763`, `:788`).
- **Trace:** decision 34 allows only `prefers-*` in `@media`, and a state may style only its own element. Both are CAUGHT, but neither message has a destination: per-form token values and accessibility media have no named home in revision 14.
- **Fix:** like `body.theme-light`, allow **token-override blocks** right after the token block: `body.tc-form-phone { … }` (the class written by `chrome` only) and `@media (forced-colors: active)`. They redefine existing tokens only and define no new names, checked by `styles.test`.

### 16. Settings: "Reset to defaults" with a confirmation — FRICTION (F5)
- **Natural code:** `new Modal(app)` or `confirm()`. `Modal` is never constructed (C2); `confirm` is denied by `reach`.
- **Problem:** the settings tab has no layer host. Only its three row lists mount a `ScreenHost`, so the "kit layer" answer does not apply there. The remaining route is contorted: a two-tap button whose label the door's `settings.page` flips.
- **Fix:** either the settings chrome row may use Obsidian's `Modal` (Obsidian chrome for an Obsidian-chrome surface, like `Setting`), or `Places.dialog()` mounts a `ScreenHost` on the window's overlay. Pick one and name it.

### 17. Obsidian API change: `MarkdownRenderer.renderMarkdown` → `render`; a pane menu via `onPaneMenu` — FRICTION (F6)
- **Trace:** a row's declarations change, which is always a **weakening** reported to Max "in product words". A rename has no product words, so these reports become noise the lead must invent sentences for. The same holds for every new gateway export (#10).
- **Gap:** the table names no row for the classes the adapters extend (`Plugin`, `ItemView`, `MarkdownRenderChild`, `PluginSettingTab` is named). Under "anything unowned is denied", `leaf.ts` and `main.ts` fail on day one.
- **Fix:** the pin classifies a row change as a weakening only when the row's **reachable set grows** beyond a replacement it records (`replaces: "renderMarkdown"`, checked against `obsidian.d.ts`'s `@deprecated`). Name the adapter base classes in the registration row.

---

## CAUGHT (each with whether the message leads to the right fix)

18. **Timeline "+N more" chip on a narrow phone** (`events.length - 3`): `noCompute`. The message points to a core rule, and `stackTasks` exists. Right fix.
19. **"Fix a flicker": `transition: opacity` on `.tc-n-card`**: the CSS allowlist (time only under `tc-m-…`). The message points to a `MotionCause`. Right.
20. **Card checkbox tick animation through `@keyframes` on `.is-done`**: the CSS allowlist. It would replay on every load of done cards; a `MotionCause` is the right fix.
21. **Full card description flashes empty while `MarkdownRenderer` renders**: a `ready` flag in the editors engine fails `execute` (a mutable non-handle binding). A class written by editors fails the ledger. Right fix: a `descriptionRendered` message and render drawing the state.
22. **Reduced motion through `matchMedia` in the motion engine**: `reach` (no row names it). The right home is a chrome fact feeding an `AnimationSpec` variant, but see L6: the new chrome fact has no reader record unless C4 is by type.
23. **Reveal a new card only if it is off screen through `scrollIntoView`**: `reach`. It leads to the scroll engine's `reveal` spec. If the agent adds `scrollIntoView({ block: "nearest" })` to the row instead, that is a visible weakening. Acceptable.
24. **Relative time "in 5 min" through `date-fns`**: `packages`, and `Date` is banned by `noCompute`. Right: a core rule returns the parts. `Intl.RelativeTimeFormat` over a core number stays legal, which is fine.
25. **Fuzzy search through `fuse.js`, highlights through `title.slice(a, b)`**: `packages` and `noCompute`. Right: a core ranking and `textParts`. But `substring` is not on the list (L1).
26. **Entry hint when a title is over 100 characters**: `noCompute`. Right: the entry answer carries the hint.
27. **`aria-posinset={i + 1}`**: `noCompute`. Right: `role="list"`/`listitem` gives the position natively, or the core gives the ordinal.
28. **Drop text dragged from Obsidian's editor onto Inbox**: `reach` on `dataTransfer.getData` (not in the input row). The row edit is a visible weakening. The drop resolves through `placeAt` and the carry's door call. Right.


## SAFE

29. **Status bar "3 left today"**: `Places.statusBar()`, the count from a core answer, drawn.
30. **Settings label presets: start the reorder with a hold on the phone**: the payload's start variant (`hold`/`press`) in the layout; one carry.
31. **⌘A selects all; Escape clears the search query before closing**: the key table and the layer stack, no arithmetic.
32. **A "Saving…" mark while a write is slow (iCloud, Sync)**: a runtime broadcast and a model flag. `new Notice` in `TasksVault` is CAUGHT by `reach`, so the agent goes through the screen.
33. **The timeline follows the now line each minute unless the user scrolled**: the `minute` broadcast, `within(nowPoint, viewport)`, and an `after()` command to resume.
34. **A haptic when the divider snaps to the middle**: the machine's step-crossed output calls `rules.dividerAt`; `chrome` haptics.
35. **Alt-click a section head folds all sections**: the sections concern, gesture modifiers. Note: N door commands make N undo steps. That is a behaviour defect a core `foldAll` fixes, not a second mechanism.
36. **Task menu: "Copy link to task"**: the core's menu model, `hostServices` clipboard.
37. **Double-tap a column header to scroll to the top**: the machine's second press, a `ScrollSpec`.
38. **A fifth ribbon position (Evening)**: `FUNNEL_PLACES`/`swipeLanding`/`layoutWidths` in the core, the UI draws data, `swipeOnce` guards.


---

## The contortion question

Does "pure UI code does no arithmetic or ordering on numbers; decisions come from the core" force contortions?

- **Not for decisions.** Counts drawn (`xs.length`), toggles (`!flag`), empty checks (`=== 0`), index-free keys and animations (motion specs) all have natural homes. The rule turns every true decision (overflow, limits, thresholds, landings) into a core rule, which is what CLAUDE.md wants.
- **Yes for a band of purely presentational numbers**, five of them:
  - per-element data sizes and colours (F3);
  - an execution tolerance (F2);
  - memoisation (F1);
  - "last item" (`i === xs.length - 1`; CSS `:last-child` is the answer, but nothing points to it);
  - a stagger (`i * 30ms`; the motion spec, unnamed).

  Each has no named home, or a home in the core that is out of proportion. Every core rule also means a `contracts.ts`/gateway change: CLAUDE.md says the whole team, and the pin calls it a weakening (#10).
- **The literal-equality escape invites contortion.** `xs.length === 1 || xs.length === 2` passes where `< 3` does not, and so does the `let prev` loop. A hurried agent will take these, so the rule should be an allowlist (L1/L2) that makes them impossible, not hard.
- **Verdict:** the principle is right and not contorting for features. Name homes for F1–F3 and close L1/L2 by an operation allowlist, so the forced path is the core and never a contortion.

## Buildability (TS 7.0.2 `typescript/unstable/*`, Preact 11.2, Vitest 5, esbuild, Obsidian mobile WebView, CDP)

- **Buildable as stated:**
  - the checker by declaration (`tests/uiRules.ts` already uses `typescript/unstable/ast` and `/sync` with a `Checker`);
  - `tsc -b` composite projects (the spec says checked);
  - `tc-jsx` with `preact/compat` `memo` and one runtime read by esbuild;
  - `noCompute`/`execute`, which are type-directed operator checks;
  - the CSS allowlist (`styles.test` parses the CSS today);
  - the metafile scope;
  - Node 22 `module.register` loader hooks;
  - a Vite plugin `transform` hook for the closure;
  - jscpd.
- **Needs a check before relying on it:**
  1. L6's fix needs type alias symbols (`type.aliasSymbol`) through `typescript/unstable/sync`. By memory, unchecked whether the unstable API exposes them.
  2. `requestIdleCallback` (the time engine's `idle`, P9's neighbours at idle) is, by memory, unchecked, absent or behind a flag in iOS WebKit. On Obsidian mobile `idle` needs a fallback (`after(0)` or the frame clock), or the neighbour budget is never met on the phone.
  3. Popouts. `Target.setAutoAttach({ waitForDebuggerOnStart, flatten })` on a **page** session attaches iframes and workers. A new Electron window is a separate page target, so it must be set on the **browser** session (the `/json/version` socket), as Puppeteer does. By memory, unchecked. Name the session in §Tests.
  4. Stryker's `@stryker-mutator/vitest-runner` 10.1.1 against Vitest 5.0.5: the spec says it was not run. Vitest 5 changed its pool and runner internals. Run once in 3b before making the mutation floor a gate.
  5. Data-driven CSS values (F3): typed `attr()` is not in WebKit, so it is not available on iOS; custom properties written by the render engine are the only portable path.
  6. The engine table names no row for `Plugin`, `ItemView` or `MarkdownRenderChild` (F6). Under deny-by-default the adapters and `main.ts` fail the first build.
