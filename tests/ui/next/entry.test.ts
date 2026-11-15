// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockHost } from "../../../obsidian/ui/next/host/block/BlockHost";
import { holdsHeight } from "../../../obsidian/ui/next/model/block";
import { harness, type Harness, PATH, settle } from "../../runtime/harness";
import { type FakeField, fakeTitleFields } from "../../helpers/FakeTitleField";
import type { BlockMsg } from "../../../obsidian/ui/next/model/messages";

/** A project with a note: its block shows its tasks, Rows by default. */
const FILE = ["## Inbox", "", "- [ ] Idea 🗂️ Дружба", "- [ ] Call 🗂️ Дружба", "", "## Projects", "", "- Дружба [[Дружба]]", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

const keymap = { pushScope: () => undefined, popScope: () => undefined };

describe("the block's quick entry", () => {
	let h: Harness;
	let host: BlockHost;
	let fields: ReturnType<typeof fakeTitleFields>;
	const field = (): FakeField => fields.made[0];
	const titles = () => [...host.node.querySelectorAll(".tc-n-card .tc-n-card-title")].map((t) => t.textContent);
	const rowKeys = () => [...host.node.querySelectorAll("[data-n-key]")].map((r) => (r as HTMLElement).dataset.nKey!).filter((k) => !k.includes("/"));
	const act = (act: string, key: string | null = null): BlockMsg => ({ kind: "acted", act: { act, key, value: null } });

	beforeEach(async () => {
		h = await harness({ file: FILE });
		fields = fakeTitleFields();
		host = new BlockHost({ session: h.runtime.openHost(), app: { keymap } as never, failure: (e) => e.message, notice: () => undefined, openLink: () => undefined, openTasksFile: () => undefined, titleField: () => fields.factory }, "Дружба.md", document.body);
		document.body.appendChild(host.node);
		host.mount();
	});

	afterEach(async () => {
		host.dispose();
		await h.runtime.unload();
	});

	it("holds the block's height while its field is open, as the old block kept its frame and scrolled inside it", () => {
		expect(holdsHeight(host.model)).toBe(false);
		host.dispatch(act("plus"));
		expect(holdsHeight(host.model)).toBe(true);
	});

	it("opens a field from the plus and focuses it inside the tap (a typing pick)", () => {
		expect(titles()).toEqual(["Idea", "Call"]);
		host.dispatch(act("plus"));
		expect(host.model.entry?.state).not.toBeNull();
		expect(host.node.querySelector("[data-n-island=field]")).not.toBeNull();
		expect(document.activeElement).toBe(field().input);
	});

	it("writes a line where it was typed: its card takes the field's row and the next field opens under it", async () => {
		host.dispatch(act("plus"));
		const fieldKey = host.model.entry!.field;
		field().type("Buy milk");
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "enter" } });
		await settle(h.runtime);
		expect(h.vault.text(PATH)).toContain("- [ ] Buy milk");
		const entry = host.model.entry!;
		expect(entry.field).not.toBe(fieldKey);
		const [id] = [...entry.bound].find(([, row]) => row === fieldKey) ?? [];
		expect(id).toBeDefined();
		const keys = rowKeys();
		expect(keys.indexOf(id!)).toBeGreaterThanOrEqual(0);
		expect(keys.indexOf(entry.field)).toBe(keys.indexOf(id!) + 1);
		expect(entry.state?.text).toBe("");
		expect(field().text).toBe("");
	});

	it("Escape closes the field, writing nothing", async () => {
		host.dispatch(act("plus"));
		field().type("Never mind");
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "escape" } });
		await settle(h.runtime);
		expect(host.model.entry?.state).toBeNull();
		expect(host.node.querySelector("[data-n-island=field]")).toBeNull();
		expect(h.vault.text(PATH)).not.toContain("Never mind");
	});

	it("a tap elsewhere keeps the text, as Enter does, and closes the field", async () => {
		host.dispatch(act("plus"));
		field().type("Kept");
		host.dispatch({ kind: "entry", msg: { kind: "blurred" } });
		await settle(h.runtime);
		expect(host.model.entry?.state).toBeNull();
		expect(h.vault.text(PATH)).toContain("- [ ] Kept");
	});

	it("a rename: the card gives its place to the field with its text, and the new text is written", async () => {
		const card = rowKeys()[titles().indexOf("Idea") + 0];
		const id = [...host.node.querySelectorAll(".tc-n-card")].map((c) => (c as HTMLElement).dataset.nKey!).find((k) => k === card)!;
		host.dispatch({ kind: "entry", msg: { kind: "rename", id } });
		expect(field().text).toBe("Idea");
		expect(titles()).toEqual(["Call"]);
		expect(document.activeElement).toBe(field().input);
		field().type("Idea, better");
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "enter" } });
		await settle(h.runtime);
		expect(h.vault.text(PATH)).toContain("- [ ] Idea, better");
		expect(titles()).toContain("Idea, better");
	});

	it("a subtask is typed under its task, a level in", async () => {
		const id = rowKeys().find((k) => k !== "head" && !k.startsWith("entry"))!;
		host.dispatch({ kind: "entry", msg: { kind: "subtask", id } });
		field().type("Step one");
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "enter" } });
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "escape" } });
		await settle(h.runtime);
		expect(h.vault.text(PATH)).toMatch(/- \[ \] Idea[^\n]*\n\t- \[ \] Step one/);
	});

	it("a typed priority tints the field from the core's marks; the bar's level tile toggles it", () => {
		host.dispatch(act("plus"));
		const level = host.model.entry!.state!.marks.tiles.levels[0];
		host.dispatch({ kind: "entry", msg: { kind: "bar", act: "priority", value: level.mark.prefix } });
		expect(host.model.entry!.state!.marks.priority?.prefix).toBe(level.mark.prefix);
		expect(host.node.querySelector("[data-n-island=field]")?.getAttribute("data-priority")).toBe(level.mark.color);
	});

	it("Option+Tab turns the field into a section's name, written where it stands", async () => {
		host.dispatch(act("plus"));
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "altTab" } });
		expect(host.model.entry!.state!.section).toBe(true);
		expect(field().input.placeholder).toBe("Section name");
		field().type("Errands");
		host.dispatch({ kind: "entry", msg: { kind: "key", key: "enter" } });
		await settle(h.runtime);
		expect(h.vault.text(PATH)).toMatch(/### Errands/);
		expect(host.model.entry?.state).toBeNull();
	});

	it("a double click on a list's own room types a task at its end", () => {
		host.dispatch({ kind: "acted", act: { act: "room", key: null, value: "inbox" } });
		expect(host.model.entry?.state?.spot).toMatchObject({ kind: "list", column: "inbox" });
		expect(document.activeElement).toBe(field().input);
	});
});
