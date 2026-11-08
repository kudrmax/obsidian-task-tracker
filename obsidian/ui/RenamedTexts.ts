import type { TaskItem } from "../../core/application/contracts";

/** A rename entered and not yet written, as an entry tells it: the task's id and the text its card shows meanwhile. */
export interface RenamedText {
	readonly id: string;
	readonly text: string;
	readonly title: string;
}

/** Where renames are typed: the screen's entry, the whole screen's entry. */
type RenameSource = () => readonly RenamedText[];

const SOURCES = new Set<RenameSource>();

/**
 * The renames entered and not yet written, wherever they were typed (decision 46): every card the plugin draws, in a list,
 * on the timeline, in a menu's stack, on the whole screen, shows a renamed task under its new text until the write is
 * drawn. One path for every card, never handed to each place that draws one.
 */
export const RenamedTexts = {
	/**
	 * An entry tells its renames from now on. Answers its end: once its owner is gone, it tells them until none waits to be
	 * written, so a card drawn after a closed field still shows the new text until the write is drawn.
	 */
	add(source: RenameSource): () => void {
		let ended = false;
		const telling: RenameSource = () => {
			const renames = source();
			if (ended && renames.length === 0) SOURCES.delete(telling);
			return renames;
		};
		SOURCES.add(telling);
		return () => {
			ended = true;
			if (source().length === 0) SOURCES.delete(telling);
		};
	},

	/** `item` as its card shows it: under its new text while a rename of it waits to be written. */
	shown<T extends Pick<TaskItem, "id" | "text" | "title">>(item: T): T {
		for (const source of SOURCES) {
			const rename = source().find((r) => r.id === item.id);
			if (rename) return { ...item, text: rename.text, title: rename.title };
		}
		return item;
	},
};
