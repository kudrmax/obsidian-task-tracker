import { describe, expect, it } from "vitest";
import type { ScreenView } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const NOW = new Date(2026, 10, 11, 12, 0);
const clock: Clock = { now: () => NOW };
const T = "2026-11-11";

const FILE = [
	"## Inbox",
	"",
	"- [ ] Plain",
	"- [ ] Hand 🗂️ Работа",
	"",
	"## Projects",
	"",
	"- Работа 🗃️",
	"\t- Отчёты",
	"",
	"## Now",
	"",
	"## Soon",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");

const context = (tasks = FILE): DoorContext => ({ tasks, settings: "{}", nowMs: NOW.getTime() });
const ok = (answer: DoorAnswer) => {
	if (!answer.ok) throw new Error(answer.error.message);
	return answer.result;
};

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, memoryProjectsScreen()) };
}

type Step = { session: unknown; state: { project: { lit: boolean; page: { current: { name: string } | null } } | null } | null; jobs: { id: string }[]; value: unknown };

/** The quick entry through the door, as both frontends drive it. */
function entry(text = FILE) {
	const view = ok(callDoor("tasks.screen", [T], context(text))) as ScreenView;
	const look = { cards: { inbox: view.inbox.map((i) => ({ key: i.key, level: 0, group: i.group })) }, day: T, shown: ["inbox"] };
	let session: unknown = null;
	const step = (method: string, ...args: unknown[]): Step => {
		const result = ok(callDoor(`entry.${method}`, [session, look, ...args], context(text))) as Step;
		session = result.session;
		return result;
	};
	return { view, step };
}

/** Max, 2026-11-11: a folder takes no task, from the quick entry's New project… too. */
describe("a folder in the quick entry and the New Task sheet", () => {
	it("New project… with a folder's name answers nothing to pick, and writes nothing", async () => {
		const { svc, store } = setup();
		await svc.screen(T);
		expect(await svc.newProject("работа", [])).toBeNull();
		expect(await svc.newProject("Работа 🗃️", [])).toBeNull();
		expect(store.text).toBe(FILE);
		expect(ok(callDoor("tasks.newProject", ["Работа", []], context()))).toBeNull();
		expect(await svc.newProject("Отчёты", [])).toMatchObject({ name: "Отчёты", folder: false });
	});

	it("a new task's field never takes a folder; its subproject it does", () => {
		const { step } = entry();
		step("openAtEnd", "inbox");
		expect(step("setProject", "Работа").state!.project!.lit).toBe(false);
		expect(step("setProject", "Отчёты").state!.project!.page.current!.name).toBe("Отчёты");
		expect(step("setProject", "Работа").state!.project!.page.current!.name).toBe("Отчёты");
	});

	it("a rename's field never takes a folder, but keeps one its task has by hand", () => {
		const plain = entry();
		const task = plain.view.inbox.find((i) => i.title === "Plain")!;
		plain.step("open", plain.step("renameSpot", task, false).value, task);
		expect(plain.step("setProject", "Работа").state!.project!.lit).toBe(false);
		const hand = entry();
		const carrying = hand.view.inbox.find((i) => i.title === "Hand")!;
		hand.step("open", hand.step("renameSpot", carrying, false).value, carrying);
		expect(hand.step("state").state!.project!.page.current!.name).toBe("Работа");
		expect(hand.step("setProject", "Работа").state!.project!.page.current!.name).toBe("Работа");
	});

	it("the New Task sheet's Project row shows a folder as no project", () => {
		expect(ok(callDoor("capture.project", ["Работа"], context()))).toMatchObject({ lit: false, page: { current: null, none: true } });
		expect(ok(callDoor("capture.project", ["Отчёты"], context()))).toMatchObject({ lit: true });
	});

	it("edit and create drop a folder the task doesn't have; a task given one by hand keeps it", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const plain = screen.inbox.find((i) => i.title === "Plain")!;
		const hand = screen.inbox.find((i) => i.title === "Hand")!;
		await svc.edit(plain.key, { text: "Plain", placement: { kind: "inbox" }, priority: null, project: "Работа" });
		await svc.edit(hand.key, { text: "Hand 2", placement: { kind: "inbox" }, priority: null, projects: ["Работа", "Отчёты"] });
		await svc.create({ text: "New", placement: { kind: "inbox" }, priority: null, projects: ["Работа", "Отчёты"] });
		await svc.create({ text: "Newer", placement: { kind: "inbox" }, priority: null, project: "Работа" });
		expect(store.text).toContain("## Inbox\n\n- [ ] Plain\n- [ ] Hand 2 🗂️ Работа 🗂️ Отчёты\n- [ ] New 🗂️ Отчёты\n- [ ] Newer\n");
	});
});
