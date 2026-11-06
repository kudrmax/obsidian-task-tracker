import { describe, expect, it } from "vitest";
import { backLink, SYNC_NOTICE, SyncRoundTrip } from "../../obsidian/infrastructure/SyncRoundTrip";
import { SYNC_REASONS, type SyncOutcome } from "../../obsidian/infrastructure/SyncWait";
import { FakeSync } from "../fakes/FakeSync";

function roundTrip(isPhone: boolean) {
	const opened: string[] = [];
	const notices: string[] = [];
	let hidden = 0;
	const sync = new FakeSync();
	let waits = 0;
	let answer: (o: SyncOutcome) => void = () => undefined;
	const trip = new SyncRoundTrip({
		host: {
			isPhone,
			open: (url) => opened.push(url),
			notice: (text) => {
				notices.push(text);
				return () => hidden++;
			},
		},
		sync,
		wait: {
			run: () => {
				waits++;
				return { outcome: new Promise((resolve) => (answer = resolve)), cancel: () => answer({ kind: "left" }) };
			},
		},
	});
	return { trip, opened, notices, hidden: () => hidden, sync, waits: () => waits, answer: async (o: SyncOutcome) => (answer(o), await Promise.resolve(), await Promise.resolve()) };
}

describe("SyncRoundTrip", () => {
	it("encodes a plus in a reason so the app doesn't read it as a space", () => {
		expect(backLink({ kind: "failed", reason: "a+b c" })).toBe("taskcalendar://synced?error=a%2Bb%20c");
	});

	it("shows the notice while it waits and hands the phone back to the app once Sync finished", async () => {
		const r = roundTrip(true);
		r.trip.run();
		expect([r.opened, r.notices, r.hidden()]).toEqual([[], [SYNC_NOTICE], 0]);
		await r.answer({ kind: "synced" });
		expect([r.opened, r.hidden()]).toEqual([["taskcalendar://synced"], 1]);
	});

	it("hides the notice and hands nothing back when Max left Obsidian", async () => {
		const r = roundTrip(true);
		r.trip.run();
		await r.answer({ kind: "left" });
		expect([r.opened, r.hidden()]).toEqual([[], 1]);
	});

	it("hands back with the reason when Sync couldn't finish", async () => {
		const r = roundTrip(true);
		r.trip.run();
		await r.answer({ kind: "failed", reason: SYNC_REASONS.timeout });
		expect(r.opened).toEqual(["taskcalendar://synced?error=Obsidian%20Sync%20didn't%20finish%20in%2045%20seconds"]);
	});

	it("drops the wait when the plugin unloads: the notice goes, nothing hands back, a new tap starts afresh", async () => {
		const r = roundTrip(true);
		r.trip.run();
		r.trip.stop();
		await r.answer({ kind: "synced" });
		expect([r.opened, r.hidden()]).toEqual([[], 1]);
		r.trip.run();
		expect([r.waits(), r.notices.length]).toEqual([2, 2]);
	});

	it("joins a second tap to the wait going", async () => {
		const r = roundTrip(true);
		r.trip.run();
		r.trip.run();
		await r.answer({ kind: "synced" });
		expect([r.waits(), r.opened.length, r.notices.length]).toEqual([1, 1, 1]);
		r.trip.run();
		expect(r.waits()).toBe(2);
	});

	it("only asks Sync to run on the Mac", () => {
		const r = roundTrip(false);
		r.trip.run();
		expect([r.waits(), r.sync.requests, r.opened, r.notices]).toEqual([0, 1, [], []]);
	});

	it("puts every reason into the link so the app reads it back as is", () => {
		for (const reason of Object.values(SYNC_REASONS)) {
			const link = backLink({ kind: "failed", reason }) ?? "";
			expect(reason).not.toBe("");
			expect(link).not.toContain("+");
			expect(new URL(link).searchParams.get("error")).toBe(reason);
		}
	});
});
