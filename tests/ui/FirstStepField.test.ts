// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaleTaskError, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { GestureArbiter } from "../../obsidian/ui/gestures";
import { FirstStepField, FirstStepTyping } from "../../obsidian/ui/quick/FirstStepField";
import { renderTaskCard } from "../../obsidian/ui/TaskCard";
import { fakeTitleField } from "../fakes/FakeTitleField";
import { onDay } from "../fakes/itemOnDay";

const TODAY = "2026-11-15";

const task = (extra: Partial<TaskItem> = {}): TaskItem =>
	onDay({ key: { section: "now", index: 0, path: [], raw: "- [ ] Plan the trip" }, text: "Plan the trip", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false, ...extra }, TODAY);

/** The task as the core draws it while the field is open on it (`firstStepScreen`): folded, its card the field's. */
const typing = (item: TaskItem): TaskItem => ({ ...item, collapsed: true, card: item.firstStepCard, block: { text: "", title: "", step: null } });

/** A list's card of `item`, in the page, as the list draws it. */
function listCard(item: TaskItem): HTMLElement {
	return renderTaskCard(document.body, item, { day: TODAY });
}

/** A timeline block drawn with an empty line, as the core draws it while the field is open. */
function block(): HTMLElement {
	const node = document.body.appendChild(document.createElement("div"));
	node.className = "tc-block";
	const card = node.appendChild(document.createElement("div"));
	card.className = "tc-block-card";
	card.appendChild(document.createElement("div")).className = "tc-card-title";
	return node;
}

function open(source: HTMLElement) {
	const done: (string | null)[] = [];
	let written: () => void = () => undefined;
	const writing = new Promise<void>((resolve) => (written = resolve));
	FirstStepField.open({
		source,
		titleField: fakeTitleField,
		onDone: (text) => {
			done.push(text);
			return writing;
		},
	});
	return { done, written, ...keys(source) };
}

function keys(source: HTMLElement) {
	const field = () => source.querySelector<HTMLTextAreaElement>(".tc-first-step textarea");
	const press = (key: string) => field()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	return { field, press };
}

afterEach(() => document.body.replaceChildren());

