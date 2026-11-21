import { cardBy } from "../lib/carry.mjs";
import { frameFaults, stepsOf, trackOf } from "../lib/frames.mjs";

/**
 * E2, a card arriving (F21, F295, F296; spec, principle 3; Decision 132): a task new on the screen, from outside (Sync, a
 * hand edit) as from the screen's own write, comes in at its place, fading in, as the cards under it glide aside to make
 * room. Nothing jumps, flickers or doubles; the tasks file has it.
 */
const SEEN = 0.1;
const WHOLE = 0.9;

export default {
	name: "e20-cards-arrive",
	features: ["E2: a card arriving (F21, F296)"],
	async run(t) {
		const [first] = await t.oracle.cards("day");
		const firstAt = await cardBy(t, first, "day");
		const frames = await t.record(() => t.stand(`addFromOutside("now", "Пришла со стороны")`), { cast: "arrives", settleMs: 900 });
		t.expect((await t.oracle.cards("day"))[0] === "Пришла со стороны", `it comes in at its place, the list's top: ${(await t.oracle.cards("day"))[0]}`);
		t.expect((await t.file()).includes("Пришла со стороны"), "the file has it");
		const id = (await cardBy(t, "Пришла со стороны", "day")).id;
		const fades = trackOf(frames, id).filter(Boolean).map((card) => card.o);
		t.expect(fades.some((o) => o > SEEN && o < WHOLE), `it fades in, never appearing in a frame: ${JSON.stringify(fades.slice(0, 12))}`);
		const pushed = trackOf(frames, firstAt.id).filter(Boolean).map((card) => card.y);
		t.expect(stepsOf(pushed, 1) >= 3 && pushed.at(-1) > firstAt.top + firstAt.height / 2, `the cards under it glide aside: ${JSON.stringify(pushed)}`);
		const faults = frameFaults(frames, { maxStep: 40 });
		t.expect(faults.length === 0, `frames of a task arriving: ${JSON.stringify(faults.slice(0, 3))}`);
	},
};
