// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventMenu } from "../../src/ui/menu/EventMenu";

describe("the event menu", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const open = () => {
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-item tc-event";
		source.innerHTML = '<div class="tc-event-bar"></div><div class="tc-event-body"><div class="tc-item-title">Работа</div></div>';
		const openInCalendar = vi.fn();
		EventMenu.open({ source, openInCalendar });
		return openInCalendar;
	};
	const panel = () => document.querySelector(".tc-panel") as HTMLElement;

	it("lays a copy of the event over the blur, as a timeline card's", () => {
		open();
		const lifted = document.querySelector(".tc-lifted.is-block");
		expect(lifted?.querySelector(".tc-event .tc-item-title")?.textContent).toBe("Работа");
	});

	it("offers one row, Open in Calendar, in the task menu's panel", () => {
		open();
		expect([...panel().querySelectorAll(".tc-menu-row .tc-menu-label")].map((n) => n.textContent)).toEqual(["Open in Calendar"]);
		expect(panel().querySelector(".tc-menu-row svg")).not.toBeNull();
		expect(panel().classList.contains("is-menu")).toBe(true);
		expect(panel().querySelector(".tc-menu-row")!.className).toBe("tc-btn tc-menu-row");
	});

	it("opens the calendar and closes", () => {
		const openInCalendar = open();
		panel().querySelector<HTMLButtonElement>(".tc-menu-row")!.click();
		expect(openInCalendar).toHaveBeenCalledOnce();
		expect(document.querySelector(".tc-backdrop")?.classList.contains("is-closing")).toBe(true);
	});
});
