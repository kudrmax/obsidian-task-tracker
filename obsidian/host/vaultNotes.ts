import { type App, FuzzySuggestModal, type TFile } from "obsidian";
import type { VaultNotes } from "../ui/engine/view/host";

/**
 * «Attach note…» of the project menu (made when asked: Obsidian's modal class is there only once Obsidian runs) (F218): Obsidian's own search over the vault's notes, as its Quick switcher looks; the
 * note picked is handed back as the link Obsidian writes for it.
 */
const noteSearch = (app: App, onEnd: (link: string | null) => void) => new (class NoteSearch extends FuzzySuggestModal<TFile> {
	private picked: string | null = null;

	constructor() {
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
		this.picked = this.app.metadataCache.fileToLinktext(file, "", true);
	}

	override onClose(): void {
		super.onClose();
		/** Obsidian closes the modal before it tells the choice: the end waits for that turn. */
		queueMicrotask(() => onEnd(this.picked));
	}
})();

/** The vault's notes as the screen reaches them: searched for one to attach, opened by its link in a new tab. */
export function vaultNotes(app: App): VaultNotes {
	return {
		pick: () => new Promise((resolve) => noteSearch(app, resolve).open()),
		open: (link) => void app.workspace.openLinkText(link, "", "tab"),
	};
}
