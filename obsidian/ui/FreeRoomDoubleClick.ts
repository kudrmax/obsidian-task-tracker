/**
 * A mouse's double click on a list's free room runs the handler: on the column and the list themselves, between and under
 * the cards; a card or a header keeps its own clicks. A finger's double tap is left alone: the phone has no double click.
 */
export class FreeRoomDoubleClick {
	private mouse = false;

	constructor(
		areas: readonly HTMLElement[],
		private readonly onDoubleClick: () => void,
	) {
		for (const area of areas) {
			area.addEventListener("pointerdown", (e) => (this.mouse = e.pointerType === "mouse"));
			area.addEventListener("dblclick", (e) => {
				if (this.mouse && e.target === area) this.onDoubleClick();
			});
		}
	}
}
