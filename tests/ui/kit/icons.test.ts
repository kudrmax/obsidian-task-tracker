// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ICONS, icon, type IconName } from "../../../src/ui/kit/icons";

describe("the icon set", () => {
	const names = Object.keys(ICONS) as IconName[];

	it("draws every name", () => {
		for (const name of names) {
			const svg = icon(name);
			expect(svg.getAttribute("viewBox"), name).toBe("0 0 24 24");
			expect(svg.getAttribute("aria-hidden"), name).toBe("true");
			expect(svg.getAttribute("stroke-linejoin"), name).toBe("round");
			const strokes = [ICONS[name].d].flat();
			expect([...svg.querySelectorAll("path")].slice(0, strokes.length).map((p) => p.getAttribute("d")), name).toEqual(strokes);
		}
	});

	it("fills the filled part", () => {
		const paths = [...icon("progress").querySelectorAll("path")];
		expect(paths).toHaveLength(2);
		expect([paths[1].getAttribute("fill"), paths[1].getAttribute("stroke")]).toEqual(["currentColor", "none"]);
		expect(icon("rename").querySelectorAll("path")).toHaveLength(1);
		expect(icon("plus").querySelectorAll("path")).toHaveLength(2);
	});

	it("keeps every drawing once", () => {
		const drawings = names.map((name) => `${[ICONS[name].d].flat().join(" ")}|${ICONS[name].fill ?? ""}`);
		expect(drawings.filter((d, i) => drawings.indexOf(d) !== i)).toEqual([]);
	});
});
