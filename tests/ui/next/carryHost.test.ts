import { fakeTitleFields } from "../../helpers/FakeTitleField";
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockHost } from "../../../obsidian/ui/next/host/block/BlockHost";
import { Motion } from "../../../obsidian/ui/next/drivers/motion";
import type { Harness } from "../../runtime/harness";
import { projectHarness } from "./blockHarness";

/** Obsidian's key scopes as a block uses them. */
const app = { keymap: { pushScope: () => undefined, popScope: () => undefined }, scope: {} } as never;
const words = { failure: () => "", notice: () => undefined, openLink: () => undefined, openTasksFile: () => undefined, titleField: () => fakeTitleFields().factory };

const pointer = (type: string, x: number, y: number, pointerType = "mouse") => new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, button: 0, clientX: x, clientY: y });

describe("the carry's transient channel (P5): the finger moves the float, never the render", () => {
	let h: Harness;
	let host: BlockHost | null = null;
	afterEach(async () => {
		host?.dispose();
		host = null;
		vi.restoreAllMocks();
		await h.runtime.unload();
	});

	it("renders once on the lift and never per move; the float follows each move through motion", async () => {
		h = await projectHarness();
		host = new BlockHost({ session: h.runtime.openHost(), app, ...words }, "Дружба.md", document.body);
		document.body.appendChild(host.node);
		host.mount();
		const card = host.node.querySelector<HTMLElement>("[data-n-act='card']")!;
		expect(card).not.toBeNull();
		const draws = vi.spyOn(host as unknown as { draw(model: unknown): void }, "draw");
		const floats = vi.spyOn(Motion.prototype, "floatAt");
		card.dispatchEvent(pointer("pointerdown", 10, 10));
		card.dispatchEvent(pointer("pointermove", 10, 20));
		expect(host.model.carry).not.toBeNull();
		const afterLift = draws.mock.calls.length;
		for (let i = 0; i < 30; i++) card.dispatchEvent(pointer("pointermove", 10, 20 + i / 10));
		expect(draws.mock.calls.length).toBe(afterLift);
		expect(floats.mock.calls.length).toBeGreaterThanOrEqual(31);
		expect(host.node.querySelector(".tc-n-card.is-waiting")).not.toBeNull();
		expect(document.querySelector("[data-n-float='card']")).not.toBeNull();
	});

	it("taps a card's counter to fold its subtasks, no menu and no carry", async () => {
		h = await projectHarness();
		host = new BlockHost({ session: h.runtime.openHost(), app, ...words }, "Дружба.md", document.body);
		document.body.appendChild(host.node);
		host.mount();
		const counter = host.node.querySelector<HTMLElement>("[data-n-act='counter']")!;
		counter.dispatchEvent(pointer("pointerdown", 5, 5));
		counter.dispatchEvent(pointer("pointerup", 5, 5));
		expect(host.model.carry).toBeNull();
		expect(h.vault.text("TODOs Tasks.md") ?? "").toBeDefined();
		const parent = h.runtime.read("tasks.screen", ["2026-11-15", null]);
		expect(parent.ok && JSON.stringify(parent.result).includes('"collapsed":true')).toBe(true);
	});
});
