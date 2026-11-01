import type { Placement } from "../application/contracts";
import { dayMonth } from "./dates";

/** A place as the screens name it: Inbox, Soon, Now, or the day as `5 Nov`. */
export function placeLabel(placement: Placement): string {
	if (placement.kind === "inbox") return "Inbox";
	if (placement.kind === "soon") return "Soon";
	if (placement.kind === "now") return "Now";
	return dayMonth(placement.date);
}
