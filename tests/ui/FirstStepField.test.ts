// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { FirstStepField } from "../../obsidian/ui/quick/FirstStepField";
import { renderTaskCard } from "../../obsidian/ui/TaskCard";
import { fakeTitleField } from "../fakes/FakeTitleField";
import { onDay } from "../fakes/itemOnDay";

const TODAY = "2026-11-15";

const task = (extra: Partial<TaskItem> = {}): TaskItem =>
	onDay({ key: { section: "now", index: 0, path: [], raw: "- [ ] Plan the trip" }, text: "Plan the trip", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false, ...extra }, TODAY);

/** A list's card of `item`, in the page. */
function listCard(item: TaskItem): HTMLElement {
	return renderTaskCard(document.body, item, { day: TODAY });
}

/** A timeline block of `item`, its card showing one line. */
function block(item: TaskItem): HTMLElement {
	const node = document.body.appendChild(document.createElement("div"));
	node.className = "tc-block";
	const card = node.appendChild(document.createElement("div"));
	card.className = "tc-block-card";
	const title = card.appendChild(document.createElement("div"));
	title.className = "tc-card-title";
	title.textContent = item.block.text;
	return node;
}

function open(item: TaskItem, source: HTMLElement) {
	const done: (string | null)[] = [];
	let written: () => void = () => undefined;
	const writing = new Promise<void>((resolve) => (written = resolve));
	FirstStepField.open({
		item,
		source,
		titleField: fakeTitleField,
		onDone: (text) => {
			done.push(text);
			return writing;
		},
	});
	const field = () => source.querySelector<HTMLTextAreaElement>(".tc-first-step textarea");
	const press = (key: string) => field()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	return { done, field, press, written };
}

afterEach(() => document.body.replaceChildren());

describe("First step on a list's card", () => {
	it("folds the card at once: the task's title small on top, the step line an empty field with the caret in it", () => {
		const card = listCard(task());
		const { field } = open(task(), card);
		expect(card.classList.contains("is-two-line")).toBe(true);
		expect(card.querySelector(".tc-card-over")?.textContent).toBe("Plan the trip");
		expect(field()?.value).toBe("");
		expect(field()?.placeholder).toBe("First step");
		expect(document.activeElement).toBe(field());
		expect(card.querySelector(".tc-card-lines > .tc-first-step")).not.toBeNull();
		expect(card.classList.contains("is-first-step")).toBe(true);
	});

	it("draws a folded task's card as the task, not its shown step", () => {
		const step = task({ text: "Old step", key: { section: "now", index: 0, path: [0], raw: "  - [ ] Old step" } });
		const folded = task({ card: { text: "Old step", title: "Old step", over: "Plan the trip", step } });
		const card = listCard(folded);
		const { field } = open(folded, card);
		expect(card.querySelector(".tc-card-over")?.textContent).toBe("Plan the trip");
		expect(card.textContent).not.toContain("Old step");
		expect(field()?.value).toBe("");
	});

	it("hands over the text on Enter, keeps it on the step line until the screen draws again, and opens no next field", async () => {
		const card = listCard(task());
		const { done, field, press, written } = open(task(), card);
		field()!.value = "Call the agency";
		press("Enter");
		expect(done).toEqual(["Call the agency"]);
		expect(field()).toBeNull();
		expect(card.querySelector(".tc-card-lines > .tc-card-title")?.textContent).toBe("Call the agency");
		expect(card.classList.contains("is-first-step")).toBe(true);
		written();
		await Promise.resolve();
		await Promise.resolve();
		expect(card.classList.contains("is-first-step")).toBe(false);
	});

	it("hands over nothing on Escape, once", () => {
		const card = listCard(task());
		const { done, field, press } = open(task(), card);
		field()!.value = "Call the agency";
		press("Escape");
		field()?.blur();
		expect(done).toEqual([null]);
	});

	it("takes a tap elsewhere as Enter, with what is typed", async () => {
		vi.useFakeTimers();
		try {
			const card = listCard(task());
			const { done, field } = open(task(), card);
			field()!.value = "Call the agency";
			field()!.blur();
			vi.runAllTimers();
			expect(done).toEqual(["Call the agency"]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("First step on a timeline block", () => {
	it("makes the block's one line the field, with no line over it", () => {
		const node = block(task());
		const { field } = open(task(), node);
		const card = node.querySelector(".tc-block-card")!;
		expect(card.querySelector(":scope > .tc-first-step")).not.toBeNull();
		expect(card.querySelector(".tc-card-over")).toBeNull();
		expect(card.querySelector(".tc-card-title")).toBeNull();
		expect(card.classList.contains("is-first-step")).toBe(true);
		expect(document.activeElement).toBe(field());
	});
});
