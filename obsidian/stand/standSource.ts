import { CorePort } from "../adapters/CorePort";
import { DeviceSettings, type DeviceViewKeys } from "../adapters/DeviceSettings";
import type { ScreenHostOptions } from "../host/ScreenHost";
import { memoryCore, type MemoryTasksFile } from "../memoryCore";
import { dateOf, dayOf, fileText, LIST_NAMES, type ListKey, type MockFile, mockFile } from "./mockData";
import { standEvents } from "./standEvents";

/** The delays a write may take before it lands, as a real write and its read-back do: the stand's switch. */
export const WRITE_DELAYS = [0, 30, 300] as const;
export type WriteDelay = (typeof WRITE_DELAYS)[number];

/**
 * The stand's tasks behind the screen (Decision 143): the core over the made-up tasks file in memory, the screen on
 * `CorePort`; and the stand's own reach the checks use: the file's text, new made-up tasks, the write delay, an edit
 * from outside.
 */
export interface StandSource {
	readonly port: CorePort;
	readonly device: DeviceSettings;
	/** The settings as the screen paints them. */
	readonly paint: ScreenHostOptions["paint"];
	fileText(): string;
	/** What the screen opened elsewhere, in order: «line N» of the tasks file, «event <title>» in Calendar (the stand opens nothing). */
	opened(): readonly string[];
	/** New made-up tasks around now; `file` puts a given set instead. */
	reset(file?: MockFile): void;
	setDelay(delay: WriteDelay): void;
	/** A task added at the top of `list` from outside the screen, as a hand edit or Sync brings it. */
	addFromOutside(list: ListKey, title: string): void;
	/** A task moved from outside: the one titled `title` before the one titled `before` (null: its list's first section's end). */
	moveFromOutside(title: string, list: ListKey, before: string | null): void;
}

/** The made-up file as the core reads it: its lists, then the made-up projects' tree (`## Projects`, a folder marked 🗃️). */
function coreText(file: MockFile, now: Date): string {
	const tree = file.projects.map((p) => `${"\t".repeat(p.depth)}- ${p.name}${p.folder ? " 🗃️" : ""}`);
	return `${fileText(file, now)}\n## Projects\n\n${tree.join("\n")}\n`;
}

/**
 * The core over the stand's made-up file (`given`, or the whole made-up file around now) as a tasks file in memory, its
 * calendar the stand's events; the screen on `CorePort`, the device's keys in `device`.
 */
export async function standSource(device: DeviceViewKeys, onError: (error: unknown) => void, clock: () => Date = () => new Date(), given?: MockFile): Promise<StandSource> {
	const now = clock();
	const first = given ?? mockFile(now);
	const made = memoryCore(coreText(first, now), { now: clock }, {}, standEvents(first, now));
	const { core, file, events } = made;
	const opened: string[] = [];
	const opens = { line: (line: number) => void opened.push(`line ${line}`), event: (event: { readonly title: string }) => void opened.push(`event ${event.title}`) };
	const port = await CorePort.open({ ...core, clock: { now: clock }, onError, tasksFile: () => made.settings.get().tasksFile, opens });
	return {
		opened: () => opened,
		port,
		device: new DeviceSettings(device, core.tasks, () => made.settings.get().zoomLevels),
		paint: made.screenSettings,
		fileText: () => file.text ?? "",
		reset: (given) => {
			const fresh = given ?? mockFile(clock());
			events.replace(standEvents(fresh, clock()));
			file.replace(coreText(fresh, clock()));
		},
		setDelay: (delay) => (file.delay = delay),
		addFromOutside: (list, title) => file.replace(withLine(file, list, `- [ ] ${title}${list === "now" ? ` 📅 ${dateOf(dayOf(clock()))}` : ""}`)),
		moveFromOutside: (title, list, before) => file.replace(movedLine(file, title, list, before)),
	};
}
const isTaskOf = (line: string, title: string) => new RegExp(`^\\s*- \\[.\\] (?:p\\d )?${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(line);

/** The line of the list's heading, and where the list's first section ends (its first `###` or the next list). */
function listBounds(lines: readonly string[], list: ListKey): { readonly head: number; readonly firstEnd: number } {
	const head = lines.indexOf(`## ${LIST_NAMES[list]}`);
	if (head < 0) throw new Error(`no ## ${LIST_NAMES[list]}`);
	let end = head + 1;
	while (end < lines.length && !lines[end].startsWith("## ") && !lines[end].startsWith("### ")) end++;
	while (end > head + 1 && lines[end - 1].trim() === "") end--;
	return { head, firstEnd: end };
}

function withLine(file: MemoryTasksFile, list: ListKey, line: string): string {
	const lines = (file.text ?? "").split("\n");
	let at = listBounds(lines, list).head + 1;
	while (at < lines.length && lines[at].trim() === "") at++;
	lines.splice(at, 0, line);
	return lines.join("\n");
}

function movedLine(file: MemoryTasksFile, title: string, list: ListKey, before: string | null): string {
	const lines = (file.text ?? "").split("\n");
	const from = lines.findIndex((line) => isTaskOf(line, title));
	if (from < 0) throw new Error(`no task «${title}»`);
	const depth = /^\t*/.exec(lines[from])![0].length;
	let to = from + 1;
	while (to < lines.length && /^\t*/.exec(lines[to])![0].length > depth && lines[to].trim() !== "") to++;
	const moved = lines.splice(from, to - from).map((line) => line.slice(depth));
	const at = before === null ? listBounds(lines, list).firstEnd : lines.findIndex((line) => isTaskOf(line, before));
	if (at < 0) throw new Error(`no task «${before}»`);
	const indent = before === null ? "" : /^\t*/.exec(lines[at])![0];
	lines.splice(at, 0, ...moved.map((line) => indent + line));
	return lines.join("\n");
}
