import type { CalendarSource, EventsReason, SourceProblem } from "../../../core/application/contracts";
import type { CalendarsAsk, FeedRun } from "../../../core/application/calendarsRefresh";
import { SourceProblemError } from "../../../core/application/EventSource";
import type { Timers } from "../../../core/application/ports";
import type { DoorAnswer } from "../../../core/application/PhoneCalls";
import { resultOf } from "../replica/Door";
import type { Replica } from "../replica/Replica";

/** A calendar the host fetches itself into its file (`GoogleCalendarFeed`). */
export interface CalendarFeed {
	readonly name: CalendarSource;
	refresh(force: boolean): Promise<void>;
}

/** The calendars' files as text, by path from the vault's folder (null for none), and their changes by path. */
export interface CalendarTexts {
	read(path: string): Promise<string | null>;
	watch(listener: (path: string) => void): () => void;
}

export interface CalendarLaneDeps {
	readonly replica: Replica;
	/** A door read over the replica now. */
	readonly read: (method: string, args: readonly unknown[]) => DoorAnswer;
	readonly feeds: readonly CalendarFeed[];
	readonly texts: CalendarTexts;
	/** The phone's export of its calendars (Scriptable, Shortcuts, the app): asked first when the rule says (`exportFirst`: Refresh now). */
	readonly work: { export(): void };
	readonly timers: Timers;
	readonly now: () => number;
	/** A failure no caller hears (a file change's read): told, never thrown unheard. */
	readonly failed: (error: unknown) => void;
}

class Silent extends Error {}

type Problems = Partial<Record<CalendarSource, SourceProblem>>;

/**
 * The network lane (P3): fetches the calendars and reads their files into the replica, asking the core's refresh rule
 * (`calendarsRefresh.*`) what to fetch. The files are read again after every feed run and on every change of a file
 * (an export, another device), and the newest read wins: a read overtaken by a newer one is abandoned, never applied
 * over newer texts. A feed's failure, its silence past the core's bound, and a file that cannot be read become the
 * replica's `feedProblems`.
 */
export class CalendarLane {
	private readonly runs = new Map<CalendarSource, FeedRun>();
	private readonly feedFailures: Problems = {};
	private readonly readFailures: Problems = {};
	private reads = 0;
	private applied = 0;
	private cached = false;
	private stopped = false;
	private readonly silences = new Set<number>();
	/** Each feed's run under way: one at a time, a second ask joins it. */
	private readonly running = new Map<CalendarSource, Promise<void>>();

	constructor(private readonly deps: CalendarLaneDeps) {}

	/**
	 * The calendars asked for a reason (open, peek, refresh): the files read now, or once the feeds the rule asks have run.
	 * `byHand`: Max asked (Refresh now), not the clock or a source changing; only then is the phone asked to export first.
	 */
	async refresh(reason: EventsReason, byHand = false): Promise<void> {
		const ask = resultOf<CalendarsAsk>(this.deps.read("calendarsRefresh.ask", [reason, this.cached, byHand]), "calendarsRefresh.ask");
		if (ask.exportFirst) this.deps.work.export();
		const feeds = this.deps.feeds.filter((feed) => ask.feeds === "forced" || (ask.feeds === "due" && this.due(feed)));
		const runs = feeds.map((feed) => this.runOnce(feed).then(() => this.readFiles()));
		await Promise.all(ask.waitFeeds && runs.length > 0 ? runs : [this.readFiles(), ...runs]);
	}

	/** Reads the files again whenever one of them changes. Returns the unsubscribe. */
	watch(): () => void {
		return this.deps.texts.watch((path) => {
			if (this.sources().some((s) => s.path === path)) this.readFiles().catch((e: unknown) => this.deps.failed(e));
		});
	}

	/** The runtime unloads: no silence timer stays armed, and nothing under way lands any more. */
	stop(): void {
		this.stopped = true;
		this.silences.forEach((timer) => this.deps.timers.clear(timer));
		this.silences.clear();
	}

	private sources(): { source: CalendarSource; path: string }[] {
		return resultOf(this.deps.read("calendars.sources", []), "calendars.sources");
	}

	private due(feed: CalendarFeed): boolean {
		return resultOf<boolean>(this.deps.read("calendarsRefresh.feedDue", [this.runs.get(feed.name) ?? null]), "calendarsRefresh.feedDue");
	}

	/** A failure as the door reads it: plain data (`{ problem }` of a source's own problem, else `{ message }`), as on the wire. */
	private problemOf(error: unknown): SourceProblem {
		const failure = error instanceof SourceProblemError ? { problem: error.problem } : { message: error instanceof Error ? error.message : String(error) };
		return resultOf<SourceProblem>(this.deps.read("calendarsRefresh.problem", [failure]), "calendarsRefresh.problem");
	}

	/** One feed run, bounded by the core's silence: a good run is remembered, a failure or a silence is the source's problem. */
	/** The feed's run under way, joined; else a new one. */
	private runOnce(feed: CalendarFeed): Promise<void> {
		const under = this.running.get(feed.name);
		if (under) return under;
		const run = this.run(feed).finally(() => this.running.delete(feed.name));
		this.running.set(feed.name, run);
		return run;
	}

	private async run(feed: CalendarFeed): Promise<void> {
		const key = resultOf<string>(this.deps.read("calendarsRefresh.feedKey", []), "calendarsRefresh.feedKey");
		const silence = resultOf<{ ms: number; problem: SourceProblem }>(this.deps.read("calendarsRefresh.silence", []), "calendarsRefresh.silence");
		let timer = 0;
		const silent = new Promise<never>((_, reject) => {
			timer = this.deps.timers.set(() => reject(new Silent()), silence.ms);
			this.silences.add(timer);
		});
		try {
			await Promise.race([feed.refresh(true), silent]);
			if (this.stopped) return;
			this.runs.set(feed.name, { atMs: this.deps.now(), key });
			delete this.feedFailures[feed.name];
		} catch (e) {
			if (this.stopped) return;
			this.feedFailures[feed.name] = e instanceof Silent ? silence.problem : this.problemOf(e);
		} finally {
			this.deps.timers.clear(timer);
			this.silences.delete(timer);
			if (!this.stopped) this.showProblems();
		}
	}

	/** The problems as the replica has them, written only when they changed: a new value would read every view again. */
	private showProblems(): void {
		const problems = { ...this.feedFailures, ...this.readFailures };
		if (JSON.stringify(problems) === JSON.stringify(this.deps.replica.state.feedProblems)) return;
		this.deps.replica.update({ feedProblems: problems });
	}

	/** The calendars' files read; applied only while no newer read was applied. */
	private async readFiles(): Promise<void> {
		const ticket = ++this.reads;
		const read = await Promise.all(
			this.sources().map(async ({ source, path }) => {
				try {
					return { source, text: await this.deps.texts.read(path) };
				} catch (e) {
					return { source, error: e };
				}
			}),
		);
		if (this.stopped || ticket <= this.applied) return;
		this.applied = ticket;
		this.cached = true;
		const calendars = { ...this.deps.replica.state.calendars };
		for (const r of read) {
			if ("error" in r) this.readFailures[r.source] = this.problemOf(r.error);
			else {
				delete this.readFailures[r.source];
				calendars[r.source] = r.text;
			}
		}
		this.showProblems();
		if (read.some((r) => "text" in r && this.deps.replica.state.calendars[r.source] !== r.text)) this.deps.replica.update({ calendars });
	}
}
