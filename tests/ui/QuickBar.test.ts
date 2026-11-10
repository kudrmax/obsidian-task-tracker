// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupedList, Placement, RepeatRule } from "../../core/application/contracts";
import type { DraftMarks, LabelLevel, PriorityLevel } from "../../core/application/contracts";
import { QuickBar, type QuickBarState } from "../../obsidian/ui/quick/QuickBar";
import { placementOfDay } from "../../core/domain/Days";
import { draftMarksOf } from "../../core/application/marks";
import { dayMonth } from "../../core/application/dayLabels";
import { entryProject } from "../../core/application/QuickEntry";

const LEVELS: readonly PriorityLevel[] = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
	{ prefix: "p3", color: "blue" },
];

const LABELS = [
	{ name: "Важное", color: "red" },
	{ name: "Очень_срочное", color: "orange" },
] as const;

/** The labels the next bar set up offers: none unless a test gives some. */
let shownLabels: readonly (typeof LABELS)[number][] = [];

/** The service's answer for a field with this priority and these labels, over the levels and the labels shown. */
function marks(priority: PriorityLevel | null = null, labels: readonly LabelLevel[] = []): DraftMarks {
	return draftMarksOf({ priority: priority?.prefix ?? null, labels: labels.map((l) => l.name) }, LEVELS, shownLabels);
}

const DEFAULT_NAMES: Readonly<Record<GroupedList, string>> = { inbox: "Inbox", backlog: "Backlog", soon: "Soon", now: "Now" };
const RENAMED: Readonly<Record<GroupedList, string>> = { inbox: "Входящие", backlog: "Когда-нибудь", soon: "Скоро", now: "Сейчас" };
/** The lists' names the next bar set up is given: the default ones unless a test renames them. */
let listNames = DEFAULT_NAMES;
const listName = (list: GroupedList) => listNames[list];
const placementTitle = (placement: Placement) => (placement.kind === "date" ? dayMonth(placement.date) : listName(placement.kind));

const PLACES: readonly GroupedList[] = ["inbox", "backlog", "soon", "now"];

/** The place button's tiles as the session gives them for a field going to `place`. */
function placesFor(place: Placement | null): QuickBarState["places"] {
	return [...PLACES.map((kind) => ({ kind, on: place?.kind === kind })), { kind: "date" as const, on: place?.kind === "date", date: place?.kind === "date" ? place.date : null }];
}

const STATE: QuickBarState = { canIndent: true, canOutdent: true, indents: true, marks: marks(), markable: true, place: { kind: "soon" }, places: placesFor({ kind: "soon" }), repeat: null, repeatable: true, repeatDay: "2026-11-01", section: null, project: null };

/** The session's state for the bar: the marks over the labels shown now and the places for its place, unless given. */
function full(state: Partial<QuickBarState> = {}): QuickBarState {
	const place = state.place === undefined ? STATE.place : state.place;
	return { ...STATE, marks: marks(), places: placesFor(place), ...state };
}

const WEEKLY_THU: RepeatRule = { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null };

const TODAY = "2026-11-01";
const dayPlacement = (day: string): Placement => placementOfDay(day, TODAY);

function setup(state: Partial<QuickBarState> = {}, desktop = false, placementOf: (day: string) => Placement = dayPlacement) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const indents: (1 | -1)[] = [];
	const priorities: string[] = [];
	const places: Placement[] = [];
	const repeats: (RepeatRule | null)[] = [];
	const sections: true[] = [];
	const labelled: string[] = [];
	const projects: (string | null)[] = [];
	const named: string[] = [];
	const nameEnds: true[] = [];
	const bar = new QuickBar(parent, {
		desktop: () => desktop,
				onLabel: (name: string) => labelled.push(name),
		today: () => TODAY,
		listName,
		placementTitle,
		placementOfDay: placementOf,
		onIndent: (delta) => indents.push(delta),
		onPriority: (prefix) => priorities.push(prefix),
		onPlace: (placement) => places.push(placement),
		onRepeat: (rule) => repeats.push(rule),
		onSection: () => sections.push(true),
		onProject: (link) => projects.push(link),
		onNewProject: (name) => named.push(name),
		onNameEnd: () => nameEnds.push(true),
	});
	bar.show(full(state));
	return { parent, bar, indents, priorities, places, repeats, sections, labelled, projects, named, nameEnds };
}

const q = <T extends Element = HTMLButtonElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;
const tiles = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>(".tc-menu-tile")];

afterEach(() => {
	shownLabels = [];
	listNames = DEFAULT_NAMES;
	document.body.innerHTML = "";
});

