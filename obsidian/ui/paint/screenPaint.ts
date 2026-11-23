import type { ScreenSettings } from "../../../core/application/contracts";
import { showCardSize } from "./cardSize";
import { showLabelPaint, showPriorityColors } from "./priorityColors";

/** The settings' card size, levels and labels on every window's body: what the host paints as the settings change. */
export function showScreenPaint(shown: Pick<ScreenSettings, "cardHeight" | "cardGap" | "priorities" | "labels" | "labelPaint">): void {
	showCardSize({ height: shown.cardHeight, gap: shown.cardGap });
	showPriorityColors(shown.priorities, shown.labels);
	showLabelPaint(shown.labelPaint);
}
