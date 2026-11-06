import { describe, expect, it } from "vitest";
import type { PriorityLevel, SecretField } from "../../src/application/contracts";
import { SettingsServiceImpl } from "../../src/application/SettingsServiceImpl";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

function service(start: Partial<TaskCalendarSettings> = {}) {
	const store = new FakeSettingsStore({ ...DEFAULT_SETTINGS, ...start });
	let writes = 0;
	store.onChange(() => writes++);
	return { svc: new SettingsServiceImpl(store), now: () => store.get(), writes: () => writes };
}

describe("the form's answers", () => {
	it("offers every hour of the day for its start, and says whether Log in has a client id to go with", () => {
		expect(service().svc.form().dayStartHours).toEqual(Array.from({ length: 24 }, (_, h) => h));
		expect(service().svc.form().googleClientReady).toBe(false);
		expect(service({ google: { ...DEFAULT_SETTINGS.google, clientId: "id" } }).svc.form().googleClientReady).toBe(true);
	});

	it("reads a colour code typed and left: none for no colour or the one the level or label has", () => {
		const shades = { red: "#FF453A", orange: "#FF9F0A", yellow: "#FFD60A", green: "#30D158", teal: "#40C8E0", blue: "#0A84FF" } as const;
		const { svc } = service({ priorities: [{ prefix: "p1", color: "red" }], labels: [{ name: "A", color: "#123456" }] });
		expect(svc.typedColour("level", 0, "#ff453a", shades)).toBeNull();
		expect(svc.typedColour("level", 0, "0a84ff", shades)).toBe("blue");
		expect(svc.typedColour("level", 0, "nope", shades)).toBeNull();
		expect(svc.typedColour("label", 0, "#123456", shades)).toBeNull();
		expect(svc.typedColour("label", 0, "#654321", shades)).toBe("#654321");
	});
});

describe("editing the labels", () => {
	it("writes a name typed with spaces as one word of a tag, adds one in a colour no label has", async () => {
		const { svc, now } = service({ labels: [{ name: "Важное", color: "red" }] });
		await svc.renameLabel(0, " Важное и срочное ");
		await svc.addLabel();
		expect(now().labels).toEqual([{ name: "Важное_и_срочное", color: "red" }, { name: "Label_2", color: "orange" }]);
		await svc.moveLabel(1, 0);
		await svc.recolourLabel(0, "#123456");
		await svc.removeLabel(1);
		expect(now().labels).toEqual([{ name: "Label_2", color: "#123456" }]);
	});

	it("writes a tag folder of one word only", async () => {
		const { svc, now } = service();
		await svc.setLabelTag(" tags ");
		await svc.setLabelTag("two words");
		expect(now().labelTag).toBe("tags");
	});
});

describe("editing the priority levels", () => {
	const DEFAULT: readonly PriorityLevel[] = [
		{ prefix: "p1", color: "red" },
		{ prefix: "p2", color: "orange" },
	];

	it("keeps a prefix just typed when a level is added or removed right after", async () => {
		const added = service({ priorities: DEFAULT });
		await added.svc.renameLevel(0, " high ");
		await added.svc.addLevel();
		expect(added.now().priorities.map((l) => l.prefix)).toEqual(["high", "p2", "p3"]);
		const removed = service({ priorities: DEFAULT });
		await removed.svc.renameLevel(0, "high");
		await removed.svc.removeLevel(1);
		expect(removed.now().priorities).toEqual([{ prefix: "high", color: "red" }]);
	});

	it("adds the next free prefix in the first unused colour, and recolours a level", async () => {
		const { svc, now } = service({ priorities: [{ prefix: "p3", color: "red" }] });
		await svc.addLevel();
		expect(now().priorities[1]).toEqual({ prefix: "p2", color: "orange" });
		await svc.recolourLevel(1, "blue");
		expect(now().priorities[1].color).toBe("blue");
		await svc.recolourLevel(1, "#123456");
		expect(now().priorities[1].color).toBe("#123456");
	});

	it("adds in the first colour when every colour is taken", async () => {
		const all = (["red", "orange", "yellow", "green", "teal", "blue"] as const).map((color, i) => ({ prefix: `p${i + 1}`, color }));
		const { svc, now } = service({ priorities: all });
		await svc.addLevel();
		expect(now().priorities[6]).toEqual({ prefix: "p7", color: "red" });
	});
});

describe("moving a priority level", () => {
	it("puts the level at its new place, the others keeping their order", async () => {
		const levels = [
			{ prefix: "p1", color: "red" },
			{ prefix: "p2", color: "orange" },
			{ prefix: "p3", color: "blue" },
		] as const;
		const { svc, now } = service({ priorities: [...levels] });
		await svc.moveLevel(2, 0);
		expect(now().priorities).toEqual([levels[2], levels[0], levels[1]]);
		await svc.moveLevel(0, 2);
		expect(now().priorities).toEqual([...levels]);
	});
});

