/**
 * The few pieces of Obsidian's API the settings tab builds on, over plain DOM: the `obsidian` package has types only,
 * so a test that loads the tab gets this module in its place (the alias in vitest.config.mts).
 */

interface DomInfo {
	readonly cls?: string;
	readonly type?: string;
	readonly attr?: Record<string, string>;
}


function createEl<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, info: DomInfo = {}): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (info.cls) node.className = info.cls;
	if (info.type) node.setAttribute("type", info.type);
	for (const [name, value] of Object.entries(info.attr ?? {})) node.setAttribute(name, value);
	parent.appendChild(node);
	return node;
}

/** Obsidian's additions to the DOM, put on happy-dom's elements. */
export function installDomHelpers(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.empty = function (this: HTMLElement) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	proto.createDiv = function (this: HTMLElement, cls?: string) {
		return createEl(this, "div", { cls });
	};
	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(this: HTMLElement, tag: K, info?: DomInfo) {
		return createEl(this, tag, info);
	};
	proto.addClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.add(...classes);
	};
	proto.removeClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.remove(...classes);
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	proto.hasClass = function (this: HTMLElement, cls: string) {
		return this.classList.contains(cls);
	};
}

if (typeof HTMLElement !== "undefined") installDomHelpers();

export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Plugin {
	constructor(readonly app: unknown) {}
}

export class Modal {
	readonly modalEl = document.createElement("div");
	readonly titleEl = createEl(this.modalEl, "div", { cls: "modal-title" });
	readonly contentEl = createEl(this.modalEl, "div", { cls: "modal-content" });

	constructor(readonly app: unknown) {
		this.modalEl.className = "modal";
	}

	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}

	open(): void {
		document.body.appendChild(this.modalEl);
		this.onOpen();
	}

	close(): void {
		this.modalEl.remove();
		this.onClose();
	}

	onOpen(): void {}

	onClose(): void {}
}

export class PluginSettingTab {
	readonly containerEl = document.createElement("div");

	constructor(
		readonly app: unknown,
		readonly plugin: unknown,
	) {}

	display(): void {}
}

export class TextComponent {
	readonly inputEl: HTMLInputElement;

	constructor(parent: HTMLElement) {
		this.inputEl = createEl(parent, "input", { type: "text" });
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	getValue(): string {
		return this.inputEl.value;
	}

	onChange(listener: (value: string) => unknown): this {
		this.inputEl.addEventListener("input", () => void listener(this.inputEl.value));
		return this;
	}
}

export class SliderComponent {
	readonly sliderEl: HTMLInputElement;

	constructor(parent: HTMLElement) {
		this.sliderEl = createEl(parent, "input", { type: "range" });
	}

	setLimits(min: number, max: number, step: number): this {
		Object.assign(this.sliderEl, { min: String(min), max: String(max), step: String(step) });
		return this;
	}

	setValue(value: number): this {
		this.sliderEl.value = String(value);
		return this;
	}

	setDynamicTooltip(): this {
		return this;
	}

	onChange(listener: (value: number) => unknown): this {
		this.sliderEl.addEventListener("input", () => void listener(Number(this.sliderEl.value)));
		return this;
	}
}

export class DropdownComponent {
	readonly selectEl: HTMLSelectElement;

	constructor(parent: HTMLElement) {
		this.selectEl = createEl(parent, "select");
	}

	addOption(value: string, text: string): this {
		const option = createEl(this.selectEl, "option");
		option.value = value;
		option.textContent = text;
		return this;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}

	onChange(listener: (value: string) => unknown): this {
		this.selectEl.addEventListener("change", () => void listener(this.selectEl.value));
		return this;
	}
}

export class ButtonComponent {
	readonly buttonEl: HTMLButtonElement;

	constructor(parent: HTMLElement) {
		this.buttonEl = createEl(parent, "button");
	}

	setButtonText(text: string): this {
		this.buttonEl.textContent = text;
		return this;
	}

	onClick(listener: () => unknown): this {
		this.buttonEl.addEventListener("click", () => void listener());
		return this;
	}
}

export class ToggleComponent {
	readonly toggleEl: HTMLInputElement;

	constructor(parent: HTMLElement) {
		this.toggleEl = createEl(parent, "input", { type: "checkbox" });
	}

	setValue(on: boolean): this {
		this.toggleEl.checked = on;
		return this;
	}

	onChange(listener: (on: boolean) => unknown): this {
		this.toggleEl.addEventListener("change", () => void listener(this.toggleEl.checked));
		return this;
	}
}

export class ExtraButtonComponent {
	readonly extraSettingsEl: HTMLElement;

	constructor(parent: HTMLElement) {
		this.extraSettingsEl = createEl(parent, "div", { cls: "clickable-icon extra-setting-button" });
	}

	setIcon(name: string): this {
		this.extraSettingsEl.dataset.icon = name;
		return this;
	}

	setTooltip(text: string): this {
		this.extraSettingsEl.setAttribute("aria-label", text);
		return this;
	}

	onClick(listener: () => unknown): this {
		this.extraSettingsEl.addEventListener("click", () => void listener());
		return this;
	}
}

export class Setting {
	readonly settingEl: HTMLElement;
	readonly nameEl: HTMLElement;
	readonly descEl: HTMLElement;
	readonly controlEl: HTMLElement;

	constructor(parent: HTMLElement) {
		this.settingEl = createEl(parent, "div", { cls: "setting-item" });
		const info = createEl(this.settingEl, "div", { cls: "setting-item-info" });
		this.nameEl = createEl(info, "div", { cls: "setting-item-name" });
		this.descEl = createEl(info, "div", { cls: "setting-item-description" });
		this.controlEl = createEl(this.settingEl, "div", { cls: "setting-item-control" });
	}

	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}

	setDesc(desc: string): this {
		this.descEl.textContent = desc;
		return this;
	}

	setHeading(): this {
		this.settingEl.classList.add("setting-item-heading");
		return this;
	}

	addText(build: (text: TextComponent) => unknown): this {
		build(new TextComponent(this.controlEl));
		return this;
	}

	addSlider(build: (slider: SliderComponent) => unknown): this {
		build(new SliderComponent(this.controlEl));
		return this;
	}

	addDropdown(build: (dropdown: DropdownComponent) => unknown): this {
		build(new DropdownComponent(this.controlEl));
		return this;
	}

	addButton(build: (button: ButtonComponent) => unknown): this {
		build(new ButtonComponent(this.controlEl));
		return this;
	}

	addToggle(build: (toggle: ToggleComponent) => unknown): this {
		build(new ToggleComponent(this.controlEl));
		return this;
	}

	addExtraButton(build: (button: ExtraButtonComponent) => unknown): this {
		build(new ExtraButtonComponent(this.controlEl));
		return this;
	}
}

/** The tags of a note's cache: its properties' and its text's, each with `#`. */
export function getAllTags(cache: { frontmatter?: { tags?: string | string[] }; tags?: { tag: string }[] }): string[] {
	const front = cache.frontmatter?.tags;
	const props = (typeof front === "string" ? [front] : (front ?? [])).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
	return [...props, ...(cache.tags ?? []).map((t) => t.tag)];
}

/** A vault file, as `instanceof` checks see it. */
export class TFile {
	constructor(
		readonly path = "",
		readonly basename = "",
		readonly extension = "md",
	) {}
}
