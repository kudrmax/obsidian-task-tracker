# D. Production practice: "every UI concern exists once, and every place uses it"

Research for the UI rewrite (TS 7, Preact TSX, Elm-like model, two hosts: leaf and note block, phone and desktop).
Concerns in scope: layout of columns and lists, drag and drop, animation, measurement, scroll, focus, keyboard, text entry, menus.

## 1. What production teams actually do

The pattern is the same everywhere it works: **ban the primitive, ship one sanctioned wrapper, keep a central exemption list, enforce at compile/lint time, and test the checks.** Review is not part of the guarantee.

### 1.1 Google "Safe Coding": the strongest published precedent
- Google applies this to security sinks (`innerHTML`, URL setters, SQL). Risky primitives may be touched only inside a small, reviewed set of safe abstractions; everywhere else the type checker and conformance checks reject them; exemptions live in a centrally managed list that compilers read automatically. Google reports close to zero residual XSS in apps built this way.
  - Kern et al., *Safe Coding: Rigorous Modular Reasoning about Software Safety*: https://research.google/pubs/safe-coding-rigorous-modular-reasoning-about-software-safety/
  - *Developer Ecosystems for Software Safety* (CACM): https://cacm.acm.org/practice/developer-ecosystems-for-software-safety
  - Kern, *Securing the Tangled Web* (ACM Queue): https://queue.acm.org/detail.cfm?id=2663760
  - *Secure by Design: Google's blueprint for a high-assurance web framework*: https://bughunters.google.com/blog/6644316274294784/secure-by-design-google-s-blueprint-for-a-high-assurance-web-framework
- Tooling:
  - Closure Compiler JS Conformance (`BANNED_PROPERTY`, `BANNED_PROPERTY_WRITE`, `BANNED_PROPERTY_CALL`, with per-file allowlists): https://github.com/google/closure-compiler/wiki/JS-Conformance-Framework
  - `tsec`, a `tsc` wrapper that bans DOM sinks, with a JSON exemption list keyed by rule and file glob: https://github.com/google/tsec
- Takeaway for us: our deny-by-default DOM guard is this exact pattern. Google applies it to sinks, which are API calls. It does **not** claim to prevent semantically equivalent logic written twice.

### 1.2 Design systems that own the primitives (layout, motion, tokens)
- **Atlassian** `@atlaskit/eslint-plugin-design-system`:
  - `use-primitives` enforces layout primitives (Box/Stack/Inline) instead of raw elements.
  - `ensure-design-token-usage` bans hard-coded values.
  - https://atlassian.design/components/eslint-plugin-design-system/ensure-design-token-usage
  - https://www.npmjs.com/package/@atlaskit/eslint-plugin-design-system
- **Shopify Polaris** `stylelint-polaris` coverage rules, grouped by category, including **motion**:
  - `motion/at-rule-disallowed-list` bans `@keyframes`.
  - `motion/declaration-property-unit-disallowed-list` bans hard-coded `ms`/`s` on `transition`/`animation`.
  - Plus custom-property and function disallowed lists.
  - A disable comment on a coverage rule must carry a `polaris:` reason, or it is itself an error, and disables are reported per category.
  - https://polaris.shopify.com/tools/stylelint-polaris/rules
  - https://polaris.shopify.com/tools/stylelint-polaris/rules/motion-global-disallowed-list
  - https://github.com/Shopify/polaris-react/pull/7589
- **Mozilla** stylelint `use-design-tokens`: https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-design-tokens.html

### 1.3 A single motion layer (frameworks where animation is a property of the tree, not of call sites)
- **Framer Motion / Motion**: `layout` on an element plus `LayoutGroup` makes one layer measure before and after a render and run the FLIP for every member, so call sites never measure or animate.
  - https://motion.dev/docs/react-layout-animations
  - https://motion.dev/docs/react-layout-group
- **React Native Reanimated** layout transitions and entering/exiting animations: declared as a prop, run by the library: https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions/
- **SwiftUI** `matchedGeometryEffect` inside one render tree. Geometry is shared by id within a namespace: https://developer.apple.com/documentation/swiftui/view/matchedgeometryeffect(id:in:properties:anchor:issource:)
- **Flutter** implicit animations: the widget animates on its own when a value changes: https://docs.flutter.dev/ui/animations/implicit-animations
- How these frameworks keep animation in one place:
  1. The animation is **declared as data** on the node (a key or id plus a transition token). The render layer diffs and animates, so there is no imperative call left to duplicate.
  2. Lint bans the escape hatches: Polaris bans `@keyframes` and raw durations, and a JS guard bans `element.animate`, `requestAnimationFrame` and inline `transition` style.

