import { describe, expect, it } from "vitest";
import { projectKey } from "../../core/domain/Project";

describe("projectKey", () => {
	it("a name decomposed by the file system is the same project as its composed link", () => {
		const composed = "Окружение в новой стране".normalize("NFC");
		const decomposed = composed.normalize("NFD");
		expect(decomposed).not.toBe(composed);
		expect(projectKey(decomposed)).toBe(projectKey(composed));
	});
	it("case aside", () => {
		expect(projectKey("Здоровье")).toBe(projectKey("здоровье"));
	});
});
