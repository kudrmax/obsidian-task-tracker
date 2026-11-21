import { cardBy } from "../lib/carry.mjs";
import { frameFaults, stepsOf, trackOf } from "../lib/frames.mjs";
import { menuButton } from "../lib/menu.mjs";

/**
 * E2, a card leaving (F21, F295, F296; spec, principle 3; Decision 132): a task done, deleted or sent where the screen
 * doesn't show it fades where it stands, and the cards under it glide up into its place. Nothing jumps, flickers or
 * doubles; the tasks file says what happened.
 */
const SEEN = 0.1;
const WHOLE = 0.9;

/** The first frame a card under the leaving one moved up, and the leaving card's opacity then: it was already fading. */
const fadingWhenTheyMove = (leaving, under, top) => {
	const first = under.findIndex((item) => item && item.y < top - 0.5);
	return first < 0 ? null : (leaving[first]?.o ?? 0);
};

export default {
	name: "e21-cards-leave",
	features: ["E2: a card leaving (F21, F295, F296)"],
	cases: ["done", "deleted", "sent away"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (t.expect(at !== null, `the menu shows «${words}»`)) await tap(at);
			await t.sleep(300);
		};
		const [, leaving, under] = await t.oracle.cards("day");
		const leavingAt = await cardBy(t, leaving, "day");
		const underAt = await cardBy(t, under, "day");
		const frames = await t.record(
			async () => {
				await tap(leavingAt);
				await t.sleep(400);
				if (item === "done") await press("Done");
				if (item === "deleted") {
					await press("Delete");
					await press("Delete");
				}
				if (item === "sent away") await press("Tomorrow");
			},
			{ cast: item.replace(" ", "-"), settleMs: 900 },
		);
		t.expect(!(await t.oracle.cards("day")).includes(leaving), `the task leaves its list: ${JSON.stringify(await t.oracle.cards("day"))}`);
		const line = (await t.file()).split("\n").find((l) => l.includes(leaving)) ?? null;
		if (item === "done") t.expect(line?.startsWith("- [x]"), `the file has it done: ${line}`);
		if (item === "deleted") t.expect(line === null, `the file has it no more: ${line}`);
		if (item === "sent away") t.expect(line?.startsWith("- [ ]") && line.includes("📅"), `the file has it on another day: ${line}`);
		const fading = trackOf(frames, leavingAt.id);
		const below = trackOf(frames, underAt.id);
		const opacity = fadingWhenTheyMove(fading, below, underAt.top);
		t.expect(fading.some((card) => card && card.o > SEEN && card.o < WHOLE), `it fades where it stands, never vanishing in a frame: ${JSON.stringify(fading.filter(Boolean).map((c) => c.o))}`);
		t.expect(fading.filter(Boolean).every((card) => Math.abs(card.y - leavingAt.top) < 1), "it fades where it stood, without moving");
		t.expect(opacity !== null && opacity < WHOLE, `it is fading by the time the card under it moves up: ${opacity}`);
		const rose = below.filter(Boolean).map((card) => card.y);
		t.expect(stepsOf(rose, -1) >= 3 && Math.abs(rose.at(-1) - leavingAt.top) < 1, `the card under it glides up into its place: ${JSON.stringify(rose)}`);
		const faults = frameFaults(frames, { maxStep: 40 });
		t.expect(faults.length === 0, `frames of a task leaving: ${JSON.stringify(faults.slice(0, 3))}`);
	},
};
