// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BlockHeight, neededHeight } from "../../obsidian/ui/BlockHeight";

/** Geometry happy-dom doesn't lay out: each element's box and scroll, as a browser would give them. */
function box(el: HTMLElement, top: number, height: number, scrollHeight = height): HTMLElement {
	Object.defineProperty(el, "getBoundingClientRect", { value: () => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0 }) });
	Object.defineProperty(el, "clientHeight", { get: () => height });
	Object.defineProperty(el, "offsetHeight", { get: () => height });
	Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
	return el;
}

function child(parent: HTMLElement, cls: string): HTMLElement {
	const el = document.createElement("div");
	el.className = cls;
	parent.appendChild(el);
	return el;
}

/** A block 400 tall at the page's top; its columns start 52 down and reach its bottom. */
function screen(place: string, lists: { inbox: [number, number]; backlog: [number, number]; soon: [number, number] }) {
	const block = box(document.createElement("div"), 0, 402);
	const root = box(child(block, `task-calendar is-block ${place}`), 1, 400);
	const inbox = box(child(root, "tc-inbox"), 53, 348);
	const inboxPane = box(child(inbox, "tc-pane is-inbox"), 53, lists.inbox[0]);
	box(child(inboxPane, "tc-list"), 53, lists.inbox[0], lists.inbox[1]);
	const backlogPane = box(child(inbox, "tc-pane is-backlog"), 53 + lists.inbox[0], 348 - lists.inbox[0]);
	box(child(backlogPane, "tc-pane-head"), 53 + lists.inbox[0], 44);
	box(child(backlogPane, "tc-list"), 53 + lists.inbox[0] + 44, lists.backlog[0], lists.backlog[1]);
	const soon = box(child(root, "tc-soon"), 53, 348);
	box(child(soon, "tc-list"), 53, lists.soon[0], lists.soon[1]);
	box(child(root, "tc-left"), 53, 348);
	document.body.appendChild(block);
	return { block, root };
}

describe("a note's block is as tall as what its window shows", () => {
	it("shrinks to the taller column's cards when they leave room", () => {
		const { root } = screen("is-inbox", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		// Inbox's column: 60 + 44 + 120 under the head's 52 leaves 348 - 224 = 124 empty.
		expect(neededHeight(root)).toBe(400 - 124);
	});

	it("grows by what its lists hide under their scroll", () => {
		const { root } = screen("is-inbox", { inbox: [100, 300], backlog: [204, 500], soon: [100, 100] });
		expect(neededHeight(root)).toBe(400 + 200 + 296);
	});

	it("asks for all the room there is while the calendar shows", () => {
		const { root } = screen("", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		expect(neededHeight(root)).toBe(Infinity);
	});

	it("sets the block's height with its frame, and the tallest the CSS allows for the calendar", () => {
		const shown = screen("is-inbox", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		new BlockHeight(shown.block, shown.root).fit();
		expect(shown.block.style.height).toBe(`${276 + 2}px`);
		const calendar = screen("", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		new BlockHeight(calendar.block, calendar.root).fit();
		expect(calendar.block.style.height).toBe("var(--tc-block-max-h)");
	});

	it("marks itself at its tallest, where Inbox keeps at most half its column", () => {
		const short = screen("is-inbox", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		short.block.style.maxHeight = "640px";
		new BlockHeight(short.block, short.root).fit();
		expect(short.block.classList.contains("is-full")).toBe(false);
		const tall = screen("is-inbox", { inbox: [100, 300], backlog: [204, 500], soon: [100, 100] });
		tall.block.style.maxHeight = "640px";
		new BlockHeight(tall.block, tall.root).fit();
		expect(tall.block.classList.contains("is-full")).toBe(true);
	});

	it("keeps its height while a card is dragged: the list under the finger stays put", () => {
		const { block, root } = screen("is-inbox is-dragging", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		new BlockHeight(block, root).fit();
		expect(block.style.height).toBe("");
	});

	it("fits again a frame after its screen changed", async () => {
		const { block, root } = screen("is-inbox is-dragging", { inbox: [60, 60], backlog: [120, 120], soon: [100, 100] });
		const height = new BlockHeight(block, root);
		height.start();
		root.classList.remove("is-dragging");
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
		expect(block.style.height).toBe("278px");
		height.stop();
	});
});