describe("QuickBar", () => {
	it("is the last child of its parent and hidden until shown", () => {
		const parent = document.createElement("div");
		const first = document.createElement("span");
		parent.appendChild(first);
		const bar = new QuickBar(parent, { desktop: () => false, today: () => TODAY, listName, placementTitle, placementOfDay: dayPlacement, onIndent: () => {}, onPriority: () => {}, onLabel: () => {}, onPlace: () => {}, onRepeat: () => {}, onSection: () => {}, onProject: () => {}, onNewProject: () => {}, onNameEnd: () => {} });
		expect(parent.lastElementChild?.classList.contains("tc-quick-bar")).toBe(true);
		expect(q<HTMLElement>(parent, ".tc-quick-bar").hidden).toBe(true);
		bar.show(full());
		expect(q<HTMLElement>(parent, ".tc-quick-bar").hidden).toBe(false);
		bar.hide();
		expect(q<HTMLElement>(parent, ".tc-quick-bar").hidden).toBe(true);
	});

	it("greys a shift button that cannot move the field and reports a tap on one that can", () => {
		const { parent, indents, bar } = setup({ canOutdent: false });
		expect(q(parent, ".tc-bar-outdent").disabled).toBe(true);
		expect(q(parent, ".tc-bar-indent").disabled).toBe(false);
		q(parent, ".tc-bar-outdent").click();
		q(parent, ".tc-bar-indent").click();
		expect(indents).toEqual([1]);
		bar.show(full({ canIndent: false, canOutdent: true }));
		q(parent, ".tc-bar-outdent").click();
		expect(indents).toEqual([1, -1]);
	});

	it("has no shift buttons for a field that does not shift", () => {
		const { parent } = setup({ indents: false });
		expect(q<HTMLElement>(parent, ".tc-bar-shifts").hidden).toBe(true);
		expect(q(parent, ".tc-bar-outdent").hidden).toBe(true);
		expect(q(parent, ".tc-bar-indent").hidden).toBe(true);
		expect(q(parent, ".tc-bar-flag").hidden).toBe(false);
	});

	it("has no place button for a field without a place", () => {
		const { parent } = setup({ place: null });
		expect(q(parent, ".tc-bar-place").hidden).toBe(true);
		expect(q(parent, ".tc-bar-flag").hidden).toBe(false);
	});

	it("fills the flag with the level's colour once the field has a level", () => {
		const { parent, bar } = setup();
		const flag = q(parent, ".tc-bar-flag");
		expect(flag.dataset.priority).toBeUndefined();
		expect(flag.classList.contains("is-set")).toBe(false);
		bar.show(full({ marks: marks(LEVELS[1]) }));
		expect(flag.dataset.priority).toBe("orange");
		expect(flag.classList.contains("is-set")).toBe(true);
		bar.show(full());
		expect(flag.dataset.priority).toBeUndefined();
	});

	it("labels the place button Inbox, Soon, Now or the day", () => {
		const { parent, bar } = setup();
		const label = () => q(parent, ".tc-bar-place .tc-btn-label").textContent;
		expect(label()).toBe("Soon");
		bar.show(full({ place: { kind: "inbox" } }));
		expect(label()).toBe("Inbox");
		bar.show(full({ place: { kind: "now" } }));
		expect(label()).toBe("Now");
		bar.show(full({ place: { kind: "date", date: "2026-11-05" } }));
		expect(label()).toBe("5 Nov");
	});

	it("names the place by the user's section names", () => {
		listNames = RENAMED;
		const { parent, bar } = setup();
		const label = () => q(parent, ".tc-bar-place .tc-btn-label").textContent;
		expect(label()).toBe("Скоро");
		bar.show(full({ place: { kind: "inbox" } }));
		expect(label()).toBe("Входящие");
		bar.show(full({ place: { kind: "backlog" } }));
		expect(label()).toBe("Когда-нибудь");
		bar.show(full({ place: { kind: "now" } }));
		expect(label()).toBe("Сейчас");
		bar.show(full({ place: { kind: "date", date: "2026-11-05" } }));
		expect(label()).toBe("5 Nov");
	});

	it("fades the end of a place name too long for the button, and only then", () => {
		listNames = RENAMED;
		const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
			return (this.textContent?.length ?? 0) * 10;
		});
		const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(60);
		const { parent, bar } = setup({ place: { kind: "inbox" } });
		const label = () => q<HTMLElement>(parent, ".tc-bar-place .tc-btn-label");
		expect(label().classList.contains("is-long")).toBe(true);
		bar.show(full({ place: { kind: "soon" } }));
		expect(label().classList.contains("is-long")).toBe(false);
		scroll.mockRestore();
		client.mockRestore();
	});

	it("keeps the field focused: pointerdown on the bar and on a panel is cancelled", () => {
		const { parent } = setup();
		const down = () => new Event("pointerdown", { bubbles: true, cancelable: true });
		const onBar = down();
		q(parent, ".tc-bar-indent").dispatchEvent(onBar);
		expect(onBar.defaultPrevented).toBe(true);
		q(parent, ".tc-bar-flag").click();
		const onPanel = down();
		q(parent, ".tc-menu-tile").dispatchEvent(onPanel);
		expect(onPanel.defaultPrevented).toBe(true);
		const mouse = new Event("mousedown", { bubbles: true, cancelable: true });
		q(parent, ".tc-menu-tile").dispatchEvent(mouse);
		expect(mouse.defaultPrevented).toBe(true);
	});
});

