import { keyId, type TaskItem, type TaskKey } from "../../../core/application/contracts";

const ARRIVING = "is-arriving";

/**
 * The card a dropped task stands on once the drop is written: every card drawn for it stays hidden until the float has
 * landed on it, so the screen never shows the task twice. The float lands where the card really is, never where a guess
 * puts it.
 */
export class ArrivingCard {
	private id: string | null = null;
	private card: HTMLElement | null = null;

	/** The task the drop gave, as the file now has it; null when it gave none. */
	expect(key: TaskKey | null): void {
		this.arrived();
		this.id = key && keyId(key);
	}

	/** A card drawn for `item`: hidden while it is the expected task's. */
	attach(card: HTMLElement, item: TaskItem): void {
		if (this.id === null || keyId(item.key) !== this.id) return;
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
	}
}
