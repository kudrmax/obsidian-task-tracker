// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { SourceStatus, SourceTone } from "../../core/application/contracts";
import { SourcesPopover } from "../../obsidian/ui/sources/SourcesPopover";

const NAMES = { google: "Google Calendar", iphone: "iPhone calendars", work: "Work calendar" } as const;
const SHORT = { google: "Google", iphone: "iPhone", work: "Work" } as const;

function status(source: SourceStatus["source"], tone: SourceTone): SourceStatus {
	return {
		source,
		kind: source === "google" ? "synced" : "exported",
		problem: tone === "broken" ? { kind: "noAnswer", seconds: 30 } : null,
		events: 0,
		updatedAt: null,
		updatedDay: null,
		updatedDate: null,
		detail: null,
		stale: tone === "old" || tone === "broken",
		used: tone !== "spare",
		tone,
		words: { name: NAMES[source], short: SHORT[source], sub: "Exported from iPhone", time: "5 Nov 20:21" },
	};
}

function open(statuses: readonly SourceStatus[]): HTMLElement {
	const anchor = document.body.appendChild(document.createElement("div"));
	SourcesPopover.open({ anchor, statuses, onRefresh: async () => {} });
	return document.querySelector<HTMLElement>(".tc-popover")!;
}

/** The window's lines top to bottom: a row as `name:tone`, the caption as its words. */
const lines = (popover: HTMLElement) =>
	[...popover.querySelectorAll<HTMLElement>(".tc-source-row, .tc-source-caption")].map((line) =>
		line.classList.contains("tc-source-caption") ? line.textContent : `${line.querySelector(".tc-source-name")!.textContent}:${[...line.classList].find((c) => c.startsWith("is-"))}`,
	);

afterEach(() => {
	document.body.innerHTML = "";
});

describe("SourcesPopover", () => {
	it("draws each row by its tone, in the order it is given, the spare ones under «Not in use»", () => {
		const popover = open([status("iphone", "plain"), status("work", "spare")]);
		expect(lines(popover)).toEqual(["iPhone calendars:is-plain", "Not in use", "Work calendar:is-spare"]);
	});

	it("puts no caption over a window whose rows are all in use", () => {
		const popover = open([status("google", "old"), status("iphone", "broken")]);
		expect(lines(popover)).toEqual(["Google Calendar:is-old", "iPhone calendars:is-broken"]);
	});

	it("puts the caption first when no row is in use, once however many spare rows follow", () => {
		const popover = open([status("google", "spare"), status("work", "spare")]);
		expect(lines(popover)).toEqual(["Not in use", "Google Calendar:is-spare", "Work calendar:is-spare"]);
	});

	it("says an orange time is out of date and a red one's refresh failed, and nothing of a grey one", () => {
		const popover = open([status("google", "old"), status("iphone", "broken"), status("work", "spare")]);
		const said = [...popover.querySelectorAll(".tc-source-time")].map((time) => time.getAttribute("aria-label"));
		expect(said).toEqual(["5 Nov 20:21, Out of date", "5 Nov 20:21, Refresh failed", null]);
	});

	it("keeps Refresh now last", () => {
		const popover = open([status("iphone", "plain"), status("work", "spare")]);
		expect(popover.lastElementChild?.classList.contains("tc-source-refresh")).toBe(true);
	});
});
