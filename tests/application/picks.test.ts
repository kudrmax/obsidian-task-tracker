import { describe, expect, it } from "vitest";
import { canLift, liftedPicks, NO_PICKS, pickRun, pressedBeside, setPicking, tapPick, togglePick, type Picks } from "../../core/application/picks";

const CARDS = ["a", "b", "c", "d", "e"];
const NONE = { mod: false, shift: false };
const MOD = { mod: true, shift: false };
const SHIFT = { mod: false, shift: true };
const picks = (picked: string[], anchor: string | null = picked[picked.length - 1] ?? null, picking = false): Picks => ({ picking, picked, anchor });

describe("picking a card", () => {
	it("picks a card not picked and runs from it next", () => {
		expect(togglePick(NO_PICKS, "b")).toEqual(picks(["b"], "b"));
		expect(togglePick(picks(["b"]), "d")).toEqual(picks(["b", "d"], "d"));
	});

	it("lets a picked card go and leaves no card to run from (the plugin's TaskSelection)", () => {
		expect(togglePick(picks(["b", "d"]), "b")).toEqual(picks(["d"], null));
	});

	it("keeps Select tasks on while a card is picked or let go", () => {
		expect(togglePick(picks([], null, true), "a")).toEqual(picks(["a"], "a", true));
		expect(togglePick(picks(["a"], "a", true), "a")).toEqual(picks([], null, true));
	});
});

describe("picking a run", () => {
	it("picks the cards from the one picked last to this one, either way, this one last", () => {
		expect(pickRun(picks(["b"]), "d", CARDS)).toEqual(picks(["b", "c", "d"], "d"));
		expect(pickRun(picks(["d"]), "b", CARDS)).toEqual(picks(["d", "c", "b"], "b"));
	});

	it("keeps the cards picked before and picks none twice", () => {
		expect(pickRun(picks(["e", "c", "b"], "b"), "d", CARDS)).toEqual(picks(["e", "c", "b", "d"], "d"));
		expect(pickRun(picks(["b", "d"], "b"), "d", CARDS)).toEqual(picks(["b", "d", "c"], "d"));
	});

	it("picks only this card when no card is picked last or it stands in another list", () => {
		expect(pickRun(picks(["d"], null), "b", CARDS)).toEqual(picks(["d", "b"], "b"));
		expect(pickRun(picks(["x"], "x"), "b", CARDS)).toEqual(picks(["x", "b"], "b"));
	});
});

describe("a tap on a list card", () => {
	it("in Select tasks picks the card or lets it go, whatever keys are held", () => {
		expect(tapPick(picks([], null, true), "a", "inbox", CARDS, NONE)).toEqual({ took: true, picks: picks(["a"], "a", true), opens: null });
		expect(tapPick(picks(["a"], "a", true), "a", "inbox", CARDS, SHIFT)).toEqual({ took: true, picks: picks([], null, true), opens: null });
	});

	it("in Select tasks takes a tap on a card it can't pick and changes nothing", () => {
		const on = picks(["a"], "a", true);
		expect(tapPick(on, "t", "timeline", CARDS, NONE)).toEqual({ took: true, picks: on, opens: null });
	});

	it("with ⌘ picks the card or lets it go", () => {
		expect(tapPick(NO_PICKS, "c", "soon", CARDS, MOD)).toEqual({ took: true, picks: picks(["c"], "c"), opens: null });
		expect(tapPick(picks(["a", "c"]), "c", "soon", CARDS, MOD)).toEqual({ took: true, picks: picks(["a"], null), opens: null });
	});

	it("with Shift picks the run from the card picked last", () => {
		expect(tapPick(picks(["a"]), "c", "day", CARDS, SHIFT)).toEqual({ took: true, picks: picks(["a", "b", "c"], "c"), opens: null });
	});

	it("with Shift and nothing picked opens the card's own menu", () => {
		expect(tapPick(NO_PICKS, "c", "day", CARDS, SHIFT)).toEqual({ took: false, picks: NO_PICKS, opens: "own" });
	});

	it("on one of several picked opens the menu for them all, the picks kept", () => {
		const two = picks(["a", "c"]);
		expect(tapPick(two, "c", "backlog", CARDS, NONE)).toEqual({ took: true, picks: two, opens: "bulk" });
	});

	it("otherwise lets the picks go and opens the card's own menu", () => {
		expect(tapPick(picks(["a"]), "a", "backlog", CARDS, NONE)).toEqual({ took: false, picks: NO_PICKS, opens: "own" });
		expect(tapPick(picks(["a", "c"]), "b", "backlog", CARDS, NONE)).toEqual({ took: false, picks: NO_PICKS, opens: "own" });
	});

	it("never picks with keys a card drawn where Select tasks picks none", () => {
		expect(tapPick(picks(["a"]), "t", "timeline", CARDS, MOD)).toEqual({ took: false, picks: NO_PICKS, opens: "own" });
		expect(tapPick(picks(["a"]), "t", "done", CARDS, SHIFT)).toEqual({ took: false, picks: NO_PICKS, opens: "own" });
	});
});

describe("Select tasks on and off", () => {
	it("turned on keeps the cards picked with ⌘", () => {
		expect(setPicking(picks(["a"]), true)).toEqual(picks(["a"], "a", true));
	});

	it("turned off lets every picked card go", () => {
		expect(setPicking(picks(["a", "b"], "b", true), false)).toEqual(NO_PICKS);
	});

	it("keeps its picks on a press beside the cards; the ⌘-picks go", () => {
		const on = picks(["a"], "a", true);
		expect(pressedBeside(on)).toBe(on);
		expect(pressedBeside(picks(["a"]))).toEqual(NO_PICKS);
	});
});

describe("lifting a card", () => {
	it("lifts any card, picked or not, in Select tasks or not (the plugin's behaviour, kept)", () => {
		expect(canLift(NO_PICKS, "a")).toBe(true);
		expect(canLift(picks(["b"], "b", true), "a")).toBe(true);
		expect(canLift(picks(["a"], "a", true), "a")).toBe(true);
	});

	it("a card not picked lifted alone lets the ⌘-picks go; Select tasks keeps its picks", () => {
		expect(liftedPicks(picks(["b"]), "a")).toEqual(NO_PICKS);
		const on = picks(["b"], "b", true);
		expect(liftedPicks(on, "a")).toBe(on);
	});

	it("a picked card lifted keeps the picks it carries", () => {
		const two = picks(["a", "b"]);
		expect(liftedPicks(two, "a")).toBe(two);
	});
});
