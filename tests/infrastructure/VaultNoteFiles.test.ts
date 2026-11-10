import { describe, expect, it } from "vitest";
import { VaultNoteFiles } from "../../obsidian/infrastructure/VaultNoteFiles";
import { FakeVault } from "../fakes/FakeVault";

describe("VaultNoteFiles", () => {
	it("lists every file's path and reads a note, empty for none", async () => {
		const vault = new FakeVault();
		vault.files.set("Дружба.md", "# Дружба\n");
		vault.files.set("Areas/Дом.md", "");
		const notes = new VaultNoteFiles(vault.asApp());
		expect(notes.paths()).toEqual(["Дружба.md", "Areas/Дом.md"]);
		expect(await notes.read("Дружба.md")).toBe("# Дружба\n");
		expect(await notes.read("Нет.md")).toBe("");
	});

	it("writes the text the core gives: over the note it has, or into a new one", async () => {
		const vault = new FakeVault();
		vault.files.set("Дружба.md", "# Дружба\n");
		const notes = new VaultNoteFiles(vault.asApp());
		await notes.write("Дружба.md", "---\ntags:\n  - project\n---\n# Дружба\n");
		await notes.write("Ремонт.md", "---\ntags:\n  - project\n---\n");
		expect(vault.files.get("Дружба.md")).toBe("---\ntags:\n  - project\n---\n# Дружба\n");
		expect(vault.created).toEqual(["Ремонт.md"]);
	});
});
