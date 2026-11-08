import { editRepeat, onTheDay, REPEAT_WORDS, type RepeatChange, type RepeatDraft, type RepeatKind, type RepeatRule, type RepeatUnit, type Weekday } from "../../../core/application/contracts";
import { el } from "../dom";
import { Button } from "../kit/Button";
import { menuRow } from "../menu/MenuPanel";

export interface RepeatPanelOptions {
	/** What the panel offers and shows: `repeatDraft` of the task's rule from its `repeatDay`, or the quick entry's. */
	readonly draft: RepeatDraft;
	readonly onChange: (rule: RepeatRule) => void;
	/** Remove repeat, at the bottom, shown while the draft is of a rule there is already (`removable`). */
	readonly onRemove: () => void;
}

interface Choice<T> {
	readonly value: T;
	readonly label: string;
}

const KIND_LABELS: Readonly<Record<RepeatKind, string>> = REPEAT_WORDS.kinds;
const UNIT_LABELS: Readonly<Record<RepeatUnit, string>> = REPEAT_WORDS.units;

/** A track of a few choices, one of them chosen. */
class Segments<T> {
	private readonly buttons: { readonly value: T; readonly button: Button }[];

	constructor(parent: HTMLElement, cls: string, name: string, choices: readonly Choice<T>[], onPick: (value: T) => void) {
		const track = el(parent, "div", `tc-repeat-seg ${cls}`);
		track.setAttribute("role", "group");
		track.setAttribute("aria-label", name);
		this.buttons = choices.map(({ value, label }) => ({ value, button: Button.create(track, { kind: "text", label, cls: "tc-repeat-seg-btn", onPress: () => onPick(value) }) }));
	}

	show(chosen: T): void {
		for (const { value, button } of this.buttons) {
			button.setOn(value === chosen);
			button.el.setAttribute("aria-pressed", String(value === chosen));
		}
	}
}

/** The repeat of a task as it is being set: every tap goes to `editRepeat`, and a draft it changes is drawn and its rule handed on at once. */
class RepeatEditor {
	private draft: RepeatDraft;

	private readonly kinds: Segments<RepeatKind>;
	private readonly units: Segments<RepeatUnit>;
	private readonly fewer: Button;
	private readonly count: HTMLElement;
	private readonly removeRow: HTMLElement | null;
	private detail: HTMLElement | null = null;

	constructor(private readonly panel: HTMLElement, private readonly opts: RepeatPanelOptions) {
		this.draft = opts.draft;
		panel.classList.add("is-repeat");
		const kinds = this.draft.kinds.map((value) => ({ value, label: KIND_LABELS[value] }));
		this.kinds = new Segments(panel, "tc-repeat-kind", "Repeat kind", kinds, (to) => this.change({ what: "kind", to }));
		const row = el(panel, "div", "tc-repeat-every");
		el(row, "span", "tc-repeat-every-label", REPEAT_WORDS.every);
		this.fewer = Button.create(row, { kind: "icon", tone: "accent", label: "Fewer", icon: "minus", cls: "tc-repeat-step", onPress: () => this.change({ what: "every", by: -1 }) });
		this.count = el(row, "span", "tc-repeat-count");
		Button.create(row, { kind: "icon", tone: "accent", label: "More", icon: "plus", cls: "tc-repeat-step", onPress: () => this.change({ what: "every", by: 1 }) });
		const units = this.draft.units.map((value) => ({ value, label: UNIT_LABELS[value] }));
		this.units = new Segments(panel, "tc-repeat-unit", "Unit", units, (to) => this.change({ what: "unit", to }));
		this.removeRow = this.draft.removable ? menuRow(panel, { label: REPEAT_WORDS.remove, icon: "removeDue", cls: "tc-repeat-remove", onPick: () => opts.onRemove() }) : null;
		panel.classList.toggle("has-remove", this.removeRow !== null);
		this.show();
	}

	/** A tap: when it changes anything, the panel shows the new draft and hands its rule on. */
	private change(change: RepeatChange): void {
		const next = editRepeat(this.draft, change);
		if (!next) return;
		this.draft = next;
		this.show();
		this.opts.onChange(next.rule);
	}

	private show(): void {
		const { kind, unit, every, can } = this.draft;
		this.kinds.show(kind);
		this.units.show(unit);
		this.count.textContent = String(every);
		this.fewer.setOff(!can.fewer);
		this.fewer.el.setAttribute("aria-disabled", String(!can.fewer));
		this.detail?.remove();
		this.detail = this.buildDetail();
		if (this.detail) this.panel.insertBefore(this.detail, this.removeRow);
	}

	/** Under the unit: what the draft says stands there, the weekdays or the month's day. */
	private buildDetail(): HTMLElement | null {
		const { detail, rule, days } = this.draft;
		if (detail === "monthDay") return el(null, "div", "tc-repeat-month", onTheDay(rule));
		if (detail !== "weekdays") return null;
		const week = el(null, "div", "tc-repeat-week");
		REPEAT_WORDS.weekdays.forEach(({ short, name }, index) => {
			const day = index as Weekday;
			const on = days.includes(day);
			const button = Button.create(week, { kind: "text", label: name, text: short, cls: "tc-repeat-day", onPress: () => this.change({ what: "weekday", day }) });
			button.setOn(on);
			button.el.setAttribute("aria-pressed", String(on));
		});
		return week;
	}
}

/** The repeat panel (README «Повторы», variant А): the kind, the step, the unit, the weekdays or the month's day, Remove repeat. */
export function repeatPanel(parent: HTMLElement, opts: RepeatPanelOptions): void {
	new RepeatEditor(parent, opts);
}
