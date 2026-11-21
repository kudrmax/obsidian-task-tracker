import { Component, MarkdownRenderer, Notice, Platform, type Plugin, type WorkspaceLeaf } from "obsidian";
import type { ScreenSettingsStore } from "../../core/application/contracts";
import type { DeviceSettings } from "../adapters/DeviceSettings";
import type { TrackpadFingers } from "../ui/engine/gestures/trackpadFollow";
import { KEYS } from "../ui/engine/keys";
import type { MountedScreen } from "../ui/engine/mount";
import type { ScreenPort } from "../ui/engine/port";
import { clearCardSize, showCardSize } from "../ui/paint/cardSize";
import { clearPriorityColors, showLabelPaint, showPriorityColors } from "../ui/paint/priorityColors";
import { addWindowDocument } from "../ui/paint/windowDocuments";
import { detectHaptics, type HapticsHost } from "./haptics";
import { type LeafLook, ScreenLeaf } from "./ScreenLeaf";
import { ScreenMounts } from "./ScreenMounts";
import { hearFingers } from "./trackpad";

/** What a host's screens draw from: the port and what the device keeps, opened once, at the first screen. */
export interface ScreenSource {
	readonly port: ScreenPort;
	readonly device: DeviceSettings;
}

export interface ScreenHostOptions {
	readonly look: LeafLook;
	readonly source: () => Promise<ScreenSource>;
	/** The levels, labels and card size painted on every window's body. */
	readonly paint: ScreenSettingsStore;
	/** Each leaf's screen once mounted: the stand stands it at its step. */
	readonly opened?: (screen: MountedScreen) => void;
}

/**
 * The host, assembled once (Decision 142): everything the screen needs from Obsidian, for the plugin and the stand alike.
 * It registers the leaf, the key table as commands, the paint on every window (pop-outs too), macOS's fingers on the
 * trackpad and their end, and mounts every screen (`ScreenMounts`) over the one source; all of it ends with the plugin.
 */
export class ScreenHost {
	readonly look: LeafLook;
	private ready: Promise<ScreenMounts> | null = null;
	private assembled: ScreenMounts | null = null;
	private fingers: TrackpadFingers & { dispose(): void } | null = null;
	private ended = false;

	constructor(
		private readonly plugin: Plugin,
		private readonly options: ScreenHostOptions,
	) {
		this.look = options.look;
	}

	load(): void {
		const plugin = this.plugin;
		this.paint();
		this.followWindows();
		plugin.registerView(this.look.type, (leaf) => new ScreenLeaf(leaf, this));
		for (const key of KEYS) plugin.addCommand({ id: key.id, name: key.name, checkCallback: (checking) => this.onActiveLeaf(checking, (leaf) => leaf.runKey(key.id)) });
		plugin.register(() => this.end());
	}

	/** The screens' mounts, once the source is open and the fingers are heard (or known not to be). */
	mounts(): Promise<ScreenMounts> {
		this.ready ??= this.assemble();
		return this.ready;
	}

	/** Every screen open now, in a leaf or a note's block. */
	openScreens(): readonly MountedScreen[] {
		return this.assembled?.open ?? [];
	}

	/** A leaf's screen just mounted. */
	opened(screen: MountedScreen): void {
		this.options.opened?.(screen);
	}

	unmount(screen: MountedScreen | null): void {
		if (!screen) return;
		void this.ready?.then((mounts) => mounts.unmount(screen));
	}

	/** The leaf, revealed: the one already open (F2), or a new one; in a new window when asked. */
	async open(popout = false): Promise<WorkspaceLeaf> {
		const workspace = this.plugin.app.workspace;
		const leaf = popout ? workspace.openPopoutLeaf() : (workspace.getLeavesOfType(this.look.type)[0] ?? workspace.getLeaf(true));
		await leaf.setViewState({ type: this.look.type, active: true });
		await workspace.revealLeaf(leaf);
		return leaf;
	}

	/** Every open leaf draws its screen anew. */
	async redrawLeaves(): Promise<void> {
		await Promise.all(this.plugin.app.workspace.getLeavesOfType(this.look.type).map((leaf) => (leaf.view instanceof ScreenLeaf ? leaf.view.remount() : undefined)));
	}

	private async assemble(): Promise<ScreenMounts> {
		const [source, fingers] = await Promise.all([this.options.source(), hearFingers(this.plugin)]);
		if (this.ended) fingers?.dispose();
		else this.fingers = fingers;
		const app = this.plugin.app;
		this.assembled = new ScreenMounts({
			port: source.port,
			device: source.device,
			app,
			haptics: detectHaptics(window as unknown as HapticsHost),
			markdown: (text, el, sourcePath) => {
				const component = new Component();
				component.load();
				void MarkdownRenderer.render(app, text, el, sourcePath, component);
				return () => {
					component.unload();
					el.empty();
				};
			},
			notice: (text) => new Notice(text),
			desk: !Platform.isMobile,
			fingers: this.fingers,
		});
		return this.assembled;
	}

	private end(): void {
		this.ended = true;
		void this.ready?.then((mounts) => mounts.dispose());
		this.fingers?.dispose();
		this.fingers = null;
	}

	/** The settings' levels, labels and card size on every window's body, as they change. */
	private paint(): void {
		const show = () => {
			const shown = this.options.paint.get();
			showCardSize({ height: shown.cardHeight, gap: shown.cardGap });
			showPriorityColors(shown.priorities, shown.labels);
			showLabelPaint(shown.labelPaint);
		};
		show();
		this.plugin.register(this.options.paint.onChange(show));
		this.plugin.register(clearCardSize);
		this.plugin.register(clearPriorityColors);
	}

	/** A pop-out window gets the paint the main one has: a leaf or a note's block moved there draws as here (F5). */
	private followWindows(): void {
		const { workspace } = this.plugin.app;
		const closings = new Map<Document, () => void>();
		const open = (doc: Document) => {
			if (doc !== document && !closings.has(doc)) closings.set(doc, addWindowDocument(doc));
		};
		workspace.iterateAllLeaves((leaf) => open(leaf.view.containerEl.ownerDocument));
		this.plugin.registerEvent(workspace.on("window-open", (win) => open(win.doc)));
		this.plugin.registerEvent(
			workspace.on("window-close", (win) => {
				closings.get(win.doc)?.();
				closings.delete(win.doc);
			}),
		);
		this.plugin.register(() => closings.forEach((close) => close()));
	}

	private onActiveLeaf(checking: boolean, run: (leaf: ScreenLeaf) => void): boolean {
		const leaf = this.plugin.app.workspace.getActiveViewOfType(ScreenLeaf);
		if (!leaf || leaf.getViewType() !== this.look.type) return false;
		if (!checking) run(leaf);
		return true;
	}
}
