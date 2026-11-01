// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ChromeClearance, statusClear } from "../../src/ui/chrome";

const VIEW = new DOMRect(344, 78, 856, 722);

describe("Obsidian's chrome over the view", () => {
	it("the desktop status bar over the bottom right corner, measured in from the right edge", () => {
		expect(statusClear(VIEW, new DOMRect(1163, 775, 37, 25))).toBe(37);
		expect(statusClear(VIEW, new DOMRect(1163, 805, 37, 25))).toBe(0);
		expect(statusClear(VIEW, new DOMRect(0, 0, 0, 0))).toBe(0);
		expect(statusClear(VIEW, null)).toBe(0);
	});

	it("the clearance set on the view as the status bar's reach", () => {
		const view = document.body.appendChild(document.createElement("div"));
		const status = document.body.appendChild(document.createElement("div"));
		status.className = "status-bar";
		view.getBoundingClientRect = () => VIEW;
		status.getBoundingClientRect = () => new DOMRect(1163, 775, 37, 25);
		new ChromeClearance(view).measure();
		expect(view.style.getPropertyValue("--tc-status-clear")).toBe("37px");
		expect(view.style.getPropertyValue("--tc-nav-clear")).toBe("");
	});
});
