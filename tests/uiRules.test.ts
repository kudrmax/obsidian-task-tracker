import { describe, expect, it } from "vitest";
import * as contracts from "../core/application/contracts";
import { declaresMsg, importsOf, messageSwitches, NEXT, nextSources, NOT_PURE, placeOf, PURE_RULES, ruleNamed, RULES, type Source } from "./uiRules";

/** The new screens keep to the spec's guards (§Guards); the old screen outside `next/` is frozen instead (`uiFreeze`). */
const sources = nextSources();

const violations = (files: readonly Source[]): string[] => files.flatMap((file) => RULES.flatMap((rule) => rule.check(file).map((v) => `${rule.name}: ${v}`)));

describe("obsidian/ui/next keeps to its rules", () => {
	it("breaks no rule", () => {
		expect(violations(sources)).toEqual([]);
	});

	it("handles Msg exhaustively: where a message union exists, update switches over it and proves it with assertNever", () => {
		if (!sources.some(declaresMsg)) return;
		const updates = sources.filter((f) => placeOf(f.path).part === "update");
		const proven = updates.flatMap((f) => messageSwitches(f.text)).filter((s) => s.exhaustive);
		expect(proven.length, "an update over Msg ending in default: assertNever(msg)").toBeGreaterThan(0);
	});
});

const sample = (path: string, text: string): Source => ({ path: `${NEXT}/${path}`, text });
const trips = (rule: string, file: Source) => expect(ruleNamed(rule).check(file), `${rule} on ${file.path}`).not.toEqual([]);
const passes = (rule: string, file: Source) => expect(ruleNamed(rule).check(file), `${rule} on ${file.path}`).toEqual([]);

