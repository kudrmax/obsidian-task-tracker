import { describe, expect, it } from "vitest";
import { openOutside } from "../../obsidian/infrastructure/OutsideLink";

function page() {
	const opened: string[] = [];
	const navigated: string[] = [];
	return {
		opened,
		navigated,
		window: {
			open: (url: string) => {
				opened.push(url);
				return null;
			},
			location: { assign: (url: string) => navigated.push(url) },
		},
	};
}

describe("openOutside", () => {
	it("on the phone navigates the page, which iOS hands to the app even long after a tap", () => {
		const p = page();
		openOutside("taskcalendar://synced", { isPhone: true, window: p.window });
		expect(p.navigated).toEqual(["taskcalendar://synced"]);
		expect(p.opened).toEqual([]);
	});

	it("on the Mac opens a window, which Electron hands to the system", () => {
		const p = page();
		openOutside("shortcuts://run-shortcut?name=x", { isPhone: false, window: p.window });
		expect(p.opened).toEqual(["shortcuts://run-shortcut?name=x"]);
		expect(p.navigated).toEqual([]);
	});
});
