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
	private constructor(private readonly count: number) {}

	/** Tags `entries` in their order: the n-th is found again as `find(doc, n)`. */
	static tag(doc: TaskDocument, entries: readonly TaskEntry[]): { readonly doc: TaskDocument; readonly tags: EntryTags } {
		const tagged = doc.replaceAll(
			entries.map((entry, n) => {
				const same = doc.find(entry.section, entry.index, entry.path)!;
				return [same, { ...same.task, text: same.task.text + markOf(n) }] as const;
			}),
		);
		return { doc: tagged, tags: new EntryTags(entries.length) };
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

	untag(doc: TaskDocument): TaskDocument {
		const changes: (readonly [TaskEntry, Task])[] = [];
		for (let n = 0; n < this.count; n++) {
			const entry = this.find(doc, n);
			if (entry) changes.push([entry, { ...entry.task, text: entry.task.text.slice(0, -markOf(n).length) }]);
		}
		return doc.replaceAll(changes);
	}
}

function markOf(n: number): string {
	return String.fromCharCode(MARK, FIRST + n);
}
