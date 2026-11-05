// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Placement, RepeatRule } from "../../src/application/contracts";
import type { PriorityLevel } from "../../src/application/contracts";
import { QuickBar, type QuickBarState } from "../../src/ui/quick/QuickBar";

const LEVELS: readonly PriorityLevel[] = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
	{ prefix: "p3", color: "blue" },
];

const STATE: QuickBarState = { canIndent: true, canOutdent: true, indents: true, priority: null, place: { kind: "soon" }, repeat: null, repeatable: true };

const WEEKLY_THU: RepeatRule = { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null };

function setup(state: Partial<QuickBarState> = {}, desktop = false) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const indents: (1 | -1)[] = [];
	const priorities: (string | null)[] = [];
	const places: Placement[] = [];
	const repeats: (RepeatRule | null)[] = [];
	const bar = new QuickBar(parent, {
		desktop: () => desktop,
		levels: () => LEVELS,
		today: () => "2026-11-01",
		onIndent: (delta) => indents.push(delta),
		onPriority: (prefix) => priorities.push(prefix),
		onPlace: (placement) => places.push(placement),
		onRepeat: (rule) => repeats.push(rule),
	});
	bar.show({ ...STATE, ...state });
	return { parent, bar, indents, priorities, places, repeats };
}

const q = <T extends Element = HTMLButtonElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;
const tiles = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>(".tc-menu-tile")];

afterEach(() => {
	document.body.innerHTML = "";
});

