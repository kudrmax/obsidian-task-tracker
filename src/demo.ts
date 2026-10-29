import { DemoCalendarService } from "../tests/fakes/DemoCalendarService";
import { DEMO_NOW, FixedClock } from "../tests/fakes/DemoClock";
import { DemoTaskService } from "../tests/fakes/DemoTaskService";
import TaskCalendarPlugin from "./main";
import type { ViewDeps } from "./ui/TaskCalendarView";

/** The build the pixel comparison runs: the board's data and 14:20 on 2026-10-30 instead of the vault and the clock. */
export default class DemoTaskCalendarPlugin extends TaskCalendarPlugin {
	protected override createDeps(): ViewDeps {
		const clock = new FixedClock(DEMO_NOW);
		return { tasks: new DemoTaskService(clock), calendars: new DemoCalendarService(), settings: this, clock };
	}
}
