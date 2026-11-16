# R4: red team of revision 12 (`2026-11-15-ui-refactor.md`)

The question: assume everything the spec defines is built and green. Can I still ship a second implementation of a concern, or a behaviour tied to one place or one form, with no check failing?

**Short answer: yes, in at least a dozen independent ways.** Revision 12 says "the compiler is the guard". Three things undercut that:

- Opacity exists only in the types (units, `Place`). The type system has three open doors that no rule shuts: `any`, user-written type predicates, and coercions.
- C3 forbids arithmetic on pixels only. Ordinal and boolean decisions, the "one swipe, one place" rule among them, need no pixels at all.
- The fallback for duplicated pure code is the matrix. The matrix compares logs, which is a behaviour check. Two correct copies pass it, and that is exactly the failure revision 11 named as the root cause.

The guards are not outside the agent's reach. The agent writes the trailer, holds Max's credentials, and lives under standing rules that tell it to fix guards without asking Max.

Below, each finding has: the attack, with code; the check that should catch it and why it does not; the fix at the level of the principle.

---

## CRITICAL

### F1. Opacity is only in the types: `any`, type predicates and coercions open units and `Place`

C1 and C3 ban `any`, `unknown` and bare `number` only in types that cross a boundary (`Model`, `Msg`, `Command`, `Layout`, kit props). Inside a function, all of them are free. C5 bans `as`, but not `any` annotations, not user-written type guards, and not coercions.

```ts
// update/carry/landing.ts — pure project, compiles, no `as`
function n(x: any): number { return x }                  // Px → any is implicit
const below = n(pointer.y) > n(box.top) + n(box.height) / 2;   // a second drop rule

function isNum(x: unknown): x is number { return true }  // a lying type guard, no cast
if (isNum(dy)) { const flick = dy > 40 }                 // dy narrowed to Px & number

const y = +pointer.y;                                    // unary + compiles on any object type (cf. `+new Date()`)
const z = Number(pointer.y), w = parseFloat(`${pointer.y}`);
const p: Px = JSON.parse("12");                          // JSON.parse returns `any`: units forged in pure code
const rec = Object.entries(model.place);                 // [string, any][]: the place record read outside layoutOf
const isNote = JSON.stringify(model.place).includes('"note"');
```

- **Should catch:** C3 ("TypeScript refuses `+`, `-`, `<`, `Math.*`") and C4 ("nothing else can read a field of it, by type").
- **Why it doesn't:** units and `Place` are phantom types over plain runtime values. Unary `+`, `Number()`, template strings, `JSON` and `Object.entries` all accept any type. `any` and `x is T` are legal TypeScript, and no rule bans them in local code. This walks straight past C3 and C4, and with them the guarantee rows for layout, drag and drop, measurement, input and place.
- **Fix (principle: opacity must be real at runtime and in the checker):**
  1. Make each unit and `Place` a class with an ECMAScript `#private` field, or keep the record in a module-private `WeakMap`, so that `+p`, `JSON.stringify(p)` and `Object.entries(p)` give `NaN` or `{}`.
  2. In the pure, kit and engine projects, refuse any expression whose type is `any`, any `any` or `unknown` annotation, and any type predicate or assertion signature, outside `units.ts` and `layout.ts`. This is `no-unsafe-*` done with the checker.
  3. Generalise decision 33's "a host value stays in host types" into "an opaque value flows only into parameters of its own type". That makes coercion positions (unary `+`, template literals, `Number`, `String`, `JSON` arguments) type errors.

### F2. Pure code still has numbers, strings and booleans, so a second rule needs no pixels

C3's claim that "a second drop rule, width rule or swipe landing has no numbers to be written with" is false. `.length`, `indexOf`, `findIndex`, string comparison and booleans are all in `lib: es2024`.

```ts
// update/context/swipe.ts — a second swipeLanding, the rule Max had to ask for twice
const order = ["inbox", "soon", "today", "done"] as const;
const i = order.indexOf(model.context.at);
const next = order[Math.min(order.length - 1, Math.max(0, i + (msg.dir === "next" ? 2 : 1)))]; // "two places"
// update/entry/land.ts — a second "where a new task lands"
const at = rows.findIndex((r) => r.key === anchor) + 1;
```

- **Should catch:** C3, then the matrix, then `uiDecides` (a list of task fields only).
- **Why it doesn't:**
  - Units cover geometry only.
  - The matrix compares logs by key roles. A wrong landing that some scenario never exercises, or a correct copy, both pass.
  - Branch coverage is met by any test that runs the line.
