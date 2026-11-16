import { type ButtonComponent, Setting } from "obsidian";
import type { AssistantField, AssistantPage, AssistantService } from "../../../core/application/contracts";
import { clear, el } from "../dom";

/**
 * More → Assistant, drawn from the core's page: the model to ask, its own settings with what this Mac found (the path of
 * `claude`), how long to wait, and each button's prompt with Reset to default. Where no model is served (the phone), the
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
		this.timeout(place, page.timeoutSeconds);
		this.prompts(place, page);
	}

	private models(parent: HTMLElement, page: AssistantPage): void {
		const row = new Setting(parent).setName("Model").addDropdown((d) => {
			for (const model of page.models) d.addOption(model.id, model.name);
			page.models.forEach((model, i) => (d.selectEl.options[i].disabled = !model.available));
			d.setValue(page.chosen).onChange((id) => void this.service.set({ kind: "model", id }).then(this.redraw));
		});
		if (page.unavailable !== null) {
			clear(row.descEl);
			el(row.descEl, "div", "tc-assistant-unavailable", page.unavailable);
		}
	}

	/** A model's own setting: typed, the offered values listed under the field; its note, and what this Mac found, each a line of its own. */
	private field(parent: HTMLElement, modelId: string, field: AssistantField): void {
		const row = new Setting(parent).setName(field.label);
		clear(row.descEl);
		if (field.note !== null) el(row.descEl, "div", "tc-assistant-note", field.note);
		const hint = el(row.descEl, "div", "tc-assistant-hint");
		this.showHint(hint, field.hint);
		this.hints.set(field.key, hint);
		row.addText((t) => {
			t.setValue(field.value);
			if (field.choices.length > 0) {
				const list = el(row.controlEl, "datalist");
				list.id = `tc-assistant-${modelId}-${field.key}`;
				for (const choice of field.choices) el(list, "option").value = choice;
				t.inputEl.setAttribute("list", list.id);
			}
			t.onChange((value) => void this.service.set({ kind: "field", modelId, key: field.key, value }).then(() => this.refreshHints()));
		});
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

	private timeout(parent: HTMLElement, seconds: number): void {
		new Setting(parent)
			.setName("Timeout")
			.setDesc("Seconds to wait for an answer.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(seconds));
				t.inputEl.addEventListener("change", () => {
					const typed = Number(t.getValue());
					if (Number.isFinite(typed)) void this.service.set({ kind: "timeout", seconds: typed }).then(this.redraw);
				});
			});
	}

	/** Each button's prompt: the whole width under its name, Reset to default beside the name. */
	private prompts(parent: HTMLElement, page: AssistantPage): void {
		if (page.prompts.length === 0) return;
		new Setting(parent).setName("Prompts").setDesc("What each button asks. The shape of the answer is the plugin's own.").setHeading();
		for (const prompt of page.prompts) {
			let reset: ButtonComponent | null = null;
			const row = new Setting(parent).setName(prompt.title).addButton((b) => {
				reset = b.setButtonText("Reset to default").onClick(() => void this.service.set({ kind: "prompt", actionId: prompt.actionId, value: null }).then(this.redraw));
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
		}
	}
}

/** A prompt's field shows a paragraph whole. */
const PROMPT_ROWS = 7;
