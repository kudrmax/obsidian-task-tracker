import { ItemView, Scope, type WorkspaceLeaf } from "obsidian";
import { KEYS, takesKeys } from "../ui/engine/keys";
import type { MountedScreen } from "../ui/engine/mount";
import type { ScreenHost } from "./ScreenHost";
import { StatusBarRoom } from "./StatusBarRoom";

/** How a host's leaf presents itself in Obsidian: its view type, its tab's title and icon. */
export interface LeafLook {
	readonly type: string;
	readonly title: string;
	readonly icon: string;
}

/**
 * A host's leaf for `look`: Obsidian asks a view its type while constructing it, before a field of the leaf is set, so
 * each host's leaf is a class that knows its type.
 */
export function leafFor(look: LeafLook): new (leaf: WorkspaceLeaf, host: ScreenHost) => ScreenLeaf {
	return class extends ScreenLeaf {
		override getViewType(): string {
			return look.type;
		}
	};
}

/**
 * `TaskScreen` in a leaf of its own (F1–F3, F5): mounted when the leaf opens (in the main window or a pop-out, each in its
 * own document), the key table on the leaf's `Scope`, the bottom row standing over Obsidian's desktop status bar while
 * the leaf is open.
 */
export abstract class ScreenLeaf extends ItemView {
	private screen: MountedScreen | null = null;
	private letStatusBarGo: (() => void) | null = null;
	/** Closed: a screen whose mounts come after this is never drawn. */
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: ScreenHost,
	) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
		for (const key of KEYS) this.scope.register([...key.modifiers], key.key, () => this.runKey(key.id));
	}

	override getDisplayText(): string {
		return this.host.look.title;
	}

	override getIcon(): string {
		return this.host.look.icon;
	}

	/** A key of the table on this screen; false keeps the key from the page once taken. */
	runKey(id: string): boolean {
		const screen = this.screen?.store.getState();
		const key = KEYS.find((k) => k.id === id);
		if (!screen || !key || !takesKeys(screen)) return true;
		key.run(screen);
		return false;
	}

	override async onOpen(): Promise<void> {
		this.closed = false;
		this.letStatusBarGo = StatusBarRoom.hold(this.containerEl.ownerDocument);
		await this.remount();
	}

	override async onClose(): Promise<void> {
		this.closed = true;
		this.letStatusBarGo?.();
		this.letStatusBarGo = null;
		this.unmount();
	}

	/** The screen drawn anew: the leaf opened, or the host asks every leaf to draw again (the stand's step). */
	async remount(): Promise<void> {
		const mounts = await this.host.mounts();
		if (this.closed) return;
		this.unmount();
		this.contentEl.empty();
		this.contentEl.addClass("tc-view");
		this.screen = mounts.mount(this.contentEl, "leaf", "");
		this.host.opened(this.screen);
	}

	private unmount(): void {
		this.host.unmount(this.screen);
		this.screen = null;
	}
}
