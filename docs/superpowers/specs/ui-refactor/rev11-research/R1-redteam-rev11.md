# Red team of spec revision 11 (`docs/superpowers/specs/2026-11-15-ui-refactor.md`)

Assumption throughout: the stages are built exactly as written, and G1–G9 with every test the spec names (`onePlace`, `ownership`, `hosts`, `kit`, `styles`, `geometry`, `pureRules`, the matrix, the trap, `guards`, Stryker, jscpd, `uiFreeze`, `oneSwitch`) exist and are green. Each attack below is a change that keeps them green. Where the spec text is ambiguous, I take the reading a deadline-pressed agent would take, and say so.

Read against the code too: `tests/uiRules.ts` today (`DRIVER_COMMON`, `DRIVER_ALLOW`, `importable`) shows what "what every effect owner may" means in practice. The spec keeps that allowance.

Severity: **S1** breaks the guarantee for a whole class of concerns, or for a behaviour Max asked for twice. **S2** gives a second implementation of one concern. **S3** is narrow, or caught only by luck.

---

## Ranked holes

### S1-1. The private-part folder brings H3 back: `drivers/motion/ribbonFlip.ts` is legal again
**Code.** G3: "An owner is one public file. It may keep private parts in a folder of the same name beside it… importable only by that file."
```ts
// obsidian/ui/next/drivers/motion/ribbonFlip.ts   (private part of drivers/motion.ts)
export function ribbonFlip(from: Px, to: Px): Keyframe[] { /* own FLIP, own easing curve, own settle rule */ }
// drivers/motion.ts
case "slide": return run(el, ribbonFlip(c.from, c.to));      // rows use rowsFlip(), the ribbon uses ribbonFlip()
```
The same works as `update/carry/sectionCarry.ts` + `update/carry/cardCarry.ts`, with `carry.ts` switching on `payload.kind`: two carry statecharts in one owner. That is D-9 and the four old drag loops, now inside the owner.
**Why nothing fails.** `ownership` sees one public file and a private folder imported only by it. The unknown-file rule is satisfied by definition. jscpd needs a copy, and a rewrite is not a copy. The matrix compares outcomes. The trap: if API rights extend to private parts, `animate` is legal there; if not, the private part returns keyframes and `motion.ts` calls `animate`. Report B's own H3 is exactly `drivers/motion/ribbonFlip.ts`, and the spec's §What each earlier failure meets says it is killed by "an owner is one file". It is not.
**Principle fix.** Uniqueness has to be per *algorithm*, not per *file*. Each concern's engine is one function with one call site per effect API:
- `animate`, `requestAnimationFrame`, `scrollTo` and the rest are each called from exactly one function in the whole tree (count call sites in `ownership`).
- Per-case code may only produce declarative data (`AnimationSpec`: keyframe kind, duration token, easing token) for that one engine.
- No private folders for effect owners at all.
- For pure owners, the statechart is one transition table (one `switch` over state × message). Payload-specific behaviour must be data in the payload union, never a second reducer.

### S1-2. The `Px` rule leaves at least four places to compute geometry, and unbranded numbers escape it entirely. `swipeLanding` (a Max-twice rule) can be redone
**Code A: the allowed arithmetic in `drivers/motion.ts`.**
```ts
case "slide": { const page = Math.round(unPx(c.offset) / unPx(c.pageWidth)); /* lands where *I* think */ }
```
`drivers/motion.ts` is explicitly allowed `Px` arithmetic "to apply them". `pureRules` only fails a rule that is *referenced* by the wrong owner. A rewrite references nothing.
**Code B: the brand is opt-in.**
```ts
// model/Msg.ts, gesture union
{ kind: "pointerMoved"; x: number; y: number; t: number }
// update/gesture.ts
if (Math.abs(m.x - s.x0) > 8) …; const v = (m.x - s.lastX) / (m.t - s.lastT); if (v > 0.5) /* flick */
```
`geometry.test` polices values typed `Px`. A field declared `number` is not `Px`, so all arithmetic is free. "The pointer's coordinates arrive as it" names no check.
**Why nothing fails.** `geometry` (scope is the `Px` type only), `pureRules` (references only). The e2e recorder's "two places away" check catches a wrong landing only on the paths and speeds it happens to run.
**Principle fix.** Make every quantity carry a unit and make provenance, not declarations, decide:
- `Msg`, `Model`, `Command` and every export type of `measure`/`input` may hold no bare `number`. Every number is a branded unit (`Px`, `Minutes`, `Ms`, `Count`, `Ratio`).
- Host geometry members (`clientX`, `deltaY`, `timeStamp`, rect fields) may flow only into a constructor of `Px`/`Ms` in `px.ts`.
- Arithmetic on a unit lives only in that unit's owner. Drivers get none at all: `motion` receives finished from/to `Px` pairs and FLIP deltas from `carryGeometry`/`layout` and formats them with a `px.ts` helper.

