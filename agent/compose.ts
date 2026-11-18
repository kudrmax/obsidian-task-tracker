import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { composeCore } from "../core/application/composeCore";
import type { AgentReads } from "../core/application/contracts";
import { tasksFilePath } from "../core/application/documentText";
import { SETTINGS_FILE } from "../core/application/PhoneDoor";
import { type Clock, systemClock } from "../core/application/ports";
import { type ProgramOptions, runProgram } from "./main";
import { calendarFileAt, NO_NOTES, NO_TICKS, nodeTimers, ReadOnlyTaskFile, runProjectsScreen, settingsAt } from "./nodePorts";

/** Where the program reads: the vault, the Subprojects tick, and the clock (the system's; a test's fixed one). */
export interface AgentHost {
	readonly vault: string;
	readonly subprojects: boolean;
	readonly clock?: Clock;
}

/** The vault the program reads when none is named and it sits in no vault. */
export const DEFAULT_VAULT = join(homedir(), "Obsidian");

/** The vault the program file sits in (it is kept in the vault's `.claude/skills/`, so an agent that sees only the vault runs it there); else the default. */
export function vaultOf(program: string | undefined): string {
	if (!program || !existsSync(program)) return DEFAULT_VAULT;
	for (let dir = dirname(realpathSync(program)); dir !== dirname(dir); dir = dirname(dir)) {
		if (existsSync(join(dir, ".obsidian"))) return dir;
	}
	return DEFAULT_VAULT;
}

/** The core over the vault's files, read only, and its answers for agents. */
export async function composeAgent(host: AgentHost): Promise<AgentReads> {
	const settings = await settingsAt(join(host.vault, SETTINGS_FILE));
	const tasksPath = tasksFilePath(settings.get());
	const tasksFile = new ReadOnlyTaskFile(tasksPath === null ? null : join(host.vault, tasksPath));
	const core = composeCore({
		tasksFile,
		storedTasks: () => tasksFile.stored(),
		settings,
		clock: host.clock ?? systemClock,
		ticker: NO_TICKS,
		timers: nodeTimers(),
		calendarFiles: { google: calendarFileAt(host.vault, "google", settings), iphone: calendarFileAt(host.vault, "iphone", settings), work: calendarFileAt(host.vault, "work", settings) },
		feeds: [],
		work: { export: () => undefined },
		isPhone: () => false,
		projects: NO_NOTES,
		projectsScreen: runProjectsScreen(host.subprojects),
	});
	return core.agent;
}

/** The program's composition for the options a command line gives. */
export function agentFor(clock?: Clock, vault: string = DEFAULT_VAULT): (options: ProgramOptions) => Promise<AgentReads> {
	return (options) => composeAgent({ vault: options.vault ?? vault, subprojects: options.subprojects, ...(clock && { clock }) });
}

/** The program run on Node: the command line's answer on stdout, its code as the exit code. */
export async function start(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
	const { text, code } = await runProgram(argv, agentFor(undefined, vaultOf(process.argv[1])));
	process.stdout.write(`${text}\n`);
	process.exitCode = code;
}
