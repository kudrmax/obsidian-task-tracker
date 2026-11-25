/**
 * Room kept under a scrolled list's last row when rows go away at its end (F66; the plugin's `ScrollHold`): the browser
 * would pull the scroll up to the shorter list's end, and every card under the finger would jump down. The list's height
 * stays what it was while the scroll needs it, and gives the room back as the list is scrolled up. Fed the virtualizer's
 * own measures: its rows' total height and its scroll offset.
 */
export class ScrollHold {
	private total = 0;
	private floor = 0;
	private at = 0;

	/** The height the list's rows take: their own, or what the scroll still needs of the room the rows that left took. */
	height(total: number, offset: number): number {
		if (total < this.total && offset > 0) {
			this.floor = Math.max(this.floor, this.total);
			this.at = offset;
		}
		this.total = total;
		if (offset < this.at) {
			this.floor -= this.at - offset;
			this.at = offset;
		}
		if (this.floor <= total) this.floor = 0;
		return Math.max(total, this.floor);
	}
}
