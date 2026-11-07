import { DescriptionDraft, type EntryState, type FullTree, QuickEntrySession, SHOWN_LISTS, samePlace, type TaskItem, type TaskKey, type TaskService, type UndoService } from "../../../core/application/contracts";
import { BottomCapsule } from "../BottomCapsule";
import { DURATION, tokenMs } from "../design";
import { clear, el } from "../dom";
import { Button } from "../kit/Button";
import { icon } from "../kit/icons";
import type { MarkdownEditing, MarkdownSurface } from "../markdown/MarkdownSurface";
import { movesRows } from "../quick/QuickEntryController";
import { QuickField, type QuickFieldHandle, type QuickKey } from "../quick/QuickField";
import type { TitleField, TitleFieldFactory } from "../quick/TitleField";
import { WriteQueue } from "../quick/WriteQueue";
import type { ListEntryInput } from "../TaskList";
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
	/** A write of the typing that failed. */
	onError(error: unknown): void;
}

/** Waits this long after the last key before the description is written, so a word is one write, not a letter each. */
const DESCRIPTION_PAUSE_MS = 600;

/**
 * One task over the whole view, to do it with nothing else on screen: its title, every subtask as a tree with a circle that
 * ticks it done and leaves it crossed out in place, and its description in Obsidian's editor, written as it is typed.
 * A subtask opens here too, its task over its title leading back up; Close leaves for the main screen. Typing here is the
 * quick entry's, as in a calendar menu's stack: a new subtask last under its task, a rename in its card or in the title.
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
	/** When the editor writes and when a change made elsewhere replaces it: the rules are the draft's, the timing the screen's. */
	private draft: DescriptionDraft | null = null;
	private saveTimer: number | null = null;
	/** Typing a subtask or a title: what it means is the session's, the screen draws its state. */
	private readonly entry: QuickEntrySession;
	private state: EntryState | null = null;
	private field: QuickFieldHandle | null = null;
	/** The field took the focus once; after that a redraw only gives it back. */
	private focused = false;
	private titleField: TitleField | null = null;
	/** A title rename ended: its field stays over the title until what it sent is written, so the old title never flashes back. */
	private leavingTitle: TitleField | null = null;
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
		this.entry = new QuickEntrySession(
			deps.tasks,
			{
				cards: () => [],
				sections: () => [],
				sectioned: () => false,
				day: () => deps.day(),
				today: () => deps.day(),
				shown: () => SHOWN_LISTS.calendar,
				fresh: (beforeShow) => this.reread(beforeShow && (() => beforeShow(() => []))),
				onChange: (state, drawnNext) => this.changed(state, drawnNext),
				renamed: (was, now) => this.renamed(was, now),
			},
			new WriteQueue((error) => deps.onError(error)),
		);
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
			entry: () => this.listEntry(),
			renaming: () => this.renamedCard()?.key ?? null,
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

	/** The file changed: once what was typed is written, the task on screen is read anew where it now stands; one that is gone gives way to the one under it. */
	async refresh(): Promise<void> {
		await this.entry.idle();
		await this.reread();
	}

	/** The task on screen read anew; `beforeShow` runs right before it is drawn. Only the last read asked for draws. */
	private async reread(beforeShow?: () => void): Promise<void> {
		const ask = ++this.reading;
		while (this.current && !this.closed) {
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
				beforeShow?.();
				this.draw(found);
				return;
			}
			this.leaveTask();
			this.stack.pop();
		}
		this.close();
	}

	/** A rename was written: the task on screen is now read by the key it answers with, the old one finds none. */
	private renamed(was: TaskItem, now: TaskItem): void {
		const current = this.current;
		if (current && samePlace(current.key, was.key)) this.stack[this.stack.length - 1] = now;
	}

	/** Rename in a menu: the title of the task on screen, or a subtask's card, becomes the field. */
	rename(item: TaskItem): void {
		this.type(null, item);
	}

	/** A new subtask, last under `parent`: the field stands where it will. */
	addSubtask(parent: TaskItem): void {
		this.type(parent.key, null);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.leaveTask();
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
		if (!this.editing || !this.draft) {
			const draft = (this.draft = new DescriptionDraft(item.description));
			this.editing = this.deps.surface.edit(this.descEl, draft.text, () => this.stopTyping(), () => this.descriptionTyped());
			return;
		}
		const replace = this.draft.read(item.description, { focused: this.editing.focused, pending: this.saveTimer !== null });
		if (replace !== null) this.editing.setValue(replace);
	}

	private descriptionTyped(): void {
		this.draft?.typed();
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.saveDescription(), DESCRIPTION_PAUSE_MS);
	}

	/**
	 * What the editor holds goes to the file once something was typed in it: an editor left untouched sends nothing, so it
	 * never writes back an old text over a change made elsewhere. The same text writes nothing (the service's rule).
	 */
	private async saveDescription(): Promise<void> {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = null;
		const current = this.current;
		if (!this.editing || !current || !this.draft?.save()) return;
		const markdown = this.editing.value;
		await this.deps.act(() => this.deps.tasks.setDescription(current.key, markdown));
	}

	/** The task on screen is left: its description written, its editor gone, and what was being typed dropped. */
	private leaveTask(): void {
		void this.saveDescription();
		this.editing?.destroy();
		this.editing = null;
		this.draft = null;
		clear(this.descEl);
		this.entry.escape();
	}

	/** A field: a new subtask under `under`, or `renamed` renamed, in the title for the task on screen, else in its card. */
	private type(under: TaskKey | null, renamed: TaskItem | null): void {
		this.dropField();
		const parent = under ?? renamed?.key;
		if (parent) this.entry.open(this.entry.stackSpot(parent), renamed ?? undefined);
	}

	private isCurrent(item: TaskItem | null): boolean {
		const current = this.current;
		return item !== null && current !== null && samePlace(current.key, item.key);
	}

	/** The subtask renamed in its card, whose card the list hides; none while the title is renamed or nothing is. */
	private renamedCard(): TaskItem | null {
		const renaming = this.state?.renaming ?? null;
		return renaming && !this.isCurrent(renaming) ? renaming : null;
	}

	/** The session's state changed: the field and the title follow it. `drawnNext`: the screen is about to draw it. */
	private changed(state: EntryState | null, drawnNext = false): void {
		const before = this.state;
		this.state = state;
		const inTitle = state !== null && this.isCurrent(state.renaming);
		if (!inTitle) this.endTitle();
		if (!state || inTitle) this.endField();
		if (state && inTitle) this.showTitleField(state);
		if (this.closed || drawnNext) return;
		if (!state || inTitle) {
			this.list.render();
		} else {
			if (movesRows(before, state)) this.list.render();
			this.sync(state);
			if (this.field && !this.focused) {
				this.focused = true;
				this.field.focus();
			}
		}
		this.showDone();
	}

	/** The field shows the state: its text and the colour of the marks it is written with. */
	private sync(state: EntryState): void {
		if (this.field && this.field.text !== state.text) this.field.setValue(state.text);
		this.field?.setTint(state.marks.tint);
	}

	/** Where the field stands among the cards, as the core places it on this task's page: a new subtask's place, or the renamed card's; none in the title. */
	private listEntry(): ListEntryInput | null {
		const current = this.current;
		const entry = current && this.entry.stackEntry(current);
		if (!entry || entry.at.kind === "title") return null;
		const { index, level } = entry.at;
		return {
			at: { kind: "in", section: 0, card: index, keepsPlate: true },
			level,
			pending: entry.pending,
			field: (row: HTMLElement) => {
				const field = (this.field ??= this.openField(row));
				if (field.el.parentElement !== row) row.appendChild(field.el);
				return field.el;
			},
		};
	}


	private openField(row: HTMLElement): QuickFieldHandle {
		const state = this.state;
		const handle: QuickFieldHandle = QuickField.open(row, {
			value: state?.text ?? "",
			tint: state?.marks.tint ?? null,
			titleField: this.deps.titleField,
			onInput: (text) => this.entry.type(text),
			onKey: (key) => this.typedKey(key),
			onBlur: () => this.blurred(handle),
		});
		return handle;
	}

	private typedKey(key: QuickKey): void {
		if (key === "enter") this.entry.enter();
		else if (key === "escape") this.entry.escape();
	}

	/** The field lost the focus: a tap elsewhere, unless a redraw that moved it gave it back at once. */
	private blurred(handle: QuickFieldHandle): void {
		window.setTimeout(() => {
			if (this.field === handle && this.state && !handle.focused) this.entry.blur();
		});
	}

	/** The card's field goes with its row; the next one is made where the entry stands then. */
	private endField(): void {
		const field = this.field;
		this.field = null;
		this.focused = false;
		field?.destroy();
		field?.el.closest(".tc-quick-row")?.remove();
	}

	private dropField(): void {
		this.field?.destroy();
		this.field = null;
		this.focused = false;
	}

	/** Rename of the task on screen: its title becomes the field, as big as it was. */
	private showTitleField(state: EntryState): void {
		if (this.titleField) return;
		this.leavingTitle?.destroy();
		this.leavingTitle = null;
		clear(this.titleEl);
		const field = this.deps.titleField(this.titleEl, {
			text: state.text,
			placeholder: "",
			events: {
				onInput: () => this.entry.type(field.text),
				onEnter: () => this.entry.enter(),
				onEscape: () => this.entry.escape(),
				onTab: () => undefined,
				onSwitch: () => undefined,
				onBlur: () => this.entry.blur(),
			},
		});
		field.el.classList.add("tc-quick-field");
		this.titleField = field;
		field.focusEnd();
	}

	/** The title rename ended: its field stays until what it sent is written, then the title is drawn from the task again. */
	private endTitle(): void {
		const field = this.titleField;
		if (!field) return;
		this.titleField = null;
		this.leavingTitle = field;
		void this.entry.idle().then(() => {
			if (this.leavingTitle !== field) return;
			this.leavingTitle = null;
			field.destroy();
			this.drawTitle();
		});
	}

	private drawTitle(): void {
		if (this.closed || this.titleField || this.leavingTitle) return;
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
