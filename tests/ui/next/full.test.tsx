// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESCRIPTION_PAUSE_MS, fullLayer } from "../../../obsidian/ui/next/model/full";
import { settle } from "../../runtime/harness";
import { type MountedBlock, mountBlock } from "./blockFixture";

/** A tap on what the view marked, as the input driver hears it. */
function tap(el: Element | null): void {
	if (!el) throw new Error("nothing to tap");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const q = (selector: string) => document.querySelector(selector);
const texts = (selector: string) => [...document.querySelectorAll(selector)].map((e) => e.textContent?.trim() ?? "");

describe("the full card over the note's block", () => {
	let b: MountedBlock;

	beforeEach(async () => {
		b = await mountBlock();
		b.host.dispatch({ kind: "full", msg: { kind: "open", id: b.item("Parent").id, description: false } });
	});

	afterEach(async () => {
		b.unmount();
		vi.useRealTimers();
		await b.h.runtime.unload();
	});

	it("shows the task: its title, its project, every subtask with a circle, the done one crossed out in place, its description's editor", () => {
		expect(q(".tc-n-full .tc-n-full-title")?.textContent).toBe("Parent");
		expect(q(".tc-n-full-project")?.textContent).toBe("Дружба");
		expect(texts(".tc-n-full-list .tc-n-card-title")).toEqual(["Child", "Done child"]);
		expect(q('.tc-n-full-list .tc-n-card[data-status="done"]')?.textContent).toBe("Done child");
		expect(q(".tc-n-full-parent")).toBeNull();
		expect(b.editors.made).toHaveLength(1);
		expect(b.editors.last.text).toBe("- ");
	});

	it("ticks a subtask done with its circle, and the card follows the file in the same loop", () => {
		tap(document.querySelectorAll(".tc-n-full-list .tc-n-pick")[0]);
		expect(q('.tc-n-full-list .tc-n-card[data-status="done"]')?.textContent).toContain("Child");
		expect(texts('.tc-n-full-list .tc-n-card[data-status="done"] .tc-n-card-title')).toEqual(["Child", "Done child"]);
	});

	it("writes the description a pause after the last key, and only what was typed", async () => {
		vi.useFakeTimers();
		b.editors.last.hooks.change("- Buy milk");
		expect(b.item("Parent").description).toBeNull();
		vi.advanceTimersByTime(DESCRIPTION_PAUSE_MS - 1);
		await Promise.resolve();
		expect(b.item("Parent").description).toBeNull();
		vi.advanceTimersByTime(1);
		await Promise.resolve();
		expect(b.item("Parent").description).toBe("- Buy milk");
		vi.useRealTimers();
		await settle(b.h.runtime);
	});

	it("takes a description changed elsewhere into its editor while the editor has no focus", async () => {
		const parent = b.item("Parent");
		b.host.dispatch({ kind: "full", msg: { kind: "open", id: parent.id, description: false } });
		b.h.runtime.call("tasks.setDescription", [parent.key, "- From the phone"]);
		await Promise.resolve();
		await Promise.resolve();
		expect(b.editors.last.value).toBe("- From the phone");
	});

	it("puts the caret in the description at once for Add description, inside the tap", async () => {
		b.host.dispatch({ kind: "layerDismissed" });
		b.host.dispatch({ kind: "layerGone" });
		b.host.dispatch({ kind: "full", msg: { kind: "open", id: b.item("Parent").id, description: true } });
		expect(document.activeElement?.parentElement?.dataset.nIsland).toBe("description");
	});

	it("opens a subtask over its task: the task over its title leads back up", () => {
		b.host.dispatch({ kind: "full", msg: { kind: "open", id: b.item("Child").id, description: false } });
		expect(q(".tc-n-full-title")?.textContent).toBe("Child");
		expect(q(".tc-n-full-parent")?.textContent).toBe("Parent");
		tap(q(".tc-n-full-parent"));
		expect(q(".tc-n-full-title")?.textContent).toBe("Parent");
	});

	it("closes when its task is gone from the file (P6: a pinned task deleted ends its layer)", async () => {
		const parent = b.item("Parent");
		b.h.runtime.call("tasks.remove", [parent.key]);
		await Promise.resolve();
		await Promise.resolve();
		expect(fullLayer(b.host.model.layers)?.closing).toBe(true);
	});

	it("Close writes what was typed and closes; the layer goes once its fade ends", () => {
		b.editors.last.hooks.change("- Typed");
		tap(q('[data-n-act="full:close"]'));
		expect(b.item("Parent").description).toBe("- Typed");
		expect(fullLayer(b.host.model.layers)?.closing).toBe(true);
		expect(b.editors.last.destroyed).toBe(true);
		b.host.dispatch({ kind: "layerGone" });
		expect(q(".tc-n-full")).toBeNull();
	});

	it("shows Done while the description is typed in, hiding the bottom row; Done writes and puts the keyboard away", () => {
		b.editors.last.hooks.focus(true);
		expect(q(".tc-n-full")?.classList.contains("tc-n-full-typing")).toBe(true);
		expect(q('[data-n-act="full:done"]')?.classList.contains("is-hidden")).toBe(false);
		b.editors.last.hooks.change("- Done typing");
		tap(q('[data-n-act="full:done"]'));
		expect(b.item("Parent").description).toBe("- Done typing");
	});
});
