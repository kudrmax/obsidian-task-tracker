import type { Clock } from "../core/application/ports";
import type { Http, HttpRequest, HttpResponse } from "./infrastructure/Http";
import TaskCalendarPlugin from "./main";
import type { ViewDeps } from "./ui/TaskCalendarView";

/**
 * The build `scripts/e2e` runs (spec §Tests 6): the real plugin over the scratch vault, with the core's clock frozen at
 * the fixture's moment and Google answered from the fixture's calendars, so a run sees the same screen every time. It
 * is built beside main.js (`npm run build:e2e`, `.e2e/build/`), never in its place. It reads `e2e.json` from its folder.
 */

/** `e2e.json`: the moment the clock stands at, and what Google answers. */
export interface E2EFixture {
	/** Local time, `YYYY-MM-DDTHH:MM`. */
	readonly now: string;
	readonly google: {
		readonly calendars: readonly { readonly id: string; readonly summary: string; readonly backgroundColor?: string; readonly primary?: boolean }[];
		readonly events: Readonly<Record<string, readonly { readonly id: string; readonly summary: string; readonly start: { dateTime?: string; date?: string }; readonly end: { dateTime?: string; date?: string } }[]>>;
	};
}

/** The clock the core reads: standing still at the fixture's moment until the harness moves it. */
export class FrozenClock implements Clock {
	constructor(private ms: number) {}
	now(): Date {
		return new Date(this.ms);
	}
	set(ms: number): void {
		this.ms = ms;
	}
}

const localMs = (text: string): number => {
	const [date, time = "00:00"] = text.split("T");
	const [y, m, d] = date.split("-").map(Number);
	const [h, min] = time.split(":").map(Number);
	return new Date(y, m - 1, d, h, min).getTime();
};

const json = (status: number, body: unknown): HttpResponse => ({ status, json: body, text: JSON.stringify(body) });

/** Google as the fixture says: a token for any refresh, the calendars, their events in the asked span. Nothing leaves the machine. */
export function fixtureHttp(fixture: E2EFixture, asked: HttpRequest[]): Http {
	return async (request) => {
		asked.push(request);
		const url = new URL(request.url);
		if (url.host === "oauth2.googleapis.com") return json(200, { access_token: "e2e", expires_in: 3600 });
		if (url.pathname.endsWith("/users/me/calendarList")) return json(200, { items: fixture.google.calendars });
		const events = /\/calendars\/([^/]+)\/events$/.exec(url.pathname);
		if (events) {
			const from = Date.parse(url.searchParams.get("timeMin") ?? "");
			const to = Date.parse(url.searchParams.get("timeMax") ?? "");
			const at = (p: { dateTime?: string; date?: string }) => (p.dateTime ? Date.parse(p.dateTime) : localMs(p.date ?? "1970-01-01"));
			const items = (fixture.google.events[decodeURIComponent(events[1])] ?? []).filter((e) => at(e.end) > from && at(e.start) < to);
			return json(200, { items });
		}
		return json(404, { error: `e2e: no fixture for ${request.url}` });
	};
}

export default class E2ETaskCalendarPlugin extends TaskCalendarPlugin {
	private fixture: E2EFixture | null = null;
	/** What the harness reads and moves over CDP: the clock, every request the plugin made, every reach outside Obsidian. */
	e2e: { readonly clock: FrozenClock; readonly asked: HttpRequest[]; readonly opened: string[] } | null = null;
	private readonly opened: string[] = [];

	/**
	 * Nothing leaves the test Obsidian for Max's Mac: links to other apps (Shortcuts, the iPhone app, Google's login, a
	 * link in a task) and the Mac's scripts (Calendar) are recorded, never opened. `window.open` and `location.assign`
	 * are taken over in this test window for the same reason: the plugin's views and Google's login open through them.
	 */
	protected override outside(): { open(url: string): void; runScript(script: string, args: readonly string[]): void } {
		return { open: (url) => void this.opened.push(url), runScript: (script) => void this.opened.push(`osascript: ${script.slice(0, 60)}`) };
	}

	override async onload(): Promise<void> {
		const page = window as Window & { open: (url?: string | URL) => Window | null };
		const opened = this.opened;
		const open = page.open;
		page.open = (url?: string | URL) => (opened.push(String(url)), null);
		const assign = page.location.assign.bind(page.location);
		try {
			Object.defineProperty(page.location, "assign", { value: (url: string | URL) => void opened.push(String(url)), configurable: true });
		} catch {
			/* a location that cannot be taken over: links go through window.open on the desktop and in the phone view */
		}
		this.register(() => {
			page.open = open;
			try {
				Object.defineProperty(page.location, "assign", { value: assign, configurable: true });
			} catch {
				/* as above */
			}
		});
		const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		this.fixture = JSON.parse(await this.app.vault.adapter.read(`${dir}/e2e.json`)) as E2EFixture;
		await super.onload();
	}

	protected override createDeps(): ViewDeps {
		const fixture = this.fixture!;
		const clock = new FrozenClock(localMs(fixture.now));
		const asked: HttpRequest[] = [];
		this.e2e = { clock, asked, opened: this.opened };
		return super.createDeps(clock, fixtureHttp(fixture, asked));
	}
}
