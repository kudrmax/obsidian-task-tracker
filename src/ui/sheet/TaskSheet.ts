import type { TaskDraft } from "../../application/contracts";
import { formatTime } from "../dates";
import { DURATION, PROPERTY, tokenMs } from "../design";
import { el, px } from "../dom";
import { MonthPicker } from "../menu/MonthPicker";
import type { LocalDate, Slot } from "../types";
import { PlacementTiles, sheetIcon } from "./PlacementTiles";
import { draftOf, initialState, pickDate, type SheetState, togglePlacement } from "./sheetState";

export interface TaskSheetOptions {
	readonly mode: "new" | "edit";
	readonly initial: TaskDraft;
	readonly slot: Slot | null;
	readonly today: LocalDate;
	onSubmit(draft: TaskDraft): Promise<void>;
	onClose?(): void;
}

/** How tall the keyboard was the last time it shrank the view: the next screen leaves that room from its first frame. */
let rememberedKeyboard = 0;

/** The task screen over the whole view: the title to type, the four tiles, the calendar under them, Cancel and Add. */
export class TaskSheet {
	readonly el: HTMLElement;
	private state: SheetState;
	private readonly title: HTMLElement;
	private readonly submit: HTMLButtonElement;
	private readonly tiles: PlacementTiles;
	private readonly body: HTMLElement;
	/** What stands centred in the body; it slides when the body's height changes. */
	private readonly content: HTMLElement;
	private contentTop = 0;
	private openHeight = 0;
	/** Whether the keyboard has shrunk the view since this screen opened; once it leaves, the content takes the whole height. */
	private keyboardSeen = false;
	private picker: MonthPicker | null = null;
	private closed = false;

	static open(root: HTMLElement, opts: TaskSheetOptions): TaskSheet {
		return new TaskSheet(root, opts);
	}

	private constructor(root: HTMLElement, private readonly opts: TaskSheetOptions) {
		this.state = initialState(opts.initial.placement);
		this.el = el(root, "div", "tc-sheet");
		this.el.style.setProperty(PROPERTY.keyboard, px(rememberedKeyboard));
		const bar = el(this.el, "div", "tc-sheet-bar");
		const cancel = el(bar, "button", "tc-sheet-cancel", "Cancel");
		cancel.addEventListener("click", () => this.close());
		this.submit = el(bar, "button", "tc-sheet-submit", opts.mode === "edit" ? "Save" : "Add");
		this.submit.addEventListener("click", () => void this.save());
		this.body = el(this.el, "div", "tc-sheet-body");
		const body = el(this.body, "div", "tc-sheet-content");
		this.content = body;
		this.title = el(body, "div", "tc-sheet-title", opts.initial.text);
		this.title.contentEditable = "true";
		this.title.setAttribute("enterkeyhint", "done");
		this.title.addEventListener("keydown", (e) => this.key(e));
		this.title.addEventListener("input", () => this.renderSubmit());
		this.tiles = new PlacementTiles(body, (tile) => this.setState(togglePlacement(this.state, tile)));
		if (opts.slot) {
			const time = el(body, "div", "tc-sheet-time");
			time.appendChild(sheetIcon("clock"));
			const { start, end } = opts.slot;
			time.appendChild(document.createTextNode(end === null ? formatTime(start) : `${formatTime(start)}–${formatTime(end)}`));
		}
		this.body.addEventListener("pointerdown", (e) => this.keepKeyboard(e));
		this.body.addEventListener("click", (e) => this.refocus(e));
		this.render();
		this.focusEnd();
		this.openHeight = this.el.clientHeight;
		this.contentTop = this.content.offsetTop;
		new ResizeObserver(() => this.fitKeyboard()).observe(this.el);
		requestAnimationFrame(() => this.el.classList.add("is-shown"));
	}

	/** A tap on a tile or the calendar changes the task, not the focus: the keyboard stays. */
	private keepKeyboard(e: PointerEvent): void {
		if (!(e.target as Element).closest(".tc-sheet-title")) e.preventDefault();
	}

	/** A tap on the empty part of the screen brings the caret, and the keyboard, back to the title. */
	private refocus(e: MouseEvent): void {
		if ((e.target as Element).closest(".tc-tile, .tc-picker, .tc-sheet-title")) return;
		this.focusEnd();
	}

	/**
	 * The host shrinks the view when the keyboard opens: the room reserved for it gives way by as much, so the content
	 * stays put; what is left over slides. The height is remembered for the next screen.
	 */
	private fitKeyboard(): void {
		if (this.closed || this.el.clientHeight === 0) return;
		const shrink = Math.max(0, this.openHeight - this.el.clientHeight);
		if (shrink > 0) {
			this.keyboardSeen = true;
			rememberedKeyboard = Math.max(rememberedKeyboard, shrink);
			this.el.style.setProperty(PROPERTY.keyboard, px(Math.max(0, rememberedKeyboard - shrink)));
		} else if (this.keyboardSeen) this.el.style.setProperty(PROPERTY.keyboard, px(0));
		this.el.parentElement?.scrollTo(0, 0);
		this.slideContent();
	}

	/** The keyboard shrinks the view in one step: the content slides to its new centre instead of jumping there. */
	private slideContent(): void {
		const top = this.content.offsetTop;
		const delta = this.contentTop - top;
		this.contentTop = top;
		if (delta === 0 || this.closed) return;
		this.content.classList.remove("is-settling");
		this.content.style.transform = `translate3d(0, ${px(delta)}, 0)`;
		void this.content.offsetWidth;
		this.content.classList.add("is-settling");
		this.content.style.transform = "";
	}

	private focusEnd(): void {
		this.title.focus({ preventScroll: true });
		this.el.parentElement?.scrollTo(0, 0);
		const range = document.createRange();
		range.selectNodeContents(this.title);
		range.collapse(false);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	private get text(): string {
		return (this.title.textContent ?? "").trim();
	}

	private key(e: KeyboardEvent): void {
		if (e.key === "Enter") {
			e.preventDefault();
			void this.save();
		} else if (e.key === "Escape") {
			e.preventDefault();
			this.close();
		}
	}

	private setState(state: SheetState): void {
		this.state = state;
		this.render();
	}

	private renderSubmit(): void {
		this.submit.classList.toggle("is-disabled", this.text === "");
	}

	private render(): void {
		this.renderSubmit();
		this.tiles.render(this.state, this.opts.today);
		if (this.state.pickerOpen && !this.picker) {
			this.picker = new MonthPicker(el(this.content, "div"), {
				month: this.state.date ?? this.opts.today,
				today: this.opts.today,
				selected: this.state.date,
				onPick: (date) => this.setState(pickDate(this.state, date)),
				variant: "sheet",
			});
		} else if (!this.state.pickerOpen && this.picker) {
			this.picker.el.remove();
			this.picker = null;
		}
	}

	private async save(): Promise<void> {
		if (this.text === "" || this.closed) return;
		const draft = draftOf(this.text, this.state, this.opts.today);
		this.close();
		await this.opts.onSubmit(draft);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.el.classList.remove("is-shown");
		window.setTimeout(() => this.el.remove(), tokenMs(this.el, DURATION.fade));
		this.opts.onClose?.();
	}
}
