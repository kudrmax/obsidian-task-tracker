import type { TaskDraft } from "../../application/contracts";
import { formatTime } from "../dates";
import { DURATION, tokenMs } from "../design";
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

/** The task screen over the whole view: the title to type, the three tiles, the calendar under them, Cancel and Add. */
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
	private picker: MonthPicker | null = null;
	private closed = false;

	static open(root: HTMLElement, opts: TaskSheetOptions): TaskSheet {
		return new TaskSheet(root, opts);
	}

	private constructor(root: HTMLElement, private readonly opts: TaskSheetOptions) {
		this.state = initialState(opts.initial.placement);
		this.el = el(root, "div", "tc-sheet");
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
			time.appendChild(document.createTextNode(`${formatTime(opts.slot.start)}–${formatTime(opts.slot.end)}`));
		}
		this.render();
		this.focusEnd();
		this.contentTop = this.content.offsetTop;
		new ResizeObserver(() => this.slideContent()).observe(this.body);
		requestAnimationFrame(() => this.el.classList.add("is-shown"));
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
		this.title.focus();
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
