// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantOffer, AssistantOutcome, AssistantService, UndoService } from "../../core/application/contracts";
import { AssistantAnswers, type MarkdownHost } from "../../obsidian/ui/assistant/AssistantAnswers";
import { AssistantSettingsPage } from "../../obsidian/ui/assistant/AssistantPage";
import { BottomCapsule } from "../../obsidian/ui/BottomCapsule";
import { type AssistantMenuRows, MoreMenu } from "../../obsidian/ui/menu/MoreMenu";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { rig, settle } from "../application/assistant/assistantFakes";

const NO_UNDO: UndoService = { undo: async () => "nothing", redo: async () => "nothing", canUndo: () => false, canRedo: () => false, onChange: () => () => undefined };

/** Markdown drawn as plain text, and what was let go. */
function plainMarkdown(): MarkdownHost & { released: number } {
	const host = Object.assign(
		(el: HTMLElement, text: string) => {
			el.textContent = text;
			return { done: Promise.resolve(), release: () => host.released++ };
		},
		{ released: 0 },
	);
	return host;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("«⋯» and the assistant", () => {
	const rows = () => [...document.querySelectorAll<HTMLElement>(".tc-panel.is-more .tc-menu-row")];
	/** Rows offered as given, and what the menu asked of them. */
	const fixed = (offers: readonly AssistantOffer[]) => ({ offers: () => offers, onChange: () => () => undefined, press: vi.fn(), stop: vi.fn() });
	const open = (assistant: AssistantMenuRows) => MoreMenu.open({ anchor: document.body.appendChild(document.createElement("div")), onSearch: vi.fn(), onSelect: vi.fn(), assistant });
	/** The menu over the real service, as CalendarScreen wires it. */
	const served = (service: AssistantService): AssistantMenuRows => ({
		offers: () => service.offers("more"),
		onChange: (listener) => service.onChange(listener),
		press: (id) => void service.press(id),
		stop: (id) => service.stop(id),
	});

	it("draws the core's rows after Search and Select tasks, label and icon from the offer; a tap closes the menu and presses it", () => {
		const assistant = fixed([{ actionId: "bestTask", label: "Best task", icon: "sparkles", running: false }]);
		open(assistant);
		expect(rows().map((r) => r.textContent?.trim())).toEqual(["Search", "Select tasks", "Best task"]);
		expect(rows()[2].querySelector("svg")).not.toBeNull();
		expect(rows()[2].querySelector(".tc-spinner")).toBeNull();
		rows()[2].click();
		expect(assistant.press).toHaveBeenCalledWith("bestTask");
		expect(assistant.stop).not.toHaveBeenCalled();
		expect(document.querySelector(".tc-panel.is-more")?.classList.contains("is-closing")).toBe(true);
	});

	it("a running row shows its own label with the ring in its icon's place, and a tap on it stops, never presses", () => {
		const assistant = fixed([{ actionId: "bestTask", label: "Stop", icon: "sparkles", running: true }]);
		open(assistant);
		expect(rows()[2].textContent?.trim()).toBe("Stop");
		expect(rows()[2].querySelector("svg")).toBeNull();
		expect(rows()[2].querySelector(".tc-spinner")).not.toBeNull();
		rows()[2].click();
		expect(assistant.stop).toHaveBeenCalledWith("bestTask");
		expect(assistant.press).not.toHaveBeenCalled();
	});

	it("no offers, no row: the phone", () => {
		open(fixed([]));
		expect(rows().map((r) => r.textContent?.trim())).toEqual(["Search", "Select tasks"]);
	});

	it("while it is open, the run's end turns Stop back into Best task; a tap then starts no stale stop", async () => {
		const { assistant, transport } = rig();
		const run = assistant.press("bestTask");
		await settle();
		const menu = served(assistant);
		const stop = vi.spyOn(menu, "stop");
		const capsule = new BottomCapsule(document.body, NO_UNDO, { onUndo: vi.fn(), onMore: vi.fn() }, assistant);
		MoreMenu.open({ anchor: capsule.el, onSearch: vi.fn(), onSelect: vi.fn(), assistant: menu });
		const copyBusy = () => document.querySelector(".tc-control-copy .tc-more-open")!.classList.contains("is-busy");
		expect(copyBusy()).toBe(true);
		expect(rows()[2].textContent?.trim()).toBe("Stop");
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent is due." });
		await run;
		expect(rows()[2].textContent?.trim()).toBe("Best task");
		expect(rows()[2].querySelector(".tc-spinner")).toBeNull();
		expect(copyBusy()).toBe(false);
		expect(stop).not.toHaveBeenCalled();
	});

	it("a Stop left from a run that ended starts no call: the service's stop does nothing", async () => {
		const { assistant, transport } = rig();
		const run = assistant.press("bestTask");
		await settle();
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent is due." });
		await run;
		assistant.stop("bestTask");
		await settle();
		expect(transport.asked).toHaveLength(1);
		expect(assistant.busy).toBe(false);
	});

	it("stops following the core once it closes", () => {
		const listeners = new Set<() => void>();
		const assistant = { ...fixed([]), onChange: (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener)) };
		const menu = open(assistant);
		expect(listeners.size).toBe(1);
		menu.close();
		expect(listeners.size).toBe(0);
	});

	it("«⋯» spins while a run is under way, and stops spinning when it ends; everything stays pressable", async () => {
		const { assistant, transport } = rig();
		new BottomCapsule(document.body, NO_UNDO, { onUndo: vi.fn(), onMore: vi.fn() }, assistant);
		const more = document.querySelector<HTMLButtonElement>(".tc-more-open")!;
		expect(more.classList.contains("is-busy")).toBe(false);
		const run = assistant.press("bestTask");
		await settle();
		expect(more.classList.contains("is-busy")).toBe(true);
		expect(more.disabled).toBe(false);
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent is due." });
		await run;
		expect(more.classList.contains("is-busy")).toBe(false);
	});
});

