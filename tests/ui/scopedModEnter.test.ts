// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { scopedModEnter } from "../../obsidian/ui/assistant/scopedModEnter";
import { AnswerPopup } from "../../obsidian/ui/assistant/AnswerPopup";
import { rig, settle } from "../application/assistant/assistantFakes";

interface FakeScope {
	readonly parent?: unknown;
	readonly keys: { modifiers: string[]; key: string; run: () => unknown }[];
}

function keymap() {
	const pushed: FakeScope[] = [];
	return {
		pushed,
		host: {
			scope: new Scope(),
			keymap: { pushScope: (s: Scope) => pushed.push(s as unknown as FakeScope), popScope: (s: Scope) => pushed.splice(pushed.indexOf(s as unknown as FakeScope), 1) },
		},
	};
}

describe("⌘Enter in the answer's field, under Obsidian's hotkeys", () => {
	it("a scope over the app's is pushed on focus and popped on blur; ⌘Enter runs, ⌘Z goes on to the field", () => {
		const { pushed, host } = keymap();
		const field = document.body.appendChild(document.createElement("textarea"));
		const run = vi.fn();
		scopedModEnter(host)(field, run);
		expect(pushed).toHaveLength(0);
		field.dispatchEvent(new FocusEvent("focus"));
		expect(pushed).toHaveLength(1);
		expect(pushed[0].parent).toBe(host.scope);
		const key = (mods: string[], name: string) => pushed[0].keys.find((k) => k.key === name && k.modifiers.join() === mods.join())!;
		expect(key(["Mod"], "Enter").run()).toBe(false);
		expect(run).toHaveBeenCalledTimes(1);
		expect(key(["Mod"], "z").run()).not.toBe(false);
		expect(key(["Mod", "Shift"], "z").run()).not.toBe(false);
		field.dispatchEvent(new FocusEvent("blur"));
		expect(pushed).toHaveLength(0);
	});

	it("popped when the popup closes with the field still focused", async () => {
		const { pushed, host } = keymap();
		const r = rig();
		const run = r.assistant.press("bestTask");
		await settle();
		r.transport.answer({ taskRef: r.transport.refOf("Pay rent"), reason: "Rent." });
		const outcome = await run;
		if (outcome.kind !== "task" || !outcome.context) throw new Error("no field");
		const popup = AnswerPopup.open(outcome, async (el, text) => void (el.textContent = text), {
			words: outcome.context.words,
			write: async () => ({ ok: true }),
			again: () => undefined,
			log: () => undefined,
			modEnter: scopedModEnter(host),
		}, document);
		document.querySelector<HTMLTextAreaElement>("textarea.tc-answer-field")!.dispatchEvent(new FocusEvent("focus"));
		expect(pushed).toHaveLength(1);
		popup.close();
		expect(pushed).toHaveLength(0);
	});
});
