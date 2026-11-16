# S1: TypeScript buildability spike for spec revision 14 (C1, C3)

Spike folder: `/private/tmp/claude-501/-Users-mdmkudryashov-projects-obsidian-my-own-plugins-obsidian-task-tracker/10b8c134-2d84-49f9-9c81-48ded7b4dd36/scratchpad/spike-ts/` (written below as `$SP`).
`node_modules` is a symlink to `.worktrees/ui-refactor-slice3-carry2/node_modules`, which itself resolves to slice3's. Versions: `typescript 7.0.2`, `esbuild 0.28.2`, `preact 11.2.0`, `vitest 5.x`, `happy-dom 21`, and node 22.22.0. No repository file was changed. slice3 was only read; it has uncommitted e2e edits by someone else.

## Verdicts

| # | Mechanism | Verdict |
|---|---|---|
| 1 | `core → pure → kit → host` composite references with `tsc -b` | **WORKS-WITH**: a per-project `emitDeclarationOnly` + `outDir`; the blocked-package stub must be an **existing** file outside every project; `tsc --noEmit` in `npm run build` becomes `tsc -b`; `core/tsconfig.json` (today `noEmit`) becomes composite |
| 1b | `KitNode` ↔ `VNode` crossing | **WORKS**: one overloaded function `cross`, zero casts; `as unknown as` occurs nowhere |
| 2 | esbuild bundles all three into one file, automatic runtime `tc-jsx` → Preact, `memo` from `preact/compat` | **WORKS**: memo verified (1 of 3 cards re-renders); cost +7.6 KB raw / +5.1 KB min / +2.1 KB gzip, already paid today because slice3's `Card.tsx` imports `preact/compat` |
| 2b | Vitest over kit TSX | **WORKS-WITH**: a Vite `alias` for `tc-jsx/jsx-runtime` **and** `tc-jsx/jsx-dev-runtime`, plus a `jsxDEV` export from the runtime (Vite does not read tsconfig `paths`) |
| 3 | `noCompute` on `typescript/unstable/sync` | **WORKS**: the fixture is exact; 167 hits in model/update/view; about 90 ms of rule time, 0.2–0.26 s total for the whole `next/` (56 files, 8.4k lines); batching makes no measurable difference |
| 4 | Contortion | (a) 58 hits / 31 sites, (b) 62 / 51, (c) 47 / 15; two helper modules (`seq.ts`, `text.ts`) clear (b) |

---

## 1. Composite project references

### Configs that worked

`core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "composite": true, "declaration": true, "emitDeclarationOnly": true, "outDir": "../.tsbuild/core",
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["es2024"], "types": [], "strict": true, "isolatedModules": true
  },
  "include": ["**/*.ts"]
}
```
`tsconfig.pure.json`:
```json
{
  "compilerOptions": {
    "composite": true, "declaration": true, "emitDeclarationOnly": true, "outDir": ".tsbuild/pure", "rootDir": ".",
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["es2024"], "types": [], "strict": true, "isolatedModules": true, "skipLibCheck": false,
    "paths": { "*": ["./blocked/none"] }
  },
  "references": [{ "path": "./core" }],
  "include": ["obsidian/ui/next/screen/**/*.ts", "obsidian/ui/next/model/**/*.ts", "obsidian/ui/next/update/**/*.ts"]
}
```
`tsconfig.kit.json` (`Screen.tsx` lives in the kit, as the spec says):
```json
{
  "compilerOptions": {
    "composite": true, "declaration": true, "emitDeclarationOnly": true, "outDir": ".tsbuild/kit", "rootDir": ".",
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["es2024"], "types": [], "strict": true, "isolatedModules": true, "skipLibCheck": false,
    "jsx": "react-jsx", "jsxImportSource": "tc-jsx",
    "paths": {
      "tc-jsx/jsx-runtime": ["./obsidian/ui/next/view/jsx/kit-jsx.ts"],
      "*": ["./blocked/none"]
    }
  },
  "references": [{ "path": "./tsconfig.pure.json" }],
  "include": ["obsidian/ui/next/view/**/*.ts", "obsidian/ui/next/view/**/*.tsx"],
  "exclude": ["obsidian/ui/next/view/jsx/jsx-runtime.ts"]
}
```
`tsconfig.json`, the host. esbuild reads it too, because it is the nearest file named `tsconfig.json`:
```json
{
  "compilerOptions": {
    "composite": true, "declaration": true, "emitDeclarationOnly": true, "outDir": ".tsbuild/host", "rootDir": ".",
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["es2024", "DOM", "DOM.Iterable"], "types": [], "strict": true, "isolatedModules": true, "skipLibCheck": true,
    "jsx": "react-jsx", "jsxImportSource": "tc-jsx",
    "paths": { "tc-jsx/jsx-runtime": ["./obsidian/ui/next/view/jsx/jsx-runtime.ts"] }
  },
  "references": [{ "path": "./tsconfig.kit.json" }],
  "include": ["obsidian/ui/next/engines/**/*.ts", "obsidian/ui/next/host/**/*.ts", "obsidian/ui/next/view/jsx/jsx-runtime.ts", "obsidian/main.ts"]
}
```
`blocked/none.ts`, which is in no project's `include`:
```ts
// Not in any project: a package a project does not name resolves here, and the import fails with TS6307.
export {};
```

