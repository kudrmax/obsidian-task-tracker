import { describe, expect, it } from "vitest";
import { PhoneCaptureService } from "../../src/application/PhoneCaptureService";

const at = new Date(2026, 10, 6, 14, 32);
const file = ["## Inbox", "", "- [ ] Old", "", "## Now", "", "- [ ] Today 📅 2026-11-06", "", "## Soon", "", "## Done", ""].join("\n");
const phone = new PhoneCaptureService("");

function written(result: ReturnType<PhoneCaptureService["capture"]>): string {
	if (!result.changed) throw new Error("nothing written");
	return result.text;
}

describe("PhoneCaptureService.capture", () => {
	it("puts the task last in Inbox, without a date", () => {
		const text = written(phone.capture(file, "inbox", "Call the bank", "", at));
		expect(text).toContain("- [ ] Old\n- [ ] Call the bank\n");
	});

	it("puts the task last in Now with today's date", () => {
		const text = written(phone.capture(file, "now", "Buy milk", "", at));
		expect(text).toContain("- [ ] Today 📅 2026-11-06\n- [ ] Buy milk 📅 2026-11-06\n");
	});

	it("writes the description under the task", () => {
		const text = written(phone.capture(file, "inbox", "Voice note", "![[Recording 20261106143200.m4a]]", at));
		expect(text).toContain("- [ ] Voice note\n\t![[Recording 20261106143200.m4a]]\n");
	});

	it("creates a missing list's heading", () => {
		const text = written(phone.capture("## Now\n", "inbox", "A", "", at));
		expect(text).toMatch(/## Inbox\n+- \[ \] A/);
	});

	it("follows the section names of the settings", () => {
		const custom = new PhoneCaptureService(JSON.stringify({ sections: { inbox: "Входящие" } }));
		expect(written(custom.capture("## Входящие\n\n## Now\n", "inbox", "A", "", at))).toMatch(/## Входящие\n+- \[ \] A/);
	});

	it("a blank title writes nothing", () => {
		expect(phone.capture(file, "inbox", "  ", "", at).changed).toBe(false);
	});
});
