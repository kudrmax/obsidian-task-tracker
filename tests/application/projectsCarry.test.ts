import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer } from "../../core/application/PhoneCalls";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { PROJECTS_HOVER_MS } from "../../core/application/projectsScreen";
import { funnelPlaceOf } from "../../core/application/screenPlaces";
import { endsSelection } from "../../core/application/contracts";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-12";
const clock: Clock = { now: () => new Date(2026, 10, 12, 12, 0) };
const FILE = [
	"## Inbox",
	"",
	"- [ ] Anki 🗂️ Саморазвитие",
	"- [ ] Без проекта",
	"",
	"## Projects",
	"",
	"- Саморазвитие",
	"\t- Языки",
	"- Дружба",
	"",
	"## Now",
	"",
	"## Soon",
	"",
	"- [ ] Позвонить 🗂️ Дружба",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");
const SELF = "project:Саморазвитие";
const PAUSE = PROJECTS_HOVER_MS;

function setup() {
	const store = new InMemoryTaskFileStore(FILE);
	const state = memoryProjectsScreen();
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, state);
	const item = async (title: string) => {
		const s = await svc.screen(T);
		return [...s.inbox, ...s.soon].find((i) => i.title === title)!;
	};
	return { store, state, svc, item };
}

describe("a carry to a project, the core's from lift to let go", () => {
	it("a card held at the phone's edge brings the panel out after the pause; it goes when the carry ends", async () => {
		const { svc, item } = setup();
		await svc.startCarry({ keys: [(await item("Anki")).key] }, false);
		expect(await svc.carryAt({ edge: true, node: null }, 1000)).toEqual({ wait: PAUSE });
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: false, reason: null });
		expect(await svc.carryAt({ edge: true, node: null }, 1000 + PAUSE / 2)).toEqual({ wait: PAUSE / 2 });
		expect(await svc.carryAt({ edge: true, node: null }, 1000 + PAUSE)).toEqual({ wait: null });
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: true, reason: "carry" });
		await svc.endCarry("nowhere");
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: false, reason: null });
	});

	it("leaving the edge before the pause starts it again; a wide screen's edge brings nothing", async () => {
		const { svc, item } = setup();
		await svc.startCarry({ keys: [(await item("Anki")).key] }, false);
		await svc.carryAt({ edge: true, node: null }, 0);
		await svc.carryAt({ edge: false, node: null }, PAUSE / 2);
		expect(await svc.carryAt({ edge: true, node: null }, PAUSE)).toEqual({ wait: PAUSE });
		await svc.startCarry({ keys: [(await item("Anki")).key] }, true);
		expect(await svc.carryAt({ edge: true, node: null }, 0)).toEqual({ wait: null });
		expect(await svc.carryAt({ edge: true, node: null }, PAUSE * 2)).toEqual({ wait: null });
		expect((await svc.funnelView(true)).panel!.open).toBe(false);
	});

	it("a card held over a row opens it after the pause; let go there it moves every carried task, the lift's filter kept as shown", async () => {
		const { svc, store, item } = setup();
		await svc.pickProjectNode("project:Дружба", true);
		await svc.setProjectsPanel(true);
		const call = await item("Позвонить");
		await svc.startCarry({ keys: [call.key, (await item("Без проекта")).key] }, true);
		expect(await svc.carryAt({ edge: false, node: SELF }, 0)).toEqual({ wait: PAUSE });
		expect(await svc.carryAt({ edge: false, node: SELF }, PAUSE)).toEqual({ wait: null });
		expect((await svc.funnelView(true)).filter?.node).toBe(SELF);
		await svc.carryOnNode(SELF);
		expect(store.text).toContain("- [ ] Позвонить 🗂️ Саморазвитие\n");
		expect(store.text).toContain("- [ ] Без проекта 🗂️ Саморазвитие\n");
		expect((await svc.funnelView(true)).filter?.node).toBe(SELF);
	});

	it("let go on the project the card opened, its own: the line stays", async () => {
		const { svc, store, item } = setup();
		await svc.setProjectsPanel(true);
		await svc.startCarry({ keys: [(await item("Anki")).key] }, true);
		await svc.carryAt({ edge: false, node: SELF }, 0);
		await svc.carryAt({ edge: false, node: SELF }, PAUSE);
		await svc.carryOnNode(SELF);
		expect(store.text).toBe(FILE);
	});

	it("let go nowhere puts back the filter it was lifted under, none included", async () => {
		const { svc, item } = setup();
		await svc.setProjectsPanel(true);
		await svc.startCarry({ keys: [(await item("Anki")).key] }, true);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, 0);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, PAUSE);
		expect((await svc.funnelView(true)).filter?.node).toBe("project:Дружба");
		await svc.endCarry("nowhere");
		expect((await svc.funnelView(true)).filter).toBeNull();
		await svc.pickProjectNode(SELF, true);
		await svc.startCarry({ keys: [(await item("Anki")).key] }, true);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, 0);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, PAUSE);
		await svc.endCarry("nowhere");
		expect((await svc.funnelView(true)).filter?.node).toBe(SELF);
	});

	it("let go in a list keeps the filter the card opened", async () => {
		const { svc, item } = setup();
		await svc.setProjectsPanel(true);
		await svc.startCarry({ keys: [(await item("Без проекта")).key] }, true);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, 0);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, PAUSE);
		await svc.endCarry("dropped");
		expect((await svc.funnelView(true)).filter?.node).toBe("project:Дружба");
	});

	it("a by project card goes by its own drop", async () => {
		const { svc, store } = setup();
		const card = (await svc.projectsScreen(SELF)).sections[0].cards[0];
		await svc.startCarry({ keys: [card.item.key], cards: [card.drop] }, true);
		await svc.carryOnNode("project:Дружба");
		expect(store.text).toContain("- [ ] Anki 🗂️ Дружба\n");
	});

	it("the plus at the edge: the panel comes out, stays while the new project's name is typed, goes when it is", async () => {
		const { svc } = setup();
		await svc.startCarry({ keys: [], plus: true }, false);
		await svc.carryAt({ edge: true, node: null }, 0);
		await svc.carryAt({ edge: true, node: null }, PAUSE);
		expect(await svc.carryAt({ edge: false, node: SELF }, PAUSE)).toEqual({ wait: null });
		await svc.endCarry("naming");
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: true, reason: "naming" });
		await svc.createProject("Новый", { parent: null, before: null });
		await svc.endProjectName();
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: false, reason: null });
	});

	it("the plus held over a folded row unfolds it, never opens a project", async () => {
		const { svc } = setup();
		await svc.setProjectsPanel(true);
		await svc.tapProjectNode(SELF);
		await svc.tapProjectNode(SELF);
		await svc.clearProjectFilter();
		await svc.startCarry({ keys: [], plus: true }, true);
		await svc.carryAt({ edge: false, node: SELF }, 0);
		await svc.carryAt({ edge: false, node: SELF }, PAUSE);
		const view = await svc.funnelView(true);
		expect(view.filter).toBeNull();
		expect(view.panel!.rows.map((r) => r.title)).toContain("Языки");
	});

	it("the button opens the panel for itself; with it open a carry's end leaves it", async () => {
		const { svc, item } = setup();
		await svc.setProjectsPanel(true);
		expect((await svc.funnelView(false)).panel).toMatchObject({ open: true, reason: "button" });
		await svc.startCarry({ keys: [(await item("Anki")).key] }, false);
		await svc.endCarry("nowhere");
		expect((await svc.funnelView(false)).panel!.open).toBe(true);
	});

	it("over the door: the session is the device's state the app hands back", () => {
		type Ok = Extract<DoorAnswer, { ok: true }>;
		const nowMs = new Date(2026, 10, 12, 12).getTime();
		const screen = (callDoor("tasks.screen", [T], { tasks: FILE, nowMs }) as Ok).result as { inbox: { key: unknown; title: string }[] };
		const key = screen.inbox[0].key;
		let state = (callDoor("tasks.startCarry", [{ keys: [key] }, false], { tasks: FILE, nowMs }) as Ok).projectsScreen;
		state = (callDoor("tasks.carryAt", [{ edge: true, node: null }, 0], { tasks: FILE, nowMs, projectsScreen: state }) as Ok).projectsScreen ?? state;
		const at = callDoor("tasks.carryAt", [{ edge: true, node: null }, PAUSE], { tasks: FILE, nowMs, projectsScreen: state }) as Ok;
		expect(at.result).toEqual({ wait: null });
		const view = callDoor("tasks.funnelView", [false], { tasks: FILE, nowMs, projectsScreen: at.projectsScreen }) as Ok;
		expect(view.result).toMatchObject({ panel: { open: true, reason: "carry" } });
	});
});