The JSX type view, `view/jsx/kit-jsx.ts` (kit, with no Preact):
```ts
declare const kitNode: unique symbol;
export interface KitNode { readonly [kitNode]: true }
export type KitChild = KitNode | string | null | false | readonly KitChild[];
export type KitClass = `tc-n-${string}` | `is-${string}`;
interface Base { readonly class?: KitClass; readonly children?: KitChild; readonly key?: string }
type Motion = { readonly motion: string | "none" };
export declare namespace JSX {
	type Element = KitNode;
	interface ElementChildrenAttribute { children: {} }
	interface IntrinsicAttributes { readonly key?: string }
	interface IntrinsicElements { div: Base & Motion; span: Base; ul: Base & Motion; li: Base & Motion }
}
export declare function jsx(type: unknown, props: unknown, key?: string): KitNode;
export declare function jsxs(type: unknown, props: unknown, key?: string): KitNode;
export declare const Fragment: unique symbol;
```

The real runtime, `view/jsx/jsx-runtime.ts` (host). It holds the **one crossing**, with no cast:
```ts
import { Fragment, type FunctionComponent, type VNode } from "preact";
import { jsx as preactJsx } from "preact/jsx-runtime";
import { memo } from "preact/compat";
import type { KitNode } from "./kit-jsx";
export type { JSX } from "./kit-jsx";
export { Fragment };

/** The one crossing between the kit's opaque node and Preact's: an overload pair, no cast. */
export function cross(n: KitNode): VNode;
export function cross(n: VNode): KitNode;
export function cross(n: KitNode | VNode): KitNode | VNode {
	return n;
}

type KitComponent<P extends object> = (props: P) => KitNode;
const memoised = new WeakMap<KitComponent<never>, FunctionComponent<never>>();

/** Each kit component becomes one memoised Preact component, made once and kept. */
function preactOf<P extends object>(type: KitComponent<P>): FunctionComponent<P> {
	const kept = memoised.get(type) as FunctionComponent<P> | undefined;
	if (kept) return kept;
	const made = memo((props: P) => cross(type(props)));
	memoised.set(type, made as FunctionComponent<never>);
	return made;
}

export function jsx<P extends object>(type: string | KitComponent<P>, props: P, key?: string): KitNode {
	return typeof type === "string" ? cross(preactJsx(type, props, key)) : cross(preactJsx(preactOf(type), props, key));
}
export const jsxs = jsx;
export const jsxDEV = jsx; // for Vitest/Vite, which compiles with the dev runtime
```
The render engine is `preactRender(cross(jsx(Screen, { model })), el)`. Kit components return `KitNode`. Because of that, a kit component is not a Preact component, and `preactOf` wraps it once, which crosses its result and memoises it in the same step. `grep -rn 'as unknown as' obsidian core` finds nothing (exit 1).

