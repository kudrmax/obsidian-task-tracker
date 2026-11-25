import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarService, EventsReason } from "../../core/application/contracts";
import { CorePort } from "../../obsidian/adapters/CorePort";
import { failureText } from "../../obsidian/host/failureText";
import { memoryCore } from "../../obsidian/memoryCore";
import { fileText, twoColumnsFile } from "../../obsidian/stand/mockData";
import { standEvents } from "../../obsidian/stand/standEvents";
import type { Destination, ScreenData } from "../../obsidian/ui/engine/port";

const NOW = new Date(2026, 10, 21, 14, 20);
const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

/** `CorePort` over the stand's two columns in memory, every notice the host would show kept in `notices`. */
async function screen(calendars?: (core: CalendarService) => CalendarService) {
	const file = twoColumnsFile();
	const made = memoryCore(`${fileText(file, NOW)}\n## Projects\n`, { now: () => NOW }, {}, standEvents(file, NOW));
	const notices: string[] = [];
	const port = await CorePort.open({ ...made.core, calendars: calendars ? calendars(made.core.calendars) : made.core.calendars, clock: made.clock, tasksFile: () => made.settings.get().tasksFile, onError: (error) => void notices.push(failureText(error)) });
	return { made, port, notices };
}

const inbox = (data: ScreenData) => data.lists.inbox.rows.flatMap((row) => (row.kind === "task" ? [data.cards[row.id].title] : []));
const idOf = (data: ScreenData, title: string) => Object.values(data.cards).find((card) => card.title === title)!.id;
const lineOf = (text: string, title: string) => text.split("\n").findIndex((line) => line.includes(`] ${title}`));

describe("the tasks file changed from outside (F7, F271; Decision 171)", () => {
	it("a task carried while its line went from outside (deleted, or moved away by Sync) is let go with the core's refusal: the screen stays still till then, nothing is written, the notice says so", async () => {
		const { made, port, notices } = await screen();
		const drawn = port.read(0);
		const [held, second, third] = inbox(drawn);
		const id = idOf(drawn, held);
		const lines = made.file.text!.split("\n");
		lines.splice(lineOf(made.file.text!, held), 1);
		const edited = lines.join("\n");
		made.file.replace(edited);
		await settled();
		const to: Destination = { list: "inbox", before: idOf(drawn, third), dayOffset: 0 };
		expect(port.takes(id, to)).toBe(true);
		expect(inbox(port.preview(id, to))).toEqual(inbox(drawn));
		expect(port.changes(id, to)).toBe(true);
		await port.move(id, to);
		expect(notices).toEqual(["The task changed in the file; the view was refreshed"]);
		expect(made.file.text).toBe(edited);
		expect(inbox(port.read(0))[0]).toBe(second);
	});

	it("a task carried while its own line was edited in place is the same task: dropped where it was let go, the edit kept", async () => {
		const { made, port, notices } = await screen();
		const drawn = port.read(0);
		const [held, second, third] = inbox(drawn);
		made.file.replace(made.file.text!.replace(`] ${held}`, `] ${held} из Sync`));
		await settled();
		await port.move(idOf(drawn, held), { list: "inbox", before: idOf(drawn, third), dayOffset: 0 });
		expect(notices).toEqual([]);
		expect(inbox(port.read(0)).slice(0, 3)).toEqual([second, `${held} из Sync`, third]);
	});

	it("a task carried while another line changed is dropped where it was let go, and the change is kept", async () => {
		const { made, port, notices } = await screen();
		const drawn = port.read(0);
		const [held, second, third] = inbox(drawn);
		made.file.replace(made.file.text!.replace(`] ${third}`, `] ${third} из Sync`));
		await settled();
		await port.move(idOf(drawn, held), { list: "inbox", before: idOf(port.read(0), `${third} из Sync`), dayOffset: 0 });
		expect(notices).toEqual([]);
		expect(inbox(port.read(0)).slice(0, 3)).toEqual([second, held, `${third} из Sync`]);
	});

	it("a menu's pick on a task changed from outside since the menu opened is refused with the same notice", async () => {
		const { made, port, notices } = await screen();
		const drawn = port.read(0);
		const [first] = inbox(drawn);
		const lines = made.file.text!.split("\n");
		lines.splice(lineOf(made.file.text!, first), 1);
		made.file.replace(lines.join("\n"));
		await settled();
		expect(await port.act(idOf(drawn, first), { kind: "status", id: "done" }, "list", 0)).toBeNull();
		expect(notices).toEqual(["The task changed in the file; the view was refreshed"]);
	});

	it("a write whose file is gone says where it was looked for", async () => {
		const { made, port, notices } = await screen();
		const drawn = port.read(0);
		made.file.text = null;
		await port.act(idOf(drawn, inbox(drawn)[0]), { kind: "status", id: "done" }, "list", 0);
		expect(notices).toEqual(["Tasks file not found: memory"]);
	});
});

describe("the calendars kept fresh while a screen shows (F109; Decision 170)", () => {
	afterEach(() => void vi.useRealTimers());

	it("fetches both sources afresh every refresh interval, not while hidden, and once when the screen comes back", async () => {
		const asked: EventsReason[] = [];
		const { port } = await screen((core) => new Proxy(core, { get: (target, name) => (name === "events" ? (date: Parameters<CalendarService["events"]>[0], reason: EventsReason) => (asked.push(reason), target.events(date, reason)) : Reflect.get(target, name, target)) }));
		port.read(0);
		vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
		let hidden = false;
		const poll = port.keepEventsFresh(() => hidden);
		const refreshes = () => asked.filter((reason) => reason === "refresh").length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(refreshes()).toBe(1);
		hidden = true;
		await vi.advanceTimersByTimeAsync(120_000);
		expect(refreshes()).toBe(1);
		hidden = false;
		poll.catchUp();
		await vi.advanceTimersByTimeAsync(0);
		expect(refreshes()).toBe(2);
		poll.stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(refreshes()).toBe(2);
	});
});

