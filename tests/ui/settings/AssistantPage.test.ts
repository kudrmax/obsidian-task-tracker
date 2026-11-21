// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantService } from "../../../core/application/contracts";
import { AssistantSettingsPage } from "../../../obsidian/ui/settings/AssistantPage";
import { DEFAULT_SETTINGS } from "../../../core/settings";
import { rig, settle } from "../../application/assistant/assistantFakes";

afterEach(() => {
	document.body.innerHTML = "";
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
