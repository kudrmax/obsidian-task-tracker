import { Modal, type App } from "obsidian";

/** Settings set up once and rarely touched, on a page of their own that a row of the tab opens. */
export class SettingsPage extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly build: (el: HTMLElement) => void,
		private readonly closed: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.title);
		this.modalEl.addClass("tc-settings-page");
		this.build(this.contentEl);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.closed();
	}
}
