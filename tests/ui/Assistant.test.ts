// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantOffer, AssistantOutcome, UndoService } from "../../core/application/contracts";
import { AssistantAnswers, type MarkdownHost } from "../../obsidian/ui/assistant/AssistantAnswers";
import { AssistantSettingsPage } from "../../obsidian/ui/assistant/AssistantPage";
import { BottomCapsule } from "../../obsidian/ui/BottomCapsule";
import { MoreMenu } from "../../obsidian/ui/menu/MoreMenu";
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
	const open = (assistant: readonly AssistantOffer[]) => {
		const on = { onSearch: vi.fn(), onSelect: vi.fn(), onAssistant: vi.fn() };
		MoreMenu.open({ anchor: document.body.appendChild(document.createElement("div")), assistant, ...on });
		return on;
	};

	it("draws the core's rows after Search and Select tasks, label and icon from the offer; a tap closes the menu and presses it", () => {
		const on = open([{ actionId: "bestTask", label: "Best task", icon: "sparkles", running: false }]);
		expect(rows().map((r) => r.textContent?.trim())).toEqual(["Search", "Select tasks", "Best task"]);
		expect(rows()[2].querySelector("svg")).not.toBeNull();
		expect(rows()[2].querySelector(".tc-spinner")).toBeNull();
		rows()[2].click();
		expect(on.onAssistant).toHaveBeenCalledWith("bestTask");
		expect(document.querySelector(".tc-panel.is-more")?.classList.contains("is-closing")).toBe(true);
	});

	it("a running row shows its own label with the ring in its icon's place", () => {
		open([{ actionId: "bestTask", label: "Stop", icon: "sparkles", running: true }]);
		expect(rows()[2].textContent?.trim()).toBe("Stop");
		expect(rows()[2].querySelector("svg")).toBeNull();
		expect(rows()[2].querySelector(".tc-spinner")).not.toBeNull();
	});

	it("no offers, no row: the phone", () => {
		open([]);
		expect(rows().map((r) => r.textContent?.trim())).toEqual(["Search", "Select tasks"]);
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
		answers.show(outcome);
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

	it("Escape closes it", async () => {
		new AssistantAnswers(rig().assistant, plainMarkdown(), vi.fn()).show(await TASK_OUTCOME());
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(document.querySelector(".tc-panel.is-answer")?.classList.contains("is-closing")).toBe(true);
	});

	it("a failure takes the same popup, its words in the reason's place; its detail goes to the console", () => {
		const log = vi.fn();
		const failed: AssistantOutcome = { kind: "failed", title: "Couldn't find the best task", words: "Claude Code isn't signed in.", detail: "authentication_failed" };
		new AssistantAnswers(rig().assistant, plainMarkdown(), log).show(failed);
		const popup = document.querySelector<HTMLElement>(".tc-panel.is-answer.is-failure")!;
		expect(popup.querySelector(".tc-answer-title")?.textContent).toBe("Couldn't find the best task");
		expect(popup.querySelector(".tc-card")).toBeNull();
		expect(popup.querySelector(".tc-answer-note")?.textContent).toBe("Claude Code isn't signed in.");
		expect(log).toHaveBeenCalledWith("authentication_failed");
	});

	it("Stop shows nothing", () => {
		expect(new AssistantAnswers(rig().assistant, plainMarkdown(), vi.fn()).show({ kind: "stopped" })).toBeNull();
		expect(document.querySelector(".tc-panel")).toBeNull();
	});

	it("a press shows its outcome when it comes, the view or not", async () => {
		const { assistant, transport } = rig();
		new AssistantAnswers(assistant, plainMarkdown(), vi.fn()).press("bestTask");
		await settle();
		expect(document.querySelector(".tc-panel.is-answer")).toBeNull();
		transport.answer({ taskRef: transport.refOf("Write the offer"), reason: "It pays." });
		await settle();
		expect(document.querySelector(".tc-panel.is-answer .tc-card-title")?.textContent).toBe("Write the offer");
	});
});

describe("More → Assistant", () => {
	const names = (root: HTMLElement) => [...root.querySelectorAll(".setting-item-name")].map((n) => n.textContent);

	it("draws the core's page: the model, its fields with what this Mac found, the timeout, each button's prompt", async () => {
		const { assistant, transport } = rig();
		transport.hints = { path: "/opt/homebrew/bin/claude" };
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, vi.fn()).build(root);
		expect(names(root)).toEqual(["Model", "Claude", "Model", "Path to claude", "Timeout", "Prompts", "Best task"]);
		const select = root.querySelector("select")!;
		expect([...select.options].map((o) => [o.value, o.textContent, o.disabled])).toEqual([["claude", "Claude", false]]);
		const inputs = root.querySelectorAll<HTMLInputElement>("input");
		expect(inputs[0].value).toBe("sonnet");
		expect([...root.querySelectorAll("datalist option")].map((o) => (o as HTMLOptionElement).value)).toEqual(["sonnet", "opus", "haiku"]);
		expect(root.querySelector(".tc-assistant-note")?.textContent).toBe("Empty: found by itself");
		expect([...root.querySelectorAll<HTMLElement>(".tc-assistant-hint")].filter((h) => !h.hidden).map((h) => h.textContent)).toEqual(["/opt/homebrew/bin/claude"]);
		expect(inputs[2].value).toBe("120");
		expect(root.querySelector("textarea")!.value).toMatch(/^You help me choose what to do/);
		expect(root.querySelector<HTMLButtonElement>(".tc-assistant-prompt-head button")!.disabled).toBe(true);
	});

	it("writes what is typed through the core: a field, a prompt (Reset lights up, and takes it back), the timeout", async () => {
		const { assistant, settings } = rig();
		const redraw = vi.fn();
		const root = document.body.appendChild(document.createElement("div"));
		await new AssistantSettingsPage(assistant, redraw).build(root);
		const inputs = root.querySelectorAll<HTMLInputElement>("input");
		inputs[0].value = "haiku";
		inputs[0].dispatchEvent(new Event("input"));
		const area = root.querySelector("textarea")!;
		area.value = "Pick the cheapest.";
		area.dispatchEvent(new Event("input"));
		inputs[2].value = "60";
		inputs[2].dispatchEvent(new Event("change"));
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
		expect(root.querySelector("textarea")).not.toBeNull();
	});
});
