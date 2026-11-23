import { type App, MarkdownView, Platform } from "obsidian";
import type { CalendarEvent } from "../../core/application/contracts";
import { AppleCalendar } from "./AppleCalendar";
import { openOutside } from "./OutsideLink";

/** The Mac runs it through osascript; Node's modules exist only in the desktop app, so they are reached for only here. */
function runAppleScript(script: string, args: readonly string[]): void {
	if (!Platform.isMacOS || !Platform.isDesktopApp) return;
	const { execFile } = (window as unknown as { require: (id: string) => typeof import("child_process") }).require("child_process");
	execFile("osascript", ["-e", script, ...args], () => undefined);
}

/**
 * What leaves the screen for another tab or app (F126, the event menu's one row): the tasks file in a new tab with the
 * cursor at the start of a task's line and the line in the middle; Apple's Calendar at an event.
 */
export class TaskOpens {
	private readonly calendar: AppleCalendar;

	constructor(
		private readonly app: App,
		private readonly tasksFile: () => string,
	) {
		this.calendar = new AppleCalendar({ isPhone: Platform.isIosApp, open: (url) => openOutside(url, { isPhone: Platform.isIosApp, window }), runScript: runAppleScript });
	}

	async line(line: number): Promise<void> {
		const file = this.app.vault.getFileByPath(this.tasksFile());
		if (!file) return;
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file, { active: true, state: { mode: "source" }, eState: { line } });
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const at = { line, ch: 0 };
		view.editor.setCursor(at);
		view.editor.scrollIntoView({ from: at, to: at }, true);
		view.editor.focus();
	}

	event(event: CalendarEvent): void {
		this.calendar.open(event);
	}
}
