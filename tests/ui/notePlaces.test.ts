import { describe, expect, it } from "vitest";
import { LocalNotePlaces } from "../../obsidian/ui/notePlaces";

function storage() {
	const kept = new Map<string, unknown>();
	return { loadLocalStorage: (key: string) => kept.get(key) ?? null, saveLocalStorage: (key: string, data: unknown) => void kept.set(key, data) };
}

describe("a project note's block keeps its place on the device", () => {
	it("goes with its note when the note is renamed", () => {
		const places = new LocalNotePlaces(storage());
		places.set("Projects/Окружение.md", { rightMode: "calendar", listShare: 0.3, zoom: 112 });
		places.move("Projects/Окружение.md", "Projects/Друзья.md");
		expect(places.get("Projects/Друзья.md")).toEqual({ rightMode: "calendar", listShare: 0.3, zoom: 112 });
		expect(places.get("Projects/Окружение.md")).toEqual({});
	});

	it("goes with every note of a folder that is renamed or moved, and with no note of a folder merely named alike", () => {
		const places = new LocalNotePlaces(storage());
		places.set("Projects/A.md", { rightMode: "soon" });
		places.set("Projects/Deep/B.md", { rightMode: "calendar" });
		places.set("Projects 2/C.md", { rightMode: "inbox" });
		places.move("Projects", "Archive/Projects");
		expect(places.get("Archive/Projects/A.md")).toEqual({ rightMode: "soon" });
		expect(places.get("Archive/Projects/Deep/B.md")).toEqual({ rightMode: "calendar" });
		expect(places.get("Projects 2/C.md")).toEqual({ rightMode: "inbox" });
	});

	it("leaves nothing behind for a deleted note or folder", () => {
		const store = storage();
		const places = new LocalNotePlaces(store);
		places.set("A.md", { rightMode: "soon" });
		places.set("Old/B.md", { rightMode: "soon" });
		places.set("Keep.md", { rightMode: "calendar" });
		places.forget("A.md");
		places.forget("Old");
		expect(JSON.parse(String(store.loadLocalStorage("task-calendar:note-places")))).toEqual({ "Keep.md": { rightMode: "calendar" } });
	});

	it("a rename or delete of a note without a place writes nothing", () => {
		const store = storage();
		const places = new LocalNotePlaces(store);
		places.move("A.md", "B.md");
		places.forget("A.md");
		expect(store.loadLocalStorage("task-calendar:note-places")).toBeNull();
	});
});
