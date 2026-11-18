import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReadOnlyTaskFile, settingsAt } from "../../agent/nodePorts";
import { makeVault, run, SETTINGS, snapshotOf } from "./vault";

/** The program reads only: whatever it is asked, Max's files stay byte for byte (agent CLI spec, «Read only, for sure»). */

/** A file the plugin would tidy at once: a past slot, a closed task in Now, a past due date, a Soon task whose day came. */
const UNTIDY = [
	"## Inbox",
	"",
	"- [ ] Dated in Inbox 📅 2026-11-25",
	"",
	"## Now",
	"",
	"- [x] Closed in Now",
	"- [ ] Yesterday's slot ⏰ 2026-11-17 10:00-11:00",
	"- [ ] Overdue 📅 2026-11-10",
	"",
	"## Soon",
	"",
	"- [ ] Today's 📅 2026-11-18",
	"",
	"## Done",
	"",
].join("\n");

const COMMANDS: readonly (readonly string[])[] = [
	["today"],
	["day", "tomorrow"],
	["day", "-3"],
	["week", "this"],
	["week", "next"],
	["soon"],
	["inbox"],
	["backlog"],
	["all"],
	["projects"],
	["search", "slot"],
	["help"],
	["today", "--no-project"],
];

describe("every command", () => {
	it("leaves the tasks file, data.json and the calendars as they were, byte for byte", async () => {
		const vault = makeVault({ tasks: UNTIDY });
		const before = snapshotOf(vault);
		for (const argv of COMMANDS) {
			const { code } = await run(vault, argv);
			expect({ argv, code }).toEqual({ argv, code: 0 });
		}
		const ref = (await run(vault, ["all"])).answer.tasks[0].ref;
		await run(vault, ["task", ref]);
		expect(snapshotOf(vault)).toEqual(before);
	});

	it("answers over the file as the plugin tidies it: the reads see it tidied, the disk does not", async () => {
		const vault = makeVault({ tasks: UNTIDY });
		const today = (await run(vault, ["today"])).answer;
		expect(today.list.sections.flatMap((s: { tasks: { title: string }[] }) => s.tasks.map((t) => t.title))).toEqual(["Today's", "Yesterday's slot", "Overdue"]);
		expect((await run(vault, ["search", "closed"])).answer.groups).toMatchObject([{ list: "done", tasks: [{ title: "Closed in Now", place: "done" }] }]);
		expect((await run(vault, ["day", "2026-11-25"])).answer.list.sections[0].tasks).toMatchObject([{ title: "Dated in Inbox", place: "day" }]);
		expect(readFileSync(join(vault, "TODOs Tasks.md"), "utf8")).toBe(UNTIDY);
	});
});

describe("task <ref>'s stored line", () => {
	it("is the section and the line as the disk has them, not the copy tidied in memory", async () => {
		const file = ["## Now", "", "- [ ] Today's own", "", "## Soon", "", "- [ ] Old thing 📅 2026-11-10", "\t- [ ] Its step", "", "## Done", ""].join("\n");
		const vault = makeVault({ tasks: file });
		const today = (await run(vault, ["today"])).answer;
		const old = today.list.sections.flatMap((s: { tasks: { title: string; ref: string; subtasks?: { ref: string }[] }[] }) => s.tasks).find((t: { title: string }) => t.title === "Old thing");
		expect(old).toMatchObject({ place: "today", date: "2026-11-18" });
		expect((await run(vault, ["task", old.ref])).answer.stored).toEqual({ section: "Soon", line: "- [ ] Old thing 📅 2026-11-10" });
		expect((await run(vault, ["task", old.subtasks[0].ref])).answer.stored).toEqual({ section: "Soon", line: "\t- [ ] Its step" });
		expect(readFileSync(join(vault, "TODOs Tasks.md"), "utf8")).toBe(file);
	});

	it("of a line the tidy makes, not on disk yet, says it is pending", async () => {
		const file = ["## Now", "", "- [x] Water 📅 2026-11-17 🔁 every day", "", "## Done", ""].join("\n");
		const vault = makeVault({ tasks: file });
		const next = (await run(vault, ["all"])).answer.tasks.find((t: { title: string }) => t.title === "Water");
		const stored = (await run(vault, ["task", next.ref])).answer.stored;
		expect(stored).toMatchObject({ pending: true, note: expect.stringMatching(/not in the file yet/) });
	});
});

describe("the ports", () => {
	it("the tasks file keeps a tidy in memory and never creates a file", async () => {
		const vault = makeVault({ tasks: "## Now\n\n- [ ] A\n" });
		const file = new ReadOnlyTaskFile(join(vault, "TODOs Tasks.md"));
		await file.write((text) => `${text}- [ ] B\n`);
		expect(await file.read()).toBe("## Now\n\n- [ ] A\n- [ ] B\n");
		expect(readFileSync(join(vault, "TODOs Tasks.md"), "utf8")).toBe("## Now\n\n- [ ] A\n");
		await expect(file.create()).rejects.toThrow(/reads only/);
		expect(await new ReadOnlyTaskFile(join(vault, "missing.md")).read()).toBeNull();
	});

	it("the settings are read as the plugin reads them and never written", async () => {
		const vault = makeVault();
		const settings = await settingsAt(join(vault, ".obsidian/plugins/task-calendar/data.json"));
		expect(settings.get().labels.map((l) => l.name)).toEqual(["Focus", "Not_now"]);
		await expect(settings.update({ dayStartHour: 3 })).rejects.toThrow(/reads only/);
		expect(readFileSync(join(vault, ".obsidian/plugins/task-calendar/data.json"), "utf8")).toBe(SETTINGS);
	});
});
