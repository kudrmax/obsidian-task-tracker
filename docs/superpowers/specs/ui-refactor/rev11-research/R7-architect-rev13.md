# R7: architect review of the UI refactor spec, revision 13

Spec: `docs/superpowers/specs/2026-11-15-ui-refactor.md` at b1a80604. Line numbers are the spec's. Code was spot-checked in the worktree `ui-refactor-spec11`.

Verdict: revision 13 is much cleaner than 12, and the threat model (l.400-406) is the right one. It is **not yet buildable as written**. Four defects block stage 3b or 3c, and several leftovers contradict the new tiers. Findings are ranked by severity.

## Blockers (unbuildable or self-contradictory)

**B1. The matrix runs "on the release bundle with UI=next", but the release build refuses `next` until stage 7.**
- Where: l.300, l.578, l.666, l.869 and l.892.
- Problem: stages 3c-6 each must pass "the risk-ranked e2e subset on the release bundle" (l.666), which is impossible before stage 7.
- Fix: say that `npm run build -- --ui=next` makes the production-mode bundle (same esbuild options, `define` UI) into `.e2e/next/main.js`, and that only `npm run release` refuses `next`. "The bytes stage 7 ships" then means "the same build recipe".

**B2. The e2e seams contradict each other.**
- Where: l.733 against l.300 and l.869.
- Problem:
  - l.733 says the clock and the network are stubbed "in the test build".
  - l.300 and l.869 say they are injected over CDP into the release bundle.
  - l.869 makes only the e2e build record `outside()` and take over `window.open`. A matrix run on the release bundle can therefore open links and Scriptable on Max's Mac.
- Fix:
  - One rule: every seam (clock, `Http`, `outside()`) lives in `hostServices`, ships inert, and is armed only by the CDP-injected script.
  - Rewrite l.733 and decision 37 to match.
  - Add `Target.setAutoAttach` with `waitForDebuggerOnStart` for popout realms. `addScriptToEvaluateOnNewDocument` alone misses windows that open later.

**B3. The three TypeScript projects cannot partition the files as described.**
- Where: l.248-257, l.253, l.556.
- Problem:
  - A TS program contains every file it imports. Pure `view/Screen.tsx` imports the kit, so the kit's `<div>`s are checked under pure's empty `IntrinsicElements` and fail.
  - The kit imports `model/` types, and the pure project imports the kit: a cycle.
  - The core is imported by all three, so "each program holding only its partition" (`--listFiles`) cannot hold.
- Fix:
  - Make the projects composite project references (`tsc -b`; check that TS 7.0.2 supports `--build`) in the order pure → kit → host, each consuming the one below as `.d.ts`.
  - Move `Screen.tsx` into the kit project. It is a JSX composition and fits the kit's type view.
  - Partition by `include` roots, not by `--listFiles`. `core/` is its own project.

**B4. The "typed coverage map" does not exist.**
- Where: l.30, l.261, l.672.
- Problem:
  - `DOOR_COVERAGE` (`PhoneCalls.ts:1280`, not `:1077`) is a `Record<string, DoorCoverage>` of space names.
  - `callDoor(method: string, args: unknown[]) → DoorAnswer` is untyped per method.
  - The `DoorContext` reference is `:93`, not `:85` (l.102).
- Fix:
  - Stage 3a: `backend` adds `DoorMethods`, an interface from method name to `{ args; answer }`, with a type test that it equals `doorMethods()`.
  - State that this lives in `PhoneCalls.ts`, not `contracts.ts`, because CLAUDE.md freezes `contracts.ts`.
  - Fix the line refs.

**B5. FLIP has no "first" boxes.**
- Where: l.171-174, l.232, l.354, decision 48 (l.883).
- Problem:
  - The loop measures only after render, and only the keys a cause names.
  - FLIP needs each row's box before the render. Today's driver keeps a `boxes` map of every row (`drivers/motion.ts:67`), which P9 forbids.
- Fix: in the loop, after `update` and before render, measure the cause's keys ("first", one layout read, no writes yet). After render, measure them again ("last"). Change the order at l.354 to: update → door → needs → **measure first** → render → editors → measure last → motion → scroll → focus.

