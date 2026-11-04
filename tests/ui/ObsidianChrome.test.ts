// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObsidianChrome } from "../../src/ui/quick/ObsidianChrome";

function addStatusBar(top: number, height = 22): HTMLElement {
	const app = document.body.appendChild(document.createElement("div"));
	app.className = "app-container";
	const bar = app.appendChild(document.createElement("div"));
	bar.className = "status-bar";
	bar.getBoundingClientRect = () => new DOMRect(0, top, 800, height);
	return app;
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("ObsidianChrome", () => {
	it("finds the status bar once while it stays", () => {
		addStatusBar(700);
		const chrome = new ObsidianChrome(document);
		const lookups = vi.spyOn(document.body, "querySelector");
		for (let i = 0; i < 10; i++) expect(chrome.statusBarTop()).toBe(700);
		expect(lookups).toHaveBeenCalledTimes(1);
	});

	it("finds it again once it is gone", () => {
		const first = addStatusBar(700);
		const chrome = new ObsidianChrome(document);
		expect(chrome.statusBarTop()).toBe(700);
		first.remove();
		expect(chrome.statusBarTop()).toBe(Infinity);
		addStatusBar(650);
		expect(chrome.statusBarTop()).toBe(650);
	});

	it("Infinity without a status bar or while it is hidden", () => {
		const chrome = new ObsidianChrome(document);
		expect(chrome.statusBarTop()).toBe(Infinity);
		addStatusBar(700, 0);
		expect(chrome.statusBarTop()).toBe(Infinity);
	});
});
