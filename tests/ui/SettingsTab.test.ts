// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { App, Plugin } from "obsidian";
import type { GoogleAccount, WorkCalendarSetup } from "../../src/application/contracts";
import { SettingsServiceImpl } from "../../src/application/SettingsServiceImpl";
import { DEVICE_STATE_KEY, PluginSettings, type SettingsPersistence } from "../../src/infrastructure/PluginSettings";
import { DEFAULT_SETTINGS, sharedOf, type SharedSettings } from "../../src/settings";
import { TaskCalendarSettingsTab } from "../../src/ui/SettingsTab";

const FILE = ".obsidian/plugins/task-calendar/data.json";

/** data.json as Obsidian writes it, and the device's own storage. */
class Disk implements SettingsPersistence {
	text: string;
	saves = 0;
	readonly local = new Map<string, string>();

	constructor(file: unknown) {
		this.text = JSON.stringify(file, null, 2);
	}

	async loadData(): Promise<unknown> {
		return JSON.parse(this.text);
	}

	async saveData(data: unknown): Promise<void> {
		this.saves++;
		this.text = JSON.stringify(data, null, 2);
	}

	loadLocalStorage(key: string): unknown {
		const saved = this.local.get(key);
		return saved === undefined ? null : JSON.parse(saved);
	}

	saveLocalStorage(key: string, data: unknown): void {
		this.local.set(key, JSON.stringify(data));
	}
}

/** The file the tab starts from: the defaults, logged in to Google. */
const START: SharedSettings = {
	...sharedOf(DEFAULT_SETTINGS),
	google: { ...DEFAULT_SETTINGS.google, clientId: "id", clientSecret: "secret", refreshToken: "token" },
};

/** The file's text after a change: the start with `patch` over it, in the order the plugin writes the keys. */
function fileWith(patch: Partial<SharedSettings>): string {
	return JSON.stringify({ ...START, ...patch }, null, 2);
}

const loggedOut: GoogleAccount = {
	isLoggedIn: () => false,
	login: async () => "",
	logout: async () => undefined,
	listCalendars: async () => [],
	setShown: async () => undefined,
	isShown: () => true,
};
const work: WorkCalendarSetup = { scriptableLoader: () => "loader", export: () => undefined };

let disk: Disk;
let settings: PluginSettings;
let tab: TaskCalendarSettingsTab;

