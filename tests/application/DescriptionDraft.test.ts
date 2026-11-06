import { describe, expect, it } from "vitest";
import { DESCRIPTION_TEMPLATE } from "../../core/application/contracts";
import { DescriptionDraft } from "../../core/application/DescriptionDraft";

const idle = { focused: false, pending: false };

describe("the full screen's description editor", () => {
	it("starts with the description, the template for none", () => {
		expect(new DescriptionDraft("- a").text).toBe("- a");
		expect(new DescriptionDraft(null).text).toBe(DESCRIPTION_TEMPLATE);
	});

	it("writes only once something was typed since the last write", () => {
		const draft = new DescriptionDraft("- a");
		expect(draft.save()).toBe(false);
		draft.typed();
		expect(draft.save()).toBe(true);
		expect(draft.save()).toBe(false);
	});

	it("takes a change made elsewhere while it has no focus and no write waits; what was typed then goes", () => {
		const draft = new DescriptionDraft("- a");
		draft.typed();
		expect(draft.read("- b", idle)).toBe("- b");
		expect(draft.save()).toBe(false);
		expect(draft.read(null, idle)).toBe(DESCRIPTION_TEMPLATE);
	});

	it("keeps its own text for the file as it was, while focused, or with a write waiting", () => {
		const draft = new DescriptionDraft("- a");
		expect(draft.read("- a", idle)).toBeNull();
		expect(draft.read("- b", { focused: true, pending: false })).toBeNull();
		expect(draft.read("- c", { focused: false, pending: true })).toBeNull();
		expect(draft.read("- c", idle)).toBeNull();
		expect(draft.read("- d", idle)).toBe("- d");
	});
});