### 1.4 Elm: effects owned by the runtime by construction
- In Elm, app code cannot touch the DOM at all. Every effect is a `Cmd`/`Sub` value that the runtime interprets: https://guide.elm-lang.org/effects/
- This is the limit our setup can approach: views return data only, and the drivers are the only effectful code.

### 1.5 Architecture fitness functions (import and dependency rules)
- **ArchUnit** (Java): https://www.archunit.org/
- **ArchUnitTS**: architecture rules written as unit tests. It **fails a rule whose file pattern matches zero files**, which guards against vacuous rules: https://github.com/LukasNiessen/ArchUnitTS
- **dependency-cruiser** (forbidden, allowed and required dependency rules, including `allowed` deny-by-default mode): https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- **Nx `enforce-module-boundaries`** (tag-based layering): https://nx.dev/features/enforce-module-boundaries
- **eslint-plugin-boundaries**: https://github.com/javierbrea/eslint-plugin-boundaries
- **ESLint core rules:**
  - `no-restricted-imports`: https://eslint.org/docs/latest/rules/no-restricted-imports
  - `no-restricted-syntax` (AST selectors): https://eslint.org/docs/latest/rules/no-restricted-syntax
  - `no-restricted-globals`: https://eslint.org/docs/latest/rules/no-restricted-globals
- Background (Ford, Parsons, Kua), *Building Evolutionary Architectures*, where "fitness function" is defined: https://www.thoughtworks.com/insights/books/building-evolutionary-architectures

### 1.6 Closed configs, discriminated unions, exhaustiveness
- `@typescript-eslint/switch-exhaustiveness-check`: https://typescript-eslint.io/rules/switch-exhaustiveness-check/
- The `x satisfies never` / `assertNever` idiom in a default branch: a new variant breaks compilation everywhere it is not handled.
- Closed host config: a single `mount(host, config)` whose config is a discriminated union (`{kind:'leaf',…} | {kind:'block',…}`) with no callbacks or components inside. Hosts can then vary only in data.

### 1.7 Testing the checks themselves
- **ESLint `RuleTester`** and **typescript-eslint `RuleTester`**: every rule ships `valid` and `invalid` fixtures, and an `invalid` case must produce the named error:
  - https://eslint.org/docs/latest/integrate/nodejs-api#ruletester
  - https://typescript-eslint.io/packages/rule-tester/
- **Mutation testing** (StrykerJS) on the guard code: it shows that each branch of a guard is needed and that the fixtures kill the mutants: https://stryker-mutator.io/docs/stryker-js/introduction/
- **ArchUnitTS empty-match failure** (above): a rule that checks nothing is itself a failure.

### 1.8 Duplicate detection in CI
- **jscpd** (token-based copy/paste detector, threshold and min-tokens settings, exits non-zero over the threshold): https://github.com/kucherenko/jscpd
- It finds copy-paste only (Type-1/2 clones). It does **not** find two different implementations of the same idea.

### 1.9 Strangler fig vs big bang, and deletion deadlines
- Fowler, *Strangler Fig Application*: https://martinfowler.com/bliki/StranglerFigApplication.html
- Cartwright, Horn, Lewis, *Patterns of Legacy Displacement*, including "Transitional Architecture". Transitional code is meant to be removed, and the known failure mode is the transition never ending, so both systems live on: https://martinfowler.com/articles/patterns-legacy-displacement/
- Enforcement tools:
  - **Ratchets**: Betterer stores a baseline that may only improve, and CI fails when it gets worse: https://phenomnomnominal.github.io/betterer/
  - **Expiring markers**: `unicorn/expiring-todo-comments` fails lint after a date, a package version, or a dependency appears: https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/expiring-todo-comments.md
  - **Dead-code finders**: Knip reports unused files, exports and dependencies, so an old path that is no longer reachable fails CI: https://knip.dev
- Practice: while old and new coexist, a test lists the old files, and the list may only shrink (a ratchet). Past a fixed date or version it must be empty (an expiry).

