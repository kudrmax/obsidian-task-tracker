import { Modal, type App } from "obsidian";

/** Settings set up once and rarely touched, on a page of their own that a row of the tab opens. */
export class SettingsPage extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly build: (el: HTMLElement, redraw: () => void) => void,
		private readonly closed: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.title);
		this.modalEl.addClass("tc-settings-page");
		this.redraw();
	}

	/** After a change that adds or drops rows, such as logging in. */
	redraw(): void {
		this.contentEl.empty();
		this.build(this.contentEl, () => this.redraw());
	}

	override onClose(): void {
		this.contentEl.empty();
		this.closed();
	}
}