The overload trick is legal: each overload is assignable to the implementation signature `(KitNode | VNode) => KitNode | VNode`, and `return n` type-checks. It is still a cast in effect. Its safety rests on `cross` being imported only by the runtime and the render engine. That is a one-line checker rule, which the spike did not write.

### `tsc -b` works
```
$ trash .tsbuild; /usr/bin/time -p ./node_modules/.bin/tsc -b
real 0.28   EXIT=0
$ ./node_modules/.bin/tsc -b --verbose        # no-op rebuild, 0.12 s
Projects in this build: core/tsconfig.json, tsconfig.pure.json, tsconfig.kit.json, tsconfig.json
Project 'core/tsconfig.json' is up to date because newest input 'core/rules.ts' is older than output '.tsbuild/core/tsconfig.tsbuildinfo'
... (all four up to date)
```
`tsc -p tsconfig.json --listFiles` shows the host reading every lower project **as `.d.ts`**: `.tsbuild/kit/.../Screen.d.ts`, `.tsbuild/pure/.../model.d.ts`, `.tsbuild/core/rules.d.ts`. That holds for pure too, even though the host references only kit: references are followed transitively.

The emitted kit declaration keeps the brand: `export declare function Screen({ model }: {...}): import("./jsx/kit-jsx").KitNode;`

### Emit settings: each case run on a copy (`cases/run.sh <name> <setup>`)

| Case | Result |
|---|---|
| `noEmit` in the referenced pure project | `error TS6310: Referenced project 'tsconfig.pure.json' may not disable emit.` A middle project must emit. |
| pure without `composite` | `error TS6306: Referenced project 'tsconfig.pure.json' must have setting "composite": true.` |
| pure without `outDir` | EXIT 0, but `update.d.ts`, `rules.d.ts` and `model.d.ts` are written **beside the sources**. An `outDir` per project is needed. |
| pure without `emitDeclarationOnly` | EXIT 0, and it emits `.js` files nobody uses. `emitDeclarationOnly` is wanted, since esbuild does the JS. |
| `noEmit` in the host (the leaf) | EXIT 0. The leaf may be `noEmit`. |
| host `include` overlapping pure's (`obsidian/**/*.ts`) | EXIT 0. Files a referenced project owns are read as its `.d.ts`, never compiled twice. |
| `tsc -p tsconfig.json --noEmit` before `tsc -b` | `error TS6305: Output file '.tsbuild/pure/.../update.d.ts' has not been built from source file ...`. `npm run build`'s `tsc --noEmit` must become `tsc -b`. |

In the repository, `core/tsconfig.json` today `extends ../tsconfig.json` with `noEmit`. It must become composite with `emitDeclarationOnly` and an `outDir`, and `.tsbuild/` goes in `.gitignore`.

### Pure and kit cannot name the host

