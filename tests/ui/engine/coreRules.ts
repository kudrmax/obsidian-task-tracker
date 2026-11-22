import { levelRange } from "../../../core/application/contracts";
import { snapMinute } from "../../../core/application/snapGrid";
import type { Levels } from "../../../obsidian/ui/engine/drag/tree";
import type { SnapRule } from "../../../obsidian/ui/engine/layout/timeScale";

/** The core's snap, as `CorePort.snap` serves it to the engine's time scale. */
export const coreSnap: SnapRule = (minute, hourPx, tolerancePx) => snapMinute(minute, hourPx, tolerancePx);

/** The core's nesting, as `CorePort.levels` serves it to the engine's drag. */
export const coreLevels: Levels = (above, below) => levelRange([...(above === null ? [] : [{ level: above, group: null }]), ...(below === null ? [] : [{ level: below, group: null }])], above === null ? 0 : 1, null);
