// @vitest-environment happy-dom
import { render } from "preact";
import { describe, expect, it } from "vitest";
import { cardRows } from "../../../obsidian/ui/next/model/menuNeeds";
import type { TaskMenuLayer } from "../../../obsidian/ui/next/model/taskMenu";
import { Layers } from "../../../obsidian/ui/next/view/Layers";
import { BlockLoop } from "./blockLoop";

const drawn = (loop: BlockLoop): HTMLElement => {
	const host = document.createElement("div");
	render(<Layers model={loop.model} />, host);
	return host;
};

const layerOf = (loop: BlockLoop) => loop.model.layers.find((l): l is TaskMenuLayer => l.kind === "taskMenu")!;

describe("the task menu as the view draws it", () => {
	it("draws the copy of the card, its links pressable, and the panel hidden for measuring before it is placed", async () => {
		const loop = await BlockLoop.open();
		const key = [...cardRows(loop.model).values()][0].key;
		loop.send({ kind: "cardTapped", key, part: "card" });
		const host = drawn(loop);
		const panel = host.querySelector<HTMLElement>('[data-n-part="menu-panel"]')!;
		expect(panel.dataset.nMeasure).toBe(String(layerOf(loop).seq));
		expect(panel.dataset.nAnchorKey).toBe(key);
		expect(panel.className).toContain("is-measuring");
		expect(host.querySelector('[data-n-part="lifted"]')?.textContent).toContain("Idea");
		expect(host.querySelector('[data-n-probe="whole"]')).not.toBeNull();
		expect(host.querySelectorAll('[data-n-act="menu:status"]').length).toBeGreaterThan(0);
		expect([...host.querySelectorAll(".tc-n-menu-row")].map((r) => r.textContent)).toEqual(expect.arrayContaining(["Rename", "Open in Obsidian"]));
	});

	it("splits the panel over and under the copy as measured, and stops measuring", async () => {
		const loop = await BlockLoop.open();
		const key = [...cardRows(loop.model).values()][0].key;
		loop.send({ kind: "cardTapped", key, part: "card" });
		const all = drawn(loop).querySelector('[data-n-part="menu-panel"]')!.children.length;
		const place = { seq: layerOf(loop).seq, copy: { box: { left: 0, top: 100, width: 200, height: 35 }, stretched: false, whole: true }, copies: new Map(), above: 2, panel: { left: 0, top: 140, bottom: null, maxHeight: null }, upper: { left: 0, top: null, bottom: 600, maxHeight: null }, long: ["tile:done"] };
		loop.send({ kind: "menu", msg: { kind: "placed", place } });
		const host = drawn(loop);
		const upper = host.querySelector<HTMLElement>('[data-n-part="menu-upper"]')!;
		const lower = host.querySelector<HTMLElement>('[data-n-part="menu-panel"]')!;
		expect(upper.children.length).toBe(2);
		expect(lower.children.length).toBe(all - 2);
		expect(lower.dataset.nMeasure).toBeUndefined();
		expect(host.querySelector('[data-n-part="lifted"]')!.className).toContain("tc-n-lifted-whole");
		expect(host.querySelector(".tc-n-menu-tile-label.is-long")).not.toBeNull();
	});

	it("asks first in place of Delete: the task named, Cancel and the danger button", async () => {
		const loop = await BlockLoop.open();
		const key = [...cardRows(loop.model).values()][0].key;
		loop.send({ kind: "cardTapped", key, part: "card" });
		loop.send({ kind: "menu", msg: { kind: "remove" } });
		const ask = drawn(loop).querySelector(".tc-n-menu-ask")!;
		expect(ask.querySelector(".tc-n-menu-ask-question")?.textContent).toBe("Delete “Idea”?");
		expect(ask.querySelector('[data-n-act="menu:confirm"]')?.className).toContain("tc-n-pill-danger");
	});
});
