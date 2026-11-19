/**
 * Whether a carried card heads into the edge of the room it is over (the plugin's `AutoScroll`, F162): only a pointer that
 * came towards the edge scrolls the room, so a card lifted near an edge and held there, or carried across an edge on into
 * another room, leaves it as it is. A pointer held still keeps heading where it headed; a new room starts afresh.
 */
export class EdgeHeading {
	private lastY: number | null = null;
	private room: string | null = null;
	private heading = false;

	/**
	 * The pointer at `y` over `room` (null: none), `edge` -1 near its top, 1 near its bottom, 0 between: the edge it heads
	 * into, as `room:edge`, or null.
	 */
	feed(room: string | null, y: number, edge: -1 | 0 | 1): string | null {
		if (room !== this.room) {
			this.room = room;
			this.lastY = null;
			this.heading = false;
		}
		const from = this.lastY;
		this.lastY = y;
		if (room === null || edge === 0) {
			this.heading = false;
			return null;
		}
		if (from !== null && y !== from) this.heading = edge > 0 === y > from;
		return this.heading ? `${room}:${edge}` : null;
	}
}
