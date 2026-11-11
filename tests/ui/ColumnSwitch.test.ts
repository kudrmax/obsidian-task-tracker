// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RightMode } from "../../obsidian/ui/viewSettings";
import type { Place } from "../../obsidian/ui/screens";
import { ColumnSwitch } from "../../obsidian/ui/ColumnSwitch";
import { GestureArbiter } from "../../obsidian/ui/gestures";
import type { CalendarAlert } from "../../core/application/contracts";

const LONG_PRESS = 250;
/** The core's words for the dot, as it hands them in. */
const DOT_WORDS: Record<CalendarAlert, string> = { none: "", old: "Out of date", broken: "Refresh failed" };
const STEP = 38;

function pointer(type: string, clientX: number, time = 0): PointerEvent {
	const event = new PointerEvent(type, { clientX, clientY: 10, pointerId: 1, isPrimary: true, button: 0, bubbles: true });
	Object.defineProperty(event, "timeStamp", { get: () => time });
	return event;
}

/** A finger creeping a pixel per 20 ms, slower than the slow speed, for longer than a careful drag needs. */
const CREEP = Array.from({ length: 7 }, (_, i) => ({ dx: i + 1, t: (i + 1) * 20 }));

/** happy-dom lays nothing out: the icon's width and the pill's place are what the stylesheet would give. */
function setUp(initial: Place, dot: CalendarAlert = "none", arbiter = new GestureArbiter()) {
	let mode = initial;
	const changes: RightMode[] = [];
	let sources = 0;
	const control = new ColumnSwitch(document.createElement("div"), {
		value: () => mode,
		onChange: (next) => {
			changes.push(next);
			mode = next;
			control.render();
		},
		dot: () => ({ alert: dot, words: DOT_WORDS[dot] }),
		onSources: () => sources++,
		longPressMs: () => LONG_PRESS,
		arbiter,
	});
	const icons = [...control.el.querySelectorAll<HTMLElement>(".tc-seg-reel")[0].querySelectorAll<HTMLElement>(".tc-seg-icon")];
	for (const icon of control.el.querySelectorAll<HTMLElement>(".tc-seg-icon")) Object.defineProperty(icon, "offsetWidth", { get: () => STEP });
	const prop = (name: string) => parseFloat(control.el.style.getPropertyValue(name));
	/** Where the wheel stands: the window's middle, an icon's width left of the icon it centres on. */
	const wheel = () => prop("--tc-seg-left") + prop("--tc-seg-span") / 2 - 1;
	const frame = () => [prop("--tc-seg-left"), prop("--tc-seg-span")];
	const lit = () => [Math.round(wheel()), Math.round(wheel()) + 1];
	const depth = (column: number) => icons[column].style.getPropertyValue("--tc-seg-depth");
	const tap = (column: number) => {
		control.el.dispatchEvent(pointer("pointerdown", 50));
		control.el.dispatchEvent(pointer("pointerup", 50));
		icons[column].click();
	};
	/** A drag through [x, ms] points: pressed at the first, let go at the last. */
	const drag = (...points: (readonly [number, number])[]) => {
		const [x0, t0] = points[0];
		control.el.dispatchEvent(pointer("pointerdown", x0, t0));
		for (const [x, t] of points.slice(1)) control.el.dispatchEvent(pointer("pointermove", x, t));
		const [x1, t1] = points[points.length - 1];
		control.el.dispatchEvent(pointer("pointerup", x1, t1));
		control.el.click();
	};
	/** Pressed at `x`, then creeping one way until the drag is careful; returns where and when the finger is. */
	const creep = (x: number, way: 1 | -1) => {
		control.el.dispatchEvent(pointer("pointerdown", x, 0));
		for (const { dx, t } of CREEP) control.el.dispatchEvent(pointer("pointermove", x + way * dx, t));
		const last = CREEP[CREEP.length - 1];
		return { x: x + way * last.dx, t: last.t };
	};
	const move = (x: number, t: number) => control.el.dispatchEvent(pointer("pointermove", x, t));
	const release = (x: number, t: number) => {
		control.el.dispatchEvent(pointer("pointerup", x, t));
		control.el.click();
	};
	return { control, changes, sources: () => sources, wheel, frame, lit, depth, tap, drag, creep, move, release };
}

