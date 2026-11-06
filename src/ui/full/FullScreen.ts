import { DESCRIPTION_TEMPLATE, type FullPlace, type FullTree, samePlace, type TaskItem, type TaskKey, type TaskService, type UndoService } from "../../application/contracts";
import { BottomCapsule } from "../BottomCapsule";
import { DURATION, tokenMs } from "../design";
import { clear, el } from "../dom";
import { Button } from "../kit/Button";
import { icon } from "../kit/icons";
import type { MarkdownEditing, MarkdownSurface } from "../markdown/MarkdownSurface";
import { QuickField, type QuickFieldHandle, type QuickKey } from "../quick/QuickField";
import type { TitleField, TitleFieldFactory } from "../quick/TitleField";
import { pickMark } from "../TaskSelection";
import { TaskList } from "../TaskList";
import { fillTitle } from "../TaskTitle";
import type { LocalDate } from "../types";

export interface FullScreenDeps {
	readonly root: HTMLElement;
	readonly tasks: TaskService;
	readonly undo: UndoService;
	readonly surface: MarkdownSurface;
	readonly titleField: TitleFieldFactory;
	day(): LocalDate;
	/** Writes one change and resolves once the screen shows it; a change that answers false wrote nothing, so nothing is redrawn. */
	act(change: () => Promise<void | boolean>): Promise<void>;
	onUndo(): void;
	/** The task's own menu over `source`: a subtask's card, or the capsule for the screen's task. */
	menu(item: TaskItem, source: HTMLElement): void;
	onClose(): void;
}

/** A subtask's card being typed in the list: a new one last under `parent`, or one being renamed in its card's place. */
type CardTyping = { readonly kind: "subtask"; readonly parent: TaskKey } | { readonly kind: "rename"; readonly item: TaskItem };

/** Waits this long after the last key before the description is written, so a word is one write, not a letter each. */
const DESCRIPTION_PAUSE_MS = 600;

/**
 * One task over the whole view, to do it with nothing else on screen: its title, every subtask as a tree with a circle that
 * ticks it done and leaves it crossed out in place, and its description in Obsidian's editor, written as it is typed.
 * A subtask opens here too, its task over its title leading back up; Close leaves for the main screen.
 */
export class FullScreen {
	readonly el: HTMLElement;
	/** The tasks opened one inside another, the one on screen last. */
	private stack: TaskItem[] = [];
	/** The tree of the task on screen, as the service lays it out. */
	private tree: FullTree | null = null;
	private readonly parentButton: HTMLButtonElement;
	private readonly parentText: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly list: TaskList;
	private readonly descEl: HTMLElement;
	private readonly done: Button;
	private readonly capsule: BottomCapsule;
	private editing: MarkdownEditing | null = null;
	/** The description as the file had it when last drawn; the editor follows a change made elsewhere. */
	private fileDescription: string | null = null;
	/** What the editor last wrote, or held when it opened: nothing new to write while it holds the same. */
	private written = "";
	private saveTimer: number | null = null;
	private typing: CardTyping | null = null;
	/** The title being written; settles once the task on screen is the one the file now has. */
	private titleWrite: Promise<unknown> | null = null;
	private field: QuickFieldHandle | null = null;
	private titleField: TitleField | null = null;
	/** Each refresh is numbered: only the last one asked for draws. */
	private reading = 0;
	private closed = false;
	private readonly onKey = (e: KeyboardEvent) => this.key(e);

	static open(deps: FullScreenDeps, item: TaskItem, editing: boolean): FullScreen {
		const screen = new FullScreen(deps);
		screen.show(item, editing);
		return screen;
	}

