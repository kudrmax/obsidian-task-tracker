import { TimelineSpans } from "../../src/application/TimelineSpans";
import type { TimelineDeps } from "../../src/ui/Timeline";

/** The deps of a timeline whose cards stand, and events grey, as the services would have them, by the deps' own day, boundary and clock. */
export function withShownSpan(deps: Omit<TimelineDeps, "shownSpan" | "isPast">): TimelineDeps {
	return {
		...deps,
		shownSpan: (item) => new TimelineSpans(deps.boundary(), deps.now()).shown({ slot: item.slot!, open: item.open }, deps.date()),
		isPast: (event) => event.end.getTime() <= deps.now().getTime(),
	};
}
