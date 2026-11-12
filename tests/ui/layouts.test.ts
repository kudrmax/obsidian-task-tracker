// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { type DropColumn, viewLayout, type ViewMode } from "../../core/application/contracts";
import { DemoTaskService } from "../fakes/DemoTaskService";
import { GestureArbiter } from "../../obsidian/ui/gestures";
import type { FunnelListDeps } from "../../obsidian/ui/layouts/FunnelLists";
import type { LayoutHost } from "../../obsidian/ui/layouts/LayoutHost";
import { mountLayout } from "../../obsidian/ui/layouts/mountLayout";
import { ProjectsListDrop } from "../../obsidian/ui/projects/ProjectDrops";
import { ProjectTasks } from "../../obsidian/ui/projects/ProjectTasks";
import { EdgeTrack } from "../../obsidian/ui/ScreenTracks";

const lists: FunnelListDeps = {
	items: () => [],
	day: () => "2026-11-12",
	sectionsOf: () => null,
	listSections: () => [],
	naming: () => null,
	entry: () => null,
	plate: () => "No tasks",
	emptyLabel: () => "No tasks",
	openAtEnd: () => undefined,
	openIn: () => undefined,
	renaming: () => null,
	header: () => undefined,
	ungroupedName: () => "No section",
	card: () => undefined,
	titleDrop: () => null,
	tap: () => undefined,
};

/** A screen as a layout sees it: the day's title and the timeline at the root, before the fade. */
function screen(mode: ViewMode, note = false) {
	const root = document.createElement("div");
	root.className = "task-calendar";
	document.body.appendChild(root);
	const nav = document.createElement("div");
	nav.className = "tc-head tc-day-nav";
	const title = document.createElement("button");
	nav.appendChild(title);
	const timeline = document.createElement("div");
	timeline.className = "tc-right";
	const fade = document.createElement("div");
	fade.className = "tc-fade";
	root.append(nav, timeline, fade);
	const layout = viewLayout(mode, note, (list: DropColumn) => (list === "day" ? null : list));
	const tasks = new DemoTaskService();
	const host: LayoutHost = {
		root,
		shared: {
			nav,
			dayTitle: title,
			timeline,
			place: (navIn, timelineIn) => {
				if (navIn) navIn.appendChild(nav);
				else root.insertBefore(nav, fade);
				if (timelineIn) timelineIn.appendChild(timeline);
				else root.insertBefore(timeline, fade);
			},
		},
		lists,
		ribbon: {
			place: () => "calendar",
			day: () => "2026-11-12",
			stepFunnel: () => null,
			dayTrack: () => new EdgeTrack([], 0),
			arrive: () => undefined,
			follow: () => undefined,
			done: () => [],
			doneCard: () => undefined,
		},
		arbiter: new GestureArbiter(),
		listName: (column) => column,
		dayName: () => "Today",
		view: () => tasks.firstView(true, note),
		share: () => 0.5,
		saveShare: () => undefined,
		stageWidth: () => 1000,
		projectsList: (area) => {
			const list = new ProjectTasks(area, {});
			return { list, drop: new ProjectsListDrop(list, area, { reorders: () => false, takesAt: () => false, plusTakesAt: () => false, node: () => null }) };
		},
		projectsView: () => null,
		tap: () => undefined,
	};
	return { root, nav, timeline, mounted: mountLayout(host, layout) };
}

describe("the view modes' layouts (spec 2026-11-12-projects-view-rework)", () => {
	it("mounts the ribbon alone with pages to swipe; its place classes go with it, the shared parts stay on the screen", () => {
		const s = screen("twoColumns");
		expect(s.mounted.track).not.toBeNull();
		s.mounted.showPlace("soon", false);
		expect(s.root.classList.contains("is-lists")).toBe(true);
		expect(s.root.querySelector(":scope > .tc-inbox")).not.toBeNull();
		s.mounted.destroy();
		expect([...s.root.classList].filter((c) => c.startsWith("is-"))).toEqual([]);
		expect(s.root.querySelector(".tc-inbox, .tc-soon, .tc-left, .tc-done")).toBeNull();
		expect(s.nav.parentElement).toBe(s.root);
		expect(s.timeline.parentElement).toBe(s.root);
	});

	it.each(["allColumns", "rows", "byProject"] as const)("%s stands still: its own stage, no swipe, no ribbon classes", (mode) => {
		const s = screen(mode);
		expect(s.mounted.track).toBeNull();
		s.mounted.showPlace("inbox", true);
		expect(s.root.classList.contains("is-inbox")).toBe(false);
		const stage = s.root.querySelector(":scope > .tc-stage");
		expect(stage).not.toBeNull();
		expect(stage!.contains(s.timeline)).toBe(true);
		expect(s.mounted.timelineShows()).toBe(true);
		s.mounted.destroy();
		expect(s.root.querySelector(".tc-stage")).toBeNull();
		expect(s.timeline.parentElement).toBe(s.root);
	});

	it("all columns: Inbox over Backlog, Soon and the day's list each a place to drop, the day's title over the day's list", () => {
		const s = screen("allColumns");
		expect(s.mounted.drops().map((drop) => ("column" in drop ? drop.column : "projects"))).toEqual(["inbox", "backlog", "soon", "day"]);
		expect(s.root.querySelector(".tc-stage-col.is-day")!.contains(s.nav)).toBe(true);
		expect(s.mounted.dayLane()).not.toBeNull();
	});

	it("rows: the stages stacked in the core's order, the day's title over the timeline, no day lane to slide", () => {
		const s = screen("rows");
		const labels = [...s.root.querySelectorAll(".tc-row-label")];
		s.mounted.render("replace");
		expect(labels.map((label) => label.textContent)).toEqual(["inbox", "backlog", "soon", "Today"]);
		expect(s.root.querySelector(".tc-stage-col.is-timeline")!.contains(s.nav)).toBe(true);
		expect(s.mounted.dayLane()).toBeNull();
		expect(s.mounted.scroller()).toBeNull();
	});

	it("a note's rows: no timeline, no day's title, the stack scrolls the block", () => {
		const s = screen("rows", true);
		expect(s.mounted.timelineShows()).toBe(false);
		expect(s.nav.parentElement).toBe(s.root);
		expect(s.mounted.scroller()).toBe(s.root.querySelector(".tc-rows-stack"));
	});

	it("by project: the node's list is the one place to drop", () => {
		const s = screen("byProject");
		expect(s.mounted.projects()).not.toBeNull();
		expect(s.mounted.drops()).toHaveLength(1);
		expect(s.mounted.listOf("inbox")).toBeNull();
	});
});