describe("the priority panel", () => {
	it("is a tile group with a tile per level in rows of three, the field's level on", () => {
		const { parent } = setup({ marks: marks(LEVELS[1]) });
		q(parent, ".tc-bar-flag").click();
		const panel = q<HTMLElement>(parent, ".tc-quick-panel");
		expect(panel.querySelectorAll(".tc-menu-tile-row")).toHaveLength(1);
		expect(tiles(panel).map((t) => t.querySelector(".tc-menu-tile-label")?.textContent)).toEqual(["p1", "p2", "p3"]);
		expect(tiles(panel).map((t) => t.classList.contains("is-on"))).toEqual([false, true, false]);
		expect(tiles(panel).map((t) => t.dataset.priority)).toEqual(["red", "orange", "blue"]);
		expect(tiles(panel)[1].querySelector(".tc-menu-badge")).not.toBeNull();
	});

	it("sets a level on a tap and closes", () => {
		const { parent, priorities } = setup();
		q(parent, ".tc-bar-flag").click();
		tiles(parent)[2].click();
		expect(priorities).toEqual(["p3"]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("reports a tap on the current level too: the session takes it off", () => {
		const { parent, priorities } = setup({ marks: marks(LEVELS[0]) });
		q(parent, ".tc-bar-flag").click();
		tiles(parent)[0].click();
		expect(priorities).toEqual(["p1"]);
	});

	it("has no flag while the session says there is nothing to mark", () => {
		const parent = document.createElement("div");
		const bar = new QuickBar(parent, { desktop: () => false, today: () => TODAY, listName, placementTitle, placementOfDay: dayPlacement, onIndent: () => {}, onPriority: () => {}, onLabel: () => {}, onPlace: () => {}, onRepeat: () => {}, onSection: () => {}, onProject: () => {}, onNewProject: () => {}, onNameEnd: () => {} });
		bar.show(full({ markable: false }));
		expect(q(parent, ".tc-bar-flag").hidden).toBe(true);
	});
});

describe("the Project button", () => {
	const KNOWN = [
		{ name: "Дружба", link: "Дружба", note: "Дружба.md", canOpenNote: true, mark: true },
		{ name: "Окружение", link: "Окружение", note: "Окружение.md", canOpenNote: true, mark: true },
	];
	const rows = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>(".tc-quick-panel .tc-menu-row")];
	const labels = (root: ParentNode) => rows(root).map((row) => row.textContent);

	it("stands right after the flag, only where the session gives it (none for a subtask or a section's name)", () => {
		const { parent, bar } = setup({ project: entryProject(null, KNOWN) });
		expect(q(parent, ".tc-bar-flag").nextElementSibling).toBe(q(parent, ".tc-bar-project"));
		expect(q(parent, ".tc-bar-project").hidden).toBe(false);
		expect(q(parent, ".tc-bar-project").getAttribute("aria-label")).toBe("Project");
		bar.show(full({ project: null }));
		expect(q(parent, ".tc-bar-project").hidden).toBe(true);
	});

	it("is lit, as the flag is for a level, while a project is chosen", () => {
		const { parent, bar } = setup({ project: entryProject(null, KNOWN) });
		expect(q(parent, ".tc-bar-project").classList.contains("is-set")).toBe(false);
		bar.show(full({ project: entryProject("Дружба", KNOWN) }));
		expect(q(parent, ".tc-bar-project").classList.contains("is-set")).toBe(true);
		expect(q(parent, ".tc-bar-project").getAttribute("aria-pressed")).toBe("true");
	});

	it("opens the task menu's Project page without its way back: the projects, No project, New project…; a pick closes it", () => {
		const { parent, projects } = setup({ project: entryProject("Окружение", KNOWN) });
		q(parent, ".tc-bar-project").click();
		expect(labels(parent)).toEqual(["Дружба", "Окружение", "No project", "New project…"]);
		expect(parent.querySelector(".tc-quick-panel .tc-menu-back")).toBeNull();
		expect(rows(parent)[1].querySelector("svg")).not.toBeNull();
		rows(parent)[0].click();
		expect(projects).toEqual(["Дружба"]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
		q(parent, ".tc-bar-project").click();
		rows(parent)[2].click();
		expect(projects).toEqual(["Дружба", null]);
	});

	it("asks a new project's name in its place: Enter reports it and closes, Escape goes back to the projects", () => {
		const { parent, named, nameEnds } = setup({ project: entryProject(null, KNOWN) });
		q(parent, ".tc-bar-project").click();
		rows(parent)[3].click();
		const input = q<HTMLInputElement>(parent, ".tc-quick-panel .tc-group-input");
		expect(input.placeholder).toBe("Project name");
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(labels(parent)).toEqual(["Дружба", "Окружение", "No project", "New project…"]);
		expect(nameEnds).toHaveLength(1);
		rows(parent)[3].click();
		const again = q<HTMLInputElement>(parent, ".tc-quick-panel .tc-group-input");
		again.value = "Ремонт";
		again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(named).toEqual(["Ремонт"]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
		expect(nameEnds).toHaveLength(2);
	});
});

describe("the place panel", () => {
	it("has Inbox, Backlog, Soon, Now and Date in a row, the current place on without a cross", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-place").click();
		const all = tiles(parent);
		expect(all.map((t) => t.querySelector(".tc-menu-tile-label")?.textContent)).toEqual(["Inbox", "Backlog", "Soon", "Now", "Date"]);
		expect(all.map((t) => t.classList.contains("is-on"))).toEqual([false, false, true, false, false]);
		expect(all.map((t) => t.dataset.priority)).toEqual([undefined, undefined, undefined, undefined, undefined]);
		expect(parent.querySelector(".tc-menu-badge")).toBeNull();
		expect(parent.querySelectorAll(".tc-menu-tile-row")).toHaveLength(1);
	});

	it("names its tiles by the user's section names", () => {
		listNames = RENAMED;
		const { parent } = setup();
		q(parent, ".tc-bar-place").click();
		expect(tiles(parent).map((t) => t.querySelector(".tc-menu-tile-label")?.textContent)).toEqual(["Входящие", "Когда-нибудь", "Скоро", "Сейчас", "Date"]);
	});

	it("puts Date on for a day", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-11-05" } });
		q(parent, ".tc-bar-place").click();
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([false, false, false, false, true]);
	});

	it("reports another place and closes", () => {
		const { parent, places } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[0].click();
		expect(places).toEqual([{ kind: "inbox" }]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("reports a tap on the current place too, and closes: the session leaves the field where it is", () => {
		const { parent, places } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[2].click();
		expect(places).toEqual([{ kind: "soon" }]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("swaps for a month picker on Date, in the same panel", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-place").click();
		const panel = q<HTMLElement>(parent, ".tc-quick-panel");
		tiles(parent)[4].click();
		expect(parent.querySelectorAll(".tc-quick-panel")).toHaveLength(1);
		expect(panel.classList.contains("is-picker")).toBe(true);
		expect(panel.querySelector(".tc-menu-tile")).toBeNull();
		expect(panel.querySelector(".tc-picker-title")?.textContent).toBe("November 2026");
	});

	it("reports a picked day as a date and closes", () => {
		const { parent, places } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		const days = [...parent.querySelectorAll<HTMLButtonElement>(".tc-day")];
		days.find((d) => d.textContent === "5" && !d.classList.contains("is-other"))!.click();
		expect(places).toEqual([{ kind: "date", date: "2026-11-05" }]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("reports the placement the service gives for the day picked", () => {
		const { parent, places } = setup({ place: { kind: "inbox" } }, false, () => ({ kind: "soon" }));
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		q(parent, ".tc-day.is-today").click();
		expect(places).toEqual([{ kind: "soon" }]);
	});

	it("reports today as Now", () => {
		const { parent, places } = setup({ place: { kind: "inbox" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		q(parent, ".tc-day.is-today").click();
		expect(places).toEqual([{ kind: "now" }]);
	});

	it("marks the field's day in the picker and starts at its month", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-12-24" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		expect(q(parent, ".tc-picker-title").textContent).toBe("December 2026");
		expect(q(parent, ".tc-day.is-selected").textContent).toBe("24");
	});

	it("reports the field's own day too, and closes", () => {
		const { parent, places } = setup({ place: { kind: "date", date: "2026-11-05" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		q(parent, ".tc-day.is-selected").click();
		expect(places).toEqual([{ kind: "date", date: "2026-11-05" }]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});
});

describe("the repeat button", () => {
	const segment = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>(".tc-repeat-seg-btn")].find((b) => b.textContent === label)!;
	const weekday = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>(".tc-repeat-day")].find((b) => b.textContent === label)!;

	it("stands between the flag and the place", () => {
		const { parent } = setup();
		const buttons = [...parent.querySelectorAll(".tc-quick-bar > button")].map((b) => b.className.match(/tc-bar-(section|flag|project|repeat|place)/)?.[1]);
		expect(buttons).toEqual(["section", "flag", "project", "repeat", "place"]);
		expect(q(parent, ".tc-bar-repeat").getAttribute("aria-label")).toBe("Repeat");
	});

	it("is not there for a field that cannot repeat: a subtask, a slot", () => {
		const { parent, bar } = setup({ repeatable: false });
		expect(q(parent, ".tc-bar-repeat").hidden).toBe(true);
		bar.show(full());
		expect(q(parent, ".tc-bar-repeat").hidden).toBe(false);
	});

	it("lights up once the field has a rule", () => {
		const { parent, bar } = setup();
		const button = q(parent, ".tc-bar-repeat");
		expect(button.classList.contains("is-set")).toBe(false);
		expect(button.getAttribute("aria-pressed")).toBe("false");
		bar.show(full({ repeat: WEEKLY_THU }));
		expect(button.classList.contains("is-set")).toBe(true);
		expect(button.getAttribute("aria-pressed")).toBe("true");
	});

	it("opens the repeat panel above the bar, one panel at a time", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-bar-repeat").click();
		expect(parent.querySelectorAll(".tc-quick-panel")).toHaveLength(1);
		const panel = q<HTMLElement>(parent, ".tc-quick-panel");
		expect(panel.classList.contains("is-repeat")).toBe(true);
		expect(panel.classList.contains("is-above")).toBe(true);
		expect(q<HTMLElement>(parent, ".tc-quick-bar").dataset.panel).toBe("repeat");
		expect(panel.querySelector(".tc-repeat-remove")).toBeNull();
		q(parent, ".tc-bar-repeat").click();
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("starts a new rule from the day the session gives: its weekday", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-11-05" }, repeatDay: "2026-11-05" });
		q(parent, ".tc-bar-repeat").click();
		expect(weekday(parent, "Thu").classList.contains("is-on")).toBe(true);
	});

	it("starts a new rule from today for a field with no day", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-repeat").click();
		expect(weekday(parent, "Sun").classList.contains("is-on")).toBe(true);
	});

	it("reports each change at once and stays open", () => {
		const { parent, bar, repeats } = setup({ repeat: WEEKLY_THU });
		q(parent, ".tc-bar-repeat").click();
		weekday(parent, "Mon").click();
		expect(repeats).toEqual([{ ...WEEKLY_THU, days: [0, 3] }]);
		bar.show(full({ repeat: repeats[0] }));
		segment(parent, "days").click();
		expect(repeats[1]).toEqual({ kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null });
		expect(parent.querySelector(".tc-quick-panel")).not.toBeNull();
	});

	it("is not drawn again for the rule it reported itself", () => {
		const { parent, bar, repeats } = setup({ repeat: WEEKLY_THU });
		q(parent, ".tc-bar-repeat").click();
		const kind = q(parent, ".tc-repeat-seg-btn");
		weekday(parent, "Mon").click();
		bar.show(full({ repeat: repeats[0] }));
		expect(q(parent, ".tc-repeat-seg-btn")).toBe(kind);
	});

	it("gains Remove repeat once a rule is set", () => {
		const { parent, bar, repeats } = setup();
		q(parent, ".tc-bar-repeat").click();
		weekday(parent, "Mon").click();
		bar.show(full({ repeat: repeats[0] }));
		expect(parent.querySelector(".tc-repeat-remove")).not.toBeNull();
	});

	it("Remove repeat takes the rule off and closes", () => {
		const { parent, repeats } = setup({ repeat: WEEKLY_THU });
		q(parent, ".tc-bar-repeat").click();
		q(parent, ".tc-repeat-remove").click();
		expect(repeats).toEqual([null]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("closes when the field can no longer repeat", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-repeat").click();
		bar.show(full({ repeatable: false }));
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});
});

describe("the panels' opening and closing", () => {
	it("opens one at a time", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-bar-place").click();
		expect(parent.querySelectorAll(".tc-quick-panel")).toHaveLength(1);
		expect(parent.querySelectorAll(".tc-menu-tile")).toHaveLength(5);
		q(parent, ".tc-bar-flag").click();
		expect(parent.querySelectorAll(".tc-menu-tile")).toHaveLength(3);
	});

	it("closes on a second tap on its own button", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-bar-flag").click();
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("closes on a pointerdown outside, not on one inside", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-menu-tile").dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		expect(parent.querySelector(".tc-quick-panel")).not.toBeNull();
		q(parent, ".tc-bar-flag").dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		expect(parent.querySelector(".tc-quick-panel")).not.toBeNull();
		document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("stops listening outside once closed", () => {
		const { parent } = setup();
		const remove = vi.spyOn(document, "removeEventListener");
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-bar-flag").click();
		expect(remove).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
	});

	it("closes when the bar hides", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-flag").click();
		bar.hide();
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("keeps an open priority panel current as the field's level changes", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-flag").click();
		bar.show(full({ marks: marks(LEVELS[2]) }));
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([false, false, true]);
	});

	it("closes the place panel when the field no longer has a place", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		bar.show(full({ place: null }));
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("the same place keeps its icon", () => {
		const { parent, bar } = setup({ place: { kind: "inbox" } });
		const first = q<SVGElement>(parent, ".tc-bar-place svg");
		bar.show(full({ place: { kind: "inbox" } }));
		expect(q<SVGElement>(parent, ".tc-bar-place svg")).toBe(first);
		bar.show(full({ place: { kind: "soon" } }));
		expect(q<SVGElement>(parent, ".tc-bar-place svg")).not.toBe(first);
		expect(parent.querySelectorAll(".tc-bar-place svg")).toHaveLength(1);
		expect(q<HTMLElement>(parent, ".tc-bar-place .tc-btn-label").textContent).toBe("Soon");
	});

	it("an open panel is not drawn again for the same state", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		const place = tiles(parent)[0];
		bar.show(full());
		expect(tiles(parent)[0]).toBe(place);
		bar.show(full({ place: { kind: "inbox" } }));
		expect(tiles(parent)[0]).not.toBe(place);
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([true, false, false, false, false]);
		q(parent, ".tc-bar-flag").click();
		const level = tiles(parent)[0];
		bar.show(full({ place: { kind: "inbox" } }));
		expect(tiles(parent)[0]).toBe(level);
		bar.show(full({ place: { kind: "inbox" }, marks: marks(LEVELS[0]) }));
		expect(tiles(parent)[0]).not.toBe(level);
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([true, false, false]);
	});

	it("leaves the month picker alone when the field's state is shown again", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		bar.show(full());
		expect(parent.querySelector(".tc-picker")).not.toBeNull();
	});
});

describe("QuickBar over a menu", () => {
	it("leaves the view for the page at the view's bottom, above the blur, and comes back last in the view", () => {
		const { parent, bar } = setup();
		parent.appendChild(document.createElement("span"));
		const el = q<HTMLElement>(document, ".tc-quick-bar");
		bar.follow({ field: null, room: new DOMRect(0, 0, 300, 400), overMenu: new DOMRect(10, 0, 300, window.innerHeight - 50) });
		expect(el.parentElement).toBe(document.body);
		expect(el.classList.contains("is-over")).toBe(true);
		expect([el.style.left, el.style.width, el.style.bottom]).toEqual(["10px", "300px", "calc(50px + var(--tc-bar-bottom))"]);
		bar.follow(null);
		expect(parent.lastElementChild).toBe(el);
		expect(el.classList.contains("is-over")).toBe(false);
		expect([el.style.left, el.style.width, el.style.bottom]).toEqual(["", "", ""]);
	});
});

describe("QuickBar over a menu on the desktop", () => {
	it("stands away without docking at the view's bottom when the field has no spot", () => {
		const { bar } = setup({}, true);
		const el = q<HTMLElement>(document, ".tc-quick-bar");
		bar.follow({ field: null, room: new DOMRect(0, 0, 300, 400), overMenu: new DOMRect(10, 0, 300, window.innerHeight - 50) });
		expect(el.classList.contains("is-away")).toBe(true);
		expect([el.style.left, el.style.width, el.style.bottom]).toEqual(["", "", ""]);
	});
});

describe("QuickBar on the desktop", () => {
	const VIEW = new DOMRect(100, 50, 800, 600);
	const ROOM_BOX = new DOMRect(110, 90, 360, 540);
	const SIZE = new DOMRect(0, 0, 183, 32);

	function desk(state: Partial<QuickBarState> = {}) {
		const set = setup(state, true);
		set.parent.getBoundingClientRect = () => VIEW;
		const el = q<HTMLElement>(document, ".tc-quick-bar");
		el.getBoundingClientRect = () => new DOMRect(VIEW.left + (parseFloat(el.style.left) || 0), VIEW.top + (parseFloat(el.style.top) || 0), SIZE.width, SIZE.height);
		return { ...set, el };
	}

	it("is a capsule right under the field, its right edge on the field's, in the view's own coordinates", () => {
		const { bar, el } = desk();
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.classList.contains("is-desk")).toBe(true);
		expect([el.style.left, el.style.top]).toEqual([`${120 + 350 - 183 - 100}px`, `${300 + 35 + 8 - 50}px`]);
		expect(el.style.bottom).toBe("");
	});

	it("follows the field and goes over it where the column shows no room under it", () => {
		const { bar, el } = desk();
		bar.follow({ field: new DOMRect(120, 400, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.style.top).toBe(`${443 - 50}px`);
		bar.follow({ field: new DOMRect(120, 590, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.style.top).toBe(`${590 - 8 - 32 - 50}px`);
	});

	it("is out of sight while the field does not show, and back once it does", () => {
		const { bar, el } = desk();
		bar.follow({ field: new DOMRect(120, 20, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.classList.contains("is-away")).toBe(true);
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.classList.contains("is-away")).toBe(false);
	});

	it("over a menu's blur stands by the field on the page, in the screen's coordinates", () => {
		const { bar, el } = desk({ place: null });
		bar.follow({ field: new DOMRect(500, 300, 155, 35), room: VIEW, overMenu: VIEW });
		expect(el.parentElement).toBe(document.body);
		expect([el.style.left, el.style.top, el.style.width]).toEqual([`${655 - 183}px`, "343px", ""]);
	});

	it("opens its panel away from the field: under a capsule under the field, over a capsule over it", () => {
		const { bar, el } = desk();
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		q(el, ".tc-bar-flag").click();
		const panel = q<HTMLElement>(el, ".tc-quick-panel");
		expect(panel.classList.contains("is-below")).toBe(true);
		expect(el.dataset.panel).toBe("priority");
		bar.follow({ field: new DOMRect(120, 590, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(panel.classList.contains("is-above")).toBe(true);
		expect(panel.classList.contains("is-below")).toBe(false);
	});

	it("follows the same anchor without writing anything", () => {
		const { bar, parent } = desk();
		const anchor = { field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null };
		bar.follow(anchor);
		const observer = new MutationObserver(() => {});
		observer.observe(document.body, { attributes: true, subtree: true });
		observer.observe(parent, { attributes: true, subtree: true });
		bar.follow(anchor);
		expect(observer.takeRecords()).toEqual([]);
		observer.disconnect();
	});

	it("reads the layout before it writes", () => {
		const { bar, el, parent } = desk();
		const observer = new MutationObserver(() => {});
		observer.observe(document.body, { attributes: true, subtree: true });
		let readsAfterWrite = 0;
		for (const box of [el, parent]) {
			const read = box.getBoundingClientRect.bind(box);
			box.getBoundingClientRect = () => {
				readsAfterWrite += observer.takeRecords().length;
				return read();
			};
		}
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		observer.takeRecords();
		bar.follow({ field: new DOMRect(120, 400, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.style.top).toBe(`${443 - 50}px`);
		expect(readsAfterWrite).toBe(0);
		observer.disconnect();
	});

	it("has the repeat button in the capsule, its panel away from the field as the others", () => {
		const { bar, el } = desk({ repeat: WEEKLY_THU });
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(q(el, ".tc-bar-repeat").hidden).toBe(false);
		expect(q(el, ".tc-bar-repeat").classList.contains("is-set")).toBe(true);
		q(el, ".tc-bar-repeat").click();
		expect(el.dataset.panel).toBe("repeat");
		expect(q<HTMLElement>(el, ".tc-quick-panel.is-repeat").classList.contains("is-below")).toBe(true);
	});

	it("names its keys in the buttons' tooltips", () => {
		const { el } = desk();
		expect(q(el, ".tc-bar-indent").title).toBe("Move in (Tab)");
		expect(q(el, ".tc-bar-outdent").title).toBe("Move out (Shift+Tab)");
	});

	it("is the bar over the keyboard on the phone, whatever the field", () => {
		const { parent, bar } = setup();
		const el = q<HTMLElement>(parent, ".tc-quick-bar");
		bar.follow({ field: new DOMRect(120, 300, 350, 35), room: ROOM_BOX, overMenu: null });
		expect(el.classList.contains("is-desk")).toBe(false);
		expect([el.style.left, el.style.top]).toEqual(["", ""]);
		expect(parent.lastElementChild).toBe(el);
	});
});

describe("QuickBar on the phone keyboard", () => {
	it("rises with the keyboard from as far below as the keyboard is tall, and only as it slides in", () => {
		const { parent, bar } = setup();
		const el = q<HTMLElement>(parent, ".tc-quick-bar");
		const anchor = { field: null, room: new DOMRect(0, 0, 390, 700), overMenu: null };
		const drawn: string[] = [];
		el.getBoundingClientRect = () => {
			drawn.push(el.style.transform);
			return new DOMRect(0, 414, 390, 44);
		};
		bar.follow(anchor, 336);
		expect(drawn).toContain("translateY(336px)");
		expect(el.classList.contains("is-gliding")).toBe(true);
		expect(el.style.transform).toBe("");
		el.classList.remove("is-gliding");
		drawn.length = 0;
		bar.follow(anchor);
		expect(drawn).toEqual([]);
		expect(el.classList.contains("is-gliding")).toBe(false);
	});

	it("follows the same anchor without writing anything", () => {
		const { parent, bar } = setup();
		parent.getBoundingClientRect = () => new DOMRect(0, 0, 390, 700);
		const anchor = { field: null, room: new DOMRect(0, 0, 390, 700), overMenu: null };
		bar.follow(anchor);
		const observer = new MutationObserver(() => {});
		observer.observe(document.body, { attributes: true, subtree: true });
		bar.follow(anchor);
		expect(observer.takeRecords()).toEqual([]);
		observer.disconnect();
	});

	it("the section button shows where a section may be written; pressed, only it stays", () => {
		const { parent, sections } = setup({ section: false });
		const section = q(parent, ".tc-bar-section");
		expect(section.hidden).toBe(false);
		expect(section.getAttribute("aria-pressed")).toBe("false");
		section.click();
		expect(sections).toHaveLength(1);
		const on = setup({ section: true, indents: false, markable: false, repeatable: false, place: null });
		expect(q(on.parent, ".tc-bar-section").getAttribute("aria-pressed")).toBe("true");
		for (const cls of [".tc-bar-outdent", ".tc-bar-flag", ".tc-bar-repeat", ".tc-bar-place"]) expect(q(on.parent, cls).hidden).toBe(true);
		expect(q(setup().parent, ".tc-bar-section").hidden).toBe(true);
	});

	it("owns every element it puts on the page, on the phone and on the desktop, so a tap there never closes the field", () => {
		for (const desktop of [false, true]) {
			const parent = document.createElement("div");
			const other = parent.appendChild(document.createElement("span"));
			const bar = new QuickBar(parent, { desktop: () => desktop, today: () => TODAY, listName, placementTitle, placementOfDay: dayPlacement, onIndent: () => {}, onPriority: () => {}, onLabel: () => {}, onPlace: () => {}, onRepeat: () => {}, onSection: () => {}, onProject: () => {}, onNewProject: () => {}, onNameEnd: () => {} });
			bar.show(full({ section: false }));
			const own = [...parent.querySelectorAll("*")].filter((node) => !other.contains(node));
			expect(own.length).toBeGreaterThan(0);
			for (const node of own) expect(bar.owns(node)).toBe(true);
			expect(bar.owns(other)).toBe(false);
		}
	});
});

describe("the flag's labels", () => {
	it("offers the labels under the levels, one tap putting a label on and the panel staying for the next", () => {
		shownLabels = LABELS;
		const { parent, labelled } = setup({ marks: marks(null, [LABELS[1]]) });
		q(parent, ".tc-bar-flag").click();
		const labels = [...document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-labels .tc-menu-tile")];
		expect(labels.map((t) => [t.textContent, t.classList.contains("is-on")])).toEqual([["Важное", false], ["Очень срочное", true]]);
		labels[0].click();
		expect(labelled).toEqual(["Важное"]);
		expect(document.querySelector(".tc-menu-tiles.is-labels")).not.toBeNull();
	});

	it("turns the labels off while there is a priority, the levels while there are labels, and colours the flag by the first label", () => {
		shownLabels = LABELS;
		const prioritized = setup({ marks: marks(LEVELS[0]) });
		q(prioritized.parent, ".tc-bar-flag").click();
		expect([...document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-labels .tc-menu-tile")].every((t) => t.disabled)).toBe(true);
		document.body.innerHTML = "";
		const labelled = setup({ marks: marks(null, [LABELS[1]]) });
		expect(q(labelled.parent, ".tc-bar-flag").dataset.priority).toBe("orange");
		q(labelled.parent, ".tc-bar-flag").click();
		expect([...document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile")].every((t) => t.disabled)).toBe(true);
	});
	it("turns tiles off as the service answers, whatever the field shows", () => {
		shownLabels = LABELS;
		const answer = marks();
		const off = <T,>(tiles: readonly { readonly mark: T; readonly on: boolean }[]) => tiles.map((tile) => ({ ...tile, enabled: false }));
		const { parent } = setup({ marks: { ...answer, can: { setPriority: false, setLabels: false }, tiles: { levels: off(answer.tiles.levels), labels: off(answer.tiles.labels) } } });
		q(parent, ".tc-bar-flag").click();
		expect([...document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles .tc-menu-tile")].every((t) => t.disabled)).toBe(true);
	});
});
