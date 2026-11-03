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
		let tagged = doc;
		entries.forEach((entry, n) => {
			const same = tagged.find(entry.section, entry.index, entry.path)!;
			tagged = tagged.replace(same, { ...same.task, text: same.task.text + markOf(n) });
		});
		return { doc: tagged, tags: new EntryTags(entries.length) };
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
		let clean = doc;
		for (let n = 0; n < this.count; n++) {
			const entry = this.find(clean, n);
			if (entry) clean = clean.replace(entry, { ...entry.task, text: entry.task.text.slice(0, -markOf(n).length) });
		}
		return clean;
	}
}

function markOf(n: number): string {
	return String.fromCharCode(MARK, FIRST + n);
}
