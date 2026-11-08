import { keyId, type TaskItem, type TaskKey } from "../../../core/application/contracts";

const ARRIVING = "is-arriving";

/**
 * The card a dropped task stands on once the drop is written: every card drawn for it stays hidden until the float has
 * landed on it, so the screen never shows the task twice. The float lands where the card really is, never where a guess
 * puts it.
 */
export class ArrivingCard {
	private id: string | null = null;
	/** The dropped task's identity (`TaskItem.id`), known before the write: a drawing made while it is written hides its card too. */
	private task: string | null = null;
	private card: HTMLElement | null = null;

	/** The task dropped, before its drop is written: every card drawn for it from now on waits for the float. */
	dropping(item: TaskItem): void {
		this.arrived();
		this.task = item.id;
	}

	/** The task the drop gave, as the file now has it; null when it gave none. */
	expect(key: TaskKey | null): void {
		const task = this.task;
		const card = this.card;
		this.id = key && keyId(key);
		this.task = task;
		this.card = card?.isConnected ? card : null;
	}

	/** A card drawn for `item`: hidden while it is the expected task's. */
	attach(card: HTMLElement, item: TaskItem): void {
		const expected = (this.id !== null && keyId(item.key) === this.id) || (this.task !== null && item.id === this.task);
		if (!expected) return;
		if (this.card?.isConnected && this.card !== card) return;
		card.classList.add(ARRIVING);
		this.card = card;
	}

	/** The expected task's card as drawn now; null when none stands on the screen. */
	get shown(): HTMLElement | null {
		return this.card?.isConnected ? this.card : null;
	}

	/** The float has landed: the card shows again. */
	arrived(): void {
		this.card?.classList.remove(ARRIVING);
		this.card = null;
		this.id = null;
		this.task = null;
	}
}