describe("ColumnSwitch", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("turns the wheel so that its window shows the two columns on the screen, the icons out of it standing deeper", () => {
		const calendar = setUp("calendar");
		expect(calendar.lit()).toEqual([3, 4]);
		expect([0, 1, 2, 3, 4].map(calendar.depth)).toEqual(["3", "2", "1", "0", "0"]);
		expect(setUp("soon").lit()).toEqual([2, 3]);
		const inbox = setUp("inbox");
		expect(inbox.lit()).toEqual([1, 2]);
		expect([0, 1, 2, 3, 4].map(inbox.depth)).toEqual(["1", "0", "0", "1", "2"]);
	});

	it("narrows the window to the folder alone at Projects and to Inbox alone at Done, so no icon is ever cut by its edge", () => {
		const projects = setUp("projects");
		expect(projects.wheel()).toBe(-0.5);
		expect(projects.frame()).toEqual([0, 1]);
		expect([0, 1, 2, 3, 4].map(projects.depth)).toEqual(["0", "1", "2", "3", "4"]);
		const done = setUp("done");
		expect(done.frame()).toEqual([1, 1]);
		expect([0, 1, 2, 3, 4].map(done.depth)).toEqual(["1", "0", "1", "2", "3"]);
		expect(setUp("inbox").frame()).toEqual([1, 2]);
		expect(setUp("calendar").frame()).toEqual([3, 2]);
	});

	it("turns to Projects for a tap on the folder, and from Projects to the place nearest Inbox for a list's icon", () => {
		const s = setUp("calendar");
		s.tap(0);
		expect(s.changes).toEqual(["projects"]);
		s.tap(2);
		expect(s.changes).toEqual(["projects", "inbox"]);
		const now = setUp("projects");
		now.tap(3);
		expect(now.changes).toEqual(["soon"]);
	});

	it("turns one place a quick swipe from Inbox back to Projects, and on to Inbox again", () => {
		const s = setUp("inbox");
		s.drag([100, 0], [140, 16], [200, 32], [260, 48]);
		expect(s.changes).toEqual(["projects"]);
		s.drag([100, 0], [80, 16], [40, 32], [0, 48]);
		expect(s.changes).toEqual(["projects", "inbox"]);
	});

	it("holds a neighbour on each side of the window only where the wheel has one", () => {
		const sides = (s: ReturnType<typeof setUp>) => ["--tc-seg-before", "--tc-seg-after"].map((name) => s.control.el.style.getPropertyValue(name));
		expect(sides(setUp("projects"))).toEqual(["0", "1"]);
		expect(sides(setUp("inbox"))).toEqual(["1", "1"]);
		expect(sides(setUp("soon"))).toEqual(["1", "1"]);
		expect(sides(setUp("calendar"))).toEqual(["1", "0"]);
		const s = setUp("soon");
		const at = s.creep(100, 1);
		s.move(at.x + 50, at.t + 20);
		expect(s.frame()).toEqual([1, 1]);
		expect(sides(s)).toEqual(["1", "1"]);
	});

	it("draws the wheel twice, the copy under the window turning with it", () => {
		const s = setUp("soon");
		const [track, lens] = s.control.el.querySelectorAll(".tc-seg-reel");
		expect(lens.parentElement!.classList.contains("tc-seg-pill")).toBe(true);
		expect([...lens.querySelectorAll<HTMLElement>(".tc-seg-icon")].map((icon) => icon.style.getPropertyValue("--tc-seg-depth"))).toEqual(
			[...track.querySelectorAll<HTMLElement>(".tc-seg-icon")].map((icon) => icon.style.getPropertyValue("--tc-seg-depth")),
		);
	});

	it("from Done, a tapped icon turns to the place nearest Inbox that shows its column", () => {
		const s = setUp("done");
		s.tap(1);
		expect(s.changes).toEqual(["inbox"]);
		const now = setUp("done");
		now.tap(3);
		expect(now.changes).toEqual(["soon"]);
	});

	it("moves to the nearest place that shows a tapped column, and stays for a column already shown", () => {
		const s = setUp("calendar");
		s.tap(4);
		s.tap(3);
		expect(s.changes).toEqual([]);
		s.tap(2);
		expect(s.changes).toEqual(["soon"]);
		s.tap(1);
		expect(s.changes).toEqual(["soon", "inbox"]);
		s.tap(3);
		expect(s.changes).toEqual(["soon", "inbox", "soon"]);
		s.tap(4);
		expect(s.changes).toEqual(["soon", "inbox", "soon", "calendar"]);
		const far = setUp("calendar");
		far.tap(1);
		expect(far.changes).toEqual(["inbox"]);
	});

	it("turns the wheel the way the finger goes, within its ends, the screen staying put until let go", () => {
		const s = setUp("soon");
		const at = s.creep(100, -1);
		s.move(at.x - 12, at.t + 20);
		expect(s.wheel()).toBe(2.5);
		expect(s.depth(1)).toBe("1.5");
		s.move(at.x - 18, at.t + 40);
		expect(s.lit()).toEqual([3, 4]);
		s.move(0, at.t + 60);
		expect(s.wheel()).toBe(3);
		s.move(at.x + 42, at.t + 80);
		expect(s.lit()).toEqual([1, 2]);
		s.move(300, at.t + 100);
		expect(s.wheel()).toBe(-0.5);
		expect(s.changes).toEqual([]);
	});

	it("turns one place on a quick swipe, however far or short it goes, and a swipe is not a tap", () => {
		const s = setUp("soon");
		s.drag([100, 0], [80, 16], [40, 32], [0, 48]);
		expect(s.changes).toEqual(["calendar"]);
		s.drag([100, 0], [140, 16], [200, 32], [260, 48]);
		expect(s.changes).toEqual(["calendar", "soon"]);
		s.drag([100, 0], [108, 16], [112, 24]);
		expect(s.changes).toEqual(["calendar", "soon", "inbox"]);
		s.drag([100, 0], [90, 16], [70, 32]);
		expect(s.changes).toEqual(["calendar", "soon", "inbox", "soon"]);
	});

	it("holds the wheel within a place of where it stood while the swipe is quick", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 100, 0));
		s.move(160, 16);
		s.move(220, 32);
		expect(s.wheel()).toBe(2);
	});

	it("turns freely once the finger goes slowly, and stays free when it speeds up again", () => {
		const s = setUp("calendar");
		const at = s.creep(100, 1);
		s.move(at.x + 40, at.t + 16);
		s.move(at.x + 80, at.t + 32);
		s.release(at.x + 80, at.t + 40);
		expect(s.changes).toEqual(["inbox"]);
	});

	it("turns freely when a quick swipe slows down, going on from where the swipe held the wheel", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 100, 0));
		s.move(140, 16);
		s.move(180, 32);
		expect(s.wheel()).toBe(2);
		for (let i = 1; i <= 40; i++) s.move(180 + i * 1.2, 32 + i * 20);
		expect(s.wheel()).toBeLessThan(1.5);
		s.release(228, 32 + 41 * 20);
		expect(s.changes).toEqual(["inbox"]);
	});

	it("settles a careful drag on the nearest place, and stays when it comes back", () => {
		const s = setUp("calendar");
		let at = s.creep(100, 1);
		s.release(at.x, at.t + 20);
		expect(s.changes).toEqual([]);
		expect(s.wheel()).toBe(3);
		at = s.creep(100, 1);
		s.move(at.x + 20, at.t + 200);
		s.release(at.x + 20, at.t + 400);
		expect(s.changes).toEqual(["soon"]);
	});

	it("holds the screen while the wheel is turned, and waits while another gesture holds it", () => {
		const arbiter = new GestureArbiter();
		const s = setUp("calendar", "none", arbiter);
		s.control.el.dispatchEvent(pointer("pointerdown", 100));
		s.control.el.dispatchEvent(pointer("pointermove", 115));
		expect(arbiter.busy).toBe(true);
		s.control.el.dispatchEvent(pointer("pointermove", 180));
		s.control.el.dispatchEvent(pointer("pointerup", 180));
		expect(arbiter.busy).toBe(false);
		expect(s.changes).toEqual(["soon"]);
		arbiter.claim("swipe");
		s.drag([100, 0], [180, 16]);
		expect(s.changes).toEqual(["soon"]);
		expect(s.wheel()).toBe(2);
	});

	it("glides to a place the screen asks for, as after a tap", () => {
		const s = setUp("soon");
		s.control.show("calendar");
		expect(s.changes).toEqual(["calendar"]);
		expect(s.lit()).toEqual([3, 4]);
		expect(s.control.el.classList.contains("is-settling")).toBe(true);
		s.control.show("calendar");
		expect(s.changes).toEqual(["calendar"]);
	});

	it("opens the sources when held while the calendar shows, and does not flip", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		s.control.el.dispatchEvent(pointer("pointerup", 50));
		s.control.el.querySelector<HTMLElement>(".tc-seg-icon")!.click();
		expect(s.sources()).toBe(1);
		expect(s.changes).toEqual([]);
		const lists = setUp("soon");
		lists.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		expect(lists.sources()).toBe(0);
	});

	it("puts the dot of an old source on the calendar, under the window too, red once its refresh failed", () => {
		const shown = (alert: CalendarAlert) => [...setUp("soon", alert).control.el.querySelectorAll(".tc-dot.is-shown")].map((dot) => dot.classList.contains("is-broken"));
		expect(shown("old")).toEqual([false, false]);
		expect(shown("broken")).toEqual([true, true]);
		expect(shown("none")).toEqual([]);
		const said = (alert: CalendarAlert) => setUp("soon", alert).control.el.querySelector(".tc-dot")!.getAttribute("aria-label");
		expect([said("old"), said("broken"), said("none")]).toEqual(["Out of date", "Refresh failed", null]);
	});

	it("holds Inbox alone in its window at Done, which it has no icon for, and turns on to Inbox and Soon from there", () => {
		const done = setUp("done");
		expect(done.wheel()).toBe(0.5);
		done.control.show("done");
		expect(done.changes).toEqual([]);
		done.tap(2);
		expect(done.changes).toEqual(["inbox"]);
	});
});
