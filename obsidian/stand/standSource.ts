import { CorePort } from "../adapters/CorePort";
import { memoryCore, type MemoryTasksFile } from "../memoryCore";
import type { ScreenPort } from "../ui/engine/port";
import { dateOf, dayOf, fileText, LIST_NAMES, type ListKey, MOCK_PROJECTS, type MockFile, mockFile } from "./mockData";
import { MockPort, type WriteDelay } from "./MockPort";
import { standEvents } from "./standEvents";

/** Which port the stand runs the screen on: its made-up rules (`MockPort`), or the core's over its tasks file in memory. */
export type StandPortKind = "mock" | "core";

/**
 * The stand's tasks behind the screen (the plan's step 5, the stand's switch): the port the screen draws from, and the
 * stand's own reach the checks use, the same whichever port it is: the file's text, new made-up tasks, the write delay, an
 * edit from outside.
 */
export interface StandSource {
	readonly kind: StandPortKind;
	readonly port: ScreenPort;
	fileText(): string;
	/** New made-up tasks around now; `file` puts a given set instead. */
	reset(file?: MockFile): void;
	setDelay(delay: WriteDelay): void;
	/** A task added at the top of `list` from outside the screen, as a hand edit or Sync brings it. */
	addFromOutside(list: ListKey, title: string): void;
	/** A task moved from outside: the one titled `title` before the one titled `before` (null: its list's first section's end). */
	moveFromOutside(title: string, list: ListKey, before: string | null): void;
	/** Lets go of what the port holds: the stand switched ports, or unloads. */
	dispose(): void;
}

export function mockSource(port: MockPort = new MockPort()): StandSource {
	return {
		kind: "mock",
		port,
		fileText: () => port.fileText(),
		reset: (file) => port.reset(file),
		setDelay: (delay) => (port.delay = delay),
		addFromOutside: (list, title) => port.addFromOutside(list, title),
		moveFromOutside: (title, list, before) => port.moveFromOutside(title, list, before),
		dispose: () => undefined,
	};
}

/** The made-up file as the core reads it: its lists, then the made-up projects' tree (`## Projects`, a folder marked 🗃️). */
function coreText(file: MockFile, now: Date): string {
	const tree = MOCK_PROJECTS.map((p) => `${"\t".repeat(p.depth)}- ${p.name}${p.folder ? " 🗃️" : ""}`);
	return `${fileText(file, now)}\n## Projects\n\n${tree.join("\n")}\n`;
}

/** The core over the stand's made-up file as a tasks file in memory, its calendar the stand's events; the screen on `CorePort`. */
export async function coreSource(onError: (error: unknown) => void, clock: () => Date = () => new Date()): Promise<StandSource> {
	const now = clock();
	const { core, file, events } = memoryCore(coreText(mockFile(now), now), { now: clock }, {}, standEvents(mockFile(now), now));
	const port = await CorePort.open({ ...core, clock: { now: clock }, onError });
	return {
		kind: "core",
		port,
		fileText: () => file.text ?? "",
		reset: (given) => {
			const made = given ?? mockFile(clock());
			events.replace(standEvents(made, clock()));
			file.replace(coreText(made, clock()));
		},
		setDelay: (delay) => (file.delay = delay),
		addFromOutside: (list, title) => file.replace(withLine(file, list, `- [ ] ${title}${list === "now" ? ` 📅 ${dateOf(dayOf(clock()))}` : ""}`)),
		moveFromOutside: (title, list, before) => file.replace(movedLine(file, title, list, before)),
		dispose: () => port.dispose(),
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
