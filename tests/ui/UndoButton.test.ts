// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { UndoService } from "../../src/application/contracts";
import { UndoButton } from "../../src/ui/UndoButton";

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

describe("UndoButton", () => {
	it("stays dim and does nothing while there is nothing to take back", () => {
		const onPress = vi.fn();
		new UndoButton(document.body, service(0), onPress);
		const button = document.querySelector<HTMLButtonElement>(".tc-undo")!;
		expect(button.classList.contains("is-off")).toBe(true);
		button.click();
		expect(onPress).not.toHaveBeenCalled();
		document.body.innerHTML = "";
	});

	it("lights up once there is a step, and takes it back on a press", () => {
		const onPress = vi.fn();
		const undo = service(0);
		new UndoButton(document.body, undo, onPress);
		undo.steps = 1;
		undo.emit();
		const button = document.querySelector<HTMLButtonElement>(".tc-undo")!;
		expect(button.classList.contains("is-off")).toBe(false);
		button.click();
		expect(onPress).toHaveBeenCalledOnce();
		document.body.innerHTML = "";
	});
});