describe("the guard itself", () => {
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
		trips("places", sample("drivers/paint.ts", ""));
		trips("places", sample("helpers.ts", ""));
		passes("places", sample("view/Card.tsx", ""));
	});

	it("reads imports, their values and type-only ones", () => {
		const found = importsOf(sample("update/x.ts", `import { swipeLanding, type TaskKey } from "../../../../core/application/contracts";\nimport type { ScreenView } from "../../../../core/application/contracts";`));
		expect(found.map((i) => [i.target, i.values, i.typeOnly])).toEqual([
			["core/application/contracts.ts", ["swipeLanding"], false],
			["core/application/contracts.ts", [], true],
		]);
	});

	it("purity: a pure part touches no DOM, Obsidian, runtime, driver, clock or chance", () => {
		trips("purity", sample("update/a.ts", "const w = document.body;"));
		trips("purity", sample("model/a.ts", `import { Notice } from "obsidian";`));
		trips("purity", sample("recognizers/a.ts", `import { x } from "../drivers/motion";`));
		trips("purity", sample("view/a.tsx", `import { Store } from "../../../runtime/Runtime";`));
		trips("purity", sample("update/a.ts", "const t = Date.now();"));
		trips("purity", sample("update/a.ts", "el.addEventListener('x', f);"));
		trips("purity", sample("model/a.ts", "const r = new ResizeObserver(f);"));
		passes("purity", sample("update/a.ts", `import { swipeLanding } from "../../../../core/application/contracts";\nconst x = { document: 1 }; // window\nconst d = new Date(ms);`));
		passes("purity", sample("drivers/measure.ts", "new ResizeObserver(f);"));
	});

	it("core calls: no door or replica outside the runtime, and of the core only the listed pure rules", () => {
		trips("core calls", sample("update/a.ts", "callDoor('tasks.screen', [], ctx);"));
		trips("core calls", sample("update/a.ts", `import { QuickEntrySession } from "../../../../core/application/contracts";`));
		trips("core calls", sample("update/a.ts", `import { callDoor } from "../../../../core/application/PhoneCalls";`));
		trips("core calls", sample("host/Leaf.tsx", "const t = runtime.replica.state;"));
		trips("core calls", sample("host/Leaf.tsx", `import { Replica } from "../../../runtime/replica/Replica";`));
		trips("core calls", sample("view/Card.tsx", `import { swipeLanding } from "../../../../core/application/contracts";`));
		trips("core calls", sample("view/Card.tsx", `import { step } from "../update/step";`));
		passes("core calls", sample("view/Card.tsx", `import type { TaskItem } from "../../../../core/application/contracts";\nimport { cardOf } from "../model/selectors";\nimport { h } from "preact";`));
		passes("core calls", sample("host/Leaf.tsx", `import { HostSession } from "../../../runtime/Runtime";`));
		passes("core calls", sample("update/a.ts", `import { swipeLanding, type TaskKey } from "../../../../core/application/contracts";`));
	});

	it("timers and frames only in drivers", () => {
		trips("timers", sample("host/Leaf.tsx", "setTimeout(f, 10);"));
		trips("timers", sample("view/a.tsx", "win.requestAnimationFrame(f);"));
		passes("timers", sample("drivers/motion.ts", "win.requestAnimationFrame(f);"));
	});

	it("DOM work: each piece only in its own driver", () => {
		const cases: [string, string, string][] = [
			["el.animate(frames, 200);", "motion", "chrome"],
			["el.style.transform = 'x';", "motion", "measure"],
			["el.style.setProperty('--tc-x', v);", "motion", "chrome"],
			["el.setCssProps({ a: 'b' });", "motion", "focus"],
			["const r = el.getBoundingClientRect();", "measure", "scroll"],
			["const h = el.offsetHeight;", "motion", "chrome"],
			["el.scrollTop = 10;", "scroll", "measure"],
			["el.scrollIntoView();", "scroll", "motion"],
			["input.focus({ preventScroll: true });", "focus", "keys"],
			["new ResizeObserver(f);", "measure", "motion"],
			["el.classList.add('is-on');", "chrome", "motion"],
			["el.dataset.state = 'x';", "chrome", "motion"],
			["el.setAttribute('class', 'x');", "chrome", "focus"],
			["el.toggleClass('x', on);", "chrome", "keys"],
			["const s = new Scope(app.scope);", "keys", "chrome"],
		];
		for (const [text, owner, other] of cases) {
			passes("DOM work", sample(`drivers/${owner}.ts`, text));
			trips("DOM work", sample(`drivers/${other}.ts`, text));
			trips("DOM work", sample("update/a.ts", text));
		}
		passes("DOM work", sample("drivers/measure.ts", "const t = el.scrollTop;"));
		passes("DOM work", sample("view/a.tsx", "const text = 'el.focus()';"));
	});

	it("no JSX style", () => {
		trips("JSX style", sample("view/Card.tsx", "return <div style={{ height: h }} />;"));
		trips("JSX style", sample("view/Card.tsx", `return <div class="x" style="color: red" />;`));
		passes("JSX style", sample("view/Card.tsx", "const style = { a: 1 };\nreturn <div class={cls} />;"));
	});

	it("no class read to decide", () => {
		trips("class reads", sample("drivers/input.ts", "if (el.classList.contains('is-open')) go();"));
		trips("class reads", sample("drivers/input.ts", "if (el.hasClass('tc-card')) go();"));
		trips("class reads", sample("drivers/input.ts", "const card = target.closest('.tc-card');"));
		trips("class reads", sample("drivers/input.ts", "const c = el.className;"));
		passes("class reads", sample("drivers/input.ts", "const card = target.closest('[data-row]');"));
	});

	it("messages: a switch over msg.kind ends in assertNever", () => {
		trips("messages", sample("update/update.ts", "switch (msg.kind) { case 'a': return 1; default: return 2; }"));
		trips("messages", sample("update/update.ts", "switch (msg.kind) { case 'a': return 1; }"));
		passes("messages", sample("update/update.ts", "switch (msg.kind) { case 'a': { return 1; } default: return assertNever(msg); }"));
		expect(declaresMsg(sample("model/Msg.ts", "export type Msg = { kind: 'a' } | { kind: 'b' };"))).toBe(true);
	});

	it("windows: no bare document or window", () => {
		trips("windows", sample("drivers/chrome.ts", "document.body.addClass('x');"));
		trips("windows", sample("drivers/chrome.ts", "const w = activeWindow;"));
		trips("windows", sample("host/Leaf.tsx", "window.setTimeout(f);"));
		passes("windows", sample("drivers/chrome.ts", "const doc = el.ownerDocument; const win = doc.defaultView; win.document;"));
	});
});