async function settled(): Promise<void> {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function open(file: unknown = START, google: GoogleAccount = loggedOut): Promise<void> {
	document.body.replaceChildren();
	disk = new Disk(file);
	settings = new PluginSettings(disk, FILE);
	await settings.load();
	tab = new TaskCalendarSettingsTab({} as App, {} as Plugin, { settings: new SettingsServiceImpl(settings), google, work });
	tab.display();
}

/** The tab's rows, then those of the page open over it. */
function rows(name: string): HTMLElement[] {
	return [tab.containerEl, ...document.querySelectorAll<HTMLElement>(".modal")]
		.flatMap((root) => [...root.querySelectorAll<HTMLElement>(".setting-item")]).filter((row) => row.querySelector(".setting-item-name")?.textContent === name);
}

/** Opens the page a row of More leads to. */
function page(name: string): HTMLElement {
	rows(name)[0].click();
	return document.querySelector<HTMLElement>(".modal")!;
}

function input(name: string, nth = 0): HTMLInputElement {
	return rows(name)[nth].querySelector<HTMLInputElement>("input, select")!;
}

function type(field: HTMLInputElement | HTMLSelectElement, value: string, event = "input"): void {
	field.value = value;
	field.dispatchEvent(new Event(event));
}

function press(label: string): void {
	const button = [...tab.containerEl.querySelectorAll<HTMLElement>("button, [aria-label]")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label);
	button!.click();
}

function levelRows(): HTMLElement[] {
	return [...tab.containerEl.querySelectorAll<HTMLElement>(".tc-level-row:not(.tc-preset-row)")];
}

function presetRows(): HTMLElement[] {
	return [...tab.containerEl.querySelectorAll<HTMLElement>(".tc-preset-row")];
}

function deviceState(): unknown {
	return disk.local.has(DEVICE_STATE_KEY) ? JSON.parse(disk.local.get(DEVICE_STATE_KEY)!) : null;
}

/** Typed into the field, the value counts at once and lands in data.json; nothing goes to the device. */
async function writes(change: () => void, patch: Partial<SharedSettings>): Promise<void> {
	change();
	const counted = sharedOf(settings.get());
	await settled();
	expect(disk.text).toBe(fileWith(patch));
	expect(JSON.stringify(counted, null, 2)).toBe(fileWith(patch));
	expect(deviceState()).toBeNull();
}

/** Typed into the field, nothing is written and nothing counts. */
async function rejects(change: () => void): Promise<void> {
	const before = disk.text;
	change();
	await settled();
	expect(disk.saves).toBe(0);
	expect(disk.text).toBe(before);
	expect(JSON.stringify(sharedOf(settings.get()), null, 2)).toBe(before);
	expect(deviceState()).toBeNull();
}

beforeEach(async () => {
	document.body.className = "";
	await open();
});

describe("the settings tab: the tasks file", () => {
	it("writes the path as typed, empty too", async () => {
		page("Tasks file");
		await writes(() => type(input("File path"), " Other.md "), { tasksFile: " Other.md " });
		await writes(() => type(input("File path"), ""), { tasksFile: "" });
	});

	it("writes a section's name as typed, empty too, keeping the other names", async () => {
		page("Tasks file");
		await writes(() => type(input("Now"), " Today "), { sections: { ...START.sections, now: " Today " } });
		await writes(() => type(input("Done"), ""), { sections: { ...START.sections, now: " Today ", done: "" } });
		for (const [label, key] of [["Inbox", "inbox"], ["Soon", "soon"], ["Backlog", "backlog"]] as const) {
			await open();
			page("Tasks file");
			await writes(() => type(input(label), "X"), { sections: { ...START.sections, [key]: "X" } });
		}
	});

	it("writes each marker as typed", async () => {
		const markers = [
			["Due date marker", "dueDateMarker"],
			["Slot marker", "slotMarker"],
			["Alarm marker", "alarmSlotMarker"],
			["Live Activity marker", "liveSlotMarker"],
			["No-reminder marker", "silentSlotMarker"],
			["Repeat marker", "repeatMarker"],
		] as const;
		for (const [label, key] of markers) {
			await open();
			page("Tasks file");
			expect(input(label).value).toBe(START[key]);
			await writes(() => type(input(label), " ✱"), { [key]: " ✱" });
		}
	});
});

describe("the settings tab: the priority levels", () => {
	it("renames a level trimmed, without drawing the rows anew", async () => {
		const prefix = levelRows()[0].querySelector<HTMLInputElement>(".tc-level-prefix")!;
		await writes(() => type(prefix, " high "), { priorities: [{ prefix: "high", color: "red" }, START.priorities[1]] });
		expect(levelRows()[0].querySelector(".tc-level-prefix")).toBe(prefix);
		expect(prefix.value).toBe(" high ");
	});

	it("adds the next free prefix in the first unused colour, and draws its row", async () => {
		await writes(() => press("Add priority"), { priorities: [...START.priorities, { prefix: "p3", color: "yellow" }] });
		expect(levelRows()).toHaveLength(3);
		await writes(() => press("Add priority"), { priorities: [...START.priorities, { prefix: "p3", color: "yellow" }, { prefix: "p4", color: "green" }] });
	});

	it("adds after a rename the rename kept", async () => {
		type(levelRows()[0].querySelector<HTMLInputElement>(".tc-level-prefix")!, "p3");
		await writes(() => press("Add priority"), { priorities: [{ prefix: "p3", color: "red" }, START.priorities[1], { prefix: "p4", color: "yellow" }] });
	});

	it("removes a level and draws the rows anew", async () => {
		await writes(() => levelRows()[0].querySelector<HTMLElement>("[aria-label='Delete level']")!.click(), { priorities: [START.priorities[1]] });
		expect(levelRows()).toHaveLength(1);
		expect(levelRows()[0].querySelector<HTMLInputElement>(".tc-level-prefix")!.value).toBe("p2");
	});

	it("recolours by a circle", async () => {
		await writes(() => levelRows()[1].querySelector<HTMLElement>("button[data-priority='blue']")!.click(), { priorities: [START.priorities[0], { prefix: "p2", color: "blue" }] });
		expect(levelRows()[1].querySelector("button[data-priority='blue']")!.className).toContain("is-on");
	});

	it("recolours by a code on leaving the field: any colour, a preset's shade in this theme as that preset", async () => {
		const code = () => levelRows()[0].querySelector<HTMLInputElement>(".tc-level-hex-input")!;
		expect(code().value).toBe("FF453A");
		type(code(), "#ff6a00");
		expect(disk.saves).toBe(0);
		await writes(() => code().dispatchEvent(new Event("blur")), { priorities: [{ prefix: "p1", color: "#FF6A00" }, START.priorities[1]] });
		disk.saves = 0;
		type(code(), "0a84ff");
		await writes(() => code().dispatchEvent(new Event("blur")), { priorities: [{ prefix: "p1", color: "blue" }, START.priorities[1]] });
	});

	it("takes a light preset's shade in the light theme as that preset", async () => {
		document.body.className = "theme-light";
		await open();
		const code = levelRows()[0].querySelector<HTMLInputElement>(".tc-level-hex-input")!;
		expect(code.value).toBe("FF3B30");
		type(code, "007AFF");
		await writes(() => code.dispatchEvent(new Event("blur")), { priorities: [{ prefix: "p1", color: "blue" }, START.priorities[1]] });
	});

	it("writes nothing for a wrong code or the same colour, and puts the code back", async () => {
		const code = levelRows()[0].querySelector<HTMLInputElement>(".tc-level-hex-input")!;
		await rejects(() => {
			type(code, "xyz");
			code.dispatchEvent(new Event("blur"));
		});
		expect(code.value).toBe("FF453A");
		await rejects(() => {
			type(code, "ff453a");
			code.dispatchEvent(new Event("blur"));
		});
	});

	it("recolours by the picker when it closes, not while it moves", async () => {
		const picker = levelRows()[0].querySelector<HTMLInputElement>(".tc-swatch-well-input")!;
		expect(picker.value).toBe("#ff453a");
		type(picker, "#123456");
		await settled();
		expect(disk.saves).toBe(0);
		await writes(() => picker.dispatchEvent(new Event("change")), { priorities: [{ prefix: "p1", color: "#123456" }, START.priorities[1]] });
	});
});

describe("the settings tab: the sections", () => {
	it("renames a preset trimmed", async () => {
		const name = presetRows()[1].querySelector<HTMLInputElement>(".tc-preset-name")!;
		await writes(() => type(name, " Noon "), { groups: { ...START.groups, presets: ["Morning", "Noon", "Evening"] } });
		expect(presetRows()[1].querySelector(".tc-preset-name")).toBe(name);
	});

	it("adds an empty preset and removes one, drawing the rows anew", async () => {
		await writes(() => press("Add preset"), { groups: { ...START.groups, presets: ["Morning", "Afternoon", "Evening", ""] } });
		expect(presetRows()).toHaveLength(4);
		await writes(() => presetRows()[0].querySelector<HTMLElement>("[aria-label='Delete preset']")!.click(), { groups: { ...START.groups, presets: ["Afternoon", "Evening", ""] } });
		expect(presetRows()).toHaveLength(3);
	});

	it("moves a level by its grip", async () => {
		const grip = levelRows()[0].querySelector<HTMLElement>(".tc-row-grip")!;
		await writes(() => {
			grip.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0, bubbles: true }));
			document.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientY: 10 }));
			document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientY: 10 }));
		}, { priorities: [START.priorities[1], START.priorities[0]] });
		expect(levelRows().map((row) => row.querySelector<HTMLInputElement>(".tc-level-prefix")!.value)).toEqual(["p2", "p1"]);
	});

	it("moves a preset by its grip", async () => {
		const grip = presetRows()[0].querySelector<HTMLElement>(".tc-row-grip")!;
		await writes(() => {
			grip.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0, bubbles: true }));
			document.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientY: 10 }));
			document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientY: 10 }));
		}, { groups: { ...START.groups, presets: ["Afternoon", "Evening", "Morning"] } });
	});

	it("writes No section's name, a blank one as the default", async () => {
		await writes(() => type(input("No section"), " Loose "), { groups: { ...START.groups, ungrouped: "Loose" } });
		await writes(() => type(input("No section"), "   "), { groups: { ...START.groups, ungrouped: "No section" } });
	});
});

