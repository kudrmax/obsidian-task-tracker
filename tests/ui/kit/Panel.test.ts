// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Panel, Picks } from "../../../src/ui/kit/Panel";
import { Overlay } from "../../../src/ui/menu/Overlay";

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe("Picks", () => {
	it("closes, then runs the action", () => {
		const log: string[] = [];
		const picks = new Picks(() => log.push("close"));
		picks.pick(() => void log.push("act"))();
		expect(log).toEqual(["close", "act"]);
	});

	it("a second pick while it closes does nothing, the same or another", () => {
		const log: string[] = [];
		const picks = new Picks(() => log.push("close"));
		const first = picks.pick(() => void log.push("first"));
		const second = picks.pick(() => void log.push("second"));
		first();
		first();
		second();
		expect(log).toEqual(["close", "first"]);
	});
});

describe("Panel", () => {
	const picks = () => new Picks(() => undefined);

	it("over an overlay: on its level, with the root and the classes it is given", () => {
		const overlay = new Overlay(() => overlay.close());
		const panel = Panel.over(overlay, { root: "tc-panel", cls: "is-menu is-task", picks: picks() });
		expect(panel.el.className).toBe("tc-panel is-menu is-task");
		expect(panel.el.parentElement?.className).toBe("tc-level");
	});

	it("off the level: straight on the page", () => {
		const overlay = new Overlay(() => overlay.close());
		const panel = Panel.over(overlay, { root: "tc-popover", picks: picks() }, false);
		expect(panel.el.parentElement).toBe(document.body);
	});

	it("goes with its overlay", () => {
		vi.useFakeTimers();
		const overlay = new Overlay(() => overlay.close());
		const panel = Panel.over(overlay, { root: "tc-panel", picks: picks() });
		overlay.close();
		vi.runAllTimers();
		expect(panel.el.isConnected).toBe(false);
	});

	it("replace clears, builds and places", () => {
		const overlay = new Overlay(() => overlay.close());
		const placed: number[] = [];
		const panel = Panel.over(overlay, { root: "tc-panel", picks: picks(), place: (el) => placed.push(el.children.length) });
		panel.el.append(document.createElement("i"), document.createElement("i"));
		panel.replace((el) => el.appendChild(document.createElement("b")));
		expect([...panel.el.children].map((c) => c.tagName)).toEqual(["B"]);
		expect(placed).toEqual([1]);
	});

	it("inside a holder: shown at once, grown in from its layout", () => {
		const holder = document.body.appendChild(document.createElement("div"));
		const panel = Panel.inside(holder, { root: "tc-panel", cls: "tc-quick-panel is-above", picks: picks() });
		expect(panel.el.parentElement).toBe(holder);
		panel.show();
		expect(panel.el.className).toBe("tc-panel tc-quick-panel is-above is-shown");
	});

	it("pick goes through its picks", () => {
		const log: string[] = [];
		const overlay = new Overlay(() => overlay.close());
		const panel = Panel.over(overlay, { root: "tc-panel", picks: new Picks(() => log.push("close")) });
		const pick = panel.pick(() => void log.push("act"));
		pick();
		pick();
		expect(log).toEqual(["close", "act"]);
	});
});