- **Fix (principle: pure UI code has no numbers at all, not "no bare numbers that cross"):**
  1. Refuse every expression of type `number` in the pure and kit projects outside `units.ts`.
  2. Move ordinal list operations (index, neighbour, step) into core rules behind the gateway, and give pure code key-based operations (`find`, `filter`, `map`).
  3. State honestly that duplicated string or boolean decision logic is not stopped by construction. It is stopped by F7 (an inventory-keyed registry) and G9, and the spec's claim that "none rests on a reviewer" should be withdrawn.

### F3. "Guards outside the code's reach" is false

1. **The trailer is self-authored.** `npm run guards:pin` checks that a commit carries `Guards-approved-by: Max` quoting his message. The agent writes the commit and can quote any earlier "да" from the transcript. The agent runs as Max, with his git identity, signing keys and `gh` token, so nothing cryptographic tells the agent and Max apart.
2. **Standing rules contradict the gate.** Memory says "Guard follows spec: my guard blocks clean code → fix the guard … never ask Max about tests" and "Decide technical details myself". The spec says "Questions for Max: none". Every stage raises the mutation floor, which lives in the manifest, so every stage needs a re-pin. The gate will either be rubber-stamped or walked around.
3. **The manifest is a list, and it leaks.** It does not cover:
   - `scripts/release.mjs` (edit it to skip the manifest check);
   - the `gen:screen` generator (edit the generator, regenerate, and the "equals generator output" check passes; see F11);
   - `scripts/e2e/*` beyond `matrix.ts` (the recorder, `frames.ts`, `run.mjs`: loosen the frame rules);
   - vitest `setupFiles` (`tests/setup.ts`, which can patch `expect` and globals);
   - `tests/helpers/LeakCounter.ts`, `tests/guards/TsProgram.ts`, `tests/fakes`;
   - `package-lock.json` and `package.json`'s dependencies (only its scripts are covered; see F8).
4. **Unbuildable as written.** `tests/engines.test.ts` holds the manifest's hash, and the manifest holds `engines.test.ts`'s hash. That fixed point cannot be satisfied (short of a hash collision) unless one of the two is excluded, and the spec excludes neither.

- **Fix (principle):**
  1. Make the manifest the computed closure of everything `npm test`, `npm run release` and `npm run e2e` load or execute (the module graphs of vitest, esbuild and node, plus the lockfile). It should not be a list.
  2. Store the manifest's own hash outside its set, for example in a git tag Max pushes.
  3. Approval must come through a channel the agent cannot drive, such as a GitHub ruleset or CODEOWNERS review on guard paths approved from Max's phone. Otherwise, call the mechanism what it is: detection by out-of-band notification of every guard diff, not prevention.
  4. Reconcile the memory rules with the spec. One of them has to give.

### F4. Every concern can emit every effect: focus, motion, scroll and door writes have N decision owners

There is one call site per API, but `Command` is one union that any concern's handler may return.

```ts
// update/menu/open.ts
return [slice, [{ kind: "focus", key: rowKey }, { kind: "motion", cause: "rows", keys: [k] }, { kind: "scroll", intent: "intoView", key: k }], []];
// update/search/pick.ts — a note writes the device's filter regardless of `search.reveal`
return [slice, [{ kind: "door", method: "tasks.selectProjectNode", args: [node] }], []];
```

- **Should catch:** "one focus call site", "one `animate` call site", the C4 variants, and the note's matrix cells.
- **Why it doesn't:**
  - One call site makes the execution unique, not the decision. The old UI's "about 9 focus owners" and "about 8 motion paths" come back as nine concerns emitting `focus` and `motion` commands.
  - Variants are strings that ask for good behaviour. They do not grant capability: a door write of the place needs no token.
  - The note's cells assert that the filter is unchanged only in the scenarios they script.
- **Fix (principle: a capability, not a convention):**
  1. Each command kind can be constructed only inside the concern that owns it, through per-concern command unions typed into each handler's return type. Other concerns send that concern a message.
  2. Door methods that write the place, the filter, the day or the carry take a capability value that only `layoutOf` issues, and `null` in places that may not write. A note then cannot express the write.

## HIGH

### F5. Engines and `ScreenHost` keep state and recognise gestures through closures and the DOM