| Case | Result |
|---|---|
| pure imports `preact/hooks`, with `paths` pointing at a **missing** stub (`preact/*`) | **EXIT 0, a leak.** `--traceResolution`: `Trying substitution './blocked/none'` ... `does not exist`, then TypeScript falls back to `node_modules`. |
| the same with no `paths` at all | **EXIT 0, a leak.** Preact's `.d.ts` files compile under `lib: es2024` with `skipLibCheck: false`. |
| `paths: {"*": ["./blocked/none"]}` with an **existing** `blocked/none.ts` outside every include | `error TS6307: File '.../blocked/none.ts' is not listed within the file list of project 'tsconfig.pure.json'` plus `TS2305: Module '"preact/hooks"' has no exported member 'useState'`. This blocks named imports, `import * as`, side-effect `import "preact"` and `import("preact").VNode`, and `vitest` the same way. Deny by default: every bare package goes to the stub unless `paths` names it. |
| pure imports `../../../../node_modules/preact/hooks/src/index.js` (relative) | **EXIT 0, a leak.** Needs a checker rule: no relative import leaving the project's roots. |
| `<div>` in a pure `.ts` | `TS1005: '>' expected` (a syntax error) |
| `<div>` in a pure `.tsx` (if the include allowed `.tsx`) | `TS17004: Cannot use JSX unless the '--jsx' flag is provided.` |
| `document`, `setTimeout` in pure | `TS2584: Cannot find name 'document'`, `TS2304: Cannot find name 'setTimeout'` |
| pure imports `../view/Card` (upward) | `TS6142: Module '../view/Card' was resolved to '.../Card.tsx', but '--jsx' is not set.` A pure `.ts` file importing a kit `.ts` file would get TS6307. |
| kit imports `./jsx/jsx-runtime` (host) | `TS6307: File '.../jsx-runtime.ts' is not listed within the file list of project 'tsconfig.kit.json'` |
| kit imports `preact/hooks` (with the `*` stub) | TS2305 + TS6307 |
| kit `<button>`; `<div style>`; `class="red"`; `<div>` without `motion`; `onClick` | `TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'`; `Property 'style' does not exist`; `Type '"red"' is not assignable to type 'KitClass'`; `Property 'motion' is missing`; `Property 'onClick' does not exist` |
| kit `<Card task={null} selected="yes"/>`, `<Card/>` | component props are checked (TS2322) |
| kit forges `const k: KitNode = { type: "div", props: {} }` | `TS2353: 'type' does not exist in type 'KitNode'` |
| host `k as VNode` | `TS2352: Conversion of type 'KitNode' to type 'VNode<{}>' may be a mistake ...`. Only `cross` converts. |

### The checker API and project references
`typescript/unstable/sync` opening `tsconfig.kit.json` loads the **sources** of the referenced projects (`program files: kit-jsx.ts core/rules.ts Card.tsx model.ts Screen.tsx`) and gives 0 diagnostics with `.tsbuild` deleted. The guards need no `tsc -b` first (`checker/refprobe.mjs`).

## 2. esbuild: one bundle

`$SP/build.mjs`: `esbuild.build({ entryPoints, bundle: true, format: "cjs", target: "es2020", external: ["obsidian"], metafile: true })` with no JSX option. esbuild takes `jsx: react-jsx`, `jsxImportSource: tc-jsx` and the `paths` from the root `tsconfig.json` for every file, kit files included. It ignores `tsconfig.kit.json`, since only files named `tsconfig.json` count. So the kit compiles against the type view in `tsc` and against the real runtime in the bundle.

```
$ node build.mjs spiketest/entry.ts dist/spike.cjs
dist/spike.cjs: 27315 bytes
 16125  nm/preact/dist/preact.mjs
   489  nm/preact/jsx-runtime/dist/jsxRuntime.mjs
  4302  nm/preact/compat/dist/compat.mjs
  2468  nm/preact/hooks/dist/hooks.mjs        <- pulled in by compat
   403  obsidian/ui/next/view/jsx/jsx-runtime.ts
   237  obsidian/ui/next/view/Card.tsx
   310  obsidian/ui/next/view/Screen.tsx
    80  obsidian/ui/next/engines/render.ts
   175  obsidian/ui/next/update/update.ts
   278  obsidian/main.ts  (+ spike probe files)
$ node spiketest/run.mjs $SP/dist/spike.cjs        # happy-dom
boot html: <div motion="none" class="tc-n-screen"><ul motion="none" class="tc-n-list"><li motion="card" class="tc-n-card">...<li motion="card" class="is-selected">...
CountedCard calls: first render 3, re-render after selecting b: 1 (memo works if 1)
```
memo cost: the same entry with and without `memo` (`variants/build-variant.mjs`):

| | raw | minified | gzip (min) |
|---|---|---|---|
| with `preact/compat` memo | 26 710 | 17 395 | 7 329 |
| without | 19 062 | 12 248 | 5 261 |
| **difference** | **+7 648** | **+5 147** | **+2 068** |

slice3 already imports `memo` and `createPortal` from `preact/compat` (`view/Card.tsx`, `view/BlockRoot.tsx`), so the marginal cost against today's `main.js` (1.4 MB, not minified) is 0.