**B6. "The root re-renders zero times during a carry" contradicts "Screen sees only `regions`".**
- Where: l.235 against l.288, l.352 and l.229-230.
- Problem:
  - The float, the drop indicator and the layers must come from `regions`, so a target change changes `regions` and re-runs the root.
  - `layoutOf(place, root, chrome)` (l.346) takes no model, yet `regions` must include the open field, the carry's waiting place, layers and pins.
- Fix:
  - Split `layoutOf`'s place-derived parts from a selector `regionsOf(model, parts)`.
  - Restate the budget: "during a carry no list or card component re-renders except the target's indicator and the float". The root function may run.
  - Register `memo` in the `tc-jsx` runtime: `jsx(type)` swaps each function component for a WeakMap-cached `memo(type)`. "Where it registers them" (l.259, l.230) has no registration point. `memo` is in `preact/compat`.

## High (contradictions and leftovers)

**H1. A 100 % gate is still there.**
- Where: l.437, l.576, l.666, l.699, l.754.
- Problem: they demand 100 % line, function and branch coverage of the pure project, and "a line no scenario can reach is deleted". That deletes `assertNever` arms and defensive defaults. It also contradicts l.297 ("no stage waits on 100 %") and the spirit of l.574.
- Fix: use a coverage ratchet like mutation, plus "every Msg/Command kind exercised".