describe("the settings tab: the cards and the timeline", () => {
	it("writes the card's height and the gap as the slider moves", async () => {
		await writes(() => type(input("Card height"), "30"), { cardHeight: 30 });
		await writes(() => type(input("Gap between cards"), "0"), { cardHeight: 30, cardGap: 0 });
	});

	it("writes a count of zero or more, and nothing for anything else", async () => {
		const pages = { "Long press delay": "Day and timeline", "Scroll to hour": "Day and timeline", "Stale after": "Calendars" } as const;
		const opened = async (label: keyof typeof pages) => {
			await open();
			page(pages[label]);
		};
		for (const label of Object.keys(pages) as (keyof typeof pages)[]) {
			for (const bad of ["", "  ", "-1", "abc", "Infinity", "1,5"]) {
				await opened(label);
				await rejects(() => type(input(label), bad));
			}
		}
		await opened("Long press delay");
		await writes(() => type(input("Long press delay"), " 300 "), { longPressMs: 300 });
		await opened("Scroll to hour");
		await writes(() => type(input("Scroll to hour"), "0"), { scrollToHour: 0 });
		await opened("Stale after");
		await writes(() => type(input("Stale after"), "2.5"), { staleAfterMinutes: 2.5 });
		await opened("Stale after");
		await writes(() => type(input("Stale after"), "1e3"), { staleAfterMinutes: 1000 });
	});

	it("writes the hour the day starts at as the dropdown chose it", async () => {
		page("Day and timeline");
		expect(input("Day starts at").value).toBe("5");
		await writes(() => type(input("Day starts at"), "0", "change"), { dayStartHour: 0 });
		await writes(() => type(input("Day starts at"), "23", "change"), { dayStartHour: 23 });
	});

	it("writes zoom levels that read, the old text with steps too, and nothing for the rest", async () => {
		page("Day and timeline");
		expect(input("Zoom levels").value).toBe("28, 56, 112, 224");
		for (const bad of ["", "28, x", "0", "28:", "28,,56"]) {
			await open();
			page("Day and timeline");
			await rejects(() => type(input("Zoom levels"), bad));
		}
		await open();
		page("Day and timeline");
		await writes(() => type(input("Zoom levels"), " 40 , 80"), { zoomLevels: [{ hourPx: 40 }, { hourPx: 80 }] });
		await writes(() => type(input("Zoom levels"), "28:60, 56:30"), { zoomLevels: [{ hourPx: 28 }, { hourPx: 56 }] });
	});
});

