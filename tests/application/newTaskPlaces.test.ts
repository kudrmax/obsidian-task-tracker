import { describe, expect, it } from "vitest";
import { sameNewPlace } from "../../core/application/contracts";

const key = { section: "inbox", index: 1, path: [], raw: "- [ ] A" } as const;

/** QA 2026-11-12: a host's JSON may list a place's fields in any order; the place is the same. */
describe("sameNewPlace", () => {
	it("matches field by field, whatever order the fields came in", () => {
		const a = JSON.parse('{"kind":"list","list":"inbox","group":null,"before":null}');
		const b = JSON.parse('{"before":null,"group":null,"list":"inbox","kind":"list"}');
		expect(sameNewPlace(a, b)).toBe(true);
		expect(sameNewPlace({ kind: "list", list: "soon", group: null, before: null, date: "2026-11-13" }, { date: "2026-11-13", before: null, group: null, list: "soon", kind: "list" } as never)).toBe(true);
	});

	it("tells apart another list, section, date, the task before, the kind", () => {
		const base = { kind: "list", list: "inbox", group: null, before: null } as const;
		expect(sameNewPlace(base, { ...base, list: "soon" })).toBe(false);
		expect(sameNewPlace(base, { ...base, group: "Work" })).toBe(false);
		expect(sameNewPlace(base, { ...base, date: "2026-11-13" })).toBe(false);
		expect(sameNewPlace(base, { ...base, before: key })).toBe(false);
		expect(sameNewPlace({ ...base, before: key }, { ...base, before: { raw: "- [ ] A", path: [], index: 1, section: "inbox" } })).toBe(true);
		expect(sameNewPlace(base, { kind: "day", date: "2026-11-12", group: null, before: null })).toBe(false);
		expect(sameNewPlace({ kind: "slot", slot: { date: "2026-11-12", start: 60, end: null } }, { kind: "slot", slot: { end: null, start: 60, date: "2026-11-12" } })).toBe(true);
	});
});
