import type { MountedScreen } from "../ui/engine/mount";
import type { Stop } from "../ui/engine/store";
import type { ListKey } from "./mockData";
import type { MemoryModel } from "../memoryCore";
import type { StandSource, WriteDelay } from "./standSource";

/** What the checks and a person debugging reach on `window.__tcStand`: the made-up tasks' file and the stand's switches; never the screen's own state. */
export interface StandApi {
	fileText(): string;
	reset(): void;
	setDelay(delay: WriteDelay): void;
	addFromOutside(list: ListKey, title: string): void;
	moveFromOutside(title: string, list: ListKey, before: string | null): void;
	/** Puts every open screen's ribbon at `stop`, as a scenario's setup. */
	setStop(stop: Stop): void;
	/** Chooses a made-up project on every open screen (null: none): a change of context, as the projects panel will make it. */
	setProject(project: string | null): void;
	/** The assistant's question waiting answered with the task titled `title` and `reason`, or failed (null): the stand's model in memory (F262–F265). */
	answerAssistant(title: string | null, reason?: string): void;
	/** Whether the assistant's question waits for its answer. */
	assistantAsked(): boolean;
	/** The titles the assistant's waiting question offers. */
	assistantCandidates(): readonly string[];
	/** Each open screen's stop, gesture slot, carried task, layer and the task its menu is open over (a check reads `menuOf` alone: whose menu a tap opened). */
	debug(): readonly object[];
}

/** The stand's reach over `source` and the screens open now: one for the stand plugin and the checks' page. */
export function standApi(source: StandSource, screens: () => readonly MountedScreen[], model: MemoryModel | null = null): StandApi {
	return {
		answerAssistant: (title, reason = "It changes the most.") => (title === null ? model?.fail() : model?.answer(title, reason)),
		assistantAsked: () => model?.asked ?? false,
		assistantCandidates: () => model?.candidates() ?? [],
		fileText: () => source.fileText(),
		reset: () => source.reset(),
		setDelay: (delay) => source.setDelay(delay),
		addFromOutside: (list, title) => source.addFromOutside(list, title),
		moveFromOutside: (title, list, before) => source.moveFromOutside(title, list, before),
		setStop: (stop) => screens().forEach((screen) => screen.store.getState().setStop(stop)),
		setProject: (project) => screens().forEach((screen) => screen.store.getState().setContext({ project })),
		debug: () =>
			screens().map((screen) => {
				const { stop, gesture, lifted, layer, entry, pending, dayOffset, menuLifted, selected } = screen.store.getState();
				return { stop, gesture, lifted, layer: layer?.kind ?? null, menuOf: layer?.kind === "menu" ? layer.id : null, entry, pending, dayOffset, menuLifted, selected };
			}),
	};
}
