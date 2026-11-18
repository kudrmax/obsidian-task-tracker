import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { agentFor, composeAgent } from "../../agent/compose";
import { runProgram } from "../../agent/main";
import type { AgentReads } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";

/** Wednesday, 18 November 2026, 13:05: the day starts at 5, the plugin's default. */
export const NOW = new Date(2026, 10, 18, 13, 5);
export const T = "2026-11-18";
export const clockAt = (at: Date): Clock => ({ now: () => at });

/**
 * Max's kind of file: tasks in every place, a task dated three days ahead in `## Soon`, an empty section, a folded task
 * with a deep step, subtasks, a repeat, labels and a priority, a task of two projects, projects with a subproject, a folder
 * and a done project, a slot that has started, a slot at 00:30 after midnight, a slot on a day other than its due date.
 */
export const TASKS = [
	"## Inbox",
	"",
	"- [ ] Idea for the report 🗂️ Отчёты",
	"",
	"## Projects",
	"",
	"- Отчёты",
	"\t- Квартальный",
	"- Архив 🗃️",
	"\t- Старое",
	"- Ремонт",
	"- Самолёт",
	"",
	"## Now",
	"",
	"- [ ] p1 Standup ⏰ 2026-11-18 10:00-10:30",
	"- [ ] Late call ⏰ 2026-11-19 00:30-01:00",
	"- [/] Write report 🗂️ Отчёты 🗂️ Ремонт #label/Focus",
	"\tKeep it short.",
	"### Evening",
	"- [ ] Prepare talk 📁",
	"\t- [ ] Slides",
	"\t\t- [ ] Gather numbers",
	"\t\t- [ ] Draw charts",
	"\t- [x] Book room",
	"- [ ] Water plants 📅 2026-11-18 🔁 every 3 days",
	"### Later",
	"",
	"## Soon",
	"",
	"- [ ] Undated 🗂️ Квартальный",
	"- [ ] Saturday thing 📅 2026-11-21",
	"- [ ] Slotted sunday 📅 2026-11-20 ⏰ 2026-11-22 09:00-10:00",
	"### Morning",
	"",
	"## Backlog",
	"",
	"- [ ] Someday 🗂️ Старое",
	"",
	"## Done",
	"",
	"- [x] Old report 🗂️ Отчёты",
	"- [x] Flew 🗂️ Самолёт",
	"",
].join("\n");

export const SETTINGS = JSON.stringify(
	{
		labels: [
			{ name: "Focus", color: "blue" },
			{ name: "Not_now", color: "clear" },
		],
		assistant: { model: "claude", timeoutSeconds: 120, prompts: {}, models: {}, options: { bestTask: { label: "Focus", skip: "Not_now" } } },
		google: { clientId: "", clientSecret: "secret-never-read", refreshToken: "token-never-read", calendarIds: [], refreshSeconds: 60 },
	},
	null,
	2,
);

const at = (hour: number, minute = 0, day = 18) => new Date(2026, 10, day, hour, minute).toISOString();
export const WORK = JSON.stringify({
	exportedAt: at(12),
	device: "iPhone",
	events: [
		{ id: "s", title: "Planning", start: at(9), end: at(9, 30), allDay: false, calendar: "Work" },
		{ id: "r", title: "Review", start: at(15), end: at(16), allDay: false, calendar: "Work" },
		{ id: "h", title: "Offsite", start: new Date(Date.UTC(2026, 10, 18)).toISOString(), end: new Date(Date.UTC(2026, 10, 19)).toISOString(), allDay: true, calendar: "Work" },
	],
});

/** A vault in a fresh temporary folder: the tasks file, the plugin's data.json and the work calendar, at the plugin's paths. */
export function makeVault(files: { readonly tasks?: string | null; readonly settings?: string | null; readonly work?: string | null } = {}): string {
	const vault = mkdtempSync(join(tmpdir(), "task-calendar-agent-"));
	const write = (path: string, text: string | null | undefined) => {
		if (text === null || text === undefined) return;
		mkdirSync(dirname(join(vault, path)), { recursive: true });
		writeFileSync(join(vault, path), text);
	};
	write("TODOs Tasks.md", files.tasks === undefined ? TASKS : files.tasks);
	write(".obsidian/plugins/task-calendar/data.json", files.settings === undefined ? SETTINGS : files.settings);
	write("calendar/work.json", files.work === undefined ? WORK : files.work);
	return vault;
}

/** Every file of the vault, by path, with its bytes as text. */
export function snapshotOf(vault: string): Record<string, string> {
	const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
	return Object.fromEntries(walk(vault).map((path) => [relative(vault, path), readFileSync(path, "latin1")]));
}

/** The program's answer to a command line over `vault` at `now`: its JSON, read back, and its exit code. */
export async function run(vault: string, argv: readonly string[], now: Date = NOW): Promise<{ readonly answer: any; readonly code: number }> {
	const { text, code } = await runProgram([...argv, "--vault", vault], agentFor(clockAt(now)));
	return { answer: JSON.parse(text), code };
}

/** The program's answers over `vault`, as `core.agent`. */
export function agentOver(vault: string, now: Date = NOW, subprojects = true): Promise<AgentReads> {
	return composeAgent({ vault, subprojects, clock: clockAt(now) });
}