### S1-3. The gate-only rule is not enforceable by code shape, and the spec's own decisions need "which of two"
**Code A: `??` turns a gate into a branch.**
```ts
return [gated(layout.gates.filterClears, clearFilterCmd) ?? openFullCmd];
```
`gated(...)` is one of the two recognised forms. `?? y` sits outside it.
**Code B: complementary gates.** `layoutOf` sets `gates.dayMoves = days === "any"` and `gates.dayStays = days === "today"`. Then:
```ts
gated(layout.gates.dayMoves, goToDay); gated(layout.gates.dayStays, openFull)
```
Each read is a legal gate.
**Code C: observing the early return.** `const r = revealDay(m); if (r === m) return openFull(m)`. `revealDay` starts with the legal early return.
**Why nothing fails.** `onePlace` matches syntax. G5's `notOffered` only checks `layoutOf`'s value. The cross-place log comparison could catch it, but see below.
**Contradiction.** Decision 53 and old bugs 1–3 require which-of-two by place. Where the filter is chosen the search clears it; where it is fixed it opens the full card. Where days move it goes to the day; where the day is today's it opens the full card. These cannot be written as "only whether". G5's "the same scenario across places, logs of the same shape" then fails *by design* for search, context, scroll (the note's outer scroller) and entry (bar vs capsule). Any builder must add an exemption, and every future place branch will hide in that exemption.
**Principle fix.**
- Owners must not be able to *observe* a gate. `Layout.gates` becomes opaque `Capability` tokens. The only operations are `offer(cap, thing): Offered<T>`, which only the router or `ScreenHost` unwraps, and `when(cap, handler)`, evaluated by the router. With no boolean in hand there is nothing to branch on.
- Where the product needs which-of-two (decision 53), say so honestly: the alternative is chosen in `layout.ts` as data, e.g. `Layout.reveal: "clearFilter" | "openFull"`, a closed variant consumed by exactly one owner.
- The G5 comparator removes exactly the commands and causes that `layoutOf`'s variants and gates predict for that cell, computed from the registry, and nothing else.

### S1-4. Place and form proxies other than `Place`: the ban is on names, not on information
Each line below branches on place or form without touching a member of `Place` or a banned identifier:
```ts
if (model.views.root.filter.clearable === false) …        // core answer: true only on the main screen
if (layout.modeWrite === "tasks.setNoteViewMode") …       // a string literal, not an identifier
if (layout.regions[0].kind === "stack") …                 // a region kind ("stack" = the note's inline frame)
if (m.pointer === "touch") …                              // pointer kind ≈ form; the spec lets it travel with each event
if (model.chrome.keyboard !== null) …                     // chrome slice ≈ phone
const { frame } = model.place;  Object.values(model.place); JSON.stringify(model.place).includes("inline")
```
In drivers (`DRIVER_COMMON` allows `closest` with literal attribute selectors):
```ts
if (root.closest('[data-type="markdown"]')) { /* walk parentElement to the note's scroller */ }
```
**Why nothing fails.** `onePlace` bans identifiers (`leaf`, `block`, `noteView`, `phone`, `wide`…) and reads of `Place`'s members. None of the lines above names one. `namesAClass` permits attribute selectors that are not `class`.
**Principle fix.** Make what may not be read *unreadable by type*, and give each correlated input one reader:
- `Model.place` is an opaque token. Only `layout.ts` can open it, through a module-private map in `place.ts`.
- The `chrome` slice, the pointer kind and every per-place fact of the core's answers (`clearable`, `panel`, `topRow`, `plus`, `ViewChoice.*`) are typed so that only `layout.ts` (and the recognizer, for the pointer kind) receives them. Owners get `Omit<Answer, PlaceFacts>`.
- `regions`, `targets`, `scrollers`, `variants` and `keys` each have one named consumer, enforced by opaque types: regions go to `Screen` and `carryGeometry`, scrollers to scroll, variants to the kit.
- Drivers may traverse only inside the screen's own root. Only `mount` sees Obsidian's DOM.

### S1-5. Libraries admitted to an owner carry whole concerns with them (CodeMirror, Obsidian `Menu`/`Modal`), and the trap ignores what they do
**Code.** All of this is legal in `drivers/editors.ts` (row 10 allows `EditorView`, `EditorState`):
```ts
keymap.of([{ key: "Enter", run: commit }, { key: "Escape", run: close }])      // a second key table
view.focus(); view.dispatch({ effects: EditorView.scrollIntoView(pos) })       // second focus and scroll owners
EditorView.updateListener.of(u => u.geometryChanged && …)                       // CM's own measure loop
```
In `drivers/overlay.ts`: `new Modal(app).open()`. Obsidian's `Modal` and `Menu` push their own `Scope` (Escape, arrows) and keep their own stack. That is a second layer stack and a second Escape order, against "the one layer stack".
**Why nothing fails.** The static guard checks the reach (`EditorView` is on row 10). The trap attributes a call to "the nearest stack frame from `obsidian/`": CM's internal `focus()` and `scrollIntoView` have `editors.ts` as nearest frame, and CM's asynchronous measure loop has *no* frame of ours, so it is "Obsidian's and ignored".
**Unbuildable as written.** Creating an `EditorView` makes CM register key, pointer and focus listeners with `editors.ts` as the nearest frame. Mounting `MarkdownRenderer` adds click listeners the same way. The trap therefore fails the legitimate owner, and the only way out is an exemption that frees exactly these paths.
**Principle fix.**
- Classify every library API by *every* concern it touches.
- A library that owns a second concern is admitted only configured so that concern delegates to its owner: CM with no default keymap and a `scrollHandler`/focus facet that emits intents. `Menu` and `Modal` are dropped, since the spec already says the plugin's menus and sheets are kit layers.
- The trap attributes a library's calls to the owner that admitted the library, and judges library-async effects by the element they act on, never "ignored" when that element is inside the screen's root.

### S1-6. The guards of the guards are a promise
**Code.**
- `/* jscpd:ignore-start */ … /* jscpd:ignore-end */` around a copied block. This is a source comment; no config changes.
- `// @ts-expect-error` above a kit node without `motion`. This silences the "absence is a compile error" construction, and the same for `Disjoint<…>` and the total `ROUTES`.
- `// Stryker disable next-line all: equivalent` marks, together with an edit of the pinned count.
- `owners.ts` and its hash in `ownership.test.ts` changed in one commit.
- `.jscpd.json` `"ignore"`, `vitest.config` `exclude`, `tsconfig` `exclude`, `it.skip`, `toMatchSnapshot` refreshed with `-u`.

**Why nothing fails.** Every protection (the hash, the mark count, the "names Max" comment) lives in files the same agent writes. Its force is CLAUDE.md, i.e. a reviewer and a promise, which G-intro says nothing rests on.
**Principle fix.**
- Move the protection out of the agent's write path.
  - A PreToolUse hook (like `~/.claude/hooks/guard-ios-sim.sh`) refuses Edit/Write/Bash writes to a protected list: `tests/uiRules.ts`, `tests/guards/**`, every guard test, `tests/matrix/**`, `obsidian/e2e/trap.ts`, `stryker.config.mjs`, `.jscpd.json`, `tsconfig*.json`, `vitest*.config*`, `esbuild.config.mjs` and `package.json` scripts.
  - `scripts/release.mjs` and the merge in the main clone verify those files' hashes against a manifest that only Max's commit may change.
- Inside the tree: `uiRules` bans `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, `jscpd:ignore`, `eslint-disable`, `Stryker disable` (outside a counted file), `.skip`/`.only`/`.todo`, and `as` casts in `obsidian/`.

### S2-1. Drivers can hold state and recognise gestures (U20 moved from the host to a driver)
**Code.**
```ts
// drivers/input.ts
private x0 = 0; private t0 = 0;
onMove(e: PointerEvent) { if (e.timeStamp - this.t0 > 450 && Math.hypot(e.clientX - this.x0, …) < 6) this.send({ kind: "held" }); }
```
This is a second long-press recognizer with no timer, so `Timers` is not involved. Raw numbers, so `geometry` does not apply.
`drivers/scroll.ts`: `el.scrollTo({ left, behavior: "smooth" })` is the "native smooth path beside the glide" (report A), and it is inside scroll's own API.
**Why nothing fails.** G2's "readonly fields, no module-level `let`" applies to `ScreenHost` only. The input row allows `preventDefault` and pointer members wholesale.
**Principle fix.**
- Every effect owner is a stateless translator: readonly fields of handle types only, and no arithmetic or comparison on event data (each event becomes exactly one message carrying branded raw data).
- Owner API rows constrain *arguments* as well as names: `behavior: "instant"` only, `{ passive }` fixed.

### S2-2. Every effect owner may add "its own listeners" of any event type
**Code.** `drivers/scroll.ts`: `root.addEventListener("pointermove", edgeScroll)`, an edge-scroll recognizer outside `input`. `drivers/motion.ts`: `addEventListener("transitionend", …)` as a settle path beside `motionSettled`.
**Why nothing fails.** The spec keeps "what every effect owner may (… its own listeners)". Today's code confirms it: `DRIVER_COMMON` includes `workOf("a listener")` and `workOf("a timer")`. The input row's "pointer listeners" is not exclusive by event type.
**Principle fix.** Listeners are owned by event type across `obsidian/`: `pointer*`/`touch*`/`wheel`/`click` go to input, `key*` to keys, `scroll` to scroll, `focus*` to focus, `animation*`/`transition*` to motion. Drop the generic listener and timer allowance from `DRIVER_COMMON`; timers belong to `Timers.ts` alone, as row 19 already says.

### S2-3. Kit and view: hooks, module state, logic in templates, native behaviours
**Code.**
```tsx
// view/kit/Menu.tsx
const [page, setPage] = useState(0);                                    // a second layer stack's state
const cache = new Map<string, number>();                                // module-level memory outside Model
// view/kit/List.tsx
const cols = rows.length > 6 ? stacked(rows) : side(rows);              // layout from counts, not Px
<input autofocus /> <div popover="auto"> <details> <dialog> <form onSubmit…> <svg><animate attributeName="opacity"/></svg>
<div draggable="true">                                                  // native HTML5 drag: a fifth drag loop
```
**Why nothing fails.**
- `kit.test` checks closed *props*, required intents and where intrinsic JSX is written, not which hooks, attributes or elements the kit writes.
- `preact/hooks` is importable by views (`importable` allows `preact/*`).
- `autofocus`, `popover`, `<dialog>`, `<details>` and `<form>` each give a native focus, layer, Escape or Enter path with no API call, so neither the static guard nor the trap sees them.
- SVG SMIL `<animate>` is motion with no CSS and no `animate()`.
- The arithmetic is on `number`, not `Px`.

**Principle fix.**
- A view only draws given data:
  - no `preact/hooks`, no class components and no `options`;
  - no module-level mutable bindings (this applies to `update/`, `model/` and `screen/` too: deep-readonly `Model`, no `let`/`Map`/`Set` at module scope);
  - in `view/`, no arithmetic, comparison or array transform beyond `.map` over given data.
- An allowlist of intrinsic elements and attributes per kit component. Deny `autofocus`, `popover`, `draggable`, `contenteditable`, `tabindex` (except from `FocusKey`), `<form>`, `<dialog>`, `<details>`, and SVG animation elements.
- Kit class literals only `tc-n-…`/`is-…`.

### S2-4. CSS: motion, scrolling and place branches the motion rule does not name
**Code** (all below `/* next */`):
```css
.task-calendar .tc-n-ribbon { scroll-snap-type: x mandatory; }   /* a second swipeLanding: one swipe can land two away */
.task-calendar .tc-n-ribbon > * { scroll-snap-stop: normal; }
.task-calendar .tc-n-list { overflow-anchor: auto; }             /* browser scroll anchoring beside "hold while rows fold" */
.task-calendar .tc-m-fade.is-open { transition: opacity var(--tc-motion-fast); }  /* motion adds tc-m-fade once; the view toggles is-open */
.task-calendar .tc-m-x:hover { transform: … }  @starting-style { … }  animation-timeline: scroll();  view-transition-name: …
body.is-mobile .task-calendar .tc-n-card { … }                   /* form branch in CSS */
.markdown-source-view .task-calendar .tc-n-foot { … }            /* place branch by ancestor */
@media (pointer: coarse) { … }   .task-calendar .tc-n-frame--inline .tc-n-card { … }
```
**Why nothing fails.**
- The motion rule lists `transition`, `animation`, `@keyframes`, `scroll-behavior` and `will-change`. Scroll snapping, `overflow-anchor`, `@starting-style`, `view-transition-*` and the scroll-driven `animation-timeline`/`scroll-timeline` longhands are not named; whether longhands count is not said.
- A `tc-m-…` selector may combine with an `is-…` state the view toggles, so the motion owner tags the element once and the view drives the transition.
- "Under `.task-calendar`" says nothing about ancestors before it.
- Obsidian's body classes (`is-mobile`, `is-phone`) and media queries are not place reads in `onePlace` (TS only).
- A variant class with a descendant combinator styles a whole subtree per place.

**Principle fix.** The CSS rule becomes an allowlist instead of a blocklist:
- Motion properties: any property whose computed effect is time- or scroll-driven.
- Selectors: `.task-calendar` is the leftmost compound. No body or host-class ancestors except the theme. No `@media`/`@container` except the token block.
- A `tc-m-…` rule may not combine with a state or user-action pseudo-class.
- A variant class styles only its own element, never descendants: a variant that changes children is a different kit component.
- `overflow-anchor: none` and `scroll-snap-type: none` are stated on the screen root as tokens the test requires.

### S2-5. Effect owners can reach another concern's API through a structural type of their own
**Code.**
```ts
// drivers/scroll.ts
const flyer: { animate(k: Keyframe[], o: KeyframeAnimationOptions): unknown } = row;  // row: HTMLElement
flyer.animate(…);
```
The reach resolves to scroll.ts's own type literal, not to `lib.dom`, so the static guard sees no host API. The same trick works with a structural parameter in a helper anywhere in `core/`, since `core/phone` is not scanned by `uiRules`.
**Why nothing fails.** Decision 33's flow rule bans a host value flowing into a type literal of its own *outside* effect owners; inside them only `any`/`unknown`/`{}` are banned. The trap catches it only if a matrix scenario runs that path.
**Principle fix.** A host value may flow only into host-declared types, everywhere, effect owners included. Every member access on a value whose *runtime origin* is host (by flow) is resolved against the host declaration.

### S2-6. Files and code the guard does not scan, or that the trap treats as "a library"
**Code.**
- `obsidian/ui/next-helpers/fly.js` (plain `.js`, bundled by esbuild, not type-checked), or `src/dom.ts` / `core/phone/flip.ts` outside `obsidian/`.
- `declare global { function flyNode(el: unknown, k: unknown): void }` in our own `.d.ts`, with the global defined in an unscanned `.js` file. Callers resolve `flyNode` to *our* declaration, so it is not host.

**Why nothing fails.** `uiRules` covers `obsidian/` TS. "`next/` holds only `.ts`/`.tsx`" covers `next/` only. The trap takes "the nearest stack frame from the plugin's own source (`obsidian/`)" and skips other frames like a library's, so the `.js` file outside `obsidian/` holds the frame and the call is ignored.
**Principle fix.**
- Scope by the bundle, not by folder: every input in esbuild's metafile is a scanned `.ts`/`.tsx`, a pinned package from the lockfile, or `core/` (its own architecture rules).
- No ambient declarations (`declare global`/`module`/`const`) outside a pinned file.
- The trap treats every non-`node_modules` frame as ours and attributes `node_modules` frames to the importing owner.

### S2-7. The trap misses whole paths
- **Popout windows.** Each window has its own realm (`Element.prototype`, `requestAnimationFrame`). The trap wraps the main window's. A screen in a popout, which `chrome` owns, is untrapped.
- **Effects with no call.** These include CSS transitions, SMIL, `autofocus`, `<label for>` focus transfer, focus-caused scrolling (`focus()` without `preventScroll`), native scroll anchoring and `<form>` submit on Enter.
- **Paths the matrix never runs.** Examples: `fileGone`, `staleTask`, replay remaps, rare drop targets. "It catches … on the paths the matrix runs."
- **Unknown or async frames.** Async library callbacks with no frame of ours are "ignored", and a missing source map is undefined.

**Principle fix.** Trap *effects*, not only calls, and require coverage:
- Install the trap on every realm at `window-open` before mounting there.
- Keep an effect ledger per frame (scroll offsets changed, `activeElement` changed, entries of `document.getAnimations()` and `getComputedStyle` transitions), each matched to a command its owner executed in that loop.
- The e2e run demands 100 % branch coverage of `obsidian/ui/next` and the runtime over the matrix (istanbul in the e2e build). A frame that cannot be mapped fails the step.

### S2-8. The matrix can be satisfied trivially
**Code.**
```ts
carry: { main: { phone: [scenario("lift card", [lift, drop])], … }, note: { phone: notOffered("deviceCarry"), … } }
```
- One card scenario covers the carry concern. Section, plus, tree, settings-row and timeline payloads can each have their own implementation in the private folder.
- `notOffered(gate)` checks only that `layoutOf` turns the gate off, not that the behaviour is actually absent. A carry path that never reads the gate still runs in the note.
- Concerns without an effect owner (layout, carry, carry geometry, search, sections, selection, full card, context) leave nothing for the trap's "the owner was the caller" check.
- "Same shape across places" is vacuous when both logs are empty, and "the same keys" cannot hold literally (a note shows other tasks), so keys will be normalised away.

**Principle fix.**
- Key the registry by the concern's closed unions (`Record<Carry["payload"]["kind"] × Target["kind"], …>`, every `MotionCause["kind"]`, every `Msg["kind"]` of the owner), so a new payload, cause or message adds required cells by type.
- Each cell must exhibit the concern's signature: every exported intent or message of the owner at least once across the cell's scenarios.
- `notOffered` cells run the same scenarios and assert the concern's commands and causes are *absent*.
- The cross-place comparison uses key roles (lifted, landed-on, neighbour), not raw keys, and fails on an empty log.

### S2-9. The motion-cause union: a new case handled by a second engine
**Code.**
```ts
// update/motion.ts
| { kind: "ribbonGlide"; velocity: number }
// drivers/motion.ts
case "ribbonGlide": { let x = …; const step = () => { x += v *= 0.95; el.style.transform = `translateX(${x}px)`;
  if (Math.abs(v) > .1) requestAnimationFrame(step); else this.settled(c.id) }; requestAnimationFrame(step); }
```
A hand-rolled physics loop beside WAAPI, with its own settle rule. The same can be done without a cause: a `setVariables(layout)` path that tweens `--tc-col-w` over frames.
Cause constructors also take free payloads. `update/carry.ts` computes the float's path and hands it to `motion.flight({ path })`, so the algorithm lives in carry and only its packaging is in motion.
**Why nothing fails.** "Only `drivers/motion.ts` turns one into an animation, by an exhaustive switch." Exhaustiveness proves each case is handled, not that the cases share an engine. rAF and style writes are legal there.
**Principle fix.**
- Same as S1-1: one engine function, one call site of `animate`, one of `requestAnimationFrame` (the transient channel's applier), and a style-variable writer with no time dimension.
- Every cause maps to a declarative `AnimationSpec` of tokens.
- Cause constructors take only keys, ids and transition numbers (no `Px`, no `number`): geometry comes from `layout`/`carryGeometry` via the measured slice.

### S2-10. `model/` and the router are logic zones with no owner
**Code.** `model/carryHelpers.ts` or the kept `model/section.ts` beside `update/section.ts` holds a second rule set as "selectors". `update/update.ts`, "the router", gets an `if` before routing. `view/Screen.tsx`, "the one root", decides which regions to draw.
**Why nothing fails.** The table names `model/`'s files generically ("selectors that read the model"). The kept-as-is list keeps ten `model/` files that no owner row names. Nothing limits the router's or `Screen`'s body.
**Principle fix.**
- `model/` holds types only. Every selector belongs to one concern's owner file.
- `update.ts` is generated or checked to be exactly `ROUTES[msg.kind](model, msg)`. `Screen.tsx` maps `Layout.regions` to kit components, with no conditionals.
- The unknown-file rule lists files, never folders or globs.

### S2-11. Adapters can drive behaviour through `ScreenHost`'s surface
**Code.**
```ts
// host/adapters/note.ts
this.registerEvent(app.workspace.on("active-leaf-change", () => host.dispatch({ kind: "dayPicked", day: today })));
```
The note keeps today by force. No import of `Msg` is needed, because the literal type-checks structurally against `dispatch(msg: Msg)`.
**Why nothing fails.** `hosts.test` limits an adapter's imports, size and fields, not what it sends through `ScreenHost`.
**Principle fix.** `ScreenHost`'s public surface is frozen to lifecycle intents: `mount(target, seed)`, `renamed(path)`, `shown()`, `hidden()`, `dispose()`. There is no `dispatch` and no `Msg` in an adapter's reach.

### S2-12. Dynamic message kinds, `any` and casts in the pure parts
**Code.**
- `type CarryMsg = { kind: \`carry/${string}\`; … }` makes `ROUTES` an index signature, `Disjoint` meaningless and any kind routable.
- `Model` gains `scratch: Record<string, unknown>`, a bag where note-only state lives.
- `(model as Mutable<Model>).search.query = ""` writes another owner's slice from the carry handler.

**Why nothing fails.** `uiRules` bans host values in `any`/`unknown`. Pure-to-pure `any`, index signatures and casts are not covered. "Returns only its own slice" is a return-type statement, not a mutation ban.
**Principle fix.**
- `Msg` discriminants are string-literal types only.
- `Model`, `Msg` and `Command` are closed: no index signatures, `unknown`, `any` or open generics.
- `Model` is `DeepReadonly`. No `as` in `obsidian/` except `as const`.

### S3-1. The old UI kept alive through master
**Code.** Commit a "fix" to an old file on master, where agents push directly. Merge it into the branch. Add a `uiFreeze.ported.ts` entry naming "the new UI's test that covers the same fix", where the name is any string.
**Why nothing fails.** The content freeze accepts master's version. The ported entry is not checked to name an existing test that fails without the new UI's fix.
**Principle fix.** A ported entry is executable: the named test must exist, be in the matrix, and fail when the new UI's corresponding commit is reverted (checked like a G7 bypass fixture).
(Note: `uiRules.importRules` today already refuses `next/` importing the old screen. Keep that across the widened scope; the runtime's import of `obsidian/ui/failureText.ts`, decision 9, must move out of the old UI's path before stage 7.)

### S3-2. jscpd catches only verbatim copies
A renamed or reordered copy passes, since jscpd matches token streams. It also yields to `jscpd:ignore` (S1-6). It is not a uniqueness guarantee and should not be listed as one in §Guarantee; the real guard is S1-1's one-engine rule.

---

## Unbuildable or self-contradictory

1. **The gate-only rule against decisions 53 and old bugs 1–3, and G5's cross-place equality.** "Which of two" is the product (S1-3). As written, the matrix cannot be green without an exemption.
2. **The trap against CodeMirror, `MarkdownRenderer`, `Menu` and `Modal`.** Creating them registers listeners, focus and scroll under `editors.ts`/`overlay.ts` frames, so the trap fails the legitimate owners (S1-5).
3. **The `Px` rule against the recognizer, edge scroll, pinch and the transient channel.**
   - `update/gesture.ts` must compare movement to a slop and compute speed for `SWIPE_FLICK_SPEED`.
   - `update/scroll.ts` must compute edge-scroll speed from distance to an edge, and the hold while rows fold.
   - `update/context.ts` must form the pinch ratio for `zoomAfterPinch`.
   - The transient channel's values need the same.

   None of these files is a `Px` owner. The builder must either pile all of it into `layout.ts`/`carryGeometry.ts` (wrong owners, god modules) or unbrand to `number`, which is S1-2. **Fix:** a closed set of unit operations in `px.ts` (`delta`, `exceeds`, `speed`, `ratio`) usable by update owners. Raw operators stay banned, and *decisions* that compare against core constants go through the core's rules.
4. **The banned identifiers hit legitimate host and core names.**
   - `measure.ts` reads `ResizeObserverSize.blockSize` ("block").
   - CodeMirror has `lineBlockAt`/`BlockInfo` ("block").
   - The core's types and methods include `NoteView`, `projectNoteView`, `setNoteViewMode` ("noteView").
   - `Layout.door.wide` must be read by whoever hands it to the core: `ScreenHost` or the runtime, which are not exempt ("wide").

   **Fix:** ban by *declaration*, meaning identifiers our code declares, never references to host or core declarations. Better still, replace the identifier ban with S1-4's opaque types.
5. **A frozen, hash-pinned table that must name every file and every `PURE_RULES` assignment.** Stage 3 writes the full assignment after Max approved "the table as written". Every kit sub-component in stage 4 (event block, now line, month grid, divider handle) is a new file to approve. The result is either Max approving technical file names (against "ask Max only product questions") or giant files, while the private-folder exception (S1-1) makes the freeze toothless anyway. **Fix:** freeze the *concerns, effect APIs and rule assignments* (what Max approves), and generate the file list from them. Files are listed exactly, never as folders, and changed by the lead.
6. **Mutation at 100 % over `uiRules.ts` (about 1,100 lines on TypeScript 7's unstable Go API) and the trap.** It is buildable but expensive, and the escape hatch (marks plus a count in an editable test) is S1-6. Not a hole in itself.

## Contorted code the spec would force

- **Arithmetic bans** (above, item 3) push slop and speed checks into geometry owners or into unbranded numbers.
- **Every inline style through `motion`, including static column widths at rest** (decision 46). Layout and region sizing at rest become the motion owner's business, which is why `motion` was given `Px` arithmetic. That is the opening for S1-2/A. **Fix:** a separate stateless "apply layout variables" effect owner with no time dimension. Motion keeps only time.
- **"A slice has one writer"** turns every cross-concern consequence into follow-up message ping-pong: a drop ends the selection, a lift closes a menu, a lift blurs the entry, edge scroll starts. That is acceptable, but `endsSelection` is assigned to carry while the selection belongs to `select`, so either carry reads a rule about a slice it cannot write or the rule moves. State it.
- **Adapters of 120 lines with imports limited to `ScreenHost`, `place` and `obsidian`.** `note.ts` must still pick among three mount targets (leaf content, after `.cm-contentContainer`, first in `.mod-footer`) and handle mode switches and several blocks per note. The pick becomes place logic in `drivers/mount.ts`, whose names (`noteFooter`…) the identifier ban then forbids.
