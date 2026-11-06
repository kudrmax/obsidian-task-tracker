import { describe, expect, it } from "vitest";
import { backLink, SyncRoundTrip } from "../../obsidian/infrastructure/SyncRoundTrip";
import { SYNC_REASONS, type SyncOutcome } from "../../obsidian/infrastructure/SyncWait";
import { FakeSync } from "../fakes/FakeSync";

function roundTrip(isPhone: boolean) {
	const opened: string[] = [];
	const sync = new FakeSync();
	let waits = 0;
	let answer: (o: SyncOutcome) => void = () => undefined;
	const trip = new SyncRoundTrip({
		host: { isPhone, open: (url) => opened.push(url) },
		sync,
		wait: {
			run: () => {
				waits++;
				return new Promise((resolve) => (answer = resolve));
			},
		},
	});
	return { trip, opened, sync, waits: () => waits, answer: async (o: SyncOutcome) => (answer(o), await Promise.resolve(), await Promise.resolve()) };
}

describe("SyncRoundTrip", () => {
	it("hands the phone back to the app once Sync finished", async () => {
		const r = roundTrip(true);
		r.trip.run();
		expect(r.opened).toEqual([]);
		await r.answer({ synced: true });
		expect(r.opened).toEqual(["taskcalendar://synced"]);
	});

	it("hands back with the reason when Sync couldn't finish", async () => {
		const r = roundTrip(true);
		r.trip.run();
		await r.answer({ synced: false, reason: SYNC_REASONS.timeout });
		expect(r.opened).toEqual(["taskcalendar://synced?error=Obsidian%20Sync%20didn't%20finish%20in%2045%20seconds"]);
	});

	it("joins a second tap to the wait going", async () => {
		const r = roundTrip(true);
		r.trip.run();
		r.trip.run();
		await r.answer({ synced: true });
		expect([r.waits(), r.opened.length]).toEqual([1, 1]);
		r.trip.run();
		expect(r.waits()).toBe(2);
	});

	it("only asks Sync to run on the Mac", () => {
		const r = roundTrip(false);
		r.trip.run();
		expect([r.waits(), r.sync.requests, r.opened]).toEqual([0, 1, []]);
	});

	it("puts every reason into the link so the app reads it back as is", () => {
		for (const reason of Object.values(SYNC_REASONS)) {
			const url = new URL(backLink({ synced: false, reason }));
			expect(url.searchParams.get("error")).toBe(reason);
		}
	});
});
