import type { Task } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

/** Characters of Unicode's private use area: no text a person writes carries them. */
const MARK = 0xe000;
const FIRST = 0xe001;

/**
 * Follows tasks through several operations on one document. Each tagged task carries a mark of its own at the end of
 * its text, which the operations keep wherever they move it; `untag` takes every mark off before the document is written.
 */
export class EntryTags {
	private constructor(private readonly asRead: readonly TaskEntry[]) {}

	/** Tags `entries` in their order: the n-th is found again as `find(doc, n)`. */
	static tag(doc: TaskDocument, entries: readonly TaskEntry[]): { readonly doc: TaskDocument; readonly tags: EntryTags } {
		const asRead = entries.map((entry) => doc.find(entry.section, entry.index, entry.path)!);
		const tagged = doc.replaceAll(asRead.map((same, n) => [same, { ...same.task, text: same.task.text + markOf(n) }] as const));
		return { doc: tagged, tags: new EntryTags(asRead) };
	}

	/** `text` with the n-th mark: written in place of a tagged task's text, it keeps the task tagged. */
	static marked(text: string, n: number): string {
		return text + markOf(n);
	}

	/** The n-th tagged task where it stands now; null once it is gone. */
	find(doc: TaskDocument, n: number): TaskEntry | null {
		const mark = markOf(n);
		const search = (entries: readonly TaskEntry[]): TaskEntry | null => {
			for (const entry of entries) {
				if (entry.task.text.endsWith(mark)) return entry;
				const inside = search(entry.subtasks);
				if (inside) return inside;
			}
			return null;
		};
		return search(doc.allTasks());
	}

	/** Takes every mark off: a task the operations left as it was gets its line back as it was read, wherever it now stands. */
	untag(doc: TaskDocument): TaskDocument {
		const changes: (readonly [TaskEntry, Task, TaskEntry])[] = [];
		this.asRead.forEach((asRead, n) => {
			const entry = this.find(doc, n);
			if (entry) changes.push([entry, { ...entry.task, text: entry.task.text.slice(0, -markOf(n).length) }, asRead]);
		});
		return doc.replaceAll(changes);
	}
}

function markOf(n: number): string {
	return String.fromCharCode(MARK, FIRST + n);
}
