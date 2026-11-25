import { describe, expect, it } from "vitest";
import type { EntryDraft } from "../../obsidian/ui/engine/port";
import { standPort, settled } from "../ui/engine/standPort";

const NOW = new Date(2026, 10, 18, 14, 20);
const HOME = { project: "Дом" };
const NO_DRAFT: EntryDraft = { level: null, projects: [], descriptionLine: null, section: false };

/** A new task typed at the end of the leaf's Inbox, through `port` (another screen open beside it, or not), and the file as it is written. */
async function typedInLeaf(withBlock: boolean): Promise<string> {
	const source = await standPort(NOW);
	const leaf = source.port.within();
	if (withBlock) source.port.within(HOME).read(0, HOME);
	leaf.read(0);
	const field = { at: leaf.listEnd("inbox", 0)!, renaming: null, stack: false };
	await leaf.commit(field, "Из главного экрана", leaf.entryDraft(field), false).write;
	await settled();
	return source.fileText();
}

describe("each screen's port keeps its own context", () => {
	it("leaf and project block on one port: a write from the leaf is the same as without the block", async () => {
		expect(await typedInLeaf(true)).toBe(await typedInLeaf(false));
	});

	it("a drop from the leaf goes by the leaf's context while a project's block is open beside it", async () => {
		const run = async (withBlock: boolean) => {
			const source = await standPort(NOW);
			const leaf = source.port.within();
			if (withBlock) source.port.within(HOME).read(0, HOME);
			const data = leaf.read(0);
			const id = data.lists.inbox.rows.find((row) => row.kind === "task")!.id;
			await leaf.move(id, { list: "inbox", before: null, dayOffset: 0 });
			await settled();
			return source.fileText();
		};
		expect(await run(true)).toBe(await run(false));
	});

	it("a new task in a project's block starts with that project, and is written with it", async () => {
		const source = await standPort(NOW);
		const block = source.port.within(HOME);
		block.read(0, HOME);
		const field = { at: block.listEnd("inbox", 0)!, renaming: null, stack: false };
		const draft = block.entryDraft(field);
		expect(draft.projects).toEqual(["Дом"]);
		await block.commit(field, "Из блока заметки", draft, false).write;
		await settled();
		expect(source.fileText()).toMatch(/- \[ \] Из блока заметки 🗂️ Дом/);
	});

	it("a new task on the leaf starts with nothing set", async () => {
		const source = await standPort(NOW);
		const leaf = source.port.within();
		leaf.read(0);
		expect(leaf.entryDraft({ at: leaf.listEnd("inbox", 0)!, renaming: null, stack: false })).toEqual(NO_DRAFT);
	});
});