describe("the settings tab: the calendar sources", () => {
	beforeEach(() => {
		page("Calendars");
	});

	it("writes Google's client id and keeps the secret and the token", async () => {
		expect(input("Client id").value).toBe("id");
		await writes(() => type(input("Client id"), " other "), { google: { ...START.google, clientId: " other " } });
	});

	it("shows the saved secret in a password field and writes what is typed, keeping the token", async () => {
		const secret = input("Client secret");
		expect(secret.type).toBe("password");
		expect(secret.value).toBe("secret");
		await writes(() => type(secret, "secret2"), { google: { ...START.google, clientSecret: "secret2" } });
	});

	it("writes the refresh interval as a count", async () => {
		await rejects(() => type(input("Refresh interval"), "-5"));
		await writes(() => type(input("Refresh interval"), "0"), { google: { ...START.google, refreshSeconds: 0 } });
	});

	it("writes the work calendar's path as typed and its calendars split at the commas", async () => {
		await writes(() => type(input("File path"), "cal.json"), { workCalendarFile: "cal.json" });
		await writes(() => type(input("Calendar titles"), " Work ,, Team ,"), { workCalendarFile: "cal.json", workCalendarTitles: ["Work", "Team"] });
		await open({ ...START, workCalendarTitles: ["A", "B"] });
		page("Calendars");
		expect(input("Calendar titles").value).toBe("A, B");
	});
});

