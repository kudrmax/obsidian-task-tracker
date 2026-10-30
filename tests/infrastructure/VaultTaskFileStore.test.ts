import { describe, expect, it } from "vitest";
import { TasksFileMissingError } from "../../src/application/contracts";
import { VaultTaskFileStore } from "../../src/infrastructure/VaultTaskFileStore";
import { FakeVault } from "../fakes/FakeVault";

function setup(path = "TODOs Tasks.md") {
	const vault = new FakeVault();
	let current = path;
	const store = new VaultTaskFileStore(vault.asApp(), () => current);
	return { vault, store, setPath: (p: string) => (current = p) };
}

describe("VaultTaskFileStore", () => {
	it("reads null for a missing file and the text otherwise", async () => {
		const { vault, store } = setup();
		expect(await store.read()).toBeNull();
		vault.files.set("TODOs Tasks.md", "## Now\n");
		expect(await store.read()).toBe("## Now\n");
	});

	it("writes through vault.process", async () => {
		const { vault, store } = setup();
		vault.files.set("TODOs Tasks.md", "## Now\n");
		await store.write((text) => text + "- [ ] A\n");
		expect(vault.files.get("TODOs Tasks.md")).toBe("## Now\n- [ ] A\n");
	});

	it("write on a missing file throws TasksFileMissingError with the path", async () => {
		const { store } = setup("x/y.md");
		await expect(store.write((t) => t)).rejects.toMatchObject({ name: "TasksFileMissingError", path: "x/y.md" });
		await expect(store.write((t) => t)).rejects.toBeInstanceOf(TasksFileMissingError);
	});

	it("creates the file", async () => {
		const { vault, store } = setup();
		await store.create("## Inbox\n");
		expect(vault.created).toEqual(["TODOs Tasks.md"]);
		expect(await store.read()).toBe("## Inbox\n");
	});

	it("reads the path on every call", async () => {
		const { vault, store, setPath } = setup("a.md");
		vault.files.set("b.md", "B");
		expect(await store.read()).toBeNull();
		setPath("b.md");
		expect(await store.read()).toBe("B");
	});

	it("onChange fires for the tasks file only and unsubscribes", () => {
		const { vault, store, setPath } = setup("a.md");
		let fired = 0;
		const off = store.onChange(() => fired++);
		vault.emit("modify", "other.md");
		expect(fired).toBe(0);
		vault.emit("modify", "a.md");
		expect(fired).toBe(1);
		setPath("b.md");
		vault.emit("modify", "a.md");
		vault.emit("modify", "b.md");
		expect(fired).toBe(2);
		off();
		vault.emit("modify", "b.md");
		expect(fired).toBe(2);
		expect(vault.listenerCount).toBe(0);
	});

	it("onChange fires when the tasks file is created, deleted, or renamed to or from its path", () => {
		const { vault, store } = setup("a.md");
		let fired = 0;
		store.onChange(() => fired++);
		vault.emit("create", "a.md");
		vault.emit("delete", "a.md");
		vault.emit("rename", "a.md", "old.md");
		vault.emit("rename", "new.md", "a.md");
		expect(fired).toBe(4);
		vault.emit("create", "other.md");
		vault.emit("rename", "x.md", "y.md");
		expect(fired).toBe(4);
	});
});
