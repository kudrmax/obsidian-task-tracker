import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { E2EFixture } from "../../obsidian/e2e";
import type { Paths } from "./paths";

/**
 * The fixture: a copy of Max's real tasks file and settings, taken once and kept (`--refresh-fixture` takes it again), so
 * baselines stay comparable from run to run. Max's vault is only ever read. The settings lose Google's secrets (the
 * fixture's network stands in for Google); the project notes come as stubs with only their tag; the calendars are made
 * up for the fixture's day.
 */

const MAX_VAULT = join(homedir(), "Obsidian");

export interface Fixture {
	readonly tasksFile: string;
	readonly tasks: string;
	readonly settings: Record<string, unknown>;
	readonly e2e: E2EFixture;
	/** Vault paths of the project notes' stubs, with their text. */
	readonly notes: Readonly<Record<string, string>>;
	/** The phone's and the work calendar's files, by vault path. */
	readonly calendarFiles: Readonly<Record<string, string>>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (day: string, hh: number, mm = 0) => {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d, hh, mm);
};

function markdownFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name.startsWith(".")) return [];
		const path = join(dir, entry.name);
		return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
	});
}

function calendarsOf(day: string, now: Date): Pick<Fixture, "calendarFiles"> & { google: E2EFixture["google"] } {
	const iso = (d: Date) => d.toISOString();
	const tomorrow = localDay(new Date(at(day, 12).getTime() + 86_400_000));
	const google: E2EFixture["google"] = {
		calendars: [
			{ id: "e2e@example.com", summary: "Personal", backgroundColor: "#7986cb", primary: true },
			{ id: "team@example.com", summary: "Team", backgroundColor: "#33b679" },
		],
		events: {
			"e2e@example.com": [
				{ id: "g1", summary: "Breakfast with a friend", start: { dateTime: iso(at(day, 9)) }, end: { dateTime: iso(at(day, 10)) } },
				{ id: "g2", summary: "Gym", start: { dateTime: iso(at(day, 18, 30)) }, end: { dateTime: iso(at(day, 20)) } },
				{ id: "g3", summary: "Trip", start: { date: day }, end: { date: tomorrow } },
			],
			"team@example.com": [{ id: "t1", summary: "Planning", start: { dateTime: iso(at(day, 11)) }, end: { dateTime: iso(at(day, 12, 15)) } }],
		},
	};
	const file = (device: string | null, calendar: string, account: string, events: [string, number, number, number, number][]) =>
		JSON.stringify({
			exportedAt: iso(now),
			device,
			from: iso(at(day, 0)),
			to: iso(new Date(at(day, 0).getTime() + 30 * 86_400_000)),
			...(device === "iPhone" ? { validUntil: iso(new Date(now.getTime() + 5 * 86_400_000)) } : {}),
			calendars: [{ calendar, calendarId: `${calendar}-id`, account, color: "#ff9500" }],
			events: events.map(([title, h1, m1, h2, m2], i) => ({ id: `${calendar}-${i}`, title, start: iso(at(day, h1, m1)), end: iso(at(day, h2, m2)), allDay: false, calendar, calendarId: `${calendar}-id`, account, color: "#ff9500" })),
		});
	return {
		google,
		calendarFiles: {
			"calendar/iphone.json": file("iPhone", "Family", "iCloud", [["Call parents", 13, 0, 13, 30]]),
			"calendar/work.json": file(null, "Календарь", "Work", [["Design review", 15, 0, 16, 0], ["1:1", 16, 30, 17, 0]]),
		},
	};
}

/** Takes the fixture from Max's vault (read only) into `.e2e/fixture/`. */
export function takeFixture(p: Paths): void {
	const data = JSON.parse(readFileSync(join(MAX_VAULT, ".obsidian/plugins/task-calendar/data.json"), "utf8")) as Record<string, unknown> & { tasksFile?: string; google?: Record<string, unknown>; projectTag?: string };
	const tasksFile = data.tasksFile ?? "TODOs Tasks.md";
	const tasks = readFileSync(join(MAX_VAULT, tasksFile), "utf8");
	const settings = { ...data, google: { ...data.google, clientId: "e2e", clientSecret: "", refreshToken: "e2e" } };
	const tag = (data.projectTag ?? "#task_project").replace(/^#/, "");
	const notes: Record<string, string> = {};
	for (const file of markdownFiles(MAX_VAULT)) {
		if (statSync(file).size > 2_000_000) continue;
		if (new RegExp(`(^|[\\s#\\[,])${tag}\\b`).test(readFileSync(file, "utf8"))) notes[relative(MAX_VAULT, file)] = `---\ntags: [${tag}]\n---\n`;
	}
	/** The day the file was taken, at 14:20: a working afternoon, the same moment in every run. */
	const now = at(localDay(new Date()), 14, 20);
	const e2eNow = `${localDay(now)}T14:20`;
	const { google, calendarFiles } = calendarsOf(localDay(now), now);
	const fixture: Fixture = { tasksFile, tasks, settings, e2e: { now: e2eNow, google }, notes, calendarFiles };
	mkdirSync(p.fixture, { recursive: true });
	writeFileSync(join(p.fixture, "fixture.json"), JSON.stringify(fixture, null, 1));
}

export function fixture(p: Paths, refresh: boolean): Fixture {
	const file = join(p.fixture, "fixture.json");
	if (refresh || !existsSync(file)) takeFixture(p);
	return JSON.parse(readFileSync(file, "utf8")) as Fixture;
}
