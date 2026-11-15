import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as contracts from "../core/application/contracts";
import { type Analysis, analyse, NEXT, NOT_PURE, placeOf, PURE_PARTS, PURE_RULES, type Source } from "./uiRules";

/**
 * The new screens keep to the spec's guards (§Guards), read by the compiler: the pure parts in a project without the DOM,
 * the rest by every name and member resolved to its declaration. The old screen outside `next/` is frozen instead
 * (`uiFreeze`). The self-tests lay bad samples where a part's file would be, in memory, and each must be caught.
 */

describe("obsidian/ui/next keeps to its rules", () => {
	let tree: Analysis;
	beforeAll(() => {
		tree = analyse();
	});

	it("breaks no rule", () => {
		expect(tree.violations).toEqual([]);
	});

	it("handles every message union exhaustively in update/", () => {
		if (tree.declaresMsg.length === 0) return;
		expect(tree.provenInUpdate, `a switch in update/ over ${tree.declaresMsg.join(", ")} ending in assertNever`).toBeGreaterThan(0);
	});
});

/** What a sample is handed outside the pure parts: an element, a window, a document… from `tests/guards/given.ts`. */
const GIVEN = "tests/guards/given.ts";
const HOST_PREAMBLE = [
	`import { assertNever } from "../model/assertNever";`,
	`import { el, win, doc, target, f, flag, x, go, untyped } from "../../../../tests/guards/given";`,
	"void [el, win, doc, target, f, flag, x, go, untyped];",
	`type SampleMsg = { kind: "a" } | { kind: "b" }; declare const msg: SampleMsg; declare const m: SampleMsg;`,
].join("\n");
const PURE_PREAMBLE = [
	`import { assertNever } from "../model/assertNever";`,
	"declare const el: unknown; declare const f: () => void; declare const flag: boolean; declare const x: string; declare function go(): void;",
	`type SampleMsg = { kind: "a" } | { kind: "b" }; declare const msg: SampleMsg; declare const m: SampleMsg;`,
].join("\n");

let counter = 0;
/** A sample file at `part` (`update`, `view`, `drivers/motion`, `host`…): its body runs inside a function; `top` sits at the top. */
const sample = (part: string, body: string, top = "", ext = part === "view" ? "tsx" : "ts"): Source => {
	const pure = (PURE_PARTS as readonly string[]).includes(part);
	const depth = part.split("/").length;
	const up = (s: string) => (depth === 2 ? s.replaceAll('"../', '"../../') : s);
	const runtime = part === "host" ? `import type { Runtime } from "../../../runtime/Runtime";\ndeclare const runtime: Runtime;` : "declare const runtime: unknown;";
	const preamble = up(pure ? PURE_PREAMBLE : `${HOST_PREAMBLE}\n${runtime}`);
	return { path: `${NEXT}/${part}/__sample${++counter}.${ext}`, text: `${up(top)}\n${preamble}\nexport function sample(): unknown {\n${body}\nreturn undefined;\n}\nvoid [assertNever];\n` };
};

interface Case {
	readonly name: string;
	readonly file: Source;
	/** What the violation must say; null: the sample is clean. */
	readonly caught: RegExp | null;
}
const bad = (name: string, part: string, body: string, caught: RegExp, top = ""): Case => ({ name, file: sample(part, body, top), caught });
const clean = (name: string, part: string, body: string, top = ""): Case => ({ name, file: sample(part, body, top), caught: null });
const file = (name: string, part: string, ext: string, caught: RegExp): Case => ({ name, file: sample(part, "", "", ext), caught });

