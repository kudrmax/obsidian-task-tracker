import { keyId, type TaskItem } from "../application/contracts";
import { el } from "./dom";
import type { ListColumn } from "./drag/DropTarget";
import { icon } from "./kit/icons";

/** A list card as the selection knows it: the task, the card drawn for it, the list it stands in, its subtasks' cards. */
export interface PickedCard {
	readonly item: TaskItem;
	readonly card: HTMLElement;
	readonly column: ListColumn;
	readonly subtree: readonly HTMLElement[];
}

const SELECTED = "is-selected";

/** The circle at a card's start that Select tasks shows: empty, or the accent with a check once the task is picked. */
export function pickMark(card: HTMLElement): void {
	if (card.querySelector(":scope > .tc-pick")) return;
	const mark = el(null, "span", "tc-pick");
	mark.appendChild(icon("check"));
	card.prepend(mark);
}

/**
 * The tasks picked for an action on all of them: with ⌘-click, or with a tap while Select tasks is on. A redraw gives each
 * picked task its new card, which wears the selection; a task no list draws any more drops out of it.
 */
export class TaskSelection {
	private readonly picked = new Map<string, PickedCard>();
	/** Every list card drawn, picked or not, by its element. */
	private readonly drawn = new WeakMap<HTMLElement, PickedCard>();
	/** The card drawn last for each task: a click on a card a redraw just replaced picks the new one. */
	private readonly latest = new Map<string, PickedCard>();
	/** The task the last ⌘-click picked: a Shift-click selects from it. */
	private anchor: PickedCard | null = null;

	constructor(private readonly onChange: () => void = () => {}) {}

	/** A card drawn: it wears the selection when its task is picked. */
	attach(card: PickedCard): void {
		this.drawn.set(card.card, card);
		const id = keyId(card.item.key);
		this.latest.set(id, card);
		const picked = this.picked.has(id);
		if (picked) this.picked.set(id, card);
		if (this.anchor && keyId(this.anchor.item.key) === id) this.anchor = card;
		card.card.classList.toggle(SELECTED, picked);
	}

	/** The lists are drawn anew: the cards drawn before are let go; the picked tasks and the anchor stay. */
	forgetDrawn(): void {
		this.latest.clear();
	}

	/** How many cards are known as their tasks' latest. */
	get drawnCount(): number {
		return this.latest.size;
	}

	/** The picked tasks whose cards are on the page, in the order they stand there. */
	get cards(): readonly PickedCard[] {
		return [...this.picked.values()].filter((p) => p.card.isConnected).sort((a, b) => (a.card.compareDocumentPosition(b.card) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
	}

	/** The drawn card `el` as the selection knows it. */
	cardOf(el: HTMLElement): PickedCard | undefined {
		return this.drawn.get(el);
	}

	get size(): number {
		return this.cards.length;
	}

	has(item: TaskItem): boolean {
		const picked = this.picked.get(keyId(item.key));
		return picked !== undefined && picked.card.isConnected;
	}

	/** ⌘-click: in or out. */
	toggle(clicked: PickedCard): void {
		const id = keyId(clicked.item.key);
		const card = this.current(clicked);
		if (this.picked.has(id)) {
			this.picked.delete(id);
			this.anchor = null;
		} else {
			this.picked.set(id, card);
			this.anchor = card;
		}
		this.show();
	}

	/** Shift-click: every card of `column` from the last picked one to this one joins; without one in that list, only this one. */
	extend(clicked: PickedCard, column: readonly PickedCard[]): void {
		const card = this.current(clicked);
		const from = this.anchor && this.anchor.card.isConnected ? column.findIndex((c) => c.card === this.anchor!.card) : -1;
		const to = column.findIndex((c) => c.card === card.card);
		if (from < 0 || to < 0) return this.toggle(card);
		for (const c of column.slice(Math.min(from, to), Math.max(from, to) + 1)) this.picked.set(keyId(c.item.key), c);
		this.anchor = card;
		this.show();
	}

	private current(card: PickedCard): PickedCard {
		const latest = this.latest.get(keyId(card.item.key));
		return latest && latest.card.isConnected ? latest : card;
	}

	clear(): void {
		if (this.picked.size === 0) return;
		this.picked.clear();
		this.anchor = null;
		this.show();
	}

	private show(): void {
		for (const card of document.querySelectorAll<HTMLElement>(`.tc-card.${SELECTED}`)) card.classList.remove(SELECTED);
		for (const p of this.picked.values()) p.card.classList.add(SELECTED);
		this.onChange();
	}
}