"Its only fields are `readonly` maps" constrains fields, not closures. "It compares nothing" and "one message per event" are not checked anywhere: decision 33's list has no such rule.

```ts
// engines/input.ts
mount(root: HTMLElement, emit: Emit) {
  let downX = 0, downAt = 0;                         // closure state, not a field
  root.addEventListener("pointerdown", (e) => { downX = e.clientX; downAt = e.timeStamp; });
  root.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - downX) > 4 && e.timeStamp - downAt < 300) emit(flick(e)); // a second recognizer, with raw DOM numbers
  });
}
// or state kept in the DOM: el.dataset.lastY = String(e.clientY)
```

"One call site per API" is beaten by a wrapper (`const box = (el) => el.getBoundingClientRect()`), so a second FLIP inside `motion.ts` keeps one call site. With the unknown-file rule dropped, the FLIP arithmetic can also sit in a host-free helper (`obsidian/runtime/lifecycle/flip.ts`) that takes a callback. It uses no host declarations, so `uiRules` has nothing to deny.

- **Fix (principle: engines are configuration, not code):**
  1. Listener-to-message projection is a generated, frozen table (event type → fields copied → unit wraps). There are no handwritten handler bodies.
  2. An engine is a total `switch` over a spec union that is frozen in the engine table, with one case per kind.
  3. Every bundle input belongs to exactly one project by a computed partition. Engines import only `units` and pure modules, and never a free helper.
  4. Apply the same to `ScreenHost`.

### F6. Kit components get a stateful instance, and the DOM, without hooks

If the dialect's `jsx-runtime` hands kit functions to Preact as components, Preact calls a function component as `this.constructor(props, context)`, with `this` set to the component instance. That is Preact 10's code; check it on 11.2.

```tsx
export function Card(this: { base?: { animate(k: object[], o: object): void }; seen?: boolean }, p: CardProps) {
  if (this.seen) this.base?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); // a second motion path, from the kit
  this.seen = true;
  return <tc-card …/>;
}
```

Other leaks in the same area:

- `const CACHE = { m: new Map<string, number>() } as const` counts as "`as const` data" holding mutable module state.
- A top-level `function f(){}` plus an expando property `f.memo` stores state on the function.
- `<a href>` navigates and `<button>` takes focus natively; whether the allowlist includes them is unspecified.

- **Should catch:** C1's "no hooks exist to import" and the module-scope rule.
- **Why it doesn't:** hooks are not the only way to state. `this` is a typed parameter, not a cast, and the own structural type hides the host value.
- **Fix:**
  1. The kit dialect builds its own plain-data vnodes, and the render engine converts them to Preact. Kit functions are called as plain functions in strict mode, so `this` is `undefined`.
  2. Ban `this` parameters and expando properties in the pure and kit projects.
  3. An `as const` initialiser must be literal-only, checked recursively: no `new`, no calls.

### F7. The matrix registry is keyed by the code's own unions, so shrinking a union deletes the cells

```ts
// model/carry.ts: drop "section" from CarryPayload; implement the section lift in update/section/
type SectionMsg = { kind: "sectionLiftMove"; at: Px } | { kind: "sectionLiftDrop" } | …; // its own statechart, own slice
```

- **Should catch:** G5 ("a new payload … adds required cells by type") and the equal logs across payloads.
- **Why it doesn't:** fewer payloads means fewer cells. The section concern has its own cells, its own signature and its own logs, and each is internally consistent. Decision 54's list of payloads is prose.
- **Fix (principle: the registry derives from the inventory, not from the code):**
  1. Freeze the map from each inventory or traceability row to its (concern, payload or variant, place, form) cell in the manifest.
  2. A row that maps to a member missing from the union, or a union member that no row maps to, fails.

### F8. The "compiler" boundary does not exist for imports; `uiRules` is the real guard and works from a list

- `types: []` does not stop `import { Menu } from "obsidian"` or `import { useState } from "preact/hooks"`. Explicit imports still resolve through `node_modules`.
- `/// <reference lib="dom" />` in a pure file adds the DOM back. Triple-slash directives are not on the escape-hatch list.
- `skipLibCheck: true` (`tsconfig.next-pure.json` today) silently turns the unresolved DOM names in Obsidian's `.d.ts` into errors nobody sees.
- A new dependency (`motion`, `@floating-ui/dom`, `auto-animate`) is not a "host" by decision 33's list (DOM, Node, Obsidian, Preact, CodeMirror). It is unscanned, because it lives in `node_modules`. An engine importing it gets a second animation or placement system with zero call sites of `Element.animate`.
- The new code may import the frozen old UI (`obsidian/ui/motion/*`, `drag/*`), which is exempt from scanning, and so launder effects through it. The spec states only the reverse import ban.
- `contracts.ts` re-exports `swipeLanding`, `SWIPE_FLICK_SPEED` (a bare number), `layoutWidths`, and the stateful classes `QuickEntrySession`, `RepeatPage` and `SectionNameEntry`. Pure code already imports `contracts` (`update/*.ts`), so it can call rules around the gateway and run the core's sessions locally.