The metafile's `inputs` give exactly the list the spec's partition check needs, with every input under one project's roots.

Notes:
- Kit-only props such as `motion` reach the DOM as plain attributes (`motion="none"`). The render engine's turning intents into `data-*` attributes is not part of `tc-jsx` here.
- Classic runtime: not tried. Automatic works and is what the spec names.

Vitest (`vt/screen.test.ts`, happy-dom): without an alias, `Failed to resolve import "tc-jsx/jsx-dev-runtime"`. With `resolve.alias: [{ find: /^tc-jsx\/jsx-(dev-)?runtime$/, replacement: <runtime path> }]` and `export const jsxDEV = jsx`, it gives `Tests 1 passed`.

## 3. `noCompute` on `typescript/unstable/sync`

Rule: `$SP/checker/noCompute.mjs <root> <tsconfig> batched|unbatched <out.json> <dirs…>`. It opens the project as `tests/guards/TsProgram.ts` does (`new API({cwd})`, `updateSnapshot({openProjects})`), walks each `SourceFile` and collects candidates. It types the operands with **one** `checker.getTypeAtLocation(nodes[])` per file and resolves `Math`/`Date` with one `getSymbolAtLocation(nodes[])`, keeping only symbols declared in `lib.*.d.ts`.

- **arith**: `+ - * / % **` and compound assignments, when an operand's type has `TypeFlags.NumberLike|BigIntLike` (through unions and intersections, so branded numbers count). `+` with a string operand is allowed.
- **order**: `< > <= >=` with a numeric operand.
- **unary**: `++`/`--` and `-x` on a number; `+x` on anything, since it converts. `-1` is a literal and is allowed.
- **math / date**: any use of the global `Math` or `Date`.
- **index**: `xs[e]` where `e` is not a literal and is numeric.
- **seqcall**: `.at/.slice/.splice/.with/.fill` with a non-literal argument. `seqcall-string` marks the same calls on a string receiver.

Fixture (`checker/fx/src/fx.ts`): it reports `n + 1`, `xs.length - 1`, `p * 2` (branded `Px`), `n < 3`, `-n`, `+s`, `Math.max`, `Date.now`, `xs[i]`, `xs.slice(i)`, `r11++`, `(maybe ?? 0) >= 1`, `n % 2`, and `xs[n - 1]` (twice). It accepts `"a" + s`, `s + n`, `n === 0`, `xs.length !== 0`, `xs[0]`, `-1`, `xs.slice(1)`, `{Math:1}.Math`. That is 15 of 15 expected, with no false positive.

Gaps the prototype leaves open: `Number(x)`, `parseInt`, `parseFloat` and `.toFixed` are conversions it does not catch (monthGrid uses `Number(month.slice(5,7))`). Add them as calls.

