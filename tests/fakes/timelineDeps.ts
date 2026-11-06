import { TimelineSpans } from "../../src/application/TimelineSpans";
import type { TimelineDeps } from "../../src/ui/Timeline";

/** The deps of a timeline whose cards stand where the service would put them, by the deps' own day, boundary and clock. */
export function withShownSpan(deps: Omit<TimelineDeps, "shownSpan">): TimelineDeps {
	return { ...deps, shownSpan: (item) => new TimelineSpans(deps.boundary(), deps.now()).shown({ slot: item.slot!, open: item.open }, deps.date()) };
}