	private constructor(private readonly deps: FullScreenDeps) {
		this.el = el(deps.root, "div", "tc-sheet tc-full");
		const bar = el(this.el, "div", "tc-sheet-bar");
		Button.create(bar, { kind: "text", label: "Close", onPress: () => this.close() });
		this.done = Button.create(bar, { kind: "text", tone: "strong", label: "Done", onPress: () => this.stopTyping() });
		this.done.setHidden(true);
		const body = el(this.el, "div", "tc-full-body");
		const column = el(body, "div", "tc-full-column");
		this.parentButton = el(column, "button", "tc-full-parent");
		this.parentButton.appendChild(icon("subtask"));
		this.parentText = el(this.parentButton, "span", "tc-full-parent-text");
		this.parentButton.addEventListener("click", () => void this.up());
		this.titleEl = el(column, "div", "tc-full-title");
		this.list = new TaskList(el(column, "div", "tc-full-list"), {
			items: () => this.tree?.subtasks ?? [],
			day: () => this.deps.day(),
			entry: () => this.entry(),
			renaming: () => (this.typing?.kind === "rename" ? this.typing.item.key : null),
			onCard: (card, item) => this.dress(card, item),
		});
		this.descEl = el(column, "div", "tc-desc-text tc-full-desc is-editing");
		this.capsule = new BottomCapsule(this.el, deps.undo, { onUndo: () => deps.onUndo(), onMore: (anchor) => this.current && deps.menu(this.current, anchor) });
		Button.create(this.el, { kind: "round", tone: "accent", label: "Add subtask", icon: "plus", cls: "tc-plus", onPress: () => this.current && this.addSubtask(this.current) });
		this.el.addEventListener("focusin", () => this.showDone());
		this.el.addEventListener("focusout", () => requestAnimationFrame(() => this.showDone()));
		document.addEventListener("keydown", this.onKey);
		requestAnimationFrame(() => this.el.classList.add("is-shown"));
	}

	private get current(): TaskItem | null {
		return this.stack[this.stack.length - 1] ?? null;
	}

	/** Opens `item` here, over the one on screen; `editing` puts the caret in its description. Its own task only focuses the editor. */
	show(item: TaskItem, editing = false): void {
		const current = this.current;
		if (!current || !samePlace(current.key, item.key)) {
			this.leaveTask();
			this.stack.push(item);
			this.draw(item);
		}
		if (editing) this.editing?.focus();
		this.showDone();
	}

	/** Whether `item` is the task on screen. */
	holds(item: TaskItem): boolean {
		const current = this.current;
		return current !== null && samePlace(current.key, item.key);
	}

	/** The file changed: the task on screen is read anew where it now stands; one that is gone gives way to the one under it. */
	async refresh(): Promise<void> {
		const ask = ++this.reading;
		await this.titleWrite?.catch(() => undefined);
		if (ask !== this.reading || this.closed) return;
		while (this.current) {
			const current = this.current;
			let found: TaskItem | null = null;
			try {
				found = await this.deps.tasks.find(current.key, current.text);
			} catch {
				found = null;
			}
			if (ask !== this.reading || this.closed) return;
			if (found) {
				this.stack[this.stack.length - 1] = found;
				this.draw(found);
				return;
			}
			this.leaveTask();
			this.stack.pop();
		}
		this.close();
	}

	/** Rename in a menu: the title of the task on screen, or a subtask's card, becomes the field. */
	rename(item: TaskItem): void {
		const current = this.current;
		if (current && samePlace(current.key, item.key)) this.renameTitle(current);
		else this.typeCard({ kind: "rename", item });
	}

	/** A new subtask, last under `parent`: the field stands where it will. */
	addSubtask(parent: TaskItem): void {
		this.typeCard({ kind: "subtask", parent: parent.key });
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.leaveTask();
		this.endCard();
		this.endTitle(false);
		this.capsule.destroy();
		document.removeEventListener("keydown", this.onKey);
		this.el.classList.remove("is-shown");
		window.setTimeout(() => this.el.remove(), tokenMs(this.el, DURATION.fade));
		this.deps.onClose();
	}

	private draw(item: TaskItem): void {
		this.tree = this.deps.tasks.fullTree(item);
		this.parentButton.hidden = item.parentText === null;
		clear(this.parentText);
		if (item.parentText !== null) fillTitle(this.parentText, item.parentText);
		this.drawTitle();
		this.list.render();
		this.field?.refocus();
		this.showDescription(item);
	}

	/** A subtask's card, or its copy over a menu: the circle, filled and the title crossed once it is done. */
	static mark(card: HTMLElement, item: TaskItem): void {
		pickMark(card);
		card.classList.toggle("is-closed", !item.open);
		card.classList.toggle("is-done", item.status === "done");
	}