- **Fix (principle: a partition plus an allowlist, everywhere):**
  1. Every project uses `paths: { "*": [blocked] }` plus its allowed packages, with a `tsc --listFiles` check that each program contains exactly its partition.
  2. Ban triple-slash directives. Turn `skipLibCheck` off for the pure and kit projects.
  3. An ES-lib allowlist for pure and kit code. Denylisting "doors" misses `(() => 0).constructor`, which is typed as a callable `Function`, as well as `Date.now`, `Math.random`, `Promise`/`async`, `WeakRef`, `FinalizationRegistry` and `Object.*` reflection.
  4. Value imports from `core/` only through the gateway. The engines and the gateway are the only modules that import dependencies, each a row of the frozen table that includes the lockfile.
  5. `next` → old UI imports refused.

### F9. A place or a form leaks through proxies every concern sees

1. **The root answer's shape.** A concern can test `root.kind === "funnel"` against a note's list view.
2. **A concern's own variant value reused as a place flag.** `if (layout.reveal === "openFull") /* note: different result order */` is legal. "A variant changes only its own concern's behaviour" is not, and cannot be, type-checked against reuse.
3. **Message kinds that correlate with the form.** `wheel`, `contextmenu`, `secondPress` and the keyboard's broadcasts can be latched: `slice.sawWheel = true`, then branch on it.
4. **A variant that gates a whole second implementation.** `entry.bar === "capsule" ? deskEntry(m) : phoneEntry(m)` hides a whole duplicate. The matrix removes the declared differences and the rest is a correct copy, so it passes.

- **Fix:**
  1. Variants are consumed only as keys into `as const` data tables, never in control flow (a checker rule on variant-typed expressions).
  2. Only the gesture concern receives raw input kinds. Everything else gets form-free intents.
  3. Root answers carry no place-shaped structure that the variants do not already declare.

### F10. The trap tests a different bundle, with holes in its ledger

1. **The e2e bundle is not the shipped bundle.** It is `obsidian/e2e.ts`, holding both UIs (`UI`), the trap and coverage counters. Code can detect the trap (`Element.prototype.animate.toString()` without `[native code]`) or differ by build. Fix: run the matrix on the release `main.js`, with the trap injected before load through CDP `Page.addScriptToEvaluateOnNewDocument`, and coverage taken through CDP Profiler.
2. **The exemption "matches … or a user's input" swallows any effect in a frame with input.** During a carry, every frame has input. The browser's own text-selection autoscroll, a native button's focus on click, and CSS scroll anchoring under a finger all pass. Fix: attribute each effect to the specific input's declared consequence, such as a wheel or touch scroll on that scroller.
3. **Style and attribute mutations are not watched.** A kit or engine writing `style.transform` per message is a second float motion with no animation, no scroll and no focus. Fix: a `MutationObserver` on every screen node, each mutation attributed to a render or motion command.
4. **Branch coverage only.** `({ phone: f, desktop: g })[form]()` has no branch, so an unrun `g` passes. Fix: 100 % line, function and branch coverage.

## MEDIUM

### F11. The generated files and the gateway follow whatever their inputs say

- The `gen:screen` generator is not in the manifest. Edit its template to emit a pre-route hook in `update.ts`, regenerate, and the check "the file equals the generator's output" passes.
- `screen/rules.ts` is generated from the core's exports. A `backend` change adds `core/application/noteSwipe.ts` (a second landing rule), and the gateway exposes it automatically. "Rules live in the core" then makes the core the place where duplicates live.

- **Fix:**
  1. Generator and concern list in the manifest.
  2. A structural assertion on the generated outputs: `update.ts` is exactly the routing table plus the broadcast loop.
  3. The gateway's set of rules is frozen, each rule mapped to inventory rows, with a uniqueness rule in the core: one rule per inventory decision.

