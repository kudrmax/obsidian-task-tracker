// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearCardSize, showCardSize } from "../../../obsidian/ui/paint/cardSize";
import { clearPriorityColors, showLabelPaint, showPriorityColors } from "../../../obsidian/ui/paint/priorityColors";
import { addWindowDocument } from "../../../obsidian/ui/paint/windowDocuments";

const popout = () => document.implementation.createHTMLDocument("popout");

describe("a popout window draws as the main one", () => {
	afterEach(() => {
		clearCardSize();
		clearPriorityColors();
	});

	it("gets the card size and the colours already shown when it opens, and every later change", () => {
		showCardSize({ height: 38, gap: 4 });
		showPriorityColors([{ prefix: "!", color: "red" } as never]);
		showLabelPaint("blend");
		const doc = popout();
		const close = addWindowDocument(doc);
		expect(doc.body.style.getPropertyValue("--tc-card-h")).toBe("38px");
		expect(doc.head.querySelector("style")?.textContent).toBe(document.head.querySelector("style")?.textContent);
		expect(doc.body.classList.contains("tc-labels-blend")).toBe(true);
		showCardSize({ height: 30, gap: 2 });
		expect(doc.body.style.getPropertyValue("--tc-card-h")).toBe("30px");
		close();
		showCardSize({ height: 40, gap: 2 });
		expect(doc.body.style.getPropertyValue("--tc-card-h")).toBe("30px");
	});
});

/** A listener on the main window's `document` or `window` never hears a popout window: the host's leaf and a note's block listen to their own (the engine's own guard keeps it from listening by hand at all). */
describe("the host listens to its own window", () => {
	const files = ["ScreenLeaf.ts", "ScreenBlock.ts", "NoteBlocks.ts", "ViewWatch.ts"];
	it.each(files)("%s", (file) => {
		const source = readFileSync(join(process.cwd(), "obsidian/host", file), "utf8");
		expect(source).not.toMatch(/registerDomEvent\((document|window),|\b(document|window)\.(add|remove)EventListener|\bdocument\.(hidden|activeElement|body)/);
	});
});
