// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { fullLayer } from "../../../obsidian/ui/next/model/full";
import { type MountedBlock, mountBlock } from "./blockFixture";

const q = (selector: string) => document.querySelector(selector);
const texts = (selector: string) => [...document.querySelectorAll(selector)].map((e) => e.textContent?.trim() ?? "");

function type(text: string): void {
	const input = q('[data-n-field="search"]') as HTMLInputElement;
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(name: string): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
	q('[data-n-field="search"]')!.dispatchEvent(event);
	return event;
}

describe("the search over the note's block", () => {
	let b: MountedBlock;

	afterEach(async () => {
		b.unmount();
		await b.h.runtime.unload();
	});

	it("opens from ⋯ with the field focused inside the tap, finds as it is typed, grouped by section, with each task's place among the projects", async () => {
		b = await mountBlock();
		b.host.dispatch({ kind: "searchPicked" });
		expect(document.activeElement).toBe(q('[data-n-field="search"]'));
		type("idea");
		expect(texts(".tc-n-search-results .tc-n-group-name")).toEqual(["Inbox"]);
		expect(texts(".tc-n-hit-row .tc-n-card-over-text")).toEqual(["Дружба"]);
		expect(q(".tc-n-hit-row mark.tc-n-hit")?.textContent).toBe("Idea");
		type("zzzz");
		expect(q(".tc-n-search-empty")?.textContent).toBe("No tasks found");
	});

	it("on the desktop walks the rows with the arrows and opens one with Enter: a task the block shows wears the ring", async () => {
		b = await mountBlock();
		b.host.dispatch({ kind: "key", key: "find" });
		type("e");
		expect(q(".tc-n-hit-row.is-picked")).not.toBeNull();
		expect(key("ArrowDown").defaultPrevented).toBe(true);
		const picked = q(".tc-n-hit-row.is-picked .tc-n-card-title")?.textContent;
		type("Parent");
		key("Enter");
		expect(b.host.model.search?.closing).toBe(true);
		b.host.dispatch({ kind: "search", msg: { kind: "gone" } });
		expect(b.host.model.search).toBeNull();
		expect(q(".tc-n-block .tc-n-card.is-found")?.textContent).toContain("Parent");
		b.host.dispatch({ kind: "search", msg: { kind: "pressed" } });
		expect(q(".tc-n-card.is-found")).toBeNull();
		expect(picked).toBeTruthy();
	});

	it("as the old block: a found task its filter hides clears the main screen's filter and moves the funnel's place there, and wears the ring", async () => {
		b = await mountBlock();
		b.h.screens.set({ ...b.h.screens.get(), selected: "project:Дружба" });
		b.host.dispatch({ kind: "key", key: "find" });
		type("Elsewhere");
		key("Enter");
		b.host.dispatch({ kind: "search", msg: { kind: "gone" } });
		expect(fullLayer(b.host.model.layers)).toBeNull();
		expect(b.host.model.found?.id).toBe(b.item("Elsewhere").id);
		expect(b.h.screens.get().selected).toBeUndefined();
		expect(b.h.screens.get().place).toBe("calendar");
	});

	it("as the old block: a found Done task opens on the full card, the place left as it is", async () => {
		b = await mountBlock();
		b.host.dispatch({ kind: "key", key: "find" });
		type("Finished long ago");
		key("Enter");
		b.host.dispatch({ kind: "search", msg: { kind: "gone" } });
		expect(fullLayer(b.host.model.layers)?.id).toBe(b.item("Finished long ago").id);
		expect(b.h.screens.get().place).toBeUndefined();
	});

	it("on the phone covers the block, the field at the bottom with Cancel; Escape in the field closes it too", async () => {
		b = await mountBlock({ wide: false });
		b.host.dispatch({ kind: "searchPicked" });
		expect(q(".tc-n-block .tc-n-search .tc-n-search-bar [data-n-field='search']")).not.toBeNull();
		expect(q(".tc-n-hit-row.is-picked")).toBeNull();
		document.querySelector<HTMLElement>('[data-n-act="search:cancel"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(b.host.model.search?.closing).toBe(true);
		b.host.dispatch({ kind: "search", msg: { kind: "gone" } });
		b.host.dispatch({ kind: "searchPicked" });
		expect(key("Escape").defaultPrevented).toBe(true);
		expect(b.host.model.search?.closing).toBe(true);
	});
});