describe("First step on a list's card", () => {
	it("makes the folded card's empty step line the field, the task's title small on top, the caret in it", () => {
		const card = listCard(typing(task()));
		const { field } = open(card);
		expect(card.classList.contains("is-two-line")).toBe(true);
		expect(card.classList.contains("is-collapsed")).toBe(true);
		expect(card.querySelector(".tc-card-over")?.textContent).toBe("Plan the trip");
		expect(card.querySelector(".tc-card-lines > .tc-first-step")).not.toBeNull();
		expect(field()?.value).toBe("");
		expect(field()?.placeholder).toBe("First step");
		expect(document.activeElement).toBe(field());
		expect(card.classList.contains("is-first-step")).toBe(true);
	});

	it("hands over the text on Enter, keeps it on the step line until the screen draws again, and opens no next field", async () => {
		const card = listCard(typing(task()));
		const { done, field, press, written } = open(card);
		field()!.value = "Call the agency";
		press("Enter");
		expect(done).toEqual(["Call the agency"]);
		expect(field()).toBeNull();
		expect(card.querySelector(".tc-card-lines > .tc-card-title")?.textContent).toBe("Call the agency");
		written();
		await Promise.resolve();
		await Promise.resolve();
		expect(card.classList.contains("is-first-step")).toBe(false);
	});

	it("hands over nothing on Escape, once", () => {
		const { done, field, press } = open(listCard(typing(task())));
		field()!.value = "Call the agency";
		press("Escape");
		field()?.blur();
		expect(done).toEqual([null]);
	});

	it("takes a tap elsewhere as Enter, with what is typed", () => {
		vi.useFakeTimers();
		try {
			const { done, field } = open(listCard(typing(task())));
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
		const node = block();
		const { field } = open(node);
		const card = node.querySelector(".tc-block-card")!;
		expect(card.querySelector(":scope > .tc-first-step")).not.toBeNull();
		expect(card.querySelector(".tc-card-over")).toBeNull();
		expect(card.querySelector(".tc-card-title")).toBeNull();
		expect(card.classList.contains("is-first-step")).toBe(true);
		expect(document.activeElement).toBe(field());
	});
});

describe("First step from the menu", () => {
	function screen(write: (key: TaskKey, text: string) => Promise<void> = async () => undefined) {
		const arbiter = new GestureArbiter();
		const log: string[] = [];
		const writes: [TaskKey, string][] = [];
		const errors: unknown[] = [];
		const item = task();
		const card = listCard(item);
		const typingOn = new FirstStepTyping({
			arbiter,
			titleField: fakeTitleField,
			fold: (key) => log.push(key ? "fold" : "unfold"),
			draw: () => {
				log.push(arbiter.busy ? "draw held" : "draw");
				card.replaceChildren();
				card.className = "tc-card";
				const drawn = renderTaskCard(null, log[log.length - 2] === "fold" ? typing(item) : item, { day: TODAY });
				card.className = drawn.className;
				card.append(...drawn.childNodes);
			},
			write: (key, text) => {
				writes.push([key, text]);
				return write(key, text);
			},
			onError: (error) => errors.push(error),
		});
		typingOn.open(item, card);
		return { arbiter, log, writes, errors, item, card, ...keys(card) };
	}
	const settled = async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve();
	};

	it("draws the task folded in the same tap, then opens the field on its card and holds the screen", () => {
		const { arbiter, log, card, field } = screen();
		expect(log).toEqual(["fold", "draw"]);
		expect(card.classList.contains("is-collapsed")).toBe(true);
		expect(document.activeElement).toBe(field());
		expect(arbiter.busy).toBe(true);
	});

	it("writes nothing on Escape, lets the screen go and draws it as read", async () => {
		const { arbiter, log, writes, press } = screen();
		press("Escape");
		await settled();
		expect(writes).toEqual([]);
		expect(arbiter.busy).toBe(false);
		expect(log.slice(2)).toEqual(["unfold", "draw"]);
	});

	it("writes the text for the task's key on Enter, then lets the screen go", async () => {
		const { arbiter, writes, item, field, press } = screen();
		field()!.value = "Call the agency";
		press("Enter");
		await settled();
		expect(writes).toEqual([[item.key, "Call the agency"]]);
		expect(arbiter.busy).toBe(false);
	});

	it("writes what is typed on a tap elsewhere", async () => {
		vi.useFakeTimers();
		try {
			const { writes, item, field } = screen();
			field()!.value = "Call the agency";
			field()!.blur();
			vi.runAllTimers();
			await settled();
			expect(writes).toEqual([[item.key, "Call the agency"]]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("lets the screen go when the write finds the task stale", async () => {
		const stale = new StaleTaskError();
		const { arbiter, errors, field, press } = screen(() => Promise.reject(stale));
		field()!.value = "Call the agency";
		press("Enter");
		await settled();
		expect(arbiter.busy).toBe(false);
		expect(errors).toEqual([stale]);
	});

	it("lets the screen go and tells the failure when the write fails", async () => {
		const failure = new Error("disk");
		const { arbiter, errors, log, field, press } = screen(() => Promise.reject(failure));
		field()!.value = "Call the agency";
		press("Enter");
		await settled();
		expect(arbiter.busy).toBe(false);
		expect(errors).toEqual([failure]);
		expect(log.slice(-2)).toEqual(["unfold", "draw"]);
	});

	it("opens nothing while another gesture holds the screen", () => {
		const arbiter = new GestureArbiter();
		arbiter.claim("drag");
		const log: string[] = [];
		const card = listCard(task());
		new FirstStepTyping({ arbiter, titleField: fakeTitleField, fold: () => log.push("fold"), draw: () => log.push("draw"), write: async () => undefined, onError: () => undefined }).open(task(), card);
		expect(log).toEqual([]);
		expect(card.querySelector(".tc-first-step")).toBeNull();
	});
});
