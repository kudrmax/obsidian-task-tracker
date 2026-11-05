// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchHit, SectionKey, TaskItem } from "../../src/application/contracts";
import { SearchWindow } from "../../src/ui/search/SearchWindow";

function item(text: string, list: SectionKey, extra: Partial<TaskItem> = {}): TaskItem {
	return {
		key: { section: list, index: 0, path: [], raw: `- [ ] ${text}` },
		text,
		status: list === "done" ? "done" : "todo",
		dueDate: null,
		slot: null,
		reminder: "default",
		repeat: null,
		open: list !== "done",
		repeatable: false,
		priority: null,
		group: null,
		list,
		isSubtask: false,
		day: null,
		can: { postpone: true, removeDue: false, remind: false },
		subtasks: [],
		progress: null,
		parentText: null,
		description: null,
		...extra,
	} as TaskItem;
}

const HITS: readonly SearchHit[] = [
	{ item: item("Фото на паспорт", "inbox"), title: [{ text: "Фото на ", match: false }, { text: "паспорт", match: true }], description: null },
	{ item: item("Записаться в МФЦ", "soon", { description: "взять паспорт" }), title: [], description: { before: "взять ", match: "паспорт", after: "" } },
	{ item: item("Оплатить паспорт", "done"), title: [{ text: "Оплатить ", match: false }, { text: "паспорт", match: true }], description: null },
];

function setUp(desktop: boolean, search = vi.fn(async (query: string) => (query.trim() ? HITS : []))) {
	const root = document.createElement("div");
	root.className = "task-calendar";
	document.body.appendChild(root);
	const onPick = vi.fn();
	const onClose = vi.fn();
	const win = SearchWindow.open({ root, tasks: { search }, desktop, sectionName: (s) => s.toUpperCase(), onPick, onClose });
	const type = async (text: string) => {
		win.input.value = text;
		win.input.dispatchEvent(new Event("input"));
		await Promise.resolve();
		await Promise.resolve();
	};
	const key = (k: string) => win.input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	return { root, win, onPick, onClose, type, key, search };
}

describe("SearchWindow", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("groups what it found by section, under the sections' names", async () => {
		const { win, type } = setUp(false);
		await type("пас");
		const heads = [...win.el.querySelectorAll(".tc-group-name")].map((h) => h.textContent);
		expect(heads).toEqual(["INBOX", "SOON", "DONE"]);
		expect(win.shown).toHaveLength(3);
	});

	it("picks out the found words in the title, and gives a description's line under the title", async () => {
		const { win, type } = setUp(false);
		await type("пас");
		const [title, desc] = win.shown;
		expect(title.el.querySelector("mark.tc-hit")?.textContent).toBe("паспорт");
		expect(title.el.querySelector(".tc-hit-desc")).toBeNull();
		expect(desc.el.querySelector(".tc-hit-desc mark.tc-hit")?.textContent).toBe("паспорт");
		expect(desc.el.querySelector(".tc-card-title")?.textContent).toBe("Записаться в МФЦ");
	});

	it("shows nothing for an empty field, and says so when nothing is found", async () => {
		const search = vi.fn(async () => [] as SearchHit[]);
		const { win, type } = setUp(false, search);
		await type("   ");
		expect(win.el.querySelector(".tc-search-empty")).toBeNull();
		expect(search).not.toHaveBeenCalled();
		await type("zz");
		expect(win.el.querySelector(".tc-search-empty")?.textContent).toBe("No tasks found");
	});

	it("an answer to an older query that comes late is not shown", async () => {
		let slow: (hits: SearchHit[]) => void = () => {};
		const search = vi.fn((query: string) => (query === "па" ? new Promise<SearchHit[]>((resolve) => (slow = resolve)) : Promise.resolve([HITS[0]])));
		const { win, type } = setUp(false, search);
		void type("па");
		await type("пас");
		slow([...HITS]);
		await Promise.resolve();
		expect(win.shown).toHaveLength(1);
	});

	it("a tap on a row picks it and closes the window", async () => {
		const { win, type, onPick } = setUp(false);
		await type("пас");
		win.shown[2].el.click();
		expect(onPick).toHaveBeenCalledWith(HITS[2]);
		expect(win.el.isConnected).toBe(false);
	});

	it("Cancel on the phone closes it and says so", () => {
		const { win, onClose } = setUp(false);
		win.el.querySelector<HTMLButtonElement>(".tc-search-cancel")!.click();
		expect(onClose).toHaveBeenCalledOnce();
		expect(win.el.isConnected).toBe(false);
	});

	it("on the desktop the arrows walk the rows and Enter opens the one picked", async () => {
		const { win, type, key, onPick } = setUp(true);
		await type("пас");
		expect(win.shown[0].el.classList.contains("is-picked")).toBe(true);
		key("ArrowDown");
		key("ArrowDown");
		key("ArrowDown");
		expect(win.shown[2].el.classList.contains("is-picked")).toBe(true);
		key("ArrowUp");
		key("Enter");
		expect(onPick).toHaveBeenCalledWith(HITS[1]);
	});

	it("on the desktop Escape closes the panel", () => {
		const { onClose } = setUp(true);
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
