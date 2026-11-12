// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BlockHeight } from "../../obsidian/ui/BlockHeight";

function boxed(el: HTMLElement, top: number, height: number): void {
	el.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
}

/** A note's block in rows: its stack fills the block, as the CSS lays it out, so the stack's own box is the block's height. */
function rowsBlock(rowHeights: readonly number[]) {
	const block = document.body.appendChild(document.createElement("div"));
	const root = block.appendChild(document.createElement("div"));
	root.className = "is-view-rows";
	const rows = root.appendChild(document.createElement("div"));
	rows.className = "tc-rows";
	const stack = rows.appendChild(document.createElement("div"));
	stack.className = "tc-rows-stack";
	boxed(root, 0, 600);
	boxed(stack, 0, 600);
	Object.defineProperty(stack, "scrollHeight", { value: 600 });
	let top = 0;
	for (const height of rowHeights) {
		const row = stack.appendChild(document.createElement("div"));
		boxed(row, top, height);
		row.getClientRects = () => [new DOMRect(0, top, 300, height)] as unknown as DOMRectList;
		top += height;
	}
	return { block, root, stack };
}

describe("BlockHeight", () => {
	it("fits the block to its rows' foot, not to the stack that fills it: the block shrinks when its tasks go (Subprojects off)", () => {
		const { block, root } = rowsBlock([60, 60, 100, 60]);
		new BlockHeight(block, root).fit();
		expect(block.style.height).toBe("280px");
	});
});
