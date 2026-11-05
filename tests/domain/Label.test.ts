import { describe, expect, it } from "vitest";
import { labelNameOf, labelsOfText, labelTitle, toggledLabel, usableLabels } from "../../src/domain/Label";
import { formatTaskLine, parseTaskLine, type Markers } from "../../src/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", priorities: ["p1"], labelTag: "label", labels: ["Важное", "Срочное", "Приоритет_1"] };

describe("labelsOfText", () => {
	it("takes the tags of known labels out of the text, anywhere in it, in its order", () => {
		expect(labelsOfText("Позвонить #label/Срочное в банк #label/Важное", "label", ["Важное", "Срочное"])).toEqual({ labels: ["Срочное", "Важное"], text: "Позвонить в банк" });
	});

	it("leaves a tag of another name, another folder and a word that only starts like a tag", () => {
		const text = "A #label/Другое #tag/Важное x#label/Важное";
		expect(labelsOfText(text, "label", ["Важное"])).toEqual({ labels: [], text });
	});

	it("reads a label tagged twice once", () => {
		expect(labelsOfText("A #label/Важное #label/Важное", "label", ["Важное"])).toEqual({ labels: ["Важное"], text: "A" });
	});
});

describe("a task line with labels", () => {
	it("reads the labels anywhere on the line, the date's end too, and writes them back after the text, before the date", () => {
		const p = parseTaskLine("- [ ] Позвонить #label/Важное в банк 📅 2026-11-03 #label/Срочное", M)!;
		expect(p.task).toMatchObject({ text: "Позвонить в банк", labels: ["Важное", "Срочное"], dueDate: "2026-11-03" });
		const q = parseTaskLine("- [ ] Позвонить #label/Важное в банк #label/Срочное 📅 2026-11-03", M)!;
		expect(q.task).toMatchObject({ text: "Позвонить в банк", labels: ["Важное", "Срочное"], dueDate: "2026-11-03" });
		expect(formatTaskLine(q, M)).toBe("- [ ] Позвонить в банк #label/Важное #label/Срочное 📅 2026-11-03");
	});

	it("reads a slot the tags come after", () => {
		const p = parseTaskLine("- [ ] Созвон ⏰ 2026-11-03 10:00-10:45 #label/Важное #label/Срочное", M)!;
		expect(p.task).toMatchObject({ text: "Созвон", labels: ["Важное", "Срочное"], slot: { date: "2026-11-03", start: 600, end: 645 } });
	});

	it("reads the priority and the labels of a line that has both", () => {
		expect(parseTaskLine("- [ ] p1 A #label/Важное", M)!.task).toMatchObject({ priority: "p1", text: "A", labels: ["Важное"] });
	});

	it("keeps a line without labels as it is", () => {
		const p = parseTaskLine("- [ ] A #label/Другое", M)!;
		expect(p.task.labels).toEqual([]);
		expect(formatTaskLine(p, M)).toBe("- [ ] A #label/Другое");
	});
});

describe("names", () => {
	it("shows underscores as spaces and writes spaces as underscores", () => {
		expect(labelTitle("Приоритет_1")).toBe("Приоритет 1");
		expect(labelNameOf("  Важное и  срочное ")).toBe("Важное_и_срочное");
	});

	it("uses a one-word name without #, the first of two alike", () => {
		const labels = [{ name: "A", color: "red" }, { name: "", color: "red" }, { name: "#B", color: "red" }, { name: "A", color: "blue" }] as const;
		expect(usableLabels(labels)).toEqual([{ name: "A", color: "red" }]);
	});

	it("toggles a label on at the end, off where it is", () => {
		expect(toggledLabel(["A"], "B")).toEqual(["A", "B"]);
		expect(toggledLabel(["A", "B"], "A")).toEqual(["B"]);
	});
});
