import { type App, FuzzySuggestModal, type TFile } from "obsidian";

/**
 * «Attach note…» of the project's menu: Obsidian's own search over the vault's notes, as its Quick switcher looks; the
 * note picked is handed back as the link Obsidian would write for it from the tasks file.
 */
export class NoteSearch extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly from: string,
		private readonly onPick: (link: string) => void,
	) {
		super(app);
		this.setPlaceholder("Attach a note");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path.replace(/\.md$/, "");
	}

	onChooseItem(file: TFile): void {
		this.onPick(this.app.metadataCache.fileToLinktext(file, this.from, true));
	}
}