describe("a carry never outlives its gesture", () => {
	const killed = async () => {
		const { svc, state, item } = setup();
		await svc.startCarry({ keys: [(await item("Anki")).key] }, false);
		await svc.carryAt({ edge: true, node: null }, 0);
		await svc.carryAt({ edge: true, node: null }, PAUSE);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, PAUSE);
		await svc.carryAt({ edge: false, node: "project:Дружба" }, PAUSE * 2);
		expect((await svc.funnelView(false)).filter?.node).toBe("project:Дружба");
		return state.get();
	};
	const relaunched = (saved: ReturnType<ReturnType<typeof memoryProjectsScreen>["get"]>) => {
		const store = new InMemoryTaskFileStore(FILE);
		const state = memoryProjectsScreen(saved);
		return new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, state);
	};

	it("a service made over a state with a carry left in it drops it: no panel, the lift's filter back", async () => {
		const svc = relaunched(await killed());
		const view = await svc.funnelView(false);
		expect(view.panel).toMatchObject({ open: false, reason: null });
		expect(view.filter).toBeNull();
	});

	it("the door drops it at the app's first asks, firstPlace and firstView", async () => {
		type Ok = Extract<DoorAnswer, { ok: true }>;
		const saved = { ...(await killed()), naming: true };
		for (const [method, args] of [["tasks.firstPlace", []], ["tasks.firstView", [false, false]]] as const) {
			const answer = callDoor(method, [...args], { tasks: FILE, nowMs: 0, projectsScreen: saved }) as Ok;
			expect(answer.projectsScreen).toBeDefined();
			expect(answer.projectsScreen!.carry).toBeUndefined();
			expect(answer.projectsScreen!.naming).toBeUndefined();
			expect(answer.projectsScreen!.selected).toBeUndefined();
		}
	});
});