describe("AssistantAnswers", () => {
	const TASK_OUTCOME = async () => {
		const { assistant, transport } = rig();
		const run = assistant.press("bestTask");
		await settle();
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "**Rent** is due." });
		return run;
	};

	it("shows the answer in the middle of the window: the small title, the task's card, the reason as markdown, Close", async () => {
		const outcome = await TASK_OUTCOME();
		const markdown = plainMarkdown();
		const answers = new AssistantAnswers(rig().assistant, markdown, vi.fn());
		answers.show(outcome, "bestTask");
		const popup = document.querySelector<HTMLElement>(".tc-panel.is-answer")!;
		expect(document.querySelector(".tc-backdrop")).not.toBeNull();
		expect(popup.querySelector(".tc-answer-title")?.textContent).toBe("Best task");
		expect(popup.querySelector(".tc-card .tc-card-title")?.textContent).toBe("Pay rent");
		expect(popup.querySelector(".tc-answer-note")?.textContent).toBe("**Rent** is due.");
		popup.querySelector<HTMLButtonElement>(".tc-answer-close")!.click();
		expect(popup.classList.contains("is-closing")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(markdown.released).toBe(1);
	});

	describe("the chosen card as the screen draws it", () => {
		const STEPS = [
			"## Now",
			"",
			"- [ ] Move to Belgrade 📁",
			"\t- [ ] Find a flat",
			"\t\t- [ ] Pick districts",
			"\t- [ ] Book the movers",
			"- [ ] Call the bank",
			"\t- [ ] Find the contract",
			"- [ ] Pay rent",
			"",
			"## Soon",
			"",
			"## Done",
			"",
		].join("\n");
		const shown = async (title: string) => {
			const { assistant, transport } = rig({ text: STEPS });
			const run = assistant.press("bestTask");
			await settle();
			transport.answer({ taskRef: transport.refOf(title), reason: "Because." });
			new AssistantAnswers(assistant, plainMarkdown(), vi.fn()).show(await run, "bestTask");
			const card = document.querySelector<HTMLElement>(".tc-panel.is-answer .tc-card")!;
			return { over: card.querySelector(".tc-card-over-text")?.textContent ?? null, title: card.querySelector(".tc-card-title")?.textContent, card };
		};

		it("a folded task's next step: on the folded task's card, its title small above the step", async () => {
			const { over, title, card } = await shown("Pick districts");
			expect(over).toBe("Move to Belgrade");
			expect(title).toBe("Pick districts");
			expect(card.classList.contains("is-two-line")).toBe(true);
		});

		it("a subtask of an unfolded task: its parent's title small above its own", async () => {
			const { over, title, card } = await shown("Find the contract");
			expect(over).toBe("Call the bank");
			expect(title).toBe("Find the contract");
			expect(card.classList.contains("is-two-line")).toBe(true);
		});

		it("a top task: its own title alone, no line above", async () => {
			const { over, title, card } = await shown("Pay rent");
			expect(over).toBeNull();
			expect(title).toBe("Pay rent");
			expect(card.classList.contains("is-two-line")).toBe(false);
		});
	});

	describe("what the marking couldn't do, under the card", () => {
		const LABELLED = { ...DEFAULT_SETTINGS, labels: [{ name: "Focus", color: "orange" as const }], assistant: { ...DEFAULT_SETTINGS.assistant, options: { bestTask: { label: "Focus" } } } };
		const FILE = ["## Now", "", "- [ ] Pay rent", "- [ ] p1 Sign the lease", "", "## Soon", "", "## Done", ""].join("\n");
		const shown = async (title: string) => {
			const { assistant, transport } = rig({ text: FILE, settings: LABELLED });
			const run = assistant.press("bestTask");
			await settle();
			transport.answer({ taskRef: transport.refOf(title), reason: "Because." });
			new AssistantAnswers(assistant, plainMarkdown(), vi.fn()).show(await run, "bestTask");
			return document.querySelector<HTMLElement>(".tc-panel.is-answer")!;
		};

		it("a refused marking: the core's line right under the card, before the reason", async () => {
			const popup = await shown("Sign the lease");
			const notice = popup.querySelector<HTMLElement>(".tc-answer-notice")!;
			expect(notice.textContent).toBe("Couldn't add the label Focus to this task.");
			expect(notice.previousElementSibling?.classList.contains("tc-answer-card")).toBe(true);
			expect(notice.nextElementSibling?.classList.contains("tc-answer-note")).toBe(true);
		});

		it("a marking that took: no line, the card shows the label", async () => {
			const popup = await shown("Pay rent");
			expect(popup.querySelector(".tc-answer-notice")).toBeNull();
			expect(popup.querySelector<HTMLElement>(".tc-answer-card")?.dataset.priority).toBe("orange");
		});
	});

	it("a press that joins a run under way shows its answer once", async () => {
		const { assistant, transport } = rig();
		const answers = new AssistantAnswers(assistant, plainMarkdown(), vi.fn());
		answers.press("bestTask");
		await settle();
		answers.press("bestTask");
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent." });
		await settle();
		expect(transport.asked).toHaveLength(1);
		expect(document.querySelectorAll(".tc-panel.is-answer")).toHaveLength(1);
	});

	it("Escape closes it", async () => {
		new AssistantAnswers(rig().assistant, plainMarkdown(), vi.fn()).show(await TASK_OUTCOME(), "bestTask");
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(document.querySelector(".tc-panel.is-answer")?.classList.contains("is-closing")).toBe(true);
	});

	it("a failure takes the same popup, its words in the reason's place; its detail goes to the console", () => {
		const log = vi.fn();
		const failed: AssistantOutcome = { kind: "failed", title: "Couldn't find the best task", words: "Claude Code isn't signed in.", detail: "authentication_failed" };
		new AssistantAnswers(rig().assistant, plainMarkdown(), log).show(failed, "bestTask");
		const popup = document.querySelector<HTMLElement>(".tc-panel.is-answer.is-failure")!;
		expect(popup.querySelector(".tc-answer-title")?.textContent).toBe("Couldn't find the best task");
		expect(popup.querySelector(".tc-card")).toBeNull();
		expect(popup.querySelector(".tc-answer-note")?.textContent).toBe("Claude Code isn't signed in.");
		expect(log).toHaveBeenCalledWith("authentication_failed");
	});

	it("a write that failed while marking: the answer shows with its line, the error goes to the console once", async () => {
		const { assistant, transport } = rig({
			text: ["## Now", "", "- [ ] Pay rent", "", "## Soon", "", "## Done", ""].join("\n"),
			settings: { ...DEFAULT_SETTINGS, labels: [{ name: "Focus", color: "orange" as const }], assistant: { ...DEFAULT_SETTINGS.assistant, options: { bestTask: { label: "Focus" } } } },
			tasksPort: (tasks) => ({
				listed: () => tasks.listed(),
				sectionOffer: (date) => tasks.sectionOffer(date),
				addContext: (key, text) => tasks.addContext(key, text),
				menu: (item, from, screen) => tasks.menu(item, from, screen),
				toggleLabel: () => Promise.reject(new Error("disk full")),
			}),
		});
		const log = vi.fn();
		const run = assistant.press("bestTask");
		await settle();
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Because." });
		new AssistantAnswers(assistant, plainMarkdown(), log).show(await run, "bestTask");
		const popup = document.querySelector<HTMLElement>(".tc-panel.is-answer")!;
		expect(popup.classList.contains("is-failure")).toBe(false);
		expect(popup.querySelector(".tc-card .tc-card-title")?.textContent).toBe("Pay rent");
		expect(popup.querySelector(".tc-answer-notice")?.textContent).toBe("Couldn't move the label Focus.");
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain("disk full");
	});

	it("an answer with nothing for the console writes nothing there", async () => {
		const log = vi.fn();
		new AssistantAnswers(rig().assistant, plainMarkdown(), log).show(await TASK_OUTCOME(), "bestTask");
		expect(log).not.toHaveBeenCalled();
	});

	it("Stop shows nothing", () => {
		expect(new AssistantAnswers(rig().assistant, plainMarkdown(), vi.fn()).show({ kind: "stopped" }, "bestTask")).toBeNull();
		expect(document.querySelector(".tc-panel")).toBeNull();
	});

	describe("the field for what Claude missed", () => {
		const opened = async (log = vi.fn()) => {
			const r = rig();
			const run = r.assistant.press("bestTask");
			await settle();
			r.transport.answer({ taskRef: r.transport.refOf("Pay rent"), reason: "Rent." });
			const answers = new AssistantAnswers(r.assistant, plainMarkdown(), log);
			answers.show(await run, "bestTask");
			const popup = document.querySelector<HTMLElement>(".tc-panel.is-answer")!;
			const field = popup.querySelector<HTMLTextAreaElement>("textarea.tc-answer-field")!;
			const type = (text: string) => {
				field.value = text;
				field.dispatchEvent(new Event("input"));
			};
			const shown = () => [...popup.querySelectorAll<HTMLButtonElement>(".tc-answer-foot > button")].filter((b) => !b.classList.contains("is-hidden")).map((b) => b.textContent);
			return { ...r, answers, popup, field, type, shown };
		};

		it("stands under the reason, the core's placeholder in it; empty, the foot is Close alone", async () => {
			const { popup, field, shown } = await opened();
			expect(field.previousElementSibling?.classList.contains("tc-answer-note")).toBe(true);
			expect(field.placeholder).toBe("What did Claude miss?");
			expect(shown()).toEqual(["Close"]);
			expect(popup.querySelector<HTMLElement>(".tc-answer-failed")!.hidden).toBe(true);
		});

		it("with text, Save and Save and ask again take Close's place; emptied, Close comes back", async () => {
			const { type, shown } = await opened();
			type("Sixth of the same");
			expect(shown()).toEqual(["Save", "Save and ask again"]);
			type("");
			expect(shown()).toEqual(["Close"]);
		});

		it("Save writes the line to the chosen task and closes", async () => {
			const { type, popup, store, transport } = await opened();
			type("Takes a minute");
			popup.querySelector<HTMLButtonElement>(".tc-answer-save")!.click();
			await settle();
			expect(store.text).toContain("- [ ] Pay rent 🗂️ Home\n\t- Контекст: Takes a minute");
			expect(popup.classList.contains("is-closing")).toBe(true);
			expect(transport.asked).toHaveLength(1);
		});

		it("Save and ask again writes, closes and presses Best task again", async () => {
			const { type, popup, store, transport } = await opened();
			type("Takes a minute");
			popup.querySelector<HTMLButtonElement>(".tc-answer-again")!.click();
			await settle();
			expect(store.text).toContain("\t- Контекст: Takes a minute");
			expect(popup.classList.contains("is-closing")).toBe(true);
			expect(transport.asked).toHaveLength(2);
		});

		it("⌘Enter in the field is Save and ask again", async () => {
			const { type, field, store, transport } = await opened();
			type("Takes a minute");
			field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
			await settle();
			expect(store.text).toContain("\t- Контекст: Takes a minute");
			expect(transport.asked).toHaveLength(2);
		});

		it("a write that took is the last: a second ⌘Enter or press while the popup fades writes nothing and asks nothing", async () => {
			const { type, field, popup, store, transport } = await opened();
			type("Takes a minute");
			const modEnter = () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
			modEnter();
			await settle();
			modEnter();
			popup.querySelector<HTMLButtonElement>(".tc-answer-save")!.click();
			popup.querySelector<HTMLButtonElement>(".tc-answer-again")!.click();
			await settle();
			expect(store.text?.split("Контекст: Takes a minute")).toHaveLength(2);
			expect(transport.asked).toHaveLength(2);
		});

		it("Save then ⌘Enter while the popup fades: one line, no second question", async () => {
			const { type, field, popup, store, transport } = await opened();
			type("Takes a minute");
			popup.querySelector<HTMLButtonElement>(".tc-answer-save")!.click();
			await settle();
			field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
			await settle();
			expect(store.text?.split("Контекст: Takes a minute")).toHaveLength(2);
			expect(transport.asked).toHaveLength(1);
		});

		it("Save and ask again, then Escape before the write is back: the line is written, nothing is asked again", async () => {
			const { type, popup, store, transport } = await opened();
			type("Takes a minute");
			popup.querySelector<HTMLButtonElement>(".tc-answer-again")!.click();
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			await settle();
			expect(store.text).toContain("\t- Контекст: Takes a minute");
			expect(transport.asked).toHaveLength(1);
		});

		it("Escape closes without writing", async () => {
			const { type, popup, store } = await opened();
			const before = store.text;
			type("Takes a minute");
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			expect(popup.classList.contains("is-closing")).toBe(true);
			expect(store.text).toBe(before);
		});

		it("a write that failed keeps the popup and the text, says so under the field, the detail to the console", async () => {
			const log = vi.fn();
			const { type, popup, field, store } = await opened(log);
			store.text = ["## Now", "", "- [ ] Read a book", "", "## Soon", "", "## Done", ""].join("\n");
			type("Takes a minute");
			popup.querySelector<HTMLButtonElement>(".tc-answer-save")!.click();
			await settle();
			const failed = popup.querySelector<HTMLElement>(".tc-answer-failed")!;
			expect(failed.hidden).toBe(false);
			expect(failed.textContent).toBe("Couldn't save to this task.");
			expect(failed.previousElementSibling).toBe(field);
			expect(field.value).toBe("Takes a minute");
			expect(popup.classList.contains("is-closing")).toBe(false);
			expect(log).toHaveBeenCalledTimes(1);
		});

		it("a failure's popup has no field", () => {
			new AssistantAnswers(rig().assistant, plainMarkdown(), vi.fn()).show({ kind: "failed", title: "Couldn't", words: "No.", detail: "x" }, "bestTask");
			expect(document.querySelector(".tc-answer-field")).toBeNull();
		});
	});

	it("a press shows its outcome when it comes, the view or not", async () => {
		const { assistant, transport } = rig();
		new AssistantAnswers(assistant, plainMarkdown(), vi.fn()).press("bestTask");
		await settle();
		expect(document.querySelector(".tc-panel.is-answer")).toBeNull();
		transport.answer({ taskRef: transport.refOf("Read a book"), reason: "It rests." });
		await settle();
		expect(document.querySelector(".tc-panel.is-answer .tc-card-title")?.textContent).toBe("Read a book");
	});
});

