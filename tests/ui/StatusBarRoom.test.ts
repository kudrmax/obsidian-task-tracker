// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_BAR_SHOWN, StatusBarRoom } from "../../src/ui/StatusBarRoom";

/** Lets the mutation observer's records arrive. */
const delivered = () => new Promise((resolve) => setTimeout(resolve, 0));

const marked = () => document.body.classList.contains(STATUS_BAR_SHOWN);

function appContainer(withBar = true): { app: HTMLElement; bar: HTMLElement } {
	const app = document.createElement("div");
	app.className = "app-container";
	const bar = document.createElement("div");
	bar.className = "status-bar";
	if (withBar) app.appendChild(bar);
	return { app, bar };
}

let releases: (() => void)[] = [];
const hold = () => {
	const release = StatusBarRoom.hold(document);
	releases.push(release);
	return release;
};

let bar: HTMLElement;

beforeEach(() => {
	const parts = appContainer();
	document.body.appendChild(parts.app);
	bar = parts.bar;
});

afterEach(() => {
	releases.splice(0).forEach((release) => release());
	document.body.replaceChildren();
	document.body.className = "";
	vi.restoreAllMocks();
});

describe("StatusBarRoom", () => {
	it("marks the body at once while the status bar shows", () => {
		hold();
		expect(marked()).toBe(true);
	});

	it("follows the bar's inline style the way the selector reads it", async () => {
		hold();
		const steps: [string | null, boolean][] = [
			[null, true],
			["display: none", false],
			["display: none !important", false],
			["display:none", true],
			["color: red", true],
			["display: none", false],
			["display: flex", true],
		];
		for (const [style, shown] of steps) {
			if (style === null) bar.removeAttribute("style");
			else bar.setAttribute("style", style);
			await delivered();
			expect(marked(), String(style)).toBe(shown);
		}
	});

	it("no status bar, or not where the selector looks, no mark", () => {
		document.body.replaceChildren(appContainer(false).app);
		const release = StatusBarRoom.hold(document);
		expect(marked()).toBe(false);
		release();

		const nested = appContainer(false);
		nested.app.appendChild(document.createElement("div")).appendChild(appContainer().bar);
		document.body.replaceChildren(nested.app);
		const again = StatusBarRoom.hold(document);
		expect(marked()).toBe(false);
		again();

		const wrapper = document.createElement("div");
		wrapper.appendChild(appContainer().app);
		document.body.replaceChildren(wrapper);
		hold();
		expect(marked()).toBe(false);
	});

	it("a status bar or a container put in later is watched", async () => {
		const empty = appContainer(false);
		document.body.replaceChildren(empty.app);
		hold();
		expect(marked()).toBe(false);

		const later = empty.app.appendChild(document.createElement("div"));
		later.className = "status-bar";
		await delivered();
		expect(marked()).toBe(true);
		later.setAttribute("style", "display: none");
		await delivered();
		expect(marked()).toBe(false);

		const fresh = appContainer();
		empty.app.replaceWith(fresh.app);
		await delivered();
		expect(marked()).toBe(true);
		fresh.bar.setAttribute("style", "display: none");
		await delivered();
		expect(marked()).toBe(false);
		fresh.bar.removeAttribute("style");
		await delivered();
		expect(marked()).toBe(true);

		fresh.bar.remove();
		await delivered();
		expect(marked()).toBe(false);
		fresh.app.appendChild(fresh.bar);
		await delivered();
		expect(marked()).toBe(true);
	});

	it("two holders, one mark: the last to let go takes it off", async () => {
		const first = hold();
		const second = hold();
		first();
		expect(marked()).toBe(true);
		bar.setAttribute("style", "display: none");
		await delivered();
		expect(marked()).toBe(false);
		bar.removeAttribute("style");
		await delivered();
		expect(marked()).toBe(true);

		second();
		expect(marked()).toBe(false);
		bar.setAttribute("style", "color: red");
		await delivered();
		expect(marked()).toBe(false);

		second();
		first();
		hold();
		expect(marked()).toBe(true);
		bar.setAttribute("style", "display: none");
		await delivered();
		expect(marked()).toBe(false);
	});

	it("does not wake for styles written elsewhere on the page", async () => {
		const float = document.body.appendChild(document.createElement("div"));
		float.className = "tc-float";
		const deep = bar.parentElement!.appendChild(document.createElement("div")).appendChild(document.createElement("div"));
		hold();
		await delivered();
		const lookups = vi.spyOn(document.body, "querySelector");
		for (let i = 0; i < 50; i++) {
			float.style.transform = `translate(${i}px, ${i}px)`;
			deep.style.transform = `translateY(${i}px)`;
		}
		await delivered();
		expect(lookups).not.toHaveBeenCalled();
	});
});
