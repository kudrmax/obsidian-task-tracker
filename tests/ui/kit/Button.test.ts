// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Button, roundShape } from "../../../obsidian/ui/kit/Button";

const parent = () => document.createElement("div");

describe("Button", () => {
	it("is a button of its kind, tone and purpose", () => {
		const host = parent();
		const button = Button.create(host, { kind: "round", tone: "accent", label: "New task", icon: "plus", cls: "tc-plus", onPress: () => {} });
		expect(button.el.tagName).toBe("BUTTON");
		expect(button.el.parentElement).toBe(host);
		expect([...button.el.classList]).toEqual(["tc-btn", "is-round", "is-accent", "tc-plus"]);
		expect(Button.create(parent(), { kind: "bar", label: "x", cls: "tc-bar-shift tc-bar-indent", onPress: () => {} }).el.className).toBe("tc-btn is-bar is-plain tc-bar-shift tc-bar-indent");
		for (const kind of ["icon", "text", "pill", "swatch"] as const)
			for (const tone of ["quiet", "strong", "danger"] as const) expect(Button.create(parent(), { kind, tone, label: "x", onPress: () => {} }).el.className).toBe(`tc-btn is-${kind} is-${tone}`);
	});

	it("names an icon button, and a text button only when its text says something else", () => {
		expect(Button.create(parent(), { kind: "icon", label: "Next day", icon: "chevronRight", onPress: () => {} }).el.getAttribute("aria-label")).toBe("Next day");
		const close = Button.create(parent(), { kind: "text", label: "Close", onPress: () => {} }).el;
		expect([close.textContent, close.hasAttribute("aria-label")]).toEqual(["Close", false]);
		const title = Button.create(parent(), { kind: "text", label: "Back to today", text: "Mon", onPress: () => {} }).el;
		expect([title.textContent, title.getAttribute("aria-label"), title.children.length]).toEqual(["Mon", "Back to today", 0]);
		expect(Button.create(parent(), { kind: "bar", label: "Priority", title: "Priority", icon: "priority", onPress: () => {} }).el.title).toBe("Priority");
	});

	it("draws its icon first, and its text beside it in a label", () => {
		const button = Button.create(parent(), { kind: "pill", tone: "danger", label: "Delete", icon: "delete", onPress: () => {} }).el;
		expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
		expect(button.querySelector(".tc-btn-label")?.textContent).toBe("Delete");
		expect(button.hasAttribute("aria-label")).toBe(false);
	});

	it("hands a click to onPress", () => {
		const onPress = vi.fn();
		const button = Button.create(parent(), { kind: "icon", label: "x", icon: "plus", onPress });
		button.el.click();
		expect(onPress).toHaveBeenCalledTimes(1);
		expect(onPress.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
	});

	it("marks itself on, off and hidden", () => {
		const button = Button.create(parent(), { kind: "swatch", label: "red", onPress: () => {} });
		button.setOn(true);
		button.setOff(true);
		button.setHidden(true);
		expect(["is-on", "is-off", "is-hidden"].map((name) => button.el.classList.contains(name))).toEqual([true, true, true]);
		button.setOn(false);
		button.setOff(false);
		button.setHidden(false);
		expect(["is-on", "is-off", "is-hidden"].map((name) => button.el.classList.contains(name))).toEqual([false, false, false]);
	});

	it("changes its text and its icon in place", () => {
		const sheet = Button.create(parent(), { kind: "text", label: "Close", onPress: () => {} });
		sheet.setText("Cancel");
		expect(sheet.el.textContent).toBe("Cancel");
		const place = Button.create(parent(), { kind: "bar", label: "Place", icon: "inbox", text: "", onPress: () => {} });
		place.setText("Soon");
		place.setIcon("soon");
		expect(place.el.querySelectorAll("svg")).toHaveLength(1);
		expect(place.el.firstElementChild?.tagName.toLowerCase()).toBe("svg");
		expect(place.el.querySelector("path")?.getAttribute("d")).toContain("M5 21.5h14");
		expect(place.el.querySelector(".tc-btn-label")?.textContent).toBe("Soon");
		expect(place.el.getAttribute("aria-label")).toBe("Place");
	});
});

describe("roundShape", () => {
	it("gives what is not a button the round button's look", () => {
		const host = parent();
		const ring = roundShape(host, "cross", "quiet", "tc-plus-ring is-cross");
		expect(ring.tagName).toBe("DIV");
		expect(ring.parentElement).toBe(host);
		expect(ring.className).toBe("tc-btn is-round is-quiet tc-plus-ring is-cross");
		expect(ring.querySelector("svg")).not.toBeNull();
	});
});
