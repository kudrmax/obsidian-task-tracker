// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Rendered } from "../../../obsidian/ui/next/drivers/islands";

/** A renderer that stands in for Obsidian's: it writes the markdown as text, a `[[note]]` as an internal link. */
const made: { el: HTMLElement; markdown: string; unloaded: boolean }[] = [];
const fake = (el: HTMLElement, markdown: string) => {
	const one = { el, markdown, unloaded: false };
	made.push(one);
	el.innerHTML = markdown.replace(/\[\[(.+?)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>').replace(/\((https:\S+?)\)/g, '<a href="$1">$1</a>');
	return () => {
		one.unloaded = true;
		el.replaceChildren();
	};
};

const spot = (): HTMLElement => {
	const root = document.createElement("div");
	root.innerHTML = '<div data-n-part="peek"><div data-n-island="peek"></div></div>';
	document.body.appendChild(root);
	return root;
};

describe("the description's start over a menu, drawn by Obsidian", () => {
	it("renders once into its island, again only when the text changes, and lets go when the island goes", () => {
		made.length = 0;
		const root = spot();
		const rendered = new Rendered(fake);
		const hooks = { read: () => undefined, note: () => undefined, away: () => undefined };
		rendered.sync(root, "peek", "Call first", hooks);
		rendered.sync(root, "peek", "Call first", hooks);
		expect(made.map((m) => m.markdown)).toEqual(["Call first"]);
		rendered.sync(root, "peek", "Call later", hooks);
		expect(made.map((m) => m.unloaded)).toEqual([true, false]);
		root.replaceChildren();
		rendered.sync(root, "peek", "Call later", hooks);
		expect(made[1].unloaded).toBe(true);
	});

	it("a tap on the text reads it whole; a note's link opens the note; any other link leaves", () => {
		const root = spot();
		const said: string[] = [];
		new Rendered(fake).sync(root, "peek", "See [[Plan]] and (https://example.com)", { read: () => said.push("read"), note: (t) => said.push(`note ${t}`), away: () => said.push("away") });
		const island = root.querySelector<HTMLElement>("[data-n-island=peek]")!;
		island.click();
		island.querySelector<HTMLElement>(".internal-link")!.click();
		island.querySelector<HTMLElement>("a[href]")!.click();
		expect(said).toEqual(["read", "note Plan", "away"]);
	});

	it("draws nothing without Obsidian's renderer (a test host)", () => {
		const root = spot();
		new Rendered(null).sync(root, "peek", "Call first", { read: () => undefined, note: () => undefined, away: () => undefined });
		expect(root.querySelector("[data-n-island=peek]")!.childNodes.length).toBe(0);
	});
});
