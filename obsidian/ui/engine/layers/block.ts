/**
 * Where the menu's block stands (Decision 120, iOS's context menu): its copy at `over` (right over the task, kept in the
 * window), the panel `gap` under the copy. Where the room under the task can't take the panel, the block stands higher,
 * so its bottom keeps `margin` from the room's bottom; the copy no higher than `margin` under the room's top, the panel
 * then scrolling within what is left. `copy` and `panel` are their heights; the answer is the copy's top.
 */
export function blockTop(over: number, copy: number, panel: number, gap: number, room: { readonly top: number; readonly bottom: number }, margin: number): number {
	if (panel <= 0) return over;
	return Math.max(room.top + margin, Math.min(over, room.bottom - margin - panel - gap - copy));
}
