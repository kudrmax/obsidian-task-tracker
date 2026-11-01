// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "../../src/application/contracts";
import type { PriorityLevel } from "../../src/settings";
import { QuickBar, type QuickBarState } from "../../src/ui/quick/QuickBar";

const LEVELS: readonly PriorityLevel[] = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
	{ prefix: "p3", color: "blue" },
];

const STATE: QuickBarState = { canIndent: true, canOutdent: true, indents: true, priority: null, place: { kind: "soon" } };

function setup(state: Partial<QuickBarState> = {}) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const indents: (1 | -1)[] = [];
	const priorities: (string | null)[] = [];
	const places: Placement[] = [];
	const bar = new QuickBar(parent, {
		levels: () => LEVELS,
		today: () => "2026-11-01",
		onIndent: (delta) => indents.push(delta),
		onPriority: (prefix) => priorities.push(prefix),
		onPlace: (placement) => places.push(placement),
	});
	bar.show({ ...STATE, ...state });
	return { parent, bar, indents, priorities, places };
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
		const bar = new QuickBar(parent, { levels: () => LEVELS, today: () => "2026-11-01", onIndent: () => {}, onPriority: () => {}, onPlace: () => {} });
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
		const label = () => q(parent, ".tc-bar-place-label").textContent;
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
		const bar = new QuickBar(parent, { levels: () => [], today: () => "2026-11-01", onIndent: () => {}, onPriority: () => {}, onPlace: () => {} });
		bar.show(STATE);
		expect(q(parent, ".tc-bar-flag").hidden).toBe(true);
	});
});

describe("the place panel", () => {
	it("has Inbox, Soon, Now and Date in a row, the current place on without a cross", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-place").click();
		const all = tiles(parent);
		expect(all.map((t) => t.querySelector(".tc-menu-tile-label")?.textContent)).toEqual(["Inbox", "Soon", "Now", "Date"]);
		expect(all.map((t) => t.classList.contains("is-on"))).toEqual([false, true, false, false]);
		expect(all.map((t) => t.dataset.priority)).toEqual([undefined, undefined, undefined, undefined]);
		expect(parent.querySelector(".tc-menu-badge")).toBeNull();
		expect(parent.querySelectorAll(".tc-menu-tile-row")).toHaveLength(1);
	});

	it("puts Date on for a day", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-11-05" } });
		q(parent, ".tc-bar-place").click();
		expect(tiles(parent).map((t) => t.classList.contains("is-on"))).toEqual([false, false, false, true]);
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
		tiles(parent)[1].click();
		expect(places).toEqual([]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("swaps for a month picker on Date, in the same panel", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-place").click();
		const panel = q<HTMLElement>(parent, ".tc-quick-panel");
		tiles(parent)[3].click();
		expect(parent.querySelectorAll(".tc-quick-panel")).toHaveLength(1);
		expect(panel.classList.contains("is-picker")).toBe(true);
		expect(panel.querySelector(".tc-menu-tile")).toBeNull();
		expect(panel.querySelector(".tc-picker-title")?.textContent).toBe("November 2026");
	});

	it("reports a picked day as a date and closes", () => {
		const { parent, places } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[3].click();
		const days = [...parent.querySelectorAll<HTMLButtonElement>(".tc-day")];
		days.find((d) => d.textContent === "5" && !d.classList.contains("is-other"))!.click();
		expect(places).toEqual([{ kind: "date", date: "2026-11-05" }]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});

	it("reports today as Now", () => {
		const { parent, places } = setup({ place: { kind: "inbox" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[3].click();
		q(parent, ".tc-day.is-today").click();
		expect(places).toEqual([{ kind: "now" }]);
	});

	it("marks the field's day in the picker and starts at its month", () => {
		const { parent } = setup({ place: { kind: "date", date: "2026-12-24" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[3].click();
		expect(q(parent, ".tc-picker-title").textContent).toBe("December 2026");
		expect(q(parent, ".tc-day.is-selected").textContent).toBe("24");
	});

	it("closes without a report on the field's own day", () => {
		const { parent, places } = setup({ place: { kind: "date", date: "2026-11-05" } });
		q(parent, ".tc-bar-place").click();
		tiles(parent)[3].click();
		q(parent, ".tc-day.is-selected").click();
		expect(places).toEqual([]);
		expect(parent.querySelector(".tc-quick-panel")).toBeNull();
	});
});

describe("the panels' opening and closing", () => {
	it("opens one at a time", () => {
		const { parent } = setup();
		q(parent, ".tc-bar-flag").click();
		q(parent, ".tc-bar-place").click();
		expect(parent.querySelectorAll(".tc-quick-panel")).toHaveLength(1);
		expect(parent.querySelectorAll(".tc-menu-tile")).toHaveLength(4);
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

	it("leaves the month picker alone when the field's state is shown again", () => {
		const { parent, bar } = setup();
		q(parent, ".tc-bar-place").click();
		tiles(parent)[3].click();
		bar.show(STATE);
		expect(parent.querySelector(".tc-picker")).not.toBeNull();
	});
});
