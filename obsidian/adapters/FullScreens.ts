import { DescriptionDraft, type ScreenReader, type TaskItem, type TaskService } from "../../core/application/contracts";
import type { FullTask } from "../ui/engine/port";
import type { ScreenDrawing } from "./ScreenDrawing";

/** Waits this long after the last key before the notes are written, so a word is one write, not a letter each (the design's 0.6 s). */
const NOTES_PAUSE_MS = 600;

/** A task's notes open on the full screen: the core's rules of the editor, and the host's pause before a write. */
interface OpenNotes {
	readonly draft: DescriptionDraft;
	text: string;
	seq: number;
	focused: boolean;
	timer: ReturnType<typeof setTimeout> | null;
}

/**
 * The full screen over the core (F239–F249): a task as the core lays it out there (`fullTree`: every subtask unfolded, its
 * first project), its faces drawn as everywhere, and its notes by the core's `DescriptionDraft`, written after a pause in
 * typing (the host's timing, as the core's draft asks), when the screen leaves the task, and when the file changed
 * elsewhere replacing what the editor shows only while it has no focus and no write waits.
 */
export class FullScreens {
	private readonly notes = new Map<string, OpenNotes>();

	constructor(
		private readonly tasks: TaskService,
		private readonly drawing: ScreenDrawing,
		private readonly reader: () => ScreenReader,
		private readonly written: () => Promise<void>,
		private readonly onError: (error: unknown) => void,
	) {}

	task(id: string): FullTask | null {
		const item = this.reader().item(id);
		if (!item) return null;
		const tree = this.tasks.fullTree(item);
		const faces = Object.fromEntries([item, ...tree.rows.map((row) => row.item)].map((task) => [task.id, this.drawing.face(task, null)]));
		const parent = item.parentKey?.id ? this.reader().item(item.parentKey.id) : null;
		return {
			id,
			title: item.title,
			parent: parent && { id: parent.id, title: parent.title },
			project: tree.project?.name ?? null,
			rows: tree.rows.map((row) => ({ id: row.item.id, depth: row.level, status: row.item.status, open: row.item.open })),
			faces,
			notes: this.notesOf(item),
		};
	}

	async tick(id: string): Promise<void> {
		const item = this.reader().item(id);
		if (!item) return;
		try {
			await this.tasks.toggleDone(item.key);
		} catch (error) {
			this.onError(error);
		}
		await this.written();
	}

	typed(id: string, text: string): void {
		const open = this.notes.get(id);
		if (!open) return;
		open.text = text;
		open.draft.typed();
		if (open.timer !== null) clearTimeout(open.timer);
		open.timer = setTimeout(() => void this.save(id), NOTES_PAUSE_MS);
	}

	focus(id: string, focused: boolean): void {
		const open = this.notes.get(id);
		if (open) open.focused = focused;
	}

	async leave(id: string): Promise<void> {
		await this.save(id);
		this.notes.delete(id);
	}

	/** What the editor shows: opened afresh, or the file's text again when the draft says a change elsewhere replaces it. */
	private notesOf(item: TaskItem): FullTask["notes"] {
		let open = this.notes.get(item.id);
		if (!open) {
			const draft = new DescriptionDraft(item.description);
			open = { draft, text: draft.text, seq: 0, focused: false, timer: null };
			this.notes.set(item.id, open);
		} else {
			const replace = open.draft.read(item.description, { focused: open.focused, pending: open.timer !== null });
			if (replace !== null) {
				open.text = replace;
				open.seq++;
			}
		}
		return { text: open.text, seq: open.seq };
	}

	/** What was typed goes to the file once something was typed since the last write; the same text writes nothing (the core's rule). */
	private async save(id: string): Promise<void> {
		const open = this.notes.get(id);
		if (!open) return;
		if (open.timer !== null) clearTimeout(open.timer);
		open.timer = null;
		const item = this.reader().item(id);
		if (!item || !open.draft.save(open.text)) return;
		try {
			await this.tasks.setDescription(item.key, open.text);
			await this.written();
		} catch (error) {
			this.onError(error);
		}
	}
}
