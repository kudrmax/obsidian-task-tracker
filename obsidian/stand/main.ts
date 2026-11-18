import { ItemView, MarkdownRenderChild, Plugin, type TFile, type WorkspaceLeaf } from "obsidian";
import { BlockHeight } from "../ui/BlockHeight";
import { clearCardSize, showCardSize } from "../ui/cardSize";
import { clearPriorityColors, showLabelPaint, showPriorityColors } from "../ui/priorityColors";
import { addWindowDocument } from "../ui/windowDocuments";
import { type MountedScreen, mountScreen } from "../ui/engine/mountScreen";
import { RELEASED_LOOKS, type ScreenLooks } from "../ui/engine/ScreenContext";
import { PROJECT_NOTE } from "./mockTasks";
import { composeStand, type Stand, WRITE_DELAYS } from "./standServices";

/** The stand's own view type and code block language: never the plugin's. */
export const STAND_VIEW = "task-calendar-stand";
const BLOCK_LANGUAGE = "task-calendar-stand";

/** The engine's screen in a leaf of its own, as the plugin's view will show it. */
class StandView extends ItemView {
	private screen: MountedScreen | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly stand: Stand,
		private readonly looks: () => ScreenLooks,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return STAND_VIEW;
	}

	override getDisplayText(): string {
		return "Task Calendar Stand";
	}

	override getIcon(): string {
		return "flask-conical";
	}

	override async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("tc-view");
		this.screen = mountScreen(this.contentEl, this.stand.services, { kind: "main" }, this.looks);
		/** For a person debugging on the stand: the open screen's store (the checks never read it). */
		(window as unknown as { __tcStandScreen?: MountedScreen }).__tcStandScreen = this.screen;
	}

	override async onClose(): Promise<void> {
		this.screen?.unmount();
		this.screen = null;
	}

	override onResize(): void {
		this.screen?.refit();
	}

	refit(): void {
		this.screen?.refit();
	}
}

/** The engine's screen in a note's block: the project the note is attached to, as the plugin's block at a note's end. */
class StandBlock extends MarkdownRenderChild {
	private screen: MountedScreen | null = null;
	private height: BlockHeight | null = null;
	private frame = 0;

	constructor(
		el: HTMLElement,
		private readonly stand: Stand,
		private readonly path: string,
		private readonly looks: () => ScreenLooks,
	) {
		super(el);
	}

	refit(): void {
		this.screen?.refit();
	}

	override onload(): void {
		const block = this.containerEl;
		block.addClass("tc-project-block");
		this.screen = mountScreen(block, this.stand.services, { kind: "note", path: () => this.path }, this.looks);
		const view = block.ownerDocument.defaultView ?? window;
		/** The block grows with its tasks once the screen has drawn them. */
		this.frame = view.requestAnimationFrame(() => {
			const root = block.querySelector<HTMLElement>(":scope > .task-calendar");
			if (!root) return;
			this.height = new BlockHeight(block, root, () => block.querySelector<HTMLElement>(".tc-rows-stack, .tc-projects-list"));
			this.height.start();
		});
	}

	override onunload(): void {
		(this.containerEl.ownerDocument.defaultView ?? window).cancelAnimationFrame(this.frame);
		this.height?.stop();
		this.screen?.unmount();
		this.screen = null;
	}
}

/**
 * The stand: the engine (`obsidian/ui/engine`) on the real core over made-up tasks in memory, for the test Obsidian only
 * (docs/superpowers/specs/2026-11-18-ui-engine.md, «The stand»). Its checks reach it through `window.__tcStand`.
 */
/**
 * The looks Max is to choose between (spec, «Not decided»), each a switch of the stand's: its commands flip them on every
 * open screen. They start as the released screen draws them.
 */
const LOOK_SWITCHES: readonly { readonly id: string; readonly name: string; readonly flip: (looks: ScreenLooks) => ScreenLooks }[] = [
	{ id: "look-timeline-drop", name: "Look: timeline landing, line or block", flip: (l) => ({ ...l, timelineDrop: l.timelineDrop === "line" ? "block" : "line" }) },
	{ id: "look-home-place", name: "Look: the place a carried card left, outline or closed", flip: (l) => ({ ...l, homePlace: l.homePlace === "outline" ? "closed" : "outline" }) },
	{ id: "look-parent-outline", name: "Look: outline around the parent, off or on", flip: (l) => ({ ...l, parentOutline: !l.parentOutline }) },
];

