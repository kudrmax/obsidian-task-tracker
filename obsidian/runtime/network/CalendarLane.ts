import type { CalendarSource, EventsReason, SourceProblem } from "../../../core/application/contracts";
import type { CalendarsAsk, FeedRun } from "../../../core/application/calendarsRefresh";
import type { Timers } from "../../../core/application/ports";
import type { DoorAnswer } from "../../../core/application/PhoneCalls";
import { resultOf } from "../replica/Door";
import type { Replica } from "../replica/Replica";

/** A calendar the host fetches itself into its file (`GoogleCalendarFeed`). */
export interface CalendarFeed {
	readonly name: CalendarSource;
	refresh(force: boolean): Promise<void>;
}

/** The calendars' files as text, by path from the vault's folder; null for none. */
export interface CalendarTexts {
	read(path: string): Promise<string | null>;
}

export interface CalendarLaneDeps {
	readonly replica: Replica;
	/** A door read over the replica now. */
	readonly read: (method: string, args: readonly unknown[]) => DoorAnswer;
	readonly feeds: readonly CalendarFeed[];
	readonly texts: CalendarTexts;
	readonly timers: Timers;
	readonly now: () => number;
}

class Silent extends Error {}

/**
 * The network lane (P3): fetches the calendars and reads their files into the replica, asking the core's refresh rule
 * (`calendarsRefresh.*`) what to fetch. Per day the latest ask wins: one superseded by a newer ask of the same day is
 * abandoned, and what it brings is never applied. A feed's failure, or its silence past the core's bound, becomes the
 * replica's `feedProblems`.
 */
export class CalendarLane {
	private readonly latest = new Map<string, number>();
	private readonly runs = new Map<CalendarSource, FeedRun>();
	private tickets = 0;
	private cached = false;

	constructor(private readonly deps: CalendarLaneDeps) {}

	/** A day's events asked for a reason: the files read into the replica, fetched first or behind as the rule says. */
	async refresh(day: string, reason: EventsReason): Promise<void> {
		const ticket = ++this.tickets;
		this.latest.set(day, ticket);
		const ask = resultOf<CalendarsAsk>(this.deps.read("calendarsRefresh.ask", [reason, this.cached]), "calendarsRefresh.ask");
		const feeds = this.deps.feeds.filter((feed) => ask.feeds === "forced" || (ask.feeds === "due" && this.due(feed)));
		const runs = feeds.map((feed) => this.run(feed));
		if (ask.waitFeeds) {
			await Promise.all(runs);
			await this.readFiles(day, ticket);
			return;
		}
		const now = this.readFiles(day, ticket);
		const behind = runs.length > 0 ? Promise.all(runs).then(() => this.readFiles(day, ticket)) : Promise.resolve();
		await Promise.all([now, behind]);
	}

	private current(day: string, ticket: number): boolean {
		return this.latest.get(day) === ticket;
	}

	private due(feed: CalendarFeed): boolean {
		return resultOf<boolean>(this.deps.read("calendarsRefresh.feedDue", [this.runs.get(feed.name) ?? null]), "calendarsRefresh.feedDue");
	}

	/** One feed run, bounded by the core's silence: a good run is remembered, a failure or a silence is the source's problem. */
	private async run(feed: CalendarFeed): Promise<void> {
		const key = resultOf<string>(this.deps.read("calendarsRefresh.feedKey", []), "calendarsRefresh.feedKey");
		const silence = resultOf<{ ms: number; problem: SourceProblem }>(this.deps.read("calendarsRefresh.silence", []), "calendarsRefresh.silence");
		let timer = 0;
		const silent = new Promise<never>((_, reject) => {
			timer = this.deps.timers.set(() => reject(new Silent()), silence.ms);
		});
		try {
			await Promise.race([feed.refresh(true), silent]);
			this.runs.set(feed.name, { atMs: this.deps.now(), key });
			this.problem(feed.name, null);
		} catch (e) {
			this.problem(feed.name, e instanceof Silent ? silence.problem : resultOf<SourceProblem>(this.deps.read("calendarsRefresh.problem", [e]), "calendarsRefresh.problem"));
		} finally {
			this.deps.timers.clear(timer);
		}
	}

	private problem(source: CalendarSource, problem: SourceProblem | null): void {
		const { [source]: _was, ...rest } = this.deps.replica.state.feedProblems;
		this.deps.replica.update({ feedProblems: problem === null ? rest : { ...rest, [source]: problem } });
	}

	/** The calendars' files read; applied only while this is still the day's latest ask. */
	private async readFiles(day: string, ticket: number): Promise<void> {
		const sources = resultOf<{ source: CalendarSource; path: string }[]>(this.deps.read("calendars.sources", []), "calendars.sources");
		const texts = await Promise.all(sources.map(async ({ source, path }) => [source, await this.deps.texts.read(path)] as const));
		if (!this.current(day, ticket)) return;
		const calendars = { ...this.deps.replica.state.calendars };
		for (const [source, text] of texts) calendars[source] = text;
		this.cached = true;
		if (texts.every(([source, text]) => this.deps.replica.state.calendars[source] === text)) return;
		this.deps.replica.update({ calendars });
	}
}