describe("the place the device kept", () => {
	it("is a funnel place: the old Projects place is Inbox, the app's old numbers read too, nothing kept is Today", async () => {
		expect(funnelPlaceOf("soon")).toBe("soon");
		expect(funnelPlaceOf("projects")).toBe("inbox");
		expect(funnelPlaceOf(-1)).toBe("inbox");
		expect(funnelPlaceOf(0)).toBe("inbox");
		expect(funnelPlaceOf(1)).toBe("soon");
		expect(funnelPlaceOf(2)).toBe("calendar");
		expect(funnelPlaceOf(undefined)).toBe("calendar");
		expect(funnelPlaceOf("nonsense")).toBe("calendar");
		const { svc } = setup();
		expect((await svc.funnelView(true)).place).toBe("calendar");
		await svc.setFunnelPlace("projects");
		expect((await svc.funnelView(true)).place).toBe("inbox");
		await svc.setFunnelPlace("soon");
		expect((await svc.funnelView(true)).place).toBe("soon");
		expect(svc.firstPlace()).toBe("soon");
	});
});

describe("what the view says besides its mode", () => {
	it("is the ribbon in two columns alone, never in a note; a search shows paths under a filter", async () => {
		const { svc } = setup();
		expect(await svc.funnelView(true)).toMatchObject({ view: { ribbon: true }, searchPaths: false });
		await svc.setViewMode("allColumns");
		expect((await svc.funnelView(true)).view.ribbon).toBe(false);
		await svc.pickProjectNode(SELF, true);
		expect((await svc.funnelView(true)).searchPaths).toBe(true);
		await svc.setNoteViewMode("rows");
		expect((await svc.funnelView(true)).view.ribbon).toBe(false);
		expect(svc.firstView(true, true).ribbon).toBe(false);
	});
});

describe("what the frontends no longer decide", () => {
	it("a carry that lands ends Select Tasks; one let go nowhere or into a new project's name keeps it", () => {
		expect(endsSelection("dropped")).toBe(true);
		expect(endsSelection("nowhere")).toBe(false);
		expect(endsSelection("naming")).toBe(false);
	});

	it("the plus: in by project a tap types in place and the node's list takes it while the panel is closed; elsewhere a tap opens a new task", async () => {
		const { svc } = setup();
		expect((await svc.funnelView(true)).plus).toEqual({ tap: "newTask", list: "funnel", tree: false });
		await svc.setProjectsPanel(true);
		expect((await svc.funnelView(true)).plus).toEqual({ tap: "newTask", list: "funnel", tree: true });
		await svc.pickProjectNode(SELF, true);
		await svc.setViewMode("byProject");
		expect((await svc.funnelView(true)).plus).toEqual({ tap: "inPlace", list: null, tree: true });
		await svc.setProjectsPanel(false);
		expect((await svc.funnelView(true)).plus).toEqual({ tap: "inPlace", list: "projects", tree: false });
	});

	it("a tap on the panel's dim closes it only when the button opened it over the lists", async () => {
		const { svc, item } = setup();
		await svc.setProjectsPanel(true);
		expect((await svc.funnelView(false)).panel!.dimCloses).toBe(true);
		expect((await svc.funnelView(true)).panel!.dimCloses).toBe(false);
		await svc.setProjectsPanel(false);
		await svc.startCarry({ keys: [(await item("Anki")).key] }, false);
		await svc.carryAt({ edge: true, node: null }, 0);
		await svc.carryAt({ edge: true, node: null }, PAUSE);
		expect((await svc.funnelView(false)).panel).toMatchObject({ reason: "carry", dimCloses: false });
	});

	it("the read a mode draws from: the screen, by project the node's Projects list", async () => {
		const { svc } = setup();
		expect((await svc.funnelView(true)).view.source).toBe("screen");
		await svc.pickProjectNode(SELF, true);
		await svc.setViewMode("byProject");
		expect((await svc.funnelView(true)).view.source).toBe("projectsScreen");
	});

	it("the top row: always on a wide screen; on a narrow one with a filter or a mode without column titles", async () => {
		const { svc } = setup();
		expect((await svc.funnelView(true)).topRow).toBe(true);
		expect((await svc.funnelView(false)).topRow).toBe(false);
		await svc.setViewMode("rows");
		expect((await svc.funnelView(false)).topRow).toBe(true);
		await svc.setViewMode("twoColumns");
		await svc.pickProjectNode(SELF, true);
		await svc.setViewMode("twoColumns");
		expect((await svc.funnelView(false)).topRow).toBe(true);
	});
});
