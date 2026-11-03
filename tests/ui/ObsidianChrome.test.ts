// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObsidianChrome } from "../../src/ui/quick/ObsidianChrome";

/** Obsidian's toolbar over the phone keyboard, its buttons' top at `top`. */
function addToolbar(top: number): HTMLElement {
	const toolbar = document.body.appendChild(document.createElement("div"));
	toolbar.className = "mobile-toolbar";
	const options = toolbar.appendChild(document.createElement("div"));
	options.className = "mobile-toolbar-options-container";
	options.getBoundingClientRect = () => new DOMRect(0, top, 390, 44);
	return toolbar;
}

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
	it("finds the keyboard's toolbar once while it stays", () => {
		addToolbar(600);
		const chrome = new ObsidianChrome(document);
		const lookups = vi.spyOn(document.body, "querySelector");
		for (let i = 0; i < 10; i++) expect(chrome.toolbarTop()).toBe(600);
		expect(lookups).toHaveBeenCalledTimes(1);
	});

	it("finds the status bar once while it stays", () => {
		addStatusBar(700);
		const chrome = new ObsidianChrome(document);
		const lookups = vi.spyOn(document.body, "querySelector");
		for (let i = 0; i < 10; i++) expect(chrome.statusBarTop()).toBe(700);
		expect(lookups).toHaveBeenCalledTimes(1);
	});

	it("finds it again once it is gone", () => {
		const first = addToolbar(600);
		const chrome = new ObsidianChrome(document);
		expect(chrome.toolbarTop()).toBe(600);
		first.remove();
		expect(chrome.toolbarTop()).toBeNull();
		addToolbar(500);
		expect(chrome.toolbarTop()).toBe(500);
	});

	it("Infinity without a status bar, null without a toolbar", () => {
		const chrome = new ObsidianChrome(document);
		expect(chrome.toolbarTop()).toBeNull();
		expect(chrome.statusBarTop()).toBe(Infinity);
		addStatusBar(700, 0);
		expect(chrome.statusBarTop()).toBe(Infinity);
	});
});
