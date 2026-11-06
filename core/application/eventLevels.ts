/** An event's minutes on the timeline, from the start of the shown day. */
export interface EventSpan {
	readonly start: number;
	readonly end: number;
}

/** How deep an event lies over others (0 on the ground), and its place back to front. */
export interface EventLevel {
	readonly level: number;
	readonly layer: number;
}

/**
 * Events never share the width, like tasks: by start, the longer first on a tie, an event that starts while another goes on lies over
 * it, one inset further in; the later lies higher. Answers in the order given.
 */
export function eventLevels(spans: readonly EventSpan[]): EventLevel[] {
	const order = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
	const levels: EventLevel[] = new Array(spans.length);
	const placed: (EventSpan & { level: number })[] = [];
	for (const { span, index } of order) {
		const under = placed.filter((p) => p.start <= span.start && span.start < p.end).pop();
		const level = under ? under.level + 1 : 0;
		levels[index] = { level, layer: placed.length };
		placed.push({ ...span, level });
	}
	return levels;
}
