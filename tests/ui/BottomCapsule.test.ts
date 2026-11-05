// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UndoService } from "../../src/application/contracts";
import { BottomCapsule } from "../../src/ui/BottomCapsule";

function service(steps: number) {
	const listeners = new Set<() => void>();
	const undo = {
		steps,
		undo: async () => "done" as const,
		redo: async () => "done" as const,
		canUndo: () => undo.steps > 0,
		canRedo: () => false,
		onChange: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: () => listeners.forEach((listener) => listener()),
	};
	return undo satisfies UndoService;
}

const actions = () => ({ onUndo: vi.fn(), onSearch: vi.fn() });

describe("BottomCapsule", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("holds Undo and the magnifier in one capsule", () => {
		new BottomCapsule(document.body, service(0), actions());
		const capsule = document.querySelector(".tc-capsule")!;
		expect([...capsule.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Undo", "Search"]);
	});

	it("Undo stays dim and does nothing while there is nothing to take back", () => {
		const on = actions();
		new BottomCapsule(document.body, service(0), on);
		const button = document.querySelector<HTMLButtonElement>(".tc-undo")!;
		expect(button.classList.contains("is-off")).toBe(true);
		button.click();
		expect(on.onUndo).not.toHaveBeenCalled();
	});

	it("Undo lights up once there is a step, and takes it back on a press", () => {
		const on = actions();
		const undo = service(0);
		new BottomCapsule(document.body, undo, on);
		undo.steps = 1;
		undo.emit();
		const button = document.querySelector<HTMLButtonElement>(".tc-undo")!;
		expect(button.classList.contains("is-off")).toBe(false);
		button.click();
		expect(on.onUndo).toHaveBeenCalledOnce();
	});

	it("the magnifier opens the search, with or without a step to take back", () => {
		const on = actions();
		new BottomCapsule(document.body, service(0), on);
		document.querySelector<HTMLButtonElement>(".tc-search-open")!.click();
		expect(on.onSearch).toHaveBeenCalledOnce();
	});
});
