import type { Stop } from "../ui/engine/store";
import { calendarFile, longListsFile, type MockFile, oneColumnFile, sectionsFile, subtasksFile, twoColumnsFile } from "./mockData";

/**
 * A step of the stand (spec, «Steps on the stand»): the whole screen over a file of made-up tasks made for what the step
 * shows, the ribbon standing where that is in sight. The screen is the one ribbon on every step; a step is only data.
 */
export interface StandStep {
	readonly id: string;
	readonly name: string;
	readonly stop: Stop;
	/** The step's tasks; none: the whole made-up file. */
	readonly file?: () => MockFile;
}

/** The whole screen over the whole made-up file, the ribbon at the day and its calendar, as the screen opens. */
export const WHOLE_SCREEN: StandStep = { id: "whole-screen", name: "The whole screen", stop: "calendar" };

export const STAND_STEPS: readonly StandStep[] = [
	{ id: "step-one-column", name: "Step 1: Inbox and drag", stop: "inbox", file: oneColumnFile },
	{ id: "step-two-columns", name: "Step 2: two columns and drag between them", stop: "inbox", file: twoColumnsFile },
	{ id: "step-subtasks", name: "Step 3: subtasks", stop: "inbox", file: subtasksFile },
	{ id: "step-sections", name: "Step 4: sections", stop: "inbox", file: sectionsFile },
	{ id: "step-long-lists", name: "Step 5: long lists", stop: "inbox", file: longListsFile },
	{ id: "step-calendar", name: "Step 6: onto and off the calendar", stop: "calendar", file: () => calendarFile(new Date()) },
	{ id: "step-menu", name: "Step 8: the task menu", stop: "calendar", file: () => calendarFile(new Date()) },
	WHOLE_SCREEN,
];
