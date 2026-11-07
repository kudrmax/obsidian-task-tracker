// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ViewWatch } from "../../obsidian/ui/ViewWatch";

const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

function page() {
	const view = document.createElement("div");
	const source = view.appendChild(document.createElement("div"));
	source.className = "markdown-source-view";
	const reading = view.appendChild(document.createElement("div"));
	reading.className = "markdown-reading-view";
	reading.style.display = "none";
	const block = source.appendChild(document.createElement("div"));
	document.body.appendChild(view);
	return { view, source, reading, block };
}

describe("a note's view watched for its block", () => {
	it("tells once when the mode switches, however it was switched", async () => {
		const { view, source, reading, block } = page();
		let told = 0;
		const watch = new ViewWatch(view, () => block, () => told++);
		watch.start();
		source.style.display = "none";
		reading.style.display = "";
		await frames();
		expect(told).toBe(1);
		watch.stop();
	});

	it("tells when the reading view is drawn again", async () => {
		const { view, reading, block } = page();
		let told = 0;
		const watch = new ViewWatch(view, () => block, () => told++);
		watch.start();
		reading.appendChild(document.createElement("div")).className = "mod-footer";
		await frames();
		expect(told).toBe(1);
		watch.stop();
	});

	it("doesn't hear the block's own changes", async () => {
		const { view, block } = page();
		let told = 0;
		const watch = new ViewWatch(view, () => block, () => told++);
		watch.start();
		block.appendChild(document.createElement("div")).className = "tc-card";
		block.classList.add("is-dragging");
		await frames();
		expect(told).toBe(0);
		watch.stop();
	});
});
