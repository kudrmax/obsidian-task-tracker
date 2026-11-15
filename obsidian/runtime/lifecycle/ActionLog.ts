/** How many lines the action log keeps: the last messages, enough to read how a failure came about. */
export const ACTION_LOG_SIZE = 200;

/** One line of the action log: when, and what. */
export interface ActionLine {
	readonly atMs: number;
	readonly text: string;
}

/** A ring of the last messages and door calls, dumped with a failure. */
export class ActionLog {
	private readonly lines: ActionLine[] = [];

	constructor(
		private readonly now: () => number,
		private readonly size = ACTION_LOG_SIZE,
	) {}

	record(text: string): void {
		this.lines.push({ atMs: this.now(), text });
		if (this.lines.length > this.size) this.lines.splice(0, this.lines.length - this.size);
	}

	get entries(): readonly ActionLine[] {
		return this.lines;
	}

	dump(): string {
		return this.lines.map((l) => `${new Date(l.atMs).toISOString()} ${l.text}`).join("\n");
	}
}

/** A message as one line: its kind, and its fields short. */
export function describe(message: unknown): string {
	if (typeof message !== "object" || message === null) return String(message);
	const kind = (message as { kind?: unknown; type?: unknown }).kind ?? (message as { type?: unknown }).type ?? "message";
	let text: string;
	try {
		text = JSON.stringify(message);
	} catch {
		text = "";
	}
	return `${String(kind)} ${text.length > 160 ? `${text.slice(0, 160)}…` : text}`;
}