describe("More → Assistant", () => {
	const names = (root: HTMLElement) => [...root.querySelectorAll(".setting-item-name")].map((n) => n.textContent);

	it("draws the core's page: the model, its fields with what this Mac found, the timeout, each button's prompt", async () => {
		const { assistant, transport } = rig();
		transport.hints = { path: "/opt/homebrew/bin/claude" };
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, vi.fn()).build(root);
		expect(names(root)).toEqual(["Model", "Claude", "Model", "Path to claude", "Timeout", "Prompts", "Best task", "Label", "Skip label"]);
		const select = root.querySelector("select")!;
		expect([...select.options].map((o) => [o.value, o.textContent, o.disabled])).toEqual([["claude", "Claude", false]]);
		const model = root.querySelectorAll("select")[1];
		expect(model.value).toBe("sonnet");
		expect([...model.options].map((o) => o.value)).toEqual(["sonnet", "opus", "haiku"]);
		const inputs = root.querySelectorAll<HTMLInputElement>("input");
		expect(root.querySelector(".tc-assistant-note")?.textContent).toBe("Empty: found by itself");
		expect([...root.querySelectorAll<HTMLElement>(".tc-assistant-hint")].filter((h) => !h.hidden).map((h) => h.textContent)).toEqual(["/opt/homebrew/bin/claude"]);
		expect(inputs[1].value).toBe("120");
		expect(root.querySelector("textarea")!.value).toMatch(/^You help me choose the one task/);
		expect(root.querySelector<HTMLButtonElement>(".tc-assistant-prompt-head button")!.disabled).toBe(true);
	});

	it("writes what is typed through the core: a field, a prompt (Reset lights up, and takes it back), the timeout", async () => {
		const { assistant, settings } = rig();
		const redraw = vi.fn();
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, redraw).build(root);
		const model = root.querySelectorAll("select")[1];
		model.value = "haiku";
		model.dispatchEvent(new Event("change"));
		const inputs = root.querySelectorAll<HTMLInputElement>("input");
		const area = root.querySelector("textarea")!;
		area.value = "Pick the cheapest.";
		area.dispatchEvent(new Event("input"));
		inputs[1].value = "60";
		inputs[1].dispatchEvent(new Event("change"));
		await settle();
		expect(settings.get().assistant).toMatchObject({ timeoutSeconds: 60, prompts: { bestTask: "Pick the cheapest." }, models: { claude: { model: "haiku" } } });
		const reset = root.querySelector<HTMLButtonElement>(".tc-assistant-prompt-head button")!;
		expect(reset.disabled).toBe(false);
		reset.click();
		await settle();
		expect(settings.get().assistant.prompts).toEqual({});
		expect(redraw).toHaveBeenCalled();
	});

	it("where no model is served (the phone), says why, and the prompts stay editable", async () => {
		const { assistant } = rig({ models: () => ({ ids: [] }) });
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, vi.fn()).build(root);
		expect(root.querySelector(".tc-assistant-unavailable")?.textContent).toBe("Claude works in Obsidian on the Mac.");
		expect(root.querySelector("select")!.options[0].disabled).toBe(true);
		expect(names(root)).toEqual(["Model", "Timeout", "Prompts", "Best task", "Label", "Skip label"]);
		expect(root.querySelector("textarea")).not.toBeNull();
	});

	it("draws the page's own words as the core gives them", async () => {
		const { assistant } = rig();
		const words = { model: "M", timeout: "T", timeoutNote: "TN", prompts: "P", promptsNote: "PN", reset: "R" };
		const page = await assistant.page();
		const worded: AssistantService = Object.assign(Object.create(assistant) as AssistantService, { page: async () => ({ ...page, words }) });
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(worded, vi.fn()).build(root);
		expect(names(root)).toEqual(["M", "Claude", "Model", "Path to claude", "T", "P", "Best task", "Label", "Skip label"]);
		expect(root.textContent).toContain("TN");
		expect(root.textContent).toContain("PN");
		expect(root.querySelector(".tc-assistant-prompt-head button")!.textContent).toBe("R");
	});

	it("a blank or unreadable Timeout writes nothing and shows the saved one again", async () => {
		const { assistant, settings } = rig();
		const redraw = vi.fn();
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, redraw).build(root);
		const timeout = [...root.querySelectorAll(".setting-item")].find((item) => item.querySelector(".setting-item-name")?.textContent === "Timeout")!.querySelector("input")!;
		for (const typed of ["", "  ", "abc"]) {
			timeout.value = typed;
			timeout.dispatchEvent(new Event("change"));
			await settle();
			expect(timeout.value).toBe("120");
		}
		expect(settings.get().assistant.timeoutSeconds).toBe(120);
		expect(redraw).not.toHaveBeenCalled();
	});

	describe("an action's option rows, under its prompt", () => {
		const LABELS = [
			{ name: "Good_fun", color: "red" },
			{ name: "Focus", color: "orange" },
		] as const;
		const built = async (label: string | null) => {
			const r = rig({ settings: { ...DEFAULT_SETTINGS, labels: [...LABELS], assistant: { ...DEFAULT_SETTINGS.assistant, options: label === null ? {} : { bestTask: { label } } } } });
			const root = document.body.appendChild(document.createElement("div"));
			await new AssistantSettingsPage(r.assistant, vi.fn()).build(root);
			const row = [...root.querySelectorAll(".setting-item")].find((item) => item.querySelector(".setting-item-name")?.textContent === "Label")!;
			return { ...r, row, select: row.querySelector("select")! };
		};

		it("draws the row after the prompt, its choices as given, None first, the current one chosen", async () => {
			const { row, select } = await built("Focus");
			expect(row.previousElementSibling?.tagName).toBe("TEXTAREA");
			expect([...select.options].map((o) => o.textContent)).toEqual(["None", "Good fun", "Focus"]);
			expect(select.selectedOptions[0].textContent).toBe("Focus");
		});

		it("none set: None chosen", async () => {
			const { select } = await built(null);
			expect(select.selectedOptions[0].textContent).toBe("None");
		});

		it("a change sets the option through the core; None sets it to none", async () => {
			const { select, settings } = await built(null);
			const choose = async (title: string) => {
				select.value = [...select.options].find((o) => o.textContent === title)!.value;
				select.dispatchEvent(new Event("change"));
				await settle();
			};
			await choose("Good fun");
			expect(settings.get().assistant.options).toEqual({ bestTask: { label: "Good_fun" } });
			await choose("None");
			expect(settings.get().assistant.options).toEqual({});
		});
	});
});
