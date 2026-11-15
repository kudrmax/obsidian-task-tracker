// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockHost } from "../../../obsidian/ui/next/host/block/BlockHost";
import { type BlockLists, currentLists, projectsView } from "../../../obsidian/ui/next/model/block";
import type { CarryGeometry } from "../../../obsidian/ui/next/model/carry";
import { targetAt } from "../../../obsidian/ui/next/model/carryPlace";
import type { BlockMsg } from "../../../obsidian/ui/next/model/messages";
import { listsOf } from "../../../obsidian/ui/next/update/carry";
import { fakeTitleFields } from "../../helpers/FakeTitleField";
import { type Harness, settle } from "../../runtime/harness";
import { projectHarness } from "./blockHarness";

const app = { keymap: { pushScope: () => undefined, popScope: () => undefined }, scope: {} } as never;
const words = { failure: () => "", notice: () => undefined, openLink: () => undefined, openTasksFile: () => undefined, titleField: () => fakeTitleFields().factory };
const pointer = (type: string, x: number, y: number, pointerType = "mouse") => new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, button: 0, clientX: x, clientY: y });

/** Stacked rows, a card 35 px, a header 26 px, a 2 px gap: what the stylesheet lays out, which happy-dom does not. */
function geometryOf(lists: BlockLists): CarryGeometry {
	let top = 0;
	const measured = listsOf(lists).map(({ column, list }) => {
		const start = top;
		const rows = list.rows.map((row) => {
			const height = row.kind === "head" ? 26 : 35;
			const box = { key: row.key, top, height, left: 0, width: 300 };
			top += height + 2;
			return box;
		});
		const out = { column, left: 0, width: 300, top: start, bottom: Math.max(top, start + 35), rows };
		top += 40;
		return out;
	});
	return { lists: measured, indent: 20, cardHeight: 35, cardGap: 2, dot: 8 };
}

describe("the plus carried and a section lifted, drawn", () => {
	let h: Harness;
	let host: BlockHost;
	const carry = (msg: Extract<BlockMsg, { kind: "carry" }>["msg"]) => host.dispatch({ kind: "carry", msg });
	const acted = (act: string, value: string | null = null) => host.dispatch({ kind: "acted", act: { act, key: null, value } });

	beforeEach(async () => {
		h = await projectHarness();
		host = new BlockHost({ session: h.runtime.openHost(), app, ...words }, "Дружба.md", document.body);
		document.body.appendChild(host.node);
		host.mount();
	});

	afterEach(async () => {
		host.dispose();
		await h.runtime.unload();
	});

	it("lifts the plus when pressed and moved: its place ringed, hot while the finger is over it, the plus float under the finger", () => {
		const plus = host.node.querySelector<HTMLElement>("[data-n-act='plus']")!;
		expect(plus).not.toBeNull();
		plus.dispatchEvent(pointer("pointerdown", 0, 0, "touch"));
		plus.dispatchEvent(pointer("pointermove", 0, 20, "touch"));
		expect(host.model.carry?.kind).toBe("plus");
		expect(host.node.querySelector(".tc-n-plus.is-away")).not.toBeNull();
		expect(document.querySelector("[data-n-float-kind='plus']")).not.toBeNull();
		expect(host.node.querySelector(".tc-n-plus-ring.tc-n-plus-ring-hot")).not.toBeNull();
		plus.dispatchEvent(pointer("pointermove", 0, 400, "touch"));
		expect(host.node.querySelector(".tc-n-plus-ring-hot")).toBeNull();
		expect(host.node.querySelector(".tc-n-plus-ring")).not.toBeNull();
		plus.dispatchEvent(pointer("pointerup", 0, 400, "touch"));
		expect(host.model.entry?.state ?? null).toBeNull();
	});

	it("taps the plus: the field opens, no carry", () => {
		const plus = host.node.querySelector<HTMLElement>("[data-n-act='plus']")!;
		plus.dispatchEvent(pointer("pointerdown", 0, 0));
		plus.dispatchEvent(pointer("pointerup", 0, 0));
		expect(host.model.carry).toBeNull();
		expect(host.model.entry?.state).toBeTruthy();
	});

	it("opens the field where the plus was let go", () => {
		carry({ kind: "liftPlus", at: { x: 270, y: 620 }, box: { left: 250, top: 600, width: 44, height: 44 } });
		const model = host.model;
		carry({ kind: "measured", geometry: geometryOf(model.pinned!) });
		const inbox = host.model.carry!.geometry!.lists.find((l) => l.column === "inbox")!;
		const target = targetAt(host.model.carry!, host.model.pinned!, projectsView(host.model), 150, inbox.rows[0].top + 33);
		expect(target?.column).toBe("inbox");
		carry({ kind: "over", target, ring: false });
		carry({ kind: "drop" });
		expect(host.model.entry?.state).toBeTruthy();
		expect(host.node.querySelector("[data-n-island=field]")).not.toBeNull();
	});

	it("opens a header's menu on a tap, Rename puts the field on the header, Enter writes the name", async () => {
		const errands = [...host.node.querySelectorAll<HTMLElement>("[data-n-act='head']")].find((x) => x.textContent === "Errands")!;
		errands.dispatchEvent(pointer("pointerdown", 0, 0));
		errands.dispatchEvent(pointer("pointerup", 0, 0));
		expect(document.querySelector(".tc-n-lifted-head")?.textContent).toBe("Errands");
		expect([...document.querySelectorAll("[data-n-act^='section:']")].map((b) => (b as HTMLElement).dataset.nAct)).toEqual(["section:rename", "section:remove"]);
		acted("section:rename");
		const input = host.node.querySelector<HTMLInputElement>("input.tc-n-group-input")!;
		expect(input).not.toBeNull();
		expect(input.value).toBe("Errands");
		acted("section:named", "Shops");
		await settle(h.runtime);
		expect(host.node.querySelector("input.tc-n-group-input")).toBeNull();
		expect([...host.node.querySelectorAll(".tc-n-group-name")].map((x) => x.textContent)).toContain("Shops");
	});

	it("lifts a section by its header: the stack float, its rows waiting where they stand, the landing a line over the header it would stand above", async () => {
		const errands = [...host.node.querySelectorAll<HTMLElement>("[data-n-act='head']")].find((x) => x.textContent === "Errands")!;
		errands.dispatchEvent(pointer("pointerdown", 0, 0));
		errands.dispatchEvent(pointer("pointermove", 0, 20));
		expect(host.model.carry?.kind).toBe("section");
		expect(document.querySelector("[data-n-float-kind='section'] .tc-n-section-card-name")?.textContent).toBe("Errands");
		expect([...host.node.querySelectorAll(".tc-n-group-name")].map((x) => x.textContent)).toEqual(["No section", "Errands"]);
		expect(errands.closest("[data-n-key]")?.className).toContain("is-waiting");
		carry({ kind: "measured", geometry: geometryOf(host.model.pinned!) });
		carry({ kind: "slot", gap: 0 });
		expect(host.node.querySelector("[data-n-key='drop-line']")).not.toBeNull();
		carry({ kind: "drop" });
		await settle(h.runtime);
		expect(listsOf(currentLists(host.model)).find((l) => l.column === "day")!.list.rows.flatMap((r) => (r.kind === "head" ? [r.name] : []))).toEqual(["Errands", "No section"]);
	});
});
