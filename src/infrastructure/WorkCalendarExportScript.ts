import loader from "../../scriptable/Export Work Calendar.js?raw";
import exportBody from "../../scriptable/work-calendar-export.js?raw";
import type { SettingsStore } from "../application/ports";
import type { WorkCalendarAdapter } from "./WorkCalendarFileSource";

export interface ExportScriptAdapter extends WorkCalendarAdapter {
	write(path: string, data: string): Promise<void>;
}

const FILE = "work-calendar-export.js";
const LOADER_PATH = `.obsidian/plugins/task-calendar/${FILE}`;

/**
 * The work calendar export, kept in the plugin's folder for the script pasted into Scriptable to run. It comes with the plugin
 * and follows the work file path in the settings, so the Scriptable side is pasted once and never replaced.
 */
export class WorkCalendarExportScript {
	private writing: Promise<void> = Promise.resolve();

	constructor(
		private readonly adapter: ExportScriptAdapter,
		private readonly pluginDir: string,
		private readonly settings: SettingsStore,
	) {}

	/** What to paste into Scriptable. */
	get loader(): string {
		return loader.replace(LOADER_PATH, this.path);
	}

	/** Writes the export now and again whenever the settings change. Returns the unsubscribe. */
	keepInstalled(): () => void {
		void this.install();
		return this.settings.onChange(() => void this.install());
	}

	/** One write at a time, so the last settings win. Writes only when the file differs: Sync is not woken for nothing. */
	install(): Promise<void> {
		this.writing = this.writing.then(() => this.write()).catch((e: unknown) => console.error("Task Calendar: work calendar export", e));
		return this.writing;
	}

	private async write(): Promise<void> {
		const text = `const OUTPUT = ${JSON.stringify(this.settings.get().workCalendarFile)};\n\n${exportBody}`;
		if ((await this.adapter.exists(this.path)) && (await this.adapter.read(this.path)) === text) return;
		await this.adapter.write(this.path, text);
	}

	private get path(): string {
		return `${this.pluginDir}/${FILE}`;
	}
}
