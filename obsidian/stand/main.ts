import { Notice, Platform, Plugin, type TFile } from "obsidian";
import { keptDevice } from "../memoryCore";
import { failureText } from "../host/failureText";
import { ScreenBlock } from "../host/ScreenBlock";
import { ScreenHost } from "../host/ScreenHost";
import { MOCK_PROJECTS } from "./mockData";
import { type StandApi, standApi } from "./standApi";
import { type StandSource, standSource, WRITE_DELAYS } from "./standSource";
import { STAND_STEPS, type StandStep, WHOLE_SCREEN } from "./steps";

/** The stand's own view type and code block language: never the plugin's. */
const STAND_VIEW = "task-calendar-stand";
const BLOCK_LANGUAGE = "task-calendar-stand";
/** The note that holds the stand's block. */
const BLOCK_NOTE = "Заметка о доме.md";
/** The device's keys of the stand's screen, apart from the plugin's. */
const DEVICE_KEY = "task-calendar-stand:device";

/**
 * The stand (docs/superpowers/specs/2026-11-18-ui-engine.md, «The stand», Decision 143): the engine over `CorePort` and
 * the core over made-up tasks in memory, for a test Obsidian and a vault of its own on the phone, mounted by the same host
 * as the plugin. It opens the screen in a leaf, a pop-out window and a note's block.
 */
export default class TaskCalendarStand extends Plugin {
	/** The step a leaf shows: the whole screen, or the tasks of a step and the ribbon standing where they are. */
	private step: StandStep = WHOLE_SCREEN;

	override async onload(): Promise<void> {
		const source = await standSource(
			keptDevice(
				() => this.app.loadLocalStorage(DEVICE_KEY),
				(value) => this.app.saveLocalStorage(DEVICE_KEY, value),
			),
			(error) => new Notice(failureText(error)),
		);
		this.register(() => source.dispose());
		const host = new ScreenHost(this, {
			look: { type: STAND_VIEW, title: "Task Calendar Stand", icon: "flask-conical" },
			source: async () => source,
			paint: source.paint,
			opened: (screen) => screen.store.getState().setStop(this.step.stop),
		});
		host.load();
		const api = standApi(source, () => host.openScreens());
		(window as unknown as { __tcStand?: StandApi }).__tcStand = api;
		this.register(() => delete (window as unknown as { __tcStand?: StandApi }).__tcStand);

		this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => ctx.addChild(new ScreenBlock(el, host, ctx.sourcePath)));
		this.addRibbonIcon("flask-conical", "Task Calendar Stand", () => void host.open());
		this.addCommand({ id: "open", name: "Open the screen", callback: () => void host.open() });
		if (!Platform.isMobile) this.addCommand({ id: "open-window", name: "Open the screen in a new window", callback: () => void host.open(true) });
		this.addCommand({ id: "open-note", name: "Open the note with the screen's block", callback: () => void this.openNote() });
		this.addCommand({ id: "new-tasks", name: "New made-up tasks", callback: () => source.reset() });
		for (const step of STAND_STEPS) this.addCommand({ id: step.id, name: step.name, callback: () => void this.showStep(step, source, host) });
		for (const project of MOCK_PROJECTS.filter((p) => !p.folder)) this.addCommand({ id: `project-${project.name}`, name: `Choose the project «${project.name}»`, callback: () => api.setProject(project.name) });
		this.addCommand({ id: "project-none", name: "Choose no project", callback: () => api.setProject(null) });
		for (const delay of WRITE_DELAYS) this.addCommand({ id: `delay-${delay}`, name: `Write delay ${delay} ms`, callback: () => source.setDelay(delay) });
	}

	/** Shows `step` in every open leaf, with its tasks. */
	private async showStep(step: StandStep, source: StandSource, host: ScreenHost): Promise<void> {
		this.step = step;
		source.reset(step.file?.());
		await host.redrawLeaves();
	}

	/** The note holding the stand's block; made when missing. */
	private async openNote(): Promise<void> {
		const vault = this.app.vault;
		const file = (vault.getAbstractFileByPath(BLOCK_NOTE) as TFile | null) ?? (await vault.create(BLOCK_NOTE, `Дом.\n\n\`\`\`${BLOCK_LANGUAGE}\n\`\`\`\n`));
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
