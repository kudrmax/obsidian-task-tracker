// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem, UndoService } from "../../core/application/contracts";
import type { TaskStatus } from "../../obsidian/ui/types";
import { fullTree } from "../../core/application/fullTree";
import { FullScreen } from "../../obsidian/ui/full/FullScreen";
import { priorityTitles } from "../fakes/FakePriorityTitles";
import { fakeTitleField } from "../fakes/FakeTitleField";
import { onDay } from "../fakes/itemOnDay";

const T = "2026-11-06";

const keyOf = (text: string, path: number[]) => ({ section: "now" as const, index: 0, path, raw: `- [ ] ${text}` });

function task(text: string, path: number[], opts: { status?: TaskStatus; subs?: TaskItem[]; description?: string | null; parentText?: string | null } = {}): TaskItem {
	const status = opts.status ?? "todo";
	const subs = opts.subs ?? [];
	const open = status === "todo" || status === "inProgress";
	return onDay({
		key: { section: "now", index: 0, path, raw: `- [${status === "done" ? "x" : " "}] ${text}` },
		text,
		status,
		dueDate: null,
		slot: null,
		reminder: "notification",
		repeat: null,
		open,
		repeatable: open,
		priority: null,
		group: null,
		subtasks: subs.filter((s) => s.open),
		allSubtasks: subs,
		progress: subs.length > 0 ? { done: subs.filter((s) => s.status === "done").length, total: subs.length } : null,
		parentText: opts.parentText ?? null,
		parentKey: opts.parentText ? keyOf(opts.parentText, path.slice(0, -1)) : null,
		description: opts.description ?? null,
		list: "now",
		isSubtask: path.length > 0,
	}, T);
}

const backpack = (status: TaskStatus = "todo") =>
	task("Собрать рюкзак", [0], { parentText: "Собраться утром", subs: [task("Ноутбук", [0, 0], { status, parentText: "Собрать рюкзак" }), task("Пропуск", [0, 1], { parentText: "Собрать рюкзак" })] });
const morning = (washed: TaskStatus = "done") => task("Собраться утром", [], { description: "- Выйти в 8:40", subs: [backpack(), task("Умыться", [1], { status: washed, parentText: "Собраться утром" })] });

const undo: UndoService = { undo: async () => "done", redo: async () => "done", canUndo: () => false, canRedo: () => false, onChange: () => () => undefined };

function setup(item = morning()) {
	const editor = { value: "", focused: false, focus: vi.fn(), setValue: vi.fn((text: string) => (editor.value = text)), destroy: vi.fn(), changed: () => undefined as void };
	const surface = {
		render: vi.fn(async () => undefined),
		edit: vi.fn((_el: HTMLElement, markdown: string, _escape: () => void, onChange?: () => void) => {
			editor.value = markdown;
			editor.changed = () => onChange?.();
			return editor;
		}),
	};
	const tasks = {
		...priorityTitles([]),
		find: vi.fn(async (_key: { readonly raw: string }, _text: string): Promise<TaskItem | null> => null),
		toggleDone: vi.fn(async () => undefined),
		fullTree,
		setDescription: vi.fn(async () => undefined),
		edit: vi.fn(async (): Promise<TaskItem | null> => null),
		createWithId: vi.fn(async () => null),
		createSection: vi.fn(async () => null),
		placementOf: () => ({ kind: "now" }) as const,
		placementOfDay: () => ({ kind: "now" }) as const,
		dayOfPlacement: () => T,
	};
	const deps = {
		root: document.body.appendChild(document.createElement("div")),
		tasks: tasks as never,
		undo,
		surface,
		titleField: fakeTitleField,
		day: () => T,
		act: vi.fn(async (change: () => Promise<void | boolean>) => {
			await change();
		}),
		onUndo: vi.fn(),
		menu: vi.fn(),
		onClose: vi.fn(),
		onError: vi.fn(),
	};
	const screen = FullScreen.open(deps, item, false);
	const cards = () => [...screen.el.querySelectorAll<HTMLElement>(".tc-full-list .tc-card")];
	const titles = () => cards().map((card) => card.querySelector(".tc-card-title")?.textContent);
	return { screen, deps, tasks, editor, surface, cards, titles };
}