const CASES: readonly Case[] = [
	// The review's probe, each a hole of the text guard.
	bad("a window inside a template literal (pure)", "update", "const w = `${window.innerWidth}px`; return w;", /window/),
	bad("geometry inside a template literal (pure)", "update", "return `${(el as any).getBoundingClientRect().top}`;", /purity|untyped/),
	bad("a timer inside a template literal", "host", "return `${setTimeout(f, 1)}`;", /a timer/),
	bad("a document in a conditional (pure)", "update", "return flag ? document : null;", /document/),
	bad("Object.assign onto a style", "host", "Object.assign(el.style, { height: '3px' });", /inline style/),
	bad("a style through setAttribute", "host", "el.setAttribute('style', 'height:3px');", /inline style/),
	bad("a style through an alias", "host", "const s = el.style; s.height = '3px';", /inline style.*height|inline style/),
	bad("a class list through an alias", "host", "const cl = el.classList; cl.add('is-x');", /class or dataset write/),
	bad("a class list spread", "drivers/input", "if ([...el.classList].includes('is-open')) go();", /class list taken whole/),
	bad("a class list's value", "drivers/chrome", "if (el.classList.value.includes('is-open')) go();", /class read/),
	bad("a selector in a variable", "drivers/input", "const sel = '.tc-card'; el.closest(sel);", /selector/),
	bad("a selector in a template", "drivers/input", "if (el.matches(`.is-${x}`)) go();", /selector/),
	bad("a message switch not named msg", "update", "switch (m.kind) { case 'a': return 1; }", /messages/),
	bad("a message switch over a field it lacks (the review's probe)", "update", "switch (msg.type) { case 'a': return 1; }", /messages/),
	bad("a message switch over a destructured kind", "update", "const { kind } = msg; switch (kind) { case 'a': return 1; }", /messages/),
	bad("el.scroll", "host", "el.scroll({ top: 3 });", /a scroll/),
	bad("scrollIntoViewIfNeeded (not in the DOM's types: untyped)", "host", "(el as any).scrollIntoViewIfNeeded();", /untyped/),
	bad("innerWidth and elementFromPoint", "host", "const w = win.innerWidth; const e = doc.elementFromPoint(1, 2); return [w, e];", /geometry read[\s\S]*geometry read/),
	bad("a frame through a string key", "host", "const raf = win['requestAnimationFrame']; raf(() => 0);", /a timer/),
	bad("a style in a JSX spread", "view", "return <div {...{ style: { height: 3 } }} />;", /JSX style/),
	bad("an element's document (pure)", "update", "const doc = el.ownerDocument; return doc.body;", /purity/),
	bad("a handler property", "view", "el.onpointerdown = f;", /listener/),
	bad("comment-like strings around a window", "host", 'const a = "/*"; win.focus(); window.name; const b = "*/"; return [a, b];', /bare window/),
	bad("a style write in the chrome driver", "drivers/chrome", "el.classList.add('is-on'); el.style.height = '1px';", /inline style/),
	// What the text guard already caught, kept.
	bad("a document in a pure part", "update", "return document.body;", /document/),
	bad("Obsidian in a pure part", "model", "return Notice;", /obsidian/, `import { Notice } from "obsidian";`),
	bad("a driver in a pure part", "recognizers", "return motion;", /drivers/, `import { motion } from "../drivers/motion/x";`),
	bad("the clock in a pure part", "update", "return Date.now();", /clock or chance/),
	bad("a new Date() in a pure part", "update", "return new Date();", /clock or chance/),
	bad("chance in a pure part", "update", "return Math.random();", /clock or chance/),
	bad("a listener in a pure part", "model", "(el as any).addEventListener('x', f);", /purity|untyped/),
	bad("the door", "host", "return callDoor;", /core's|door/, `import { callDoor } from "../../../../core/application/PhoneCalls";`),
	bad("a session of the core", "update", "return QuickEntrySession;", /not a pure rule/, `import { QuickEntrySession } from "../../../../core/application/contracts";`),
	bad("the replica through a member", "host", "return runtime.replica.state;", /replica/),
	bad("the replica through a destructuring", "host", "const { replica } = runtime; return replica;", /replica/),
	bad("the runtime's insides", "host", "return Replica;", /runtime's/, `import { Replica } from "../../../runtime/replica/Replica";`),
	bad("a pure rule in a view", "view", "return swipeLanding;", /only selectors/, `import { swipeLanding } from "../../../../core/application/contracts";`),
	bad("a timer in a host", "host", "setTimeout(f, 10);", /a timer/),
	bad("a frame in a view", "view", "win.requestAnimationFrame(f);", /a timer/),
	bad("an animation outside motion", "drivers/chrome", "el.animate([], 200);", /animation/),
	bad("a geometry read outside measure", "drivers/scroll", "return el.getBoundingClientRect();", /geometry read/),
	bad("a scroll write outside scroll", "drivers/measure", "el.scrollTop = 10;", /a scroll/),
	bad("a focus outside focus", "drivers/keys", "el.focus({ preventScroll: true });", /a focus/),
	bad("an observer outside measure", "drivers/motion", "new ResizeObserver(f);", /observer/),
	bad("a class write outside chrome", "drivers/motion", "el.classList.add('is-on');", /class or dataset write/),
	bad("a dataset write outside chrome", "drivers/motion", "el.dataset.state = 'x';", /class or dataset write/),
	bad("a class attribute outside chrome", "drivers/focus", "el.setAttribute('class', 'x');", /class written whole/),
	bad("an Obsidian class write outside chrome", "drivers/keys", "el.toggleClass('is-x', flag);", /class or dataset write/),
	bad("a JSX style", "view", "return <div style={{ height: 3 }} />;", /JSX style/),
	bad("a class read", "drivers/input", "if (el.classList.contains('is-open')) go();", /class read/),
	bad("an Obsidian class read", "drivers/chrome", "if (el.hasClass('tc-card')) go();", /class read/),
	bad("a class selector", "drivers/input", "return target.closest('.tc-card');", /selector/),
	bad("a className read", "drivers/chrome", "return el.className;", /class read/),
	bad("a bare document in a driver", "drivers/chrome", "document.body.toggleClass('is-x', flag);", /bare window/),
	bad("an attribute named at run time", "drivers/chrome", "el.setAttribute(x, 'y');", /run time/),
	bad("an untyped access", "drivers/motion", "untyped.style.height = '1px';", /untyped/),
	bad("chrome writing a class that is not an is- state", "drivers/chrome", "el.classList.add('tc-n-card');", /not a literal is-/),
	bad("chrome writing a class named at run time", "drivers/chrome", "el.toggleClass(x, flag);", /not a literal is-/),
	bad("a file in no part", "drivers/paint", "", /no driver/),
	// The re-review's probes: each a hole of the allow-by-exception guard, closed by denying by default.
	bad("a document in a shorthand property", "host", "return { document };", /bare window/),
	bad("a frame in a shorthand property", "host", "return { requestAnimationFrame };", /a timer/),
	bad("globalThis in a host", "host", "return globalThis.document;", /bare window|door/),
	bad("globalThis in a driver", "drivers/motion", "const g = globalThis; void g;", /door/),
	bad("globalThis in a pure part", "update", "return globalThis;", /door/),
	bad("an element given a type literal of its own", "host", "const s: { style: { height: string } } = el; s.style.height = '3px';", /leaving the host's types/),
	bad("an element cast to a type of its own", "host", "(el as unknown as { hidden: boolean }).hidden = true;", /leaving the host's types/),
	bad("an element laundered through a generic helper", "host", "function keep<T>(v: T): T { return v; } const k = keep(el); void k;", /leaving the host's types/),
	bad("an element list given a type of its own", "host", "const list = [el]; const out: { hidden: boolean }[] = list; void out;", /leaving the host's types/),
	bad("an element into unknown in a driver", "drivers/motion", "const d: unknown = el; void d;", /leaving the host's types/),
	bad("an element into {} in a driver", "drivers/motion", "void Object.entries(el);", /leaving the host's types/),
	bad("Reflect.get on an element", "drivers/motion", "return Reflect.get(el, 'style');", /door/),
	bad("Reflect.get in a host", "host", "return Reflect.get(el, 'style');", /door/),
	bad("new Function", "drivers/motion", "return new Function('return document')();", /door/),
	bad("eval", "drivers/motion", "return eval('document');", /door/),
	bad("a style attribute in another case", "host", "el.setAttribute('Style', 'height:3px');", /inline style/),
	bad("a class attribute in capitals", "drivers/motion", "el.setAttribute('CLASS', 'tc-x');", /class written whole/),
	bad("a data attribute in another case outside chrome", "drivers/motion", "el.setAttribute('Data-x', '1');", /class or dataset write/),
	bad("chrome adding a class beside a state", "drivers/chrome", "el.classList.add('is-a', 'tc-n-card');", /not a literal is-/),
	bad("chrome replacing a state with a class", "drivers/chrome", "el.classList.replace('is-a', 'tc-n-card');", /not a literal is-/),
	bad("chrome writing the class attribute", "drivers/chrome", "el.setAttribute('class', 'is-a');", /class written whole/),
	bad("chrome writing className", "drivers/chrome", "el.className = 'is-a';", /class written whole/),
	bad("chrome writing the class list's value", "drivers/chrome", "el.classList.value = 'is-a';", /class written whole/),
	bad("chrome writing classes from a list", "drivers/chrome", "el.addClasses(['is-a']);", /class written whole/),
	bad("a class attribute selector", "drivers/input", "return el.querySelector('[class=\"tc-card\"]');", /selector/),
	bad("a class attribute selector in capitals", "drivers/input", "return el.querySelector('[CLASS~=tc-card]');", /selector/),
	bad("a class inside :is()", "drivers/input", "return el.querySelector('div:is(.tc-card)');", /selector/),
	bad("innerHTML", "host", "el.innerHTML = '<div style=\"height:3px\"></div>';", /deny by default/),
	bad("innerHTML in a driver", "drivers/motion", "el.innerHTML = 'x';", /deny by default/),
	bad("a style through its attribute node", "host", "el.getAttributeNode('style')!.value = 'height:3px';", /inline style/),
	bad("hidden", "host", "el.hidden = true;", /deny by default/),
	bad("hidden in a driver", "drivers/motion", "el.hidden = true;", /deny by default/),
	bad("a hidden attribute", "host", "el.setAttribute('hidden', '');", /deny by default/),
	bad("hidden through a ref in a view", "view", "return <div ref={(e: HTMLDivElement | null) => { if (e) e.hidden = true; }} />;", /deny by default/),
	bad("appendChild in a host", "host", "el.ownerDocument.body.appendChild(el);", /deny by default/),
	bad("an element's window in a host", "host", "return el.ownerDocument.defaultView;", /deny by default/),
	bad("local storage through the element's window", "host", "return el.ownerDocument.defaultView!.localStorage;", /bare window|deny by default/),
	bad("local storage through the element's window in a driver", "drivers/motion", "return el.ownerDocument.defaultView!.localStorage;", /bare window/),
	bad("the window's width in a host", "host", "const w = el.ownerDocument.defaultView!; return w.innerWidth;", /deny by default|geometry/),
	bad("console in a view", "view", "console.log(1);", /deny by default/),
	bad("Node's process in a driver", "drivers/motion", "return process.env;", /deny by default/),
	bad("Node's modules", "drivers/motion", "return readFileSync;", /imports node:fs/, `import { readFileSync } from "node:fs";`),
	bad("a helper of the tests", "drivers/motion", "return y;", /imports tests\/helpers/, `import { LeakCounter as y } from "../../../../tests/helpers/LeakCounter";`),
	bad("Obsidian's Notice in a host", "host", "new Notice('x');", /deny by default/, `import { Notice } from "obsidian";`),
	bad("the vault's files in a host", "host", "return { a: 1 };", /deny by default/, `import { ItemView } from "obsidian";\nexport abstract class V extends ItemView { files() { return this.app.vault.adapter; } }`),
	bad("Obsidian's DOM helpers in a host", "host", "el.createDiv({ cls: 'tc-n-x' });", /deny by default/),
	bad("a DOM type in a pure part", "update", "let e: HTMLElement | null = null; return e;", /purity|deny by default/),
	bad("the host's window type in a view", "view", "let w: Window | null = null; return w;", /deny by default/),
	bad("h() given a style", "view", "return h('div', { style: { height: 3 } });", /JSX style/, `import { h } from "preact";`),
	bad("inner HTML through JSX", "view", "return <div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />;", /JSX style/),
	bad("a switch over a message's kind through a variable", "update", "const k = msg.kind; switch (k) { case 'a': return 1; }", /messages/),
	bad("a switch over a message's kind through a let", "update", "let k = msg.kind; k = m.kind; switch (k) { case 'a': return 1; }", /messages/),
	file("a .js file in next/", "model", "js", /only .ts and .tsx/),
	file("a .d.ts file in next/", "view", "d.ts", /only .ts and .tsx/),
	bad("a conditional class that is not a state", "view", "return <div class={flag ? 'tc-n-card tc-n-open' : 'tc-n-card'} />;", /not an is- state: tc-n-open/),
	bad("a class named at run time in a view", "view", "return <div class={`tc-n-card ${x}`} />;", /class named at run time/),
	bad("a class glued to a value in a view", "view", "return <div class={`tc-n-${flag ? 'a' : 'b'}`} />;", /class named at run time/),
	bad("a class from a variable in a view", "view", "return <div class={x} />;", /class named at run time/),
	bad("a class from a value typed as literals that are not states", "view", "return <div class={cls} />;", /not an is- state: tc-n-open/, `declare const cls: "tc-n-icon" | "tc-n-icon tc-n-open";`),
	bad("a conditional class through h()", "view", "return h('div', { class: flag ? 'tc-n-open' : '' });", /not an is- state/, `import { h } from "preact";`),
	bad("a conditional class in a list", "view", "return <div class={['tc-n-card', flag && 'tc-n-open'].filter(Boolean).join(' ')} />;", /not an is- state: tc-n-open/),
	// Clean: each part doing its own work, nothing reported.
	clean("chrome writes several states and swaps one", "drivers/chrome", "el.classList.add('is-on', 'is-open'); el.classList.replace('is-a', 'is-b'); el.classList.toggle('is-c', flag);"),
	clean("input reads the pointer", "drivers/input", "el.addEventListener('pointerdown', (e) => void [e.clientX, e.pointerId, e.pointerType]); el.setPointerCapture(1);"),
	clean("islands mount a node of their own", "drivers/islands", "const d = el.ownerDocument.createElement('div'); el.appendChild(d); d.remove();"),
	clean("a driver keeps elements in a map", "drivers/motion", "const boxes = new Map<string, HTMLElement>(); boxes.set('a', el); void boxes;"),
	clean("a view reads its field's value", "view", "return <input onInput={(e) => void [e.currentTarget.value]} />;"),
	clean("a view's states as is- classes, three ways", "view", "return [<div class={`tc-n-card ${flag ? 'is-on' : ''}`} />, <div class={['tc-n-card', flag && 'is-open'].filter(Boolean).join(' ')} />, <div class='tc-n-card is-static' />];"),
	clean("a view's class from a value typed as its literals", "view", "return <div class={cls} />;", `declare const cls: "tc-n-icon" | "tc-n-icon is-on";`),
	clean("a host mounts into its view's element", "host", "return undefined;", `import { ItemView, type WorkspaceLeaf } from "obsidian";\nimport { render } from "preact";\nexport class LeafView extends ItemView {\n\tconstructor(leaf: WorkspaceLeaf) { super(leaf); }\n\tgetViewType() { return "x"; }\n\tgetDisplayText() { return "x"; }\n\toverride async onOpen() { render(null, this.contentEl); }\n\toverride async onClose() { render(null, this.contentEl); }\n}`),
	clean("a host follows its notes through the vault's and the workspace's events", "host", "return undefined;", `import { ItemView } from "obsidian";\nexport abstract class V extends ItemView {\n\tfollow() { this.registerEvent(this.app.vault.on("rename", () => undefined)); this.app.workspace.iterateAllLeaves((leaf) => void leaf.view.getViewType()); }\n}`),
	clean("a switch over a message's kind through a variable, exhaustive", "update", "const k = msg.kind; switch (k) { case 'a': return 1; case 'b': return 2; default: return assertNever(k); }"),
	clean("motion animates and writes styles", "drivers/motion", "el.animate([], 200); el.style.transform = 'x'; el.style.setProperty('--tc-x', '1'); void el.getBoundingClientRect();"),
	clean("measure observes and reads", "drivers/measure", "new ResizeObserver(f).observe(el); void [el.offsetHeight, el.scrollTop, win.getComputedStyle(el)];"),
	clean("scroll scrolls", "drivers/scroll", "el.scrollTop = 10; el.scrollTo({ top: 1 });"),
	clean("focus focuses", "drivers/focus", "el.focus({ preventScroll: true });"),
	clean("chrome writes classes", "drivers/chrome", "el.classList.add('is-on'); el.dataset.state = 'x'; el.toggleClass('is-x', flag); win.matchMedia('(hover: hover)');"),
	clean("input listens and maps by data attributes", "drivers/input", "el.addEventListener('pointerdown', f); const row = target.closest('[data-row]'); return row instanceof HTMLElement ? row.dataset.row : null;"),
	clean("a driver's own window and frame, from the element", "drivers/motion", "const w = el.ownerDocument.defaultView!; w.requestAnimationFrame(() => 0); w.setTimeout(f, 1);"),
	clean("update over a pure rule, exhaustive", "update", "switch (msg.kind) { case 'a': return swipeLanding; case 'b': return 2; default: return assertNever(msg); }", `import { swipeLanding, type TaskKey } from "../../../../core/application/contracts"; export type K = TaskKey;`),
	clean("a destructured kind, exhaustive", "update", "const { kind } = msg; switch (kind) { case 'a': return 1; case 'b': return 2; default: return assertNever(kind); }"),
	clean("a switch over something that is not a message", "update", "switch (x) { case 'a': return 1; }"),
	clean("a view with classes and handlers", "view", "return <div class={flag ? 'tc-n-card is-on' : 'tc-n-card'} onClick={f} data-row='1' />;", `import type { TaskItem } from "../../../../core/application/contracts"; export type T = TaskItem;`),
	clean("a host through its session", "host", "return HostSession;", `import { HostSession } from "../../../runtime/Runtime";`),
	clean("a date of epoch ms in a pure part", "update", "return new Date(0).getTime();"),
];

describe("the guard itself", () => {
	let result: Analysis;
	beforeAll(() => {
		result = analyse(
			CASES.map((c) => c.file),
			{ given: [GIVEN] },
		);
	});
	afterAll(() => undefined);

	const said = (c: Case) =>
		result.violations
			.filter((v) => v.path === c.file.path)
			.map((v) => `${v.rule}: ${v.what}`)
			.join("\n");

	it.each(CASES.filter((c) => c.caught !== null).map((c) => [c.name, c] as const))("catches %s", (_, c) => {
		expect(said(c), `${c.file.text}\n---\n${said(c)}`).toMatch(c.caught!);
	});

	it.each(CASES.filter((c) => c.caught === null).map((c) => [c.name, c] as const))("lets %s pass", (_, c) => {
		expect(said(c), said(c)).toEqual("");
	});

	it("lists as pure rules exactly what contracts.ts exports as values, but its sessions and errors", () => {
		const isClass = (v: unknown) => typeof v === "function" && /^class[\s{]/.test(Function.prototype.toString.call(v));
		const values = Object.entries(contracts).map(([name, value]) => ({ name, value }));
		expect(values.filter((v) => !NOT_PURE.includes(v.name)).map((v) => v.name).sort()).toEqual([...PURE_RULES].sort());
		expect(values.filter((v) => isClass(v.value)).map((v) => v.name).filter((n) => !NOT_PURE.includes(n))).toEqual([]);
	});

	it("knows every part and driver", () => {
		expect(placeOf(`${NEXT}/model/Model.ts`)).toEqual({ part: "model", driver: null });
		expect(placeOf(`${NEXT}/drivers/motion/Flights.ts`)).toEqual({ part: "drivers", driver: "motion" });
		expect(placeOf(`${NEXT}/drivers/focus.ts`)).toEqual({ part: "drivers", driver: "focus" });
		expect(placeOf(`${NEXT}/helpers.ts`)).toEqual({ part: null, driver: null });
	});

	it("finds a message union in update/ only when a switch proves it", () => {
		expect(result.declaresMsg.length).toBeGreaterThan(0);
		expect(result.provenInUpdate).toBeGreaterThan(0);
	});
});
