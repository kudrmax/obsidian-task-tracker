import type { AgentErrorCode, AgentFilter, AgentReads, WireError } from "../core/application/contracts";

/** What the program is run with, besides the command: the vault (none: the default) and the Subprojects tick. */
export interface ProgramOptions {
	readonly vault: string | null;
	readonly subprojects: boolean;
}

/** What the program prints and the code it exits with. */
export interface ProgramOutput {
	readonly text: string;
	readonly code: 0 | 1;
}

/** The program's answers over the vault the options name. */
export type AgentFor = (options: ProgramOptions) => Promise<AgentReads>;

interface Parsed {
	readonly command: string;
	readonly words: readonly string[];
	readonly vault: string | null;
	readonly project?: string;
	readonly noProject: boolean;
	readonly noSubprojects: boolean;
	readonly pretty: boolean;
	readonly days?: number;
	readonly done: boolean;
}

class UsageError extends Error {
	constructor(
		readonly code: "unknownCommand" | "badArgument",
		message: string,
	) {
		super(message);
	}
}

const FILTERED = new Set(["today", "day", "week", "soon", "inbox", "backlog", "all"]);
const CODES: ReadonlySet<string> = new Set<AgentErrorCode>(["tasksFileMissing", "unknownCommand", "badArgument", "unknownProject", "staleTask", "unknownTask"]);

/** Runs one command: argv turned into a call of the program's answers, the answer printed as one JSON object. */
export async function runProgram(argv: readonly string[], agentFor: AgentFor): Promise<ProgramOutput> {
	let pretty = argv.includes("--pretty");
	try {
		const parsed = parse(argv);
		pretty = parsed.pretty;
		const agent = await agentFor({ vault: parsed.vault, subprojects: !parsed.noSubprojects });
		return { text: json(await answer(agent, parsed), pretty), code: 0 };
	} catch (e) {
		return { text: json(errorOf(e), pretty), code: 1 };
	}
}

function answer(agent: AgentReads, p: Parsed): Promise<unknown> {
	const filter: AgentFilter = { ...(p.project !== undefined && { project: p.project }), ...(p.noProject && { noProject: true }) };
	switch (p.command) {
		case "today":
			return none(p) ?? agent.today(filter);
		case "day":
			return agent.day(one(p, "a day: YYYY-MM-DD, today, tomorrow, yesterday, +N or -N"), filter);
		case "week":
			if (p.words.length > 1) throw new UsageError("badArgument", "week takes this, next or a day");
			return agent.week({ ...(p.words[0] !== undefined && { which: p.words[0] }), ...(p.days !== undefined && { count: p.days }) }, filter);
		case "soon":
			return none(p) ?? agent.soon(filter);
		case "inbox":
			return none(p) ?? agent.inbox(filter);
		case "backlog":
			return none(p) ?? agent.backlog(filter);
		case "all":
			return none(p) ?? agent.all(filter);
		case "projects":
			return none(p) ?? agent.projects();
		case "project":
			return agent.project(all(p, "a project's name"), p.done);
		case "search":
			return agent.search(all(p, "the text to search"));
		case "task":
			return agent.task(one(p, "a task's ref"));
		case "help":
			return agent.help();
		default:
			throw new UsageError("unknownCommand", `no command ${JSON.stringify(p.command)}; run help`);
	}
}

/** A command that takes no words. */
function none(p: Parsed): null {
	if (p.words.length > 0) throw new UsageError("badArgument", `${p.command} takes no words: ${p.words.join(" ")}`);
	return null;
}

function one(p: Parsed, what: string): string {
	if (p.words.length !== 1) throw new UsageError("badArgument", `${p.command} takes ${what}`);
	return p.words[0];
}

/** The words as one text: a project's name or a query with spaces, quoted or not. */
function all(p: Parsed, what: string): string {
	if (p.words.length === 0) throw new UsageError("badArgument", `${p.command} takes ${what}`);
	return p.words.join(" ");
}

function parse(argv: readonly string[]): Parsed {
	const words: string[] = [];
	const flags = new Set<string>();
	const values = new Map<string, string>();
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) words.push(arg);
		else if (["--vault", "--project", "--days"].includes(arg)) {
			const value = argv[++i];
			if (value === undefined) throw new UsageError("badArgument", `${arg} takes a value`);
			values.set(arg, value);
		} else if (["--pretty", "--no-subprojects", "--no-project", "--done"].includes(arg)) flags.add(arg);
		else throw new UsageError("badArgument", `no option ${arg}; run help`);
	}
	const command = words.shift() ?? "help";
	const days = values.get("--days");
	const parsed: Parsed = {
		command,
		words,
		vault: values.get("--vault") ?? null,
		...(values.has("--project") && { project: values.get("--project")! }),
		noProject: flags.has("--no-project"),
		noSubprojects: flags.has("--no-subprojects"),
		pretty: flags.has("--pretty"),
		...(days !== undefined && { days: /^\d+$/.test(days) ? Number(days) : Number.NaN }),
		done: flags.has("--done"),
	};
	if ((parsed.project !== undefined || parsed.noProject) && !FILTERED.has(command)) throw new UsageError("badArgument", `${command} takes no project filter`);
	if (parsed.noSubprojects && parsed.project === undefined && command !== "project") throw new UsageError("badArgument", "--no-subprojects goes with --project or project");
	if (days !== undefined && command !== "week") throw new UsageError("badArgument", "--days goes with week");
	if (parsed.done && command !== "project") throw new UsageError("badArgument", "--done goes with project");
	return parsed;
}

function errorOf(e: unknown): WireError {
	const code = (e as { code?: unknown }).code;
	const message = e instanceof Error ? e.message : String(e);
	const candidates = (e as { candidates?: readonly string[] }).candidates;
	if (typeof code === "string" && CODES.has(code)) return { error: { code: code as AgentErrorCode, message, ...(candidates !== undefined && { candidates }) } };
	return { error: { code: "failed", message } };
}

function json(value: unknown, pretty: boolean): string {
	return JSON.stringify(value, null, pretty ? 2 : undefined);
}