describe("FullScreen", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = "";
	});

	it("shows the task's title, every subtask as a tree with the done ones crossed, and its description in the editor", () => {
		const { screen, titles, cards, surface } = setup();
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собраться утром");
		expect((screen.el.querySelector(".tc-full-parent") as HTMLElement).hidden).toBe(true);
		expect(titles()).toEqual(["Собрать рюкзак", "Ноутбук", "Пропуск", "Умыться"]);
		expect(cards().map((card) => card.classList.contains("is-done"))).toEqual([false, false, false, true]);
		expect(cards().every((card) => card.querySelector(":scope > .tc-pick"))).toBe(true);
		expect(surface.edit.mock.calls[0][1]).toBe("- Выйти в 8:40");
	});

	it("shows the subtasks of a subtask folded away in the list", () => {
		const folded = morning();
		const { titles } = setup({ ...folded, allSubtasks: [{ ...folded.allSubtasks[0], collapsed: true }, folded.allSubtasks[1]] });
		expect(titles()).toEqual(["Собрать рюкзак", "Ноутбук", "Пропуск", "Умыться"]);
	});

	it("a circle ticks an open subtask done and opens a done one again; the card itself opens its menu", () => {
		const { cards, tasks, deps } = setup();
		cards()[1].querySelector<HTMLElement>(".tc-pick")!.click();
		expect(tasks.toggleDone).toHaveBeenLastCalledWith(expect.objectContaining({ path: [0, 0] }));
		cards()[3].querySelector<HTMLElement>(".tc-pick")!.click();
		expect(tasks.toggleDone).toHaveBeenLastCalledWith(expect.objectContaining({ path: [1] }));
		expect(deps.menu).not.toHaveBeenCalled();
		cards()[0].click();
		expect(deps.menu).toHaveBeenCalledWith(expect.objectContaining({ text: "Собрать рюкзак" }), cards()[0]);
	});

	it("writes the description once typing pauses, and nothing more until something is typed again", async () => {
		const { editor, tasks, screen } = setup();
		editor.value = "- Выйти в 8:40\n- Зонт";
		editor.changed();
		expect(tasks.setDescription).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(600);
		expect(tasks.setDescription).toHaveBeenCalledWith(expect.objectContaining({ path: [] }), "- Выйти в 8:40\n- Зонт");
		screen.close();
		await vi.advanceTimersByTimeAsync(600);
		expect(tasks.setDescription).toHaveBeenCalledOnce();
	});

	it("an empty description opens on one empty point and is not written untouched", async () => {
		const { surface, tasks, screen } = setup(task("Чай", []));
		expect(surface.edit.mock.calls[0][1]).toBe("- ");
		screen.close();
		await vi.advanceTimersByTimeAsync(600);
		expect(tasks.setDescription).not.toHaveBeenCalled();
	});

	it("reads the task anew on a change of the file and closes once it is gone", async () => {
		const { screen, tasks, titles, deps } = setup();
		tasks.find.mockResolvedValueOnce(morning("todo"));
		await screen.refresh();
		expect(tasks.find).toHaveBeenCalledWith(expect.objectContaining({ path: [] }), "Собраться утром");
		expect(titles()).toEqual(["Собрать рюкзак", "Ноутбук", "Пропуск", "Умыться"]);
		tasks.find.mockResolvedValueOnce(null);
		await screen.refresh();
		expect(deps.onClose).toHaveBeenCalledOnce();
	});

	it("opens a subtask over its task, which its task's name over the title leads back to", async () => {
		const { screen, titles } = setup();
		screen.show(backpack());
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собрать рюкзак");
		expect((screen.el.querySelector(".tc-full-parent") as HTMLElement).hidden).toBe(false);
		expect(screen.el.querySelector(".tc-full-parent")?.textContent).toBe("Собраться утром");
		expect(titles()).toEqual(["Ноутбук", "Пропуск"]);
		expect(screen.holds(backpack())).toBe(true);
	});

	it("a subtask opened alone goes up to its task, read where it stands", async () => {
		const { screen, tasks } = setup(backpack());
		tasks.find.mockResolvedValueOnce(morning());
		screen.el.querySelector<HTMLElement>(".tc-full-parent")!.click();
		await vi.runAllTimersAsync();
		expect(tasks.find).toHaveBeenCalledWith({ section: "now", index: 0, path: [], raw: "- [ ] Собраться утром" }, "Собраться утром");
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собраться утром");
	});

	it("the plus types a new subtask last under the task; Enter writes it and keeps the field for the next", async () => {
		const { screen, tasks } = setup();
		tasks.find.mockResolvedValue(morning());
		screen.el.querySelector<HTMLElement>("button.tc-plus")!.click();
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-list textarea")!;
		expect(field).not.toBeNull();
		field.value = " Выпить витамины ";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await vi.runAllTimersAsync();
		expect(tasks.createWithId).toHaveBeenCalledWith(" Выпить витамины ", null, { kind: "subtask", parent: expect.objectContaining({ path: [] }), before: null }, null, []);
		expect(screen.el.querySelector<HTMLTextAreaElement>(".tc-full-list textarea")?.value).toBe("");
	});

	it("Enter on an empty field ends the entry and writes nothing; Escape drops what was typed", async () => {
		const { screen, tasks } = setup();
		screen.el.querySelector<HTMLElement>("button.tc-plus")!.click();
		const field = () => screen.el.querySelector<HTMLTextAreaElement>(".tc-full-list textarea");
		field()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(field()).toBeNull();
		screen.el.querySelector<HTMLElement>("button.tc-plus")!.click();
		field()!.value = "Зонт";
		field()!.dispatchEvent(new InputEvent("input"));
		field()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(field()).toBeNull();
		await vi.runAllTimersAsync();
		expect(tasks.createWithId).not.toHaveBeenCalled();
	});

	it("a tap elsewhere writes the new subtask and ends the entry", async () => {
		const { screen, tasks } = setup();
		screen.el.querySelector<HTMLElement>("button.tc-plus")!.click();
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-list textarea")!;
		field.value = "Зонт";
		field.dispatchEvent(new InputEvent("input"));
		field.blur();
		field.dispatchEvent(new FocusEvent("blur"));
		await vi.runAllTimersAsync();
		expect(tasks.createWithId).toHaveBeenCalledWith("Зонт", null, expect.objectContaining({ kind: "subtask" }), null, []);
		expect(screen.el.querySelector(".tc-full-list textarea")).toBeNull();
	});

	it("a new subtask of a subtask stands where the tree puts it: after that subtask and all its own, a level deeper", () => {
		const { screen } = setup();
		screen.addSubtask(backpack());
		const rows = [...screen.el.querySelectorAll<HTMLElement>(".tc-full-list > .tc-card, .tc-full-list > .tc-quick-row")];
		expect(rows.map((row) => row.querySelector(".tc-card-title")?.textContent ?? "field")).toEqual(["Собрать рюкзак", "Ноутбук", "Пропуск", "field", "Умыться"]);
		expect(rows[3].style.getPropertyValue("--tc-level")).toBe("1");
	});

	it("a subtask's rename in its card sends the text as typed and ends on Enter", async () => {
		const { screen, tasks } = setup();
		screen.rename(backpack());
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-list textarea")!;
		expect(field.value).toBe("Собрать рюкзак");
		field.value = "Собрать сумку";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await vi.runAllTimersAsync();
		expect(tasks.edit).toHaveBeenCalledWith(expect.objectContaining({ path: [0] }), expect.objectContaining({ text: "Собрать сумку" }));
		expect(screen.el.querySelector(".tc-full-list textarea")).toBeNull();
	});

	it("Rename of the task on screen turns its title into the field", async () => {
		const { screen, tasks } = setup();
		screen.rename(morning());
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-title textarea")!;
		field.value = "Собраться";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await vi.runAllTimersAsync();
		expect(tasks.edit).toHaveBeenCalledWith(expect.objectContaining({ path: [] }), expect.objectContaining({ text: "Собраться" }));
	});

	it("Escape in the title puts the title back unwritten; a tap elsewhere writes it", async () => {
		const { screen, tasks } = setup();
		screen.rename(morning());
		let field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-title textarea")!;
		field.value = "Собраться";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await vi.runAllTimersAsync();
		expect(screen.el.querySelector(".tc-full-title textarea")).toBeNull();
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собраться утром");
		expect(tasks.edit).not.toHaveBeenCalled();
		screen.rename(morning());
		field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-title textarea")!;
		field.value = "Собраться к 9";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new FocusEvent("blur"));
		await vi.runAllTimersAsync();
		expect(tasks.edit).toHaveBeenCalledWith(expect.objectContaining({ path: [] }), expect.objectContaining({ text: "Собраться к 9" }));
	});

	it("the renamed title is the task as the service answers with it", async () => {
		const { screen, tasks } = setup();
		const renamed = { ...morning(), text: "Собраться к 9" };
		tasks.edit.mockResolvedValueOnce(renamed);
		tasks.find.mockResolvedValue(renamed);
		screen.rename(morning());
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-title textarea")!;
		field.value = "  Собраться к 9 ";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await vi.runAllTimersAsync();
		await screen.refresh();
		expect(tasks.edit).toHaveBeenCalledWith(expect.objectContaining({ path: [] }), expect.objectContaining({ text: "  Собраться к 9 " }));
		expect(screen.el.querySelector(".tc-full-title textarea")).toBeNull();
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собраться к 9");
	});

	it("a change of the file while its title is written waits for it, then reads the task by the key the rename answered with", async () => {
		const { screen, tasks, deps } = setup();
		const renamed = { ...morning(), text: "Собраться к 9", key: { section: "now" as const, index: 0, path: [], raw: "- [ ] Собраться к 9" } };
		tasks.find.mockImplementation(async (key: { raw: string }) => (key.raw === renamed.key.raw ? renamed : key.raw === "- [ ] Собраться утром" && !tasks.edit.mock.calls.length ? morning() : null));
		let refreshed: Promise<void> | null = null;
		tasks.edit.mockImplementationOnce(async () => {
			refreshed = screen.refresh();
			return renamed;
		});
		screen.rename(morning());
		const field = screen.el.querySelector<HTMLTextAreaElement>(".tc-full-title textarea")!;
		field.value = "Собраться к 9";
		field.dispatchEvent(new InputEvent("input"));
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await vi.runAllTimersAsync();
		await refreshed;
		expect(tasks.find).toHaveBeenLastCalledWith(renamed.key, "Собраться к 9");
		expect(deps.onClose).not.toHaveBeenCalled();
		expect(screen.el.querySelector(".tc-full-title")?.textContent).toBe("Собраться к 9");
	});

	it("closes on Close and on Escape", () => {
		const first = setup();
		first.screen.el.querySelector<HTMLElement>(".tc-sheet-bar button")!.click();
		expect(first.deps.onClose).toHaveBeenCalledOnce();
		const second = setup();
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(second.deps.onClose).toHaveBeenCalledOnce();
	});
});