describe("editing the section presets", () => {
	const presets = (names: string[]) => ({ groups: { ...DEFAULT_SETTINGS.groups, presets: names } });

	it("move reorders", async () => {
		const { svc, now } = service(presets(["Morning", "Afternoon", "Evening"]));
		await svc.movePreset(2, 0);
		expect(now().groups.presets).toEqual(["Evening", "Morning", "Afternoon"]);
		await svc.movePreset(0, 2);
		expect(now().groups.presets).toEqual(["Morning", "Afternoon", "Evening"]);
	});

	it("add appends an empty preset", async () => {
		const { svc, now } = service(presets(["Morning"]));
		await svc.addPreset();
		expect(now().groups.presets).toEqual(["Morning", ""]);
	});

	it("remove drops one", async () => {
		const { svc, now } = service(presets(["Morning", "Afternoon"]));
		await svc.removePreset(0);
		expect(now().groups.presets).toEqual(["Afternoon"]);
	});

	it("rename trims and keeps the others, and No section's name", async () => {
		const { svc, now } = service({ groups: { presets: ["Morning", "Afternoon"], ungrouped: "Loose" } });
		await svc.renamePreset(1, " Вечер ");
		expect(now().groups).toEqual({ presets: ["Morning", "Вечер"], ungrouped: "Loose" });
	});
});

describe("SettingsServiceImpl", () => {
	it("shows the tab its fields, the texts as the fields hold them, and no secret", () => {
		const google = { ...DEFAULT_SETTINGS.google, clientId: "id", clientSecret: "secret", refreshToken: "token" };
		const form = service({ google, workCalendarTitles: ["A", "B"] }).svc.form();
		expect(form).not.toHaveProperty("workCalendars");
		expect(form).toMatchObject({ googleClientId: "id", refreshSeconds: 60, ungrouped: "No section", presets: ["Morning", "Afternoon", "Evening"] });
		expect(form.markers).toEqual({ dueDateMarker: "📅", slotMarker: "⏰", alarmSlotMarker: "🚨", liveSlotMarker: "📌", silentSlotMarker: "🔕", repeatMarker: "🔁", collapsedMarker: "📁" });
		expect(JSON.stringify(form)).not.toMatch(/secret|token/);
	});

	it("writes a count of zero or more and nothing for any other text", async () => {
		const { svc, now, writes } = service();
		for (const bad of ["", " ", "-1", "abc", "Infinity", "NaN"]) await svc.setCount("longPressMs", bad);
		expect(writes()).toBe(0);
		await svc.setCount("longPressMs", " 0 ");
		await svc.setCount("scrollToHour", "7");
		await svc.setCount("staleAfterMinutes", "2.5");
		await svc.setCount("refreshSeconds", "0");
		expect(now()).toMatchObject({ longPressMs: 0, scrollToHour: 7, staleAfterMinutes: 2.5, google: { ...DEFAULT_SETTINGS.google, refreshSeconds: 0 } });
	});

	it("writes a blank No section as the default, any other name trimmed", async () => {
		const { svc, now } = service();
		await svc.setUngrouped(" Loose ");
		expect(now().groups.ungrouped).toBe("Loose");
		await svc.setUngrouped("  ");
		expect(now().groups.ungrouped).toBe("No section");
	});

	it("writes names, paths and marks as typed", async () => {
		const { svc, now } = service();
		await svc.setTasksFile("");
		await svc.setSection("now", " Today ");
		await svc.setMarker("repeatMarker", "↻");
		await svc.setWorkCalendarFile("w.json");
		expect(now()).toMatchObject({ tasksFile: "", sections: { ...DEFAULT_SETTINGS.sections, now: " Today " }, repeatMarker: "↻", workCalendarFile: "w.json" });
	});

	it("puts the saved secret in its field and saves what is typed, keeping the rest of Google's", async () => {
		const google = { ...DEFAULT_SETTINGS.google, clientId: "id", clientSecret: "secret", refreshToken: "token" };
		const { svc, now } = service({ google });
		let shown = "";
		let typed: (value: string) => void = () => undefined;
		const field: SecretField = { setValue: (value) => void (shown = value), onChange: (listener) => void (typed = listener) };
		svc.bindClientSecret(field);
		expect(shown).toBe("secret");
		typed("other");
		await Promise.resolve();
		expect(now().google).toEqual({ ...google, clientSecret: "other" });
		await svc.setGoogleClientId("id2");
		expect(now().google).toEqual({ ...google, clientSecret: "other", clientId: "id2" });
	});

	it("writes the day's start as given", async () => {
		const { svc, now } = service();
		await svc.setDayStartHour(0);
		expect(now().dayStartHour).toBe(0);
	});
});

describe("reading a colour code", () => {
	const SHADES = { red: "#FF453A", orange: "#FF9F0A", yellow: "#FFD60A", green: "#30D158", teal: "#40C8E0", blue: "#0A84FF" } as const;

	it("reads a preset's own shade as that preset, any other code as itself, and nothing for text that is no colour", () => {
		const { svc } = service();
		expect(svc.colourOf("ff453a", SHADES)).toBe("red");
		expect(svc.colourOf(" #0a84ff ", SHADES)).toBe("blue");
		expect(svc.colourOf("123456", SHADES)).toBe("#123456");
		expect(svc.colourOf("zz", SHADES)).toBeNull();
	});
});
