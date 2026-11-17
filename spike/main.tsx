import { ItemView, Platform, Plugin, type WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../core/settings";
import type { SettingsStore } from "../core/application/ports";
import { createServices, type Services } from "../obsidian/compose";
import type { EditorHost } from "../obsidian/ui/markdown/EmbeddedEditor";
import { AltScreen } from "./AltScreen";
import { counters, SpikeScreen } from "./Screen";
import { createScreenStore, type ScreenStore } from "./store";

const VIEW = "tc-spike";
const ALT_VIEW = "tc-spike-alt";

/** The three columns on @dnd-kit/react, for the comparison with the classic dnd-kit. */
class AltView extends ItemView {
	private root: Root | null = null;
	constructor(leaf: WorkspaceLeaf, private readonly plugin: SpikePlugin) {
		super(leaf);
	}
	getViewType(): string {
		return ALT_VIEW;
	}
	getDisplayText(): string {
		return "Stack spike (dnd-kit/react)";
	}
	override async onOpen(): Promise<void> {
		this.contentEl.addClass("tcs-host");
		this.root = createRoot(this.contentEl);
		this.root.render(<AltScreen store={this.plugin.store} />);
	}
	override async onClose(): Promise<void> {
		this.root?.unmount();
	}
}

class SpikeView extends ItemView {
	private root: Root | null = null;
	private readonly editorHost: EditorHost = { activeEditor: null };

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: SpikePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW;
	}

	getDisplayText(): string {
		return "Stack spike";
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass("tcs-host");
		this.root = createRoot(this.contentEl);
		this.draw();
	}

	override onResize(): void {
		this.draw();
	}

	private draw(): void {
		const doc = this.contentEl.ownerDocument;
		this.root?.render(
			<SpikeScreen
				store={this.plugin.store}
				app={this.app}
				editorHost={this.editorHost}
				win={doc.defaultView!}
				root={this.contentEl}
				width={Math.max(320, this.contentEl.clientWidth)}
				phone={Platform.isMobile}
				dayStartHour={this.plugin.get().dayStartHour}
			/>,
		);
	}

	override async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}

export default class SpikePlugin extends Plugin implements SettingsStore {
	private config: TaskCalendarSettings = { ...DEFAULT_SETTINGS };
	private readonly settingsListeners = new Set<() => void>();
	services!: Services;
	store!: ScreenStore;
	loadMs = 0;
	readonly counters = counters;

	override async onload(): Promise<void> {
		const t0 = performance.now();
		this.services = createServices(this.app, { pluginDir: this.manifest.dir ?? "", shortcuts: { isPhone: Platform.isIosApp, vaultName: this.app.vault.getName(), open: () => undefined } }, this);
		this.store = createScreenStore(this.services.tasks, () => this.services.days.today());
		this.registerView(VIEW, (leaf) => new SpikeView(leaf, this));
		this.registerView(ALT_VIEW, (leaf) => new AltView(leaf, this));
		this.addCommand({ id: "open", name: "Open stack spike", callback: () => void this.open(false) });
		this.addCommand({ id: "open-popout", name: "Open stack spike in a new window", callback: () => void this.open(true) });
		this.addCommand({ id: "first-inbox-to-soon", name: "Move the first Inbox task to Soon", callback: () => void this.store.getState().moveFirstInboxToSoon() });
		(window as unknown as { tcSpike: SpikePlugin }).tcSpike = this;
		this.app.workspace.onLayoutReady(() => void this.store.getState().refresh());
		this.loadMs = performance.now() - t0;
	}

	async openAlt(): Promise<void> {
		await this.app.workspace.getLeaf("tab").setViewState({ type: ALT_VIEW, active: true });
	}

	async open(popout: boolean): Promise<WorkspaceLeaf> {
		const leaf = popout ? this.app.workspace.openPopoutLeaf({ size: { width: 1100, height: 760 } }) : this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW, active: true });
		return leaf;
	}

	get(): TaskCalendarSettings {
		return this.config;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.config = { ...this.config, ...patch };
		this.settingsListeners.forEach((listener) => listener());
	}

	onChange(listener: () => void): () => void {
		this.settingsListeners.add(listener);
		return () => this.settingsListeners.delete(listener);
	}
}