export default class TaskCalendarStand extends Plugin {
	stand!: Stand;
	private looks: ScreenLooks = RELEASED_LOOKS;
	private readonly screens = new Set<{ refit(): void }>();

	override async onload(): Promise<void> {
		const stand = composeStand();
		this.stand = stand;
		(window as unknown as { __tcStand: Stand }).__tcStand = stand;
		this.register(() => delete (window as unknown as { __tcStand?: Stand }).__tcStand);
		this.paint();
		this.register(stand.services.settings.onChange(() => this.paint()));
		this.register(clearCardSize);
		this.register(clearPriorityColors);
		this.followWindows();
		const looks = () => this.looks;
		this.registerView(STAND_VIEW, (leaf) => this.track(new StandView(leaf, stand, looks)));
		this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => ctx.addChild(this.track(new StandBlock(el, stand, ctx.sourcePath, looks))));
		for (const look of LOOK_SWITCHES) this.addCommand({ id: look.id, name: look.name, callback: () => this.setLooks(look.flip(this.looks)) });
		(window as unknown as { __tcStandLooks: (looks: Partial<ScreenLooks>) => void }).__tcStandLooks = (patch) => this.setLooks({ ...this.looks, ...patch });
		this.addRibbonIcon("flask-conical", "Task Calendar Stand", () => void this.open());
		this.addCommand({ id: "open", name: "Open the screen", callback: () => void this.open() });
		this.addCommand({ id: "open-window", name: "Open the screen in a new window", callback: () => void this.open(true) });
		this.addCommand({ id: "open-note", name: "Open the project note with its block", callback: () => void this.openNote() });
		this.addCommand({ id: "new-tasks", name: "New made-up tasks", callback: () => stand.reset() });
		this.addCommand({ id: "phone-view", name: "Phone view on or off", callback: () => (this.app as unknown as { emulateMobile(on: boolean): void; isMobile: boolean }).emulateMobile(!(this.app as unknown as { isMobile: boolean }).isMobile) });
		for (const delay of WRITE_DELAYS) this.addCommand({ id: `delay-${delay}`, name: `Write delay ${delay} ms`, callback: () => stand.setDelay(delay) });
	}

	/** A screen the stand opened, refitted when a look switches. */
	private track<T extends { refit(): void }>(screen: T): T {
		this.screens.add(screen);
		return screen;
	}

	/** The looks switched: every open screen draws them. */
	private setLooks(looks: ScreenLooks): void {
		this.looks = looks;
		for (const screen of this.screens) screen.refit();
	}

	/** The card size and the levels' and labels' colours, as the plugin paints them on every window's document. */
	private paint(): void {
		const settings = this.stand.services.settings.get();
		showCardSize({ height: settings.cardHeight, gap: settings.cardGap });
		showPriorityColors(settings.priorities, settings.labels);
		showLabelPaint(settings.labelPaint);
	}

	/** A pop-out window gets the same paint as the main one. */
	private followWindows(): void {
		const closings = new Map<Document, () => void>();
		const open = (doc: Document) => {
			if (doc !== document && !closings.has(doc)) closings.set(doc, addWindowDocument(doc));
		};
		this.registerEvent(this.app.workspace.on("window-open", (win) => open(win.doc)));
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				closings.get(win.doc)?.();
				closings.delete(win.doc);
			}),
		);
		this.register(() => closings.forEach((close) => close()));
	}

	async open(window = false): Promise<WorkspaceLeaf> {
		const workspace = this.app.workspace;
		const leaf = window ? workspace.openPopoutLeaf() : (workspace.getLeavesOfType(STAND_VIEW)[0] ?? workspace.getLeaf(true));
		await leaf.setViewState({ type: STAND_VIEW, active: true });
		await workspace.revealLeaf(leaf);
		return leaf;
	}

	/** The note «Дом» is attached to, holding the stand's block; made when missing. */
	async openNote(): Promise<void> {
		const path = `${PROJECT_NOTE}.md`;
		const vault = this.app.vault;
		const file = (vault.getAbstractFileByPath(path) as TFile | null) ?? (await vault.create(path, `Дом.\n\n\`\`\`${BLOCK_LANGUAGE}\n\`\`\`\n`));
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