describe("QuickBar", () => {
	it("is the last child of its parent and hidden until shown", () => {
		const parent = document.createElement("div");
		const first = document.createElement("span");
		parent.appendChild(first);
		const bar = new QuickBar(parent, { desktop: () => false, levels: () => LEVELS, today: () => "2026-11-01", onIndent: () => {}, onPriority: () => {}, onPlace: () => {}, onRepeat: () => {} });
		expect(parent.lastElementChild?.classList.contains("tc-quick-bar")).toBe(true);
		expect(q<HTMLElement>(parent, ".tc-quick-bar").hidden).toBe(true);
		bar.show(STATE);
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
		bar.show({ ...STATE, canIndent: false, canOutdent: true });
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
		bar.show({ ...STATE, priority: LEVELS[1] });
		expect(flag.dataset.priority).toBe("orange");
		expect(flag.classList.contains("is-set")).toBe(true);
		bar.show(STATE);
		expect(flag.dataset.priority).toBeUndefined();
	});

	it("labels the place button Inbox, Soon, Now or the day", () => {
		const { parent, bar } = setup();
		const label = () => q(parent, ".tc-bar-place .tc-btn-label").textContent;
		expect(label()).toBe("Soon");
		bar.show({ ...STATE, place: { kind: "inbox" } });
		expect(label()).toBe("Inbox");
		bar.show({ ...STATE, place: { kind: "now" } });
		expect(label()).toBe("Now");
		bar.show({ ...STATE, place: { kind: "date", date: "2026-11-05" } });
		expect(label()).toBe("5 Nov");
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
		const { parent } = setup({ priority: LEVELS[1] });
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

	it("takes the level off on a tap on the current one", () => {
		const { parent, priorities } = setup({ priority: LEVELS[0] });
		q(parent, ".tc-bar-flag").click();
		tiles(parent)[0].click();
		expect(priorities).toEqual([null]);
	});

	it("opens no panel without levels", () => {
		const parent = document.createElement("div");
		const bar = new QuickBar(parent, { desktop: () => false, levels: () => [], today: () => "2026-11-01", onIndent: () => {}, onPriority: () => {}, onPlace: () => {}, onRepeat: () => {} });
		bar.show(STATE);
		expect(q(parent, ".tc-bar-flag").hidden).toBe(true);
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

	it("only closes on a tap on the current place", () => {
		const { parent, places } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[2].click();
		expect(places).toEqual([]);
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

	it("closes without a report on the field's own day", () => {
		const { parent, places } = setup({ place: { kind: "date", date: "2026-11-05" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		q(parent, ".tc-day.is-selected").click();
		expect(places).toEqual([]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});
});

describe("the repeat button", () => {
	const segment = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>(".tc-repeat-seg-btn")].find((b) => b.textContent === label)!;
	const weekday = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>(".tc-repeat-day")].find((b) => b.textContent === label)!;

	it("stands between the flag and the place", () => {
		const { parent } = setup();
		const buttons = [...parent.querySelectorAll(".tc-quick-bar > button")].map((b) => b.className.match(/tc-bar-(flag|repeat|place)/)?.[1]);
		expect(buttons).toEqual(["flag", "repeat", "place"]);
		expect(q(parent, ".tc-bar-repeat").getAttribute("aria-label")).toBe("Repeat");
	});

	it("is not there for a field that cannot repeat: a subtask, a slot", () => {
		const { parent, bar } = setup({ repeatable: false });
		expect(q(parent, ".tc-bar-repeat").hidden).toBe(true);
		bar.show(STATE);
		expect(q(parent, ".tc-bar-repeat").hidden).toBe(false);
	});

	it("lights up once the field has a rule", () => {
		const { parent, bar } = setup();
		const button = q(parent, ".tc-bar-repeat");
		expect(button.classList.contains("is-set")).toBe(false);
		expect(button.getAttribute("aria-pressed")).toBe("false");
		bar.show({ ...STATE, repeat: WEEKLY_THU });
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

	it("starts a new rule from the field's day: its weekday", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-11-05" } });
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
		bar.show({ ...STATE, repeat: repeats[0] });
		segment(parent, "days").click();
		expect(repeats[1]).toEqual({ kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null });
		expect(parent.querySelector(".tc-quick-panel")).not.toBeNull();
	});

	it("is not drawn again for the rule it reported itself", () => {
		const { parent, bar, repeats } = setup({ repeat: WEEKLY_THU });
		q(parent, ".tc-bar-repeat").click();
		const kind = q(parent, ".tc-repeat-seg-btn");
		weekday(parent, "Mon").click();
		bar.show({ ...STATE, repeat: repeats[0] });
		expect(q(parent, ".tc-repeat-seg-btn")).toBe(kind);
	});

	it("gains Remove repeat once a rule is set", () => {
		const { parent, bar, repeats } = setup();
		q(parent, ".tc-bar-repeat").click();
		weekday(parent, "Mon").click();
		bar.show({ ...STATE, repeat: repeats[0] });
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
		bar.show({ ...STATE, repeatable: false });
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
		bar.show({ ...STATE, priority: LEVELS[2] });
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([false, false, true]);
	});

	it("closes the place panel when the field no longer has a place", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		bar.show({ ...STATE, place: null });
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("the same place keeps its icon", () => {
		const { parent, bar } = setup({ place: { kind: "inbox" } });
		const first = q<SVGElement>(parent, ".tc-bar-place svg");
		bar.show({ ...STATE, place: { kind: "inbox" } });
		expect(q<SVGElement>(parent, ".tc-bar-place svg")).toBe(first);
		bar.show({ ...STATE, place: { kind: "soon" } });
		expect(q<SVGElement>(parent, ".tc-bar-place svg")).not.toBe(first);
		expect(parent.querySelectorAll(".tc-bar-place svg")).toHaveLength(1);
		expect(q<HTMLElement>(parent, ".tc-bar-place .tc-btn-label").textContent).toBe("Soon");
	});

	it("an open panel is not drawn again for the same state", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		const place = tiles(parent)[0];
		bar.show(STATE);
		expect(tiles(parent)[0]).toBe(place);
		bar.show({ ...STATE, place: { kind: "inbox" } });
		expect(tiles(parent)[0]).not.toBe(place);
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([true, false, false, false, false]);
		q(parent, ".tc-bar-flag").click();
		const level = tiles(parent)[0];
		bar.show({ ...STATE, place: { kind: "inbox" } });
		expect(tiles(parent)[0]).toBe(level);
		bar.show({ ...STATE, place: { kind: "inbox" }, priority: LEVELS[0] });
		expect(tiles(parent)[0]).not.toBe(level);
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([true, false, false]);
	});

	it("leaves the month picker alone when the field's state is shown again", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[4].click();
		bar.show(STATE);
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
});