### Run on slice3 (model/update/view, via slice3's own `tsconfig.json`)
```
$ node checker/noCompute.mjs $S3 $S3/tsconfig.json batched   hits.json obsidian/ui/next/model obsidian/ui/next/update obsidian/ui/next/view
files=44 hits=167 mode=batched   rpcTypeCalls=34  open=162ms rule=62ms total=224ms
$ ... unbatched
files=44 hits=167 mode=unbatched rpcTypeCalls=323 open=128ms rule=64ms total=191ms     (identical hits)
by rule: order 47, seqcall 18, arith 73, math 16, date 2, seqcall-string 7, index 3, unary 1
```
Per file:
```
model/carryPlace.ts 45   model/entry.ts 24   update/carry.ts 20   model/taskMenu.ts 12   model/monthGrid.ts 11
update/select.ts 7   model/carryView.ts 6   update/acts.ts 5   update/search.ts 5   view/menu/TaskMenu.tsx 4
update/full.ts 4   model/search.ts 3   update/block.ts 3   update/entry.ts 3   model/block.ts 2   model/card.ts 2
view/Card.tsx 2   view/search/Search.tsx 2   model/lists.ts 1   update/fullActs.ts 1   update/menu.ts 1
update/section.ts 1   view/carry/CarryFloat.tsx 1   view/entry/Bar.tsx 1   view/full/FullCard.tsx 1
```
Examples:
```
model/carryPlace.ts:58  order  x >= l.left && x < l.left + l.width && y >= l.top && y < l.bottom
model/carryPlace.ts:110 math   Math.hypot(x - (ring.left + ring.width / 2), ...) < ring.width / 2 + PLUS_RING_REACH
model/carryPlace.ts:138 math   Math.abs(top - y) < Math.abs((slots.tops.slice(best, best + 1).find(() => true) ?? top) - y)
model/entry.ts:274      math   Math.ceil(tiles.length / Math.ceil(tiles.length / TILES_PER_ROW))
model/monthGrid.ts:34   date   new Date(year, index, 1).getDay
model/search.ts:82      math   Math.min(hits.length - 1, Math.max(0, search.picked))
update/select.ts:39     seqcall column.slice(Math.min(from, to), Math.max(from, to) + 1)
update/block.ts:31      arith  before.motion.seq + 1
view/Card.tsx:241       index  b.passes[i]
view/search/Search.tsx:95 unary row++
```
Full list: `$SP/checker/hits-batched.json` (`python3 checker/show.py <json>`).

### Whole `next/` folder (timing; drivers and host are not pure and are counted only for size)
```
files=56 hits=427 mode=batched   rpcTypeCalls=44  total=201 / 219 / 262 ms   (rule 83–102 ms)
files=56 hits=427 mode=unbatched rpcTypeCalls=816 total=210 / 257 / 216 ms   (rule 96–110 ms)
/usr/bin/time: real 0.38 s (node start included)
hits by folder: drivers 250, model 106, update 50, recognizers 7, view 11, host 3
```
**Batching does not matter at this size.** The checker type-checks lazily once, and each extra sync RPC costs about 0.1 ms, so 816 against 44 calls is under 20 ms. Batching per file stays as the default anyway, since it is free.

## 4. How contorted: classification of the 167 hits

`checker/classify.py` maps every `file:line` to a class, with nothing unclassified:

| Class | Hits | Sites | What |
|---|---|---|---|
| **(a)** a decision for the core | 58 | 31 | month grid and month arithmetic (`monthGrid.ts`, 11); `tileRows` "rows of at most three as even as they go", **duplicated** in `model/entry.ts:274` and `model/taskMenu.ts:268`; whether status tiles are "four" (`> 3`); where the entry's field stands (`sectionSpan`, `fieldIndex`) and which plates it removes; a card's subtree (`update/carry.ts:39`); a section's rows up to the next head; branch passes (`lists.ts:104`); the search's step and clamp (`model/search.ts:82`, `update/search.ts:41`); the Shift range (`update/select.ts:39`); how many colours a card shows and when it stripes (`card.ts:81,89`) |
| **(b)** plumbing | 62 | 51 | emptiness and count (`length > 0`, `> 1`, `level > 0`): 22; index, neighbour and split (`slice(i,i+1).find(()=>true)`, pairwise compare by `i`, parallel arrays, splitting at an index the measure gave, splicing at an index): 23; string key parsing (`slice("bar:".length)`, split at `:`): 10; sequence stamps and counters (`seq + 1`, `fields + 1`, `row++`): 7 |
| **(c)** geometry | 47 | 15 | finger inside a list's box; finger near the plus ring (`Math.hypot`); drop line's left, right and y; grab offset `at.x - box.left`; line width `max(0, r - l)`; list end `top + height`; nearest section slot (an outcome, so per spec a core rule) |

All (c) sites sit in two files (`model/carryPlace.ts`, `model/carryView.ts`) and three spots in `update/carry.ts`. They map onto the spec's `within`, `delta`, `distance` and the core's `placeAt`, `gapAt` and slot rules. Today the `.slice(i, i + 1).find(() => true)` idiom already shows code bending around a guard (`noUncheckedIndexedAccess` style).

