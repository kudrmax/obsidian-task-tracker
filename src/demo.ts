import { DemoCalendarService } from "../tests/fakes/DemoCalendarService";
import { DemoDayService } from "../tests/fakes/DemoDayService";
import { DEMO_NOW, FixedClock } from "../tests/fakes/DemoClock";
import { DemoTaskService } from "../tests/fakes/DemoTaskService";
import TaskCalendarPlugin from "./main";
import type { UndoService } from "./application/contracts";
import type { ViewDeps } from "./ui/TaskCalendarView";

const NO_UNDO: UndoService = { undo: async () => "nothing", redo: async () => "nothing", canUndo: () => false, canRedo: () => false, onChange: () => () => undefined };

/** The build the pixel comparison runs: the board's data and 14:20 on 2026-10-30 instead of the vault and the clock. */
export default class DemoTaskCalendarPlugin extends TaskCalendarPlugin {
	protected override createDeps(): ViewDeps {
		const clock = new FixedClock(DEMO_NOW);
		const days = new DemoDayService(clock, this);
		return {
			tasks: new DemoTaskService(clock, () => days.boundary()),
			days,
			undo: NO_UNDO,
			calendars: new DemoCalendarService(),
			settings: this.shownSettings(),
			clock,
			openInCalendar: () => undefined,
		};
	}
}
