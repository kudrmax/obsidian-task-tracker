import { type ButtonComponent, Setting } from "obsidian";
import type { AssistantField, AssistantOptionRow, AssistantPage, AssistantService } from "../../../core/application/contracts";
import { clear, el } from "./dom";

/**
 * More → Assistant, drawn from the core's page: the model to ask, its own settings with what this Mac found (the path of
 * `claude`), how long to wait, and each button's prompt with Reset to default and its option rows under it. Where no model is served (the phone), the
 * core's words say why, and the prompts stay editable: they sync.
 */
export class AssistantSettingsPage {
	/** The hint of each field shown, by its key: a field written may change what is found. */
	private readonly hints = new Map<string, HTMLElement>();

	constructor(
		private readonly service: AssistantService,
		/** Draws the page again: after a change that adds or drops rows (another model, a Reset). */
		private readonly redraw: () => void,
	) {}

	/** Holds the page's place while the core reads it, then fills it. */
	async build(parent: HTMLElement): Promise<void> {
		const place = el(parent, "div", "tc-assistant-page");
		const page = await this.service.page();
		this.models(place, page);
		const chosen = page.models.find((model) => model.id === page.chosen);
		if (chosen && page.fields.length > 0) new Setting(place).setName(chosen.name).setHeading();
		for (const field of page.fields) this.field(place, page.chosen, field);
		this.timeout(place, page);
		this.prompts(place, page);
	}

	private models(parent: HTMLElement, page: AssistantPage): void {
		const row = new Setting(parent).setName(page.words.model).addDropdown((d) => {
			for (const model of page.models) d.addOption(model.id, model.name);
			page.models.forEach((model, i) => (d.selectEl.options[i].disabled = !model.available));
			d.setValue(page.chosen).onChange((id) => void this.service.set({ kind: "model", id }).then(this.redraw));
		});
		if (page.unavailable !== null) {
			clear(row.descEl);
			el(row.descEl, "div", "tc-assistant-unavailable", page.unavailable);
		}
	}

	/** A model's own setting: a choice is a dropdown, a text is typed; its note, and what this Mac found, each a line of its own. */
	private field(parent: HTMLElement, modelId: string, field: AssistantField): void {
		const row = new Setting(parent).setName(field.label);
		clear(row.descEl);
		if (field.note !== null) el(row.descEl, "div", "tc-assistant-note", field.note);
		const hint = el(row.descEl, "div", "tc-assistant-hint");
		this.showHint(hint, field.hint);
		this.hints.set(field.key, hint);
		const save = (value: string): void => void this.service.set({ kind: "field", modelId, key: field.key, value }).then(() => this.refreshHints());
		if (field.kind === "choice") {
			row.addDropdown((d) => {
				for (const choice of new Set([...field.choices, field.value])) d.addOption(choice, choice);
				d.setValue(field.value).onChange(save);
			});
			return;
		}
		row.addText((t) => t.setValue(field.value).onChange(save));
	}

	private showHint(hint: HTMLElement, text: string | null): void {
		hint.textContent = text ?? "";
		hint.hidden = text === null;
	}

	/** What this Mac finds follows what was typed: the hints are read again. */
	private async refreshHints(): Promise<void> {
		const page = await this.service.page();
		for (const field of page.fields) {
			const hint = this.hints.get(field.key);
			if (hint) this.showHint(hint, field.hint);
		}
	}

	/** How long to wait: a whole number of seconds typed; a blank or a non-number is not written, the saved value comes back. */
	private timeout(parent: HTMLElement, page: AssistantPage): void {
		new Setting(parent)
			.setName(page.words.timeout)
			.setDesc(page.words.timeoutNote)
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(page.timeoutSeconds));
				t.inputEl.addEventListener("change", () => {
					const typed = t.getValue().trim();
					const seconds = Number(typed);
					if (typed === "" || !Number.isFinite(seconds)) t.setValue(String(page.timeoutSeconds));
					else void this.service.set({ kind: "timeout", seconds }).then(this.redraw);
				});
			});
	}

	/** Each button's prompt: the whole width under its name, Reset to default beside the name. */
	private prompts(parent: HTMLElement, page: AssistantPage): void {
		if (page.prompts.length === 0) return;
		new Setting(parent).setName(page.words.prompts).setDesc(page.words.promptsNote).setHeading();
		for (const prompt of page.prompts) {
			let reset: ButtonComponent | null = null;
			const row = new Setting(parent).setName(prompt.title).addButton((b) => {
				reset = b.setButtonText(page.words.reset).onClick(() => void this.service.set({ kind: "prompt", actionId: prompt.actionId, value: null }).then(this.redraw));
				b.setDisabled(prompt.isDefault);
			});
			row.settingEl.classList.add("tc-assistant-prompt-head");
			const area = el(parent, "textarea", "tc-assistant-prompt");
			area.value = prompt.prompt;
			area.rows = PROMPT_ROWS;
			area.addEventListener("input", async () => {
				await this.service.set({ kind: "prompt", actionId: prompt.actionId, value: area.value });
				const now = (await this.service.page()).prompts.find((p) => p.actionId === prompt.actionId);
				if (now) reset?.setDisabled(now.isDefault);
			});
			for (const option of prompt.options) this.option(parent, prompt.actionId, option);
		}
	}

	/** An action's option: a dropdown of its choices as given, none included; each choice is held by its place in the list. */
	private option(parent: HTMLElement, actionId: string, option: AssistantOptionRow): void {
		new Setting(parent).setName(option.label).addDropdown((d) => {
			option.choices.forEach((choice, i) => d.addOption(String(i), choice.title));
			d.setValue(String(option.choices.findIndex((choice) => choice.value === option.value)));
			d.onChange((index) => {
				const choice = option.choices[Number(index)];
				if (choice) void this.service.set({ kind: "option", actionId, key: option.key, value: choice.value });
			});
		});
	}
}

/** A prompt's field shows a paragraph whole. */
const PROMPT_ROWS = 7;
