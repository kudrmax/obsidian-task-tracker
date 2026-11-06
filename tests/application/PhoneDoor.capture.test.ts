import { describe, expect, it } from "vitest";
import { type PhoneAction, phoneDoor as door } from "../../src/application/PhoneDoor";

const at = new Date(2026, 10, 6, 14, 32).getTime();
const file = ["## Inbox", "", "- [ ] Old", "", "## Now", "", "- [ ] Today 📅 2026-11-06", "", "## Soon", "", "- [ ] Later", "", "## Backlog", "", "- [ ] Someday", "", "## Done", ""].join("\n");
const phone = { capture: (text: string, list: "inbox" | "now" | "soon" | "backlog", title: string, now: number) => door.capture(text, "", list, title, now) };

function written(result: PhoneAction): string {
	if (!result.changed) throw new Error("nothing written");
	return result.text;
}

describe("the phone door's capture", () => {
	it("puts the task last in Inbox, without a date", () => {
		expect(written(phone.capture(file, "inbox", "Call the bank", at))).toContain("- [ ] Old\n- [ ] Call the bank\n");
	});

	it("puts the task last in Now with today's date", () => {
		expect(written(phone.capture(file, "now", "Buy milk", at))).toContain("- [ ] Today 📅 2026-11-06\n- [ ] Buy milk 📅 2026-11-06\n");
	});

	it("puts the task last in Soon and Backlog, without a date", () => {
		expect(written(phone.capture(file, "soon", "Book a table", at))).toContain("- [ ] Later\n- [ ] Book a table\n");
		expect(written(phone.capture(file, "backlog", "Learn Go", at))).toContain("- [ ] Someday\n- [ ] Learn Go\n");
	});

	it("keeps a recording's link and tag as they are", () => {
		expect(written(phone.capture(file, "inbox", "[[Recording 20261106143200.m4a]] #transcribe", at))).toContain(
			"- [ ] Old\n- [ ] [[Recording 20261106143200.m4a]] #transcribe\n",
		);
	});

	it("creates a missing list's heading", () => {
		expect(written(phone.capture("## Now\n", "inbox", "A", at))).toMatch(/## Inbox\n+- \[ \] A/);
	});

	it("follows the section names of the settings", () => {
		expect(written(door.capture("## Входящие\n\n## Now\n", JSON.stringify({ sections: { inbox: "Входящие" } }), "inbox", "A", at))).toMatch(/## Входящие\n+- \[ \] A/);
	});

	it("a blank title writes nothing", () => {
		expect(phone.capture(file, "inbox", "  ", at).changed).toBe(false);
	});

	it("a title of only a priority is written, as the phone always did", () => {
		expect(written(phone.capture(file, "inbox", "p1", at))).toContain("- [ ] Old\n- [ ] p1\n");
	});
});