**H2. Fixtures are required for findings the spec rejects.**
- Where: l.565, l.673, l.753.
- Problem: they demand a reject fixture for "every finding of §What each finding meets that code can show". That includes the explicitly **rejected** sabotage findings (R4 F1's lying predicate, `JSON.stringify(place)`, l.460, l.467), whose fixtures would have to fail.
- Fix: write "every **Taken** finding". Rejected ones get a G9 checklist line.

**H3. Tier 2 claims more than it delivers.**
- Where: l.405 against l.437 and l.468.
- Problem:
  - l.405 says "every natural route" is caught by a machine check.
  - l.437 and l.468 admit that a second statechart in one folder, or a variant branching into a copy, is caught only by jscpd and the reviewer. Those are natural routes.
- Fix: say tier 2 catches every natural route **to the platform, the rules and the place**, and that duplicated pure plumbing is tier 3 (review plus jscpd).

**H4. Leftover "`rules.*` imported directly".**
- Where: l.609 (Resolution, M4).
- Fix: "through the gateway `screen/rules.ts` (C3)".

**H5. Leftover memo key.**
- Where: l.147 "Views are memoised by (replica, minute)", against P9's per-part caches (l.227-228).
- Fix: "by the replica parts each need reads, and the minute".

**H6. Stage 3a gives `backend` frontend work.**
- Where: l.672.
- Problem: per-part need caches live in `obsidian/runtime/dispatch/ViewAnswers.ts` (frontend-obsidian's), and the need ids computed once belong to `model/`. 3a is "green on the core's tests" only.
- Fix: 3a = core only (structural sharing by (id, line), `DoorMethods`, ordinal rules, the project-note index). Move the `ViewAnswers` rework to 3c.

**H7. Stage 3b's violation list is a baseline.**
- Where: l.673.
- Problem: "known violations listed, the list only shrinking" is the very baseline that CLAUDE.md ("never raise a baseline") and the revoked decision 35 (l.867) reject.
- Fix: run 3b's rules only on the fixtures, and switch them onto `obsidian/ui/next` at the end of 3c in one step. No list.

**H8. The matrix registry is tied to every union member.**
- Where: l.576, l.466.
- Problem: it demands an *inventory row* for every union member, every `MotionCause` and every message kind. Internal kinds (`motionSettled`, `viewsChanged`) have no row in an inventory of the old UI, so every new message forces an edit to a historical inventory. That is contorted.
- Fix: the inventory rows must map to members, and every member must appear in some scenario. Those are two separate checks.

**H9. Decision 50 contradicts C3.**
- Where: decision 50 (l.885), "the month grid is plain date math (no core rule exists)", against C3 (l.278) "the UI never computes" a rule.
- Fix: use `rules.monthGrid` from the core (Swift draws a month too) or name it as an exception.

## Clean code (contorted rules, with a cleaner equivalent)

**K1. No arithmetic in engines.**
- Where: l.272, l.559, decision 33.
- Problem: this forces FLIP inversion, rect-relative coordinates, glide interpolation (l.383), pinch distance (hypot) and float = finger − grab into `units.ts`, which becomes an untyped geometry dump.
- Fix: engines may do arithmetic; they may make **no ordering comparison and no branch on a host number**, because deciding is what a hit test needs. The units rule then covers pure code only.

**K2. Arithmetic on numbers derived from `.length` or `indexOf`.**
- Where: l.283.
- Problem: the rule bans this "followed through local bindings". It is dataflow tracking, it misses `map((_, i) => …)`, and it trips on `monthGrid.ts:37`.
- Fix: arrays of the core's place and list types are opaque outside the gateway (no element access with a computed index on them), plus `swipeOnce`. That is one type rule and no dataflow.

**K3. The C4 property-read ban.**
- Where: l.286.
- Problem: it bans reading `topRow`, `panel`, `plus` and `ViewChoice.*` outside `layout.ts`. These are things to draw, so `layout.ts` must re-copy the whole root answer: a god file.
- Fix: as in `uiDecides`, ban them only in a **condition** (`if`, `?:`, `&&`, `switch`) outside `layout.ts`.

**K4. Decision 33's "a few kinds allowed nowhere".**
- Where: decision 33 (l.865): a class read, an attribute named at run time, "a host value stays in host-declared types".
- Problem: this is the enumeration style revision 13 says it left behind, and it is not defined well enough to implement.
- Fix: drop it, or define each item as one rule with a fixture.

**K5. Equal-variant comparison "by key roles".**
- Where: l.576.
- Problem: it is undefined.
- Fix: define the role set (lifted, target, neighbour, landed) and the log projection as a type in `tests/matrix/`.

## Performance (16 ms, 300 tasks, 4× CPU)

**Reachable:**
- carry pointermove: the transient channel, a message only on a target change, `carryAt` under 1 ms;
- card menu (one need, one measure);
- a write's card re-render (P9).

**At risk:**
- **Enter, plus tap and typing picks.**
  - Each builds a CodeMirror `EditorView` inside the event, roughly 5-15 ms on a throttled mobile WebView.
  - A write also misses the parse cache, because the text changed, and parses again for the view.
  - Fix:
    1. Keep one warm `EditorView` per screen and re-key it to the next row on Enter.
    2. The write seeds the cross-call cache with its result document, keyed by the new text.
- **Mode switch and day or place swipe.**
  - Each is a new context, so no memo hits. That means a full root view (about 3 ms on the Mac, so about 12 ms at 4×) plus a fresh render of every card shown.
  - It cannot fit 16 ms structurally with 300 cards.
  - Fix: render the lists windowed (the visible rows plus one screen), or precompute the neighbour context's view in idle time. Then state the budget per gesture.
- **The minute tick.** It recomputes every task need (l.147). That is fine if structural sharing keeps `TaskItem` identity; add it to the budget tests.

## Migration

- 3a and 3b are realistic only after H6 and H7.
- 3c is large: `BlockHost.tsx` is 478 lines, `drivers/motion.ts` 683, the whole of `next/` about 9.8k. It also mounts the note from day one. Split it at "main screen lists+entry" / "carry+menus+search".
- **"Kept as is"** (l.684) lists `Program`/`Store`/`HostSession` and the runtime, but `ViewAnswers` contradicts P9: it stringifies arguments (`:25`) and clears everything on any replica change (`:40-45`). The spec names this itself at l.228, yet it is "kept as is".
- `drivers/motion.ts`'s all-row `boxes` map conflicts with "measure only the cause's keys" (B5).
- The view uses `preact/compat` twice, which must go behind `tc-jsx`.

## What a fresh 3a agent would have to guess

- The shape of the per-method typed map (B4).
- Which "ordinal rules the UI still computes" to move (none are named).
- What structural sharing returns across texts: an (id, line) keyed `TaskItem` cache, and where it lives (`DOOR_CACHE` or the replica).
- Which door method is the "project-note check indexed by path" (`projectNoteView` exists at `PhoneCalls.ts:487`, but no index).
- Whether `tasks.keyOf` is still "missing". It exists, at `PhoneCalls.ts:681`; l.129 is stale.
- What the 3a budget numbers are beyond P3's 1 ms.