describe("the settings tab: the order", () => {
	function headings(root: HTMLElement): (string | null)[] {
		return [...root.querySelectorAll(".setting-item-heading > .setting-item-info > .setting-item-name")].map((name) => name.textContent);
	}

	it("puts what is changed often first and the set-up-once part on pages under More", () => {
		expect(headings(tab.containerEl)).toEqual(["Priorities", "Labels", "Sections", "Cards", "More"]);
		for (const name of ["Calendars", "Day and timeline", "Tasks file"]) expect(rows(name)).toHaveLength(1);
		for (const name of ["Account", "Client id", "Day starts at", "Scroll to hour", "Due date marker", "Long press delay", "Zoom levels", "Stale after"]) expect(rows(name)).toHaveLength(0);
	});

	it("opens a page over the tab with its title, and draws the tab anew once it closes", async () => {
		const opened = page("Tasks file");
		expect(opened.querySelector(".modal-title")!.textContent).toBe("Tasks file");
		await writes(() => type(input("File path"), "Other.md"), { tasksFile: "Other.md" });
		expect(rows("Tasks file")[0].querySelector(".setting-item-description")!.textContent).toBe(START.tasksFile);
		opened.querySelector<HTMLElement>(".modal-content")!.parentElement!.remove();
		expect(rows("Client id")).toHaveLength(0);
	});

	it("shows the account and its calendars on the Calendars page only, and draws the page anew on logging out", async () => {
		let loggedIn = true;
		const google: GoogleAccount = {
			...loggedOut,
			isLoggedIn: () => loggedIn,
			logout: async () => {
				loggedIn = false;
			},
			listCalendars: async () => [{ id: "a", title: "Timetable", color: "#3366ff" }, { id: "b", title: "Deadlines", color: "#ff3300" }],
		};
		await open(START, google);
		await settled();
		expect(rows("Timetable")).toHaveLength(0);
		page("Calendars");
		await settled();
		expect(rows("Shown calendars")).toHaveLength(1);
		expect(rows("Timetable")).toHaveLength(1);
		rows("Account")[0].querySelector<HTMLElement>("button")!.click();
		await settled();
		expect(rows("Timetable")).toHaveLength(0);
		expect(rows("Account")[0].querySelector(".setting-item-description")!.textContent).toContain("Not logged in");
	});

	it("tells where to set the OAuth client up while there is none", async () => {
		const description = () => rows("Account")[0].querySelector(".setting-item-description")!.textContent;
		page("Calendars");
		expect(description()).toContain("Opens the browser");
		await open({ ...START, google: { ...START.google, clientId: "" } });
		page("Calendars");
		expect(description()).toContain("client id and secret below");
	});
});