### 1.10 Single owner of a host API
- This is Google's conformance per-file allowlist, `tsec` exemptions, and `no-restricted-globals`/`no-restricted-syntax` with an `overrides` block that re-enables the API in one file only.
- The ESLint form is weaker than a compiler check: it matches syntax, not types, so `const f = el.focus; f()` or `el['focus']()` can slip through unless the rule is type-aware.

## 2. Ranked mechanisms for our setup

Ranked by strength of guarantee per unit of effort, given that we already have deny-by-default, compiler-based DOM guards per module.

### Rank 1. One owner per concern, enforced by the type-aware deny-by-default guard (extend what we have)
- **What it is.** For each concern, name its one owner module, and list every primitive that concern can reach:
  - Animation: `Element.animate`, `requestAnimationFrame`, `style.transition`/`transform`, `Element.getAnimations`.
  - Measurement: `getBoundingClientRect`, `offset*`/`client*`/`scroll*` reads, `ResizeObserver`, `IntersectionObserver`.
  - Scroll: `scrollTo`, `scrollIntoView`, `scrollTop`/`scrollLeft` writes.
  - Focus: `focus`, `blur`, `activeElement`, `tabIndex`.
  - Keyboard: `keydown`/`keyup` listeners, Obsidian `Scope`, `registerDomEvent` with keys.
  - Text entry: `contenteditable`, `Selection`/`Range`, `input` events, `setSelectionRange`.
  - Drag and drop: pointer, touch and drag events, `setPointerCapture`.
  - Menus: Obsidian `Menu`, `showAtMouseEvent`.
  - Layout: none of the above; layout is covered under Rank 2.
- **Rules.** The guard resolves symbols through the type checker, not text, so aliasing and element access are covered. Only the owner may reach each primitive, and the exemption list for these concerns is empty and frozen.
- **What it guarantees.** No second implementation of any concern can reach the platform. Any other code that wants motion, focus and so on must go through the owner.
- **What it cannot catch:**
  1. Effects that live in CSS: `transition`, `@keyframes`, `:focus` tricks, `scroll-snap`, `position: sticky` layout hacks.
  2. Effects reached through Obsidian or third-party APIs we did not list. For example, `MarkdownRenderer` or a library that calls `focus()` inside itself.
  3. The owner leaking a raw primitive, such as an exported `measure(el)` that lets callers build a second layout engine on top.
  4. `any`/`unknown` casts that hide the receiver type.
- **How to cover it:**
  - (a) Run a CSS guard in `tests/styles.test.ts`, as Polaris does: `transition`, `animation`, `@keyframes`, `scroll-behavior` and `will-change` are allowed only in the selectors the motion owner owns, and durations only as `--tc-motion-*` tokens.
  - (b) Use a dependency allowlist (dependency-cruiser `allowed` mode) for npm packages, and treat the host API surface as primitives as well (`obsidian` imports, per symbol, per owner).
  - (c) Guard each owner's export surface: owners export intent-level functions or descriptors only, never `Element`, `DOMRect` or a callback that receives an element. A compiler check on exported types does this.
  - (d) Ban `as any` and `as unknown as` in `ui/`.

### Rank 2. Views produce data only, from a closed kit: no intrinsic JSX outside the kit
- **What it is.** Outside `ui/kit`, TSX may not use intrinsic elements (`<div>`, `<input>`, …). This is Atlassian's `use-primitives`, taken to deny-by-default.
  - Kit components take **closed, discriminated-union props**:
    - `<Columns spec>`, `<List items key motion>`, `<Draggable payload>`, `<TextField model>`, `<MenuButton menu={MenuModel}>`.
    - Motion is declared as data (`motion: 'reorder' | 'enter' | …`), Motion-`layout` / `matchedGeometryEffect` style.
  - Both hosts mount the same root through one `mount(host, HostConfig)`, where `HostConfig` is a discriminated union of data with no components or callbacks.
  - Every `switch` over a union is exhaustive (`satisfies never`, plus `switch-exhaustiveness-check`).
- **What it guarantees.**
  - Every list, column, field and menu on both hosts is built from the one kit component for it, so "every place uses it" holds by construction for anything that renders.
  - The two hosts differ only by config data.
  - A new variant (a new motion kind, a new menu item kind) fails compilation everywhere it is not handled.
- **What it cannot catch:**
  1. A view that should use a concern but does not. For example, a list declared without `motion`, or a field that never asks for focus. The kit makes the concern available; it cannot make a missing intent appear.
  2. Logic duplicated in plain TS, such as width arithmetic or "next focus target" computed in a view.
