# R5: independent architect review of the UI refactor spec, revision 12

Read: spec rev 12 (whole), CLAUDE.md, docs/plugin/screen.md, docs/door.md (rules sections), obsidian/runtime/dispatch/*, obsidian/ui/next/{host/block/BlockHost.tsx, recognizers/press.ts, model/carryPlace.ts, drivers/input.ts, drivers/measure.ts, drivers/motion.ts, model/answers.ts}, tsconfig*.json, esbuild.config.mjs, the old obsidian/ui listing, apple/ gesture code. rev11-research not read.
One probe was compiled with the repository's TypeScript 7.0.2 (`tsc --strict --lib es2024 --types ""`): see F1.

Overall verdict: P1–P9 (the model, the loop, the replica, the pending log, pins, P9) are sound and buildable. C1–C5 has the right goal (make the UI unable to express a second mechanism), but four of its construction devices are either **false as stated** (units) or **contorted for a small gain** (stateless engines with a message per pointermove, per-engine projects, slop in the core, opaque core-answer fields). Each can be replaced by one checker rule that keeps the guarantee and reads cleanly.

---

## CRITICAL

### F1. C3's units do not refuse what the spec says they refuse (verified)
Spec C3 (line 259): "TypeScript refuses `+`, `-`, `<` and `Math.*` on an object type, so a unit cannot be computed with or compared at all."
Probe with `type Px = { readonly [px]: true }` under TS 7.0.2:
- `a + b`, `a - b`: **refused** (TS2365/TS2362).
- `a < b`, `a > b`, `a <= b`: **compile**.
- `+a`, `Number(a)`, `String(a)`, `` `${a}` ``, `[a,b].sort()`, `a === b`: **compile**.
- `Math.max(Number(a), 2)`: compiles.
So a second hit test (`y >= box.top && y < box.bottom`, exactly `carryPlace.ts:57`) compiles in pure code with units, and `Number(px)` unwraps any unit in one call. Closing that needs a list of banned operators and functions again — the thing rev 12 said it no longer does.
Also C1 "no bare `number` in `Model`" collides with what the model must hold: core answers (`TaskItem.durationMin: number | null`, line numbers, minutes) and `DoorAnswer.result: unknown` (`core/application/PhoneCalls.ts:141-144`, `obsidian/ui/next/model/answers.ts:6`). Wrapping every core type in units would mean writing the contract a second time in units, inside the UI.
**Principle-level fix:** use **branded numbers** (`number & { readonly [px]: true }`), so the code stays ordinary arithmetic inside `units.ts` and the gateway. Add **one** checker rule in `uiRules`: *no operator, comparison, `Number`/`Math`/template conversion takes an operand whose type carries a unit brand, except in `units.ts` and the gateway*. That is one rule, stated over types (not a name list), and the TS 7 checker that `tests/guards/TsProgram.ts` already uses (`getTypeAtLocation`) can enforce it. Apply "closed / no bare number" to the **UI's own** types only. Core contract types are closed by declaration, and the answers are typed per need from the door's typed coverage map (`PhoneCalls.ts:1077`) instead of `unknown`.

## HIGH

### F2. Stateless engines + one message per event + rules in the core ⇒ the full loop runs 2–3× per frame during a carry
C2 (line 250): an engine keeps no gesture state and compares nothing, and each event becomes one message. P5 (line 181): the input engine passes live values to motion through a transient channel. These two conflict: a channel that bypasses the model is state and logic in engines. Taking C2 literally, a carry at 120 Hz sends through `Store.pass` each pointermove, each edge-scroll frame tick (time engine → message → core edge speed → scroll command) and each scroll event of the moved list (measure → `measured`). Each pass does:
- `needs()` again, plus `JSON.stringify` of every need's arguments (`ViewAnswers.ts:25`);
- `sameViews`;
- `layoutOf(place, root, chrome, measured)`, which is new whenever `measured` changes, so `regions` are rebuilt and the root re-renders;
- then measure, motion, scroll and focus.
Today's code deliberately avoids this: `BlockHost.feed`/`over` (`BlockHost.tsx:269-345`) runs the pure recognizer in place and dispatches only `lift`, a target change and `drop`, and the float follows the finger outside the model (`motion.floatAt`).
**Fix (cleaner rule, same guarantee):** *An engine may hold one value of a type that a pure machine defines, and may advance it only by that machine.* The machine is imported from the pure project and unit-tested (`press.ts` already is one). The engine dispatches only the machine's **semantic outputs**, and continuous values (finger position, glide offset) go through the transient channel. Uniqueness stays, because the machine is one pure function, and the model's update rate becomes the gesture rate, not the pointer rate. Add a budget check: messages per carried pointermove ≤ 1, and passes that re-render the root during a carry = 0.

### F3. Press slop, hold and edge speed are not product rules. Moving them into the core is UI noise
C3 (line 257) and stage 3 put "the press slop and hold, and the edge-scroll speed" into the core. The iPhone app does not and cannot share them: it uses UIKit's own recognizers (`apple/App/Board/FunnelViews.swift:113` `DragGesture(minimumDistance: 2)`, `ProjectsPage.swift:404` `UILongPressGestureRecognizer`). CLAUDE.md's test is "if the Swift version would have to write this line": Swift will not write it, the OS does. The real drop rules are already shared (`rules.placeAt`, which Swift calls in `BoardSnapshot.swift:673`). Finding the list under a point (`carryPlace.ts:57`) is geometry plumbing, not a decision.
**Fix:** the core holds the rules that decide **what** (place, drop, landing, widths, snap and flick thresholds that change where things land). Ergonomics of a pointer (slop, hold, edge speed curve) are design tokens of the one gesture concern (`DESIGN`/`--tc-…`), used in exactly one pure machine. The uniqueness argument is F2's rule, not the core.

### F4. The JSX dialects as specified are not buildable in this toolchain without hand-written runtimes, and they contradict "Preact only in render"
- esbuild reads only `tsconfig.json` (nearest) or one `--tsconfig`. It never reads `tsconfig.next-pure.json` or `tsconfig.next-kit.json` (`esbuild.config.mjs` passes none). So a per-folder `jsxImportSource` needs `tsconfig.json` files inside the folders or per-file pragmas.
- Compiled TSX imports a JSX runtime. If that runtime is Preact's, every kit and screen file imports Preact in the metafile, which breaks "Preact is reached only by the render engine" (line 339) under the metafile-wide `uiRules`.
- `<tc-list>` as an intrinsic element renders an unknown DOM element `tc-list` unless a hand-written runtime maps the tag string to a kit component.
- P9 needs `memo` on cards, but the kit cannot name Preact.
**Fix:** use one dialect, not two. The screen imports kit components **as values** (`<List …/>`). The pure project's `JSX.IntrinsicElements` is `{}`, and the kit's is the allowlist. Both use a **type-only** `jsx-runtime` shim that re-exports Preact's `jsx` and is declared as the render engine's single sanctioned module. The render engine wraps kit components in `memo` where they are registered. That gives the same guarantee (no `<div>` in the screen, closed props in the kit) with no custom runtime.

### F5. Opaque core-answer fields and a closed `Model` require rewriting the shared contract
C4 (line 266) makes the root answer's place facts (`filter.clearable`, `panel`, `topRow`, `plus`, `ViewChoice.*`) opaque tokens. Those are fields of `core/application/contracts.ts`, a shared contract that CLAUDE.md says may change "only with the whole team". Making them opaque needs either a wrapping copy of the answer types in the runtime or a change to the core's types that Swift sees.
**Fix:** keep the `Place` record private and keep the closed variants (both are good). Route core answer fields to concerns by giving each concern a *selector* that `layoutOf` builds, and guard with one checker rule: *a property access on a type declared in `contracts.ts` whose name is in the place-facts set is legal only in `screen/layout.ts`*. That is the `uiDecides.test.ts` pattern the repository already uses.

## MEDIUM

### F6. Per-engine TypeScript projects: 14 configurations doing what one checker rule already does
Decision 33's `uiRules` already enforces "a host declaration is reachable only from its row's engine", at the declaration level, over the whole metafile. Fourteen `tsconfig.engine-*.json` files add configuration surface (all in the manifest, all re-pinned with Max's signature), and they leak anyway:
- root `tsconfig.json` includes `obsidian/**` with DOM and node, and `npm run build` runs `tsc --noEmit` on it;
- `obsidian.d.ts` augments global `Element`/`Node` (`createDiv`, `win`, `doc`…) in any program that includes it;
- `lib` is per-program, not per-file.
**Fix:** use three projects (pure, kit, host) plus the existing declaration-reachability rule. Freeze the engine table as data that the rule reads, not as fourteen configurations.

### F7. The generated router and generated `Screen` are ceremony; the real hazard is cross-concern transitions
A one-line `ROUTES[msg.kind]` gains nothing from a generator. Meanwhile "a handler returns only its own slice + follow-up messages" turns every cross-concern transition into a chain of follow-up messages with implicit order, bounded only by `CHAIN_BOUND` (`Store.ts:6`). Examples: a drop ends select mode, a write pick closes the menu and pins the lists, a remap reaches every slice. That is an event bus inside `update`, which is where ordering bugs come from.
**Fix:** write the root `update` by hand, as a plain composition of concern reducers, and allow explicit cross-concern steps there. Enforce uniqueness by **slice ownership**: a checker rule that a field of slice `X` is constructed or spread only inside `update/X/`. Keep `Disjoint`/total `ROUTES` as types. Drop the generators for `update.ts` and `Screen.tsx`, and keep the generated gateway only if branded units still need wrapping (F1).

### F8. P9 is necessary but not yet sufficient for 16 ms; the current cache defeats it
- `ViewAnswers.answer` clears **all** answers on any new `ReplicaState` (`ViewAnswers.ts:40-45`).
- `needId` stringifies the arguments on every pass (`ViewAnswers.ts:25`).
- `Store.refreshViews` runs on every stale pass (`Store.ts:131-141`).
- `entryDoor` reads views twice per entry call (`BlockHost.tsx:85-89`).
**What is needed (and P9 should say):**
- `needs(model)` memoised on the model slices it reads, with need identities computed once;
- `layoutOf` split so that `measured` changes do not rebuild `regions`;
- `Screen` root memoised on `regions`;
- one budget assertion for the pointer path (F2), in addition to "cards re-rendered".
With those, 300 memoised cards at 4× CPU fit under 8 ms per frame. Without them, a scroll-driven carry will not.

### F9. The effect ledger will produce false failures
Scroll offsets change without a command:
- the browser clamps `scrollTop` when content shrinks;
- iOS keeps moving after input ends (momentum scroll and the rubber band);
- Obsidian scrolls the note's scroller when the editor changes.
`activeElement` changes from Obsidian's own UI (the command palette, another pane). CodeMirror is external (`esbuild.config.mjs` `external: [@codemirror/*]`): it runs from Obsidian's `app.js`, so a stack frame cannot be told apart from Obsidian's own code, and "a library's frame counts as its engine" cannot be computed.
**Fix:** scope the ledger to the screen's own subtree. Count a scroll change as explained by an engine command, a user input in the last N ms, or a layout change that reduced `scrollHeight`. Judge library effects by **subtree** (inside an editors island), not by stack frame.

### F10. Missing homes
- **`MutationObserver`** is in no engine row. Today it follows Live Preview and Reading re-renders and the status bar: `drivers/measure.ts:106` `watchPage`, `ui/BlockHeight.ts:18`, `ui/StatusBarRoom.ts:19`, `ui/ViewWatch.ts:16`. Proposed home: measure or mount.
- **The editors engine has no place in the draw order** (render → measure → motion → scroll → focus, line 330). A typing pick must mount CodeMirror into its island before focus, inside the tap.
- **Re-adopting the settings rows** after Obsidian's `Setting` redraws (every drop redraws them) is unspecified: rows are adopted once, and a redraw orphans them.
- **Accessibility:** the kit bans `tabindex` and `<label for>` and never mentions `aria-*`, so keyboard and VoiceOver access has no owner.
- **Workspace events** used today (`layout-change`, `file-open`, `active-leaf-change`, `resize`, `vault.rename`; `ProjectBlocks.ts:98-102`) need to be listed as `HostCommand`/lifecycle intents (`renamed`/`shown` cover only part of them).
- **`touchmove` `preventDefault`:** it must be decided synchronously from model state (`input.ts:128-130`). That works only because `dispatch` is synchronous. State that as an invariant.

### F11. Migration: stage 3 is not one stage, and the gates are not finishable
- **Stage 3 bundles three kinds of work:** the backend (P9 sharing, per-part caches, the project-note index), about fifteen guard artefacts (dialects, projects, generators, manifest, trap, ledger, matrix registry, fixtures for about 80 findings, mutation), and reshaping about 10k lines of slice 3 (`BlockHost.tsx` 478, `motion.ts` 683, `islands.ts` 639, `carry.ts` 343…). There is no green intermediate state.
- **Stage 4 is the bulk of the old UI:** `CalendarScreen.ts` 1690, `Timeline.ts` 700, and Swipe/ScreenPager/ScreenTracks/ColumnSwitch about 900. Meanwhile master's old UI is content-frozen (G8), and every fix there needs a port plus a matrix test.
- **The gates:** 100 % branch coverage over the e2e matrix (concerns × places × forms × themes × payloads × targets) and 100 % mutation on the guards are open-ended gates that will stall stage 7.
**Fix:**
- split stage 3 into 3a backend, 3b the construction with its fixtures, 3c the reshape;
- measure coverage on the **model-level** matrix and run the e2e matrix as a risk-ranked subset plus the full release gate;
- keep the mutation floor as a ratchet without a 100 % gate.

## LOW

### F12. "One call site per effect API" is ownership by module in disguise
A wrapper function gives one call site that anything can call. The engine-reachability rule already gives the guarantee. Keep the closed `AnimationSpec`/`ScrollSpec` (good). State the rule as "only engine X's module calls API Y", and drop the call-site count.

### F13. The matrix comparator's declared variance is a second behaviour spec
Making each variant value list the commands and causes it adds or removes duplicates the update code in data, and the two will drift. **Fix:** compare one concern's logs only across cells whose variant values are equal, and test each variant value by its own scenarios.

## Kept (no change needed)
P1–P4, P6 and P8, the replica and pending log, the private `Place` record with closed variants, the closed `AnimationSpec`, the CSS allowlist (decision 34), G8's single switch, the manifest of hashes (C5), the lifecycle test, and `Program`/`Store` as written.