### Minimal helper set for (b)
Two exempt modules, in the guards' closure. They answer only questions about a sequence's or a key's shape:

`screen/seq.ts`: `first`, `last`, `isMany(xs)` (more than one), `sameSeq(a, b, eq)`, `zip(a, b)`, `after(xs, pred)`, `splitWhere(xs, pred)`, `numbered(xs, from?)`.
`screen/text.ts`: `stripPrefix(s, prefix): string | null`, `splitOnce(s, sep): [string, string] | null`.

The rest of (b) needs no helper:
- emptiness becomes `xs.length !== 0` or `=== 0`, which the rule allows (about 15 sites);
- sequence stamps move to the store, as the spec already says ("stamped by the store on each loop"): `seq + 1` in `block.ts:31`, `full.ts:155`, `menu.ts:19`, and `focus + 1` / `fields + 1` in `update/entry.ts`;
- splicing at an index the core gives (`withEntry`) becomes "the core gives the rows with the field in place" or `splitWhere` on the row the core names.

Two rewrites (`$SP/checker/rw/src/update/before.ts` → `after.ts`). `tsc` EXIT 0. **before: 8 hits, after: 0.** `seq.ts` and `text.ts` hold 18 hits and are the exempt modules.

Example 1, `update/block.ts` `sameRows` and `view/Card.tsx` `sameBranch`:
```ts
// before (hits: arith i + 1, seqcall slice(i, i+1), index b.passes[i])
return x.length === y.length && x.every((row, i) => {
	const other = y.slice(i, i + 1).find(() => true);
	if (!other || other.kind !== row.kind || other.key !== row.key) return false;
	return row.kind !== "card" || (other.kind === "card" && other.face === row.face && other.level === row.level);
});
... a.passes.length === b.passes.length && a.passes.every((p, i) => p === b.passes[i])
// after (0 hits)
const sameRow = (row: Row, other: Row): boolean =>
	other.kind === row.kind && other.key === row.key && (row.kind !== "card" || (other.face === row.face && other.level === row.level));
export const sameRows = (x: readonly Row[], y: readonly Row[]): boolean => sameSeq(x, y, sameRow);
... a.last === b.last && sameSeq(a.passes, b.passes, (p, q) => p === q)
```
Example 2, `update/acts.ts` `linkOf` and the `bar:` / `menu:` acts:
```ts
// before (hits: value.slice(0, at), value.slice(at + 1), at + 1, act.act.slice("bar:".length), …slice("menu:".length))
const at = value.indexOf(":");
const kind = value.slice(0, at);
return kind === "note" || kind === "url" ? { kind: "linkTapped", link: { kind, target: value.slice(at + 1) } } : null;
if (act.act.startsWith("bar:")) return { kind: "entry", act: act.act.slice("bar:".length), value: act.value };
// after (0 hits)
const parts = value === null ? null : splitOnce(value, ":");
if (!parts) return null;
const [kind, target] = parts;
return kind === "note" || kind === "url" ? { kind: "linkTapped", link: { kind, target } } : null;
const bar = stripPrefix(act.act, "bar:");
if (bar !== null) return { kind: "entry", act: bar, value: act.value };
```
In both, the rewrite is shorter and reads more plainly than the original. (b) does not contort the code once the two modules exist. The contortion risk sits in (c) and (a), and the spec already moves those to the gateway and the core.

## Files
- Spike projects: `$SP/core`, `$SP/tsconfig.{pure,kit}.json`, `$SP/tsconfig.json`, `$SP/obsidian/…`, `$SP/blocked/none.ts`
- Negative cases: `$SP/cases/run.sh`, `$SP/cases/w-*`
- Bundle: `$SP/build.mjs`, `$SP/spiketest/`, `$SP/variants/`, `$SP/dist/`, Vitest `$SP/vitest.config.mts`, `$SP/vt/`
- Checker: `$SP/checker/noCompute.mjs`, `fx/`, `rw/`, `classify.py`, `show.py`, `refprobe.mjs`, `hits-batched.json`, `all-batched.json`