- **How to cover it:**
  - (a) Make the intents **required props**, never optional: `motion` and `focusKey` must be passed, with `'none'` as an explicit value. Absence then becomes a compile error.
  - (b) Ban geometry and decision logic in views. A compiler rule rejects arithmetic `BinaryExpression`s and numeric literals in `ui/views`, which matches our "UI decides nothing" rule and `uiDecides.test.ts`.
  - (c) Keep a **concern × surface matrix test**. A registry lists every surface (leaf columns, note block, each list, each menu), and an e2e table asserts each concern on each surface, on phone and desktop. A surface missing from the table fails, ArchUnitTS-style.

### Rank 3. Guards are tested: negative fixtures, mutation testing, no vacuous rules
- **What it is:**
  - Every guard rule has a fixture folder with `must-reject` cases (aliasing, element access, destructuring, CSS escape hatches, intrinsic JSX, optional intent) and `must-accept` cases, in RuleTester style.
  - Each rule must match more than zero files.
  - StrykerJS runs over the guard sources, with a mutation score of 100% on guard code.
- **What it guarantees.** The guards reject the forms we know about, a refactor of a guard cannot silently weaken it, and a renamed folder cannot make a rule check nothing.
- **What it cannot catch.** A bypass form nobody wrote a fixture for.
- **How to cover it:**
  - Every bypass found later becomes a fixture first, then a fix.
  - The Rank 6 runtime trap catches bypasses no fixture foresaw.

### Rank 4. No coexistence, or coexistence with an enforced deadline
- **What it is.**
  - Prefer replacing each concern whole, so that the old path is deleted in the same branch that adds the owner.
  - If old and new must coexist, the old files sit in a frozen list that may only shrink (a Betterer-style ratchet). An expiry (date or plugin version, `expiring-todo-comments` style) makes a non-empty list a failure.
  - Knip fails CI on unreachable files and exports.
- **What it guarantees.** The transitional duplicate is bounded in size and time, and cannot become permanent.
- **What it cannot catch.** New code added *inside* a frozen old file.
- **How to cover it.** Freeze old files by content hash plus a line budget that may only shrink, not by name. Our freeze-by-facts baseline already does this.

### Rank 5. jscpd in CI over `obsidian/ui` and `apple` vs `core`
- **What it is.** Threshold 0 with a low min-tokens setting, failing the build.
- **What it guarantees.** No copy-pasted block lives in two places.
- **What it cannot catch.** Re-implementations that do not share text. This is the main real-world risk, so jscpd is a backstop only.
- **How to cover it.** Rely on Ranks 1–2, which remove the *ability* to re-implement rather than detect the result.

### Rank 6. Runtime ownership trap in e2e (the dynamic backstop)
- **What it is.** In the test build, wrap the guarded prototypes: `HTMLElement.prototype.focus`, `Element.prototype.animate`, `scrollTo`, `getBoundingClientRect`, `addEventListener` for key and pointer types, and Obsidian `Menu`. The wrapper records the calling module (from a stack frame or a source-map lookup in our bundle) and fails the e2e run when a call from our bundle does not come from the owner. Calls made by Obsidian internals are ignored.
- **What it guarantees.** It catches what static analysis cannot see in the scenarios we exercise: dynamic access, casts, and library code we bundle.
- **What it cannot catch.** Paths no e2e scenario runs.
- **How to cover it.** The concern × surface matrix from Rank 2(c) defines the scenarios, so coverage of each surface × concern is itself checked.

## 3. What no one can guarantee, and the honest framing for the owner
- Production companies guarantee "exists once" **for primitives and sinks**: Google for DOM sinks; Atlassian, Shopify and Mozilla for tokens, layout primitives and motion. They do this by banning the primitive and sanctioning one wrapper, with a central exemption list, lint/compile enforcement and tested rules.
- No published practice claims to detect two *semantically equivalent* pieces of logic. That is undecidable in general (Rice's theorem).
- The working substitute has two parts:
  1. Make re-implementation impossible: no primitive access (Rank 1), no intrinsic JSX and no arithmetic in views (Rank 2).
  2. Make use mandatory: required intent props (Rank 2a) and the concern × surface matrix (Rank 2c).
- With Ranks 1, 2 and 3 in place, the residual risk is a bypass form that is neither in a fixture nor exercised by e2e. Rank 6 narrows that.
