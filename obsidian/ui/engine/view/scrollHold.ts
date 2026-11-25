/** What a list keeps of its last draw to hold its room: its rows' total height, and the room it holds while scrolled `at`. */
export interface ScrollHold {
	readonly total: number;
	readonly floor: number;
	readonly at: number;
}

export const NO_HOLD: ScrollHold = { total: 0, floor: 0, at: 0 };

/**
 * Room kept under a scrolled list's last row when rows go away at its end (F66; the plugin's `ScrollHold`): the browser
 * would pull the scroll up to the shorter list's end, and every card under the finger would jump down. The list's height
 * stays what it was while the scroll needs it, and gives the room back as the list is scrolled up. Pure: fed the hold of
 * the last draw and the virtualizer's own measures, its rows' total height and its scroll offset; the same hold back when
 * nothing changes. The height drawn is `Math.max(total, floor)`.
 */
export function scrollHold(was: ScrollHold, total: number, offset: number): ScrollHold {
	let { floor, at } = was;
	if (total < was.total && offset > 0) {
		floor = Math.max(floor, was.total);
		at = offset;
	}
	if (offset < at) {
		floor -= at - offset;
		at = offset;
	}
	if (floor <= total) floor = 0;
	return was.total === total && was.floor === floor && was.at === at ? was : { total, floor, at };
}