### F12. One fact in two slices

P1's "a fact has one field" is enforced by nothing. Each handler sees the whole `Model` and may keep its own copy, for example `entry.day` beside `context.day`. That is D58 again, and both copies diverge identically in every place, so the matrix stays green.

- **Fix:** facts are branded types owned by one concern's module, and a slice type may not contain another concern's brand (`AssertNoForeignFacts`).

### F13. `ScreenHost`, `registration.ts` ("the active screen") and the note adapter hold logic by closure

Nothing but G9 checks them; this is the same hole as F5.

### F14. CSS

- `transform`, `translate` and `inset` under an `is-…` state move rows with no motion engine, unless "revision 10's list" of size properties names them. That is a list again.
- `:has()` counts as a state, so a variant class can style other elements: `.task-calendar:has(.tc-n-frame.is-inline) .tc-n-card {…}`. This defeats "a variant class styles its own element only".

- **Fix:** an allowlist of properties permitted under a state (colour and opacity only), instead of a denylist of size properties. `:has()` may not contain a variant class.

---

## Unbuildable as written, or forcing contorted code

1. **`AssertClosed` with no bare `number` on `Model` versus view answers held in `Model`.** `TaskItem.durationMin: number` and the event and timeline minutes are bare numbers, as is `motion.seq: number` today. "Units are made only by the measure and input engines", so pure code cannot make a `Count` from anything: no counters, no indices, no fold count, no menu page. The way out is either to retype the core's contracts, which are a shared contract per CLAUDE.md, or to exempt answers, which reopens bare numbers.
2. **The manifest hash cycle** (F3.4).
3. **100 % mutation score while `Stryker disable` is banned.** Equivalent mutants cannot be killed, so 100 % is unreachable without bending the guard code itself.
4. **"Engines compare nothing" cannot be built.**
   - `wheel` `deltaMode` needs line → px arithmetic.
   - Touch `identifier` needs matching.
   - `preventDefault` on `touchmove` must be decided synchronously, from non-passive listeners.
   - IME composition needs checks.

   Since nothing checks this rule anyway, it is a promise.
5. **One `focus` call site versus CodeMirror.** Focusing the field is `EditorView.focus()`, a type only the `editors` engine sees. A click on a `contenteditable` focuses natively. The focus engine has to reach `contentDOM` by a data key set by `editors`. That works, but the spec is silent.
6. **The JSX dialect.** For the kit to be free of Preact (C1, "Preact only in render"), `jsx-runtime` must build its own vnodes, and the render engine converts them every frame. That costs P9, and memoisation has to move to data identity. If `jsx-runtime` simply re-exports Preact, F6 opens.
7. **The comparator with add/remove sets cannot express divergent follow-ups.** After `openFull` instead of `clearFilter`, a scenario's next steps act on a full card that the main screen does not have. Scenarios then become per place, and "logs equal across places" degenerates to expectations per place.
8. **No `as` and no predicates.** `Object.keys`, `entries` and `JSON` then need casts, which pushes agents toward type guards: the very bypass in F1. The spec needs a sanctioned typed-record helper in `units.ts` or `layout.ts`.
9. **Per-engine projects cannot give one engine `getBoundingClientRect` and another `animate`.** DOM is one lib, so per-member limits are `uiRules` work, not the compiler's. Packages per row need a catch-all `paths: {"*": …}`, which the spec does not mention.
10. **The settings rows.** Obsidian's `display()` rebuilds the `Setting` DOM on change, so the adopted nodes vanish mid-session and `mount` must re-adopt. The scroll chain goes through `.vertical-tab-content`. Both are unspecified.
11. **Process.** Every stage raises the mutation floor, which needs a re-pin by Max, which contradicts "Questions for Max: none" and the memory rules (F3.2).

## What is real

- **One loop, one `Model` type and one router.** These hold by construction. A second `Program` instantiation is caught, because it needs the runtime import that only `ScreenHost` has.
- **`AssertClosed` on what crosses a boundary** is real and buildable, apart from the answers' numbers in item 1.
- **The pure project naming no DOM global** is real.
- **No `Menu`/`Modal`, and listeners owned by event type**, are enforceable by `uiRules`' declaration resolution.
- **The CSS allowlist** for motion properties is mostly real; see F14 for what it misses.

What is not real: "the compiler is the guard" for units, `Place`, hooks and imports; "none rests on a reviewer"; and "outside the code's reach".