	/** A card of the list: the circle ticks it done or opens it again, the card itself opens its menu. */
	private dress(card: HTMLElement, item: TaskItem): void {
		FullScreen.mark(card, item);
		const mark = card.querySelector<HTMLElement>(":scope > .tc-pick");
		mark?.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.deps.act(() => this.deps.tasks.toggleDone(item.key));
		});
		card.addEventListener("click", () => this.deps.menu(item, card));
	}

	/** Back to the task the one on screen belongs to: the one it was opened from, or its task read where it stands. */
	private async up(): Promise<void> {
		const current = this.current;
		if (!current?.parentKey || current.parentText === null) return;
		this.leaveTask();
		if (this.stack.length > 1) {
			this.stack.pop();
			await this.refresh();
			return;
		}
		const parent = await this.deps.tasks.find(current.parentKey, current.parentText);
		if (!parent || this.closed) return;
		this.stack = [parent];
		this.draw(parent);
	}

	private showDescription(item: TaskItem): void {
		if (!this.editing) {
			const markdown = item.description ?? DESCRIPTION_TEMPLATE;
			this.written = markdown;
			this.fileDescription = item.description;
			this.editing = this.deps.surface.edit(this.descEl, markdown, () => this.stopTyping(), () => this.descriptionTyped());
			return;
		}
		const changedElsewhere = item.description !== this.fileDescription;
		this.fileDescription = item.description;
		if (changedElsewhere && !this.editing.focused && this.saveTimer === null) {
			this.written = item.description ?? DESCRIPTION_TEMPLATE;
			this.editing.setValue(this.written);
		}
	}

	private descriptionTyped(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.saveDescription(), DESCRIPTION_PAUSE_MS);
	}

	/** What the editor holds goes to the file, unless it is what was written last. */
	private async saveDescription(): Promise<void> {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = null;
		const current = this.current;
		if (!this.editing || !current) return;
		const markdown = this.editing.value;
		if (markdown === this.written) return;
		this.written = markdown;
		await this.deps.act(() => this.deps.tasks.setDescription(current.key, markdown));
	}

	/** The task on screen is left: its description written, its editor and fields gone. */
	private leaveTask(): void {
		void this.saveDescription();
		this.editing?.destroy();
		this.editing = null;
		clear(this.descEl);
		this.endCard();
		this.endTitle(false);
	}

	private typeCard(typing: CardTyping): void {
		this.endCard();
		this.endTitle(true);
		this.typing = typing;
		this.list.render();
		this.field?.focus();
		this.showDone();
	}

	/** Where the field stands among the cards: where the tree puts the new subtask, or in the renamed card's place. */
	private entry() {
		const typing = this.typing;
		const at = typing && this.fieldPlace(typing);
		if (!typing || !at) return null;
		return {
			place: { kind: "gap" as const, index: at.index, level: at.level, group: null },
			pending: [],
			field: (row: HTMLElement) => {
				if (!this.field) this.field = this.openField(row, typing);
				else if (this.field.el.parentElement !== row) row.appendChild(this.field.el);
				return this.field.el;
			},
		};
	}

	private fieldPlace(typing: CardTyping): FullPlace | null {
		const tree = this.tree;
		if (!tree) return null;
		if (typing.kind === "rename") {
			const index = tree.rows.findIndex((row) => samePlace(row.item.key, typing.item.key));
			return index < 0 ? null : { index, level: tree.rows[index].level };
		}
		if (samePlace(tree.task.key, typing.parent)) return tree.newSubtask;
		return tree.rows.find((row) => samePlace(row.item.key, typing.parent))?.newSubtask ?? tree.newSubtask;
	}

	private openField(row: HTMLElement, typing: CardTyping): QuickFieldHandle {
		const renamed = typing.kind === "rename" ? typing.item : null;
		const tint = () => {
			const marks = this.deps.tasks.draftMarks(field.text, renamed?.priority?.prefix ?? null, renamed?.labels.map((l) => l.name) ?? []);
			field.setTint(marks.priority?.color ?? marks.labels[0]?.color ?? null);
		};
		const field = QuickField.open(row, {
			value: renamed?.text ?? "",
			parseTitle: (text) => this.deps.tasks.parseTitle(text),
			priority: renamed?.priority ?? null,
			titleField: this.deps.titleField,
			onInput: () => undefined,
			onPriority: () => tint(),
			onKey: (key) => void this.cardKey(key),
			onBlur: () => void this.cardKey("enter", true),
		});
		tint();
		return field;
	}

	/** Enter writes the card: a new subtask leaves the field for the next one, a rename ends. Escape ends it unwritten. */
	private async cardKey(key: QuickKey, leaving = false): Promise<void> {
		const typing = this.typing;
		const field = this.field;
		if (!typing || !field) return;
		if (key === "escape") return this.endCard();
		if (key !== "enter") return;
		const text = field.text;
		const tasks = this.deps.tasks;
		if (typing.kind === "rename") {
			this.endCard();
			await this.deps.act(async () => (await tasks.rename(typing.item.key, text)) !== null);
			return;
		}
		if (tasks.isBlank(text)) return this.endCard();
		if (leaving) this.endCard();
		else field.setValue("");
		await this.deps.act(async () => (await tasks.createInPlace(text, null, { kind: "subtask", parent: typing.parent, before: null })) !== null);
	}

	private endCard(): void {
		if (!this.typing && !this.field) return;
		this.typing = null;
		const field = this.field;
		this.field = null;
		field?.destroy();
		field?.el.closest(".tc-quick-row")?.remove();
		if (!this.closed) this.list.render();
	}

	/** Rename of the task on screen: its title becomes the field, as big as it was. */
	private renameTitle(item: TaskItem): void {
		this.endCard();
		this.endTitle(true);
		clear(this.titleEl);
		const field = this.deps.titleField(this.titleEl, {
			text: item.text,
			placeholder: "",
			events: {
				onInput: () => undefined,
				onEnter: () => void this.saveTitle(),
				onEscape: () => this.endTitle(false),
				onTab: () => undefined,
				onSwitch: () => undefined,
				onBlur: () => void this.saveTitle(),
			},
		});
		field.el.classList.add("tc-quick-field");
		this.titleField = field;
		field.focusEnd();
		this.showDone();
	}

	/**
	 * The typed title is written; the field stays over the title until the task, as the file now has it, takes its place.
	 * A change of the file meanwhile waits for it: the task is read by the key the rename answers with, the old one finds none.
	 */
	private async saveTitle(): Promise<void> {
		const field = this.titleField;
		const current = this.current;
		if (!field || !current) return;
		this.titleField = null;
		const write = this.deps.tasks.rename(current.key, field.text).then((renamed) => {
			if (renamed && this.current === current) this.stack[this.stack.length - 1] = renamed;
			return renamed !== null;
		});
		this.titleWrite = write;
		try {
			await this.deps.act(() => write);
		} finally {
			this.titleWrite = null;
			field.destroy();
			this.drawTitle();
		}
	}

	/** The title field goes; `quiet` leaves the title as it is, else it is drawn from the task again. */
	private endTitle(quiet: boolean): void {
		const field = this.titleField;
		if (!field) return;
		this.titleField = null;
		field.destroy();
		if (!quiet) this.drawTitle();
	}

	private drawTitle(): void {
		if (this.closed || this.titleField) return;
		clear(this.titleEl);
		if (this.current) fillTitle(this.titleEl, this.current.text);
	}

	/** Done stands in the bar while something on the screen is typed in: it puts the keyboard away. */
	private showDone(): void {
		const active = this.el.ownerDocument.activeElement;
		const typing = active instanceof HTMLElement && this.el.contains(active) && (active.isContentEditable || active.matches("input, textarea"));
		this.done.setHidden(!typing);
		this.el.classList.toggle("is-typing", typing);
	}

	private stopTyping(): void {
		const active = this.el.ownerDocument.activeElement;
		if (active instanceof HTMLElement && this.el.contains(active)) active.blur();
		void this.saveDescription();
	}

	/** Escape closes the screen when nothing on it is typed in and no menu stands over it. */
	private key(e: KeyboardEvent): void {
		if (e.key !== "Escape" || e.defaultPrevented || this.closed) return;
		const active = this.el.ownerDocument.activeElement;
		if (active instanceof HTMLElement && this.el.contains(active) && active !== this.el.ownerDocument.body) return;
		if (this.el.ownerDocument.querySelector(".tc-backdrop")) return;
		e.preventDefault();
		this.close();
	}
}
