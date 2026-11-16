import { describe, expect, it } from "vitest";
import { NO_MODEL_WORDS } from "../../../core/application/assistant/outcomes";
import { DEFAULT_SETTINGS } from "../../../core/settings";
import { rig, SETTINGS, settle } from "./assistantFakes";

const withModel = (model: string) => ({ ...SETTINGS, assistant: { ...SETTINGS.assistant, model } });

describe("the model chosen", () => {
	it("is the one the settings name, served here: Claude on the Mac", async () => {
		const { assistant } = rig();
		expect(assistant.offers("more").map((o) => o.actionId)).toEqual(["bestTask"]);
		expect((await assistant.page()).unavailable).toBeNull();
	});

	it("served nowhere here (the phone): no rows, and the page says why", async () => {
		const { assistant, transport } = rig({ models: () => ({ ids: [] }) });
		expect(assistant.offers("more")).toEqual([]);
		const page = await assistant.page();
		expect(page.unavailable).toBe("Claude works in Obsidian on the Mac.");
		expect(page.models).toEqual([{ id: "claude", name: "Claude", available: false }]);
		expect(await assistant.press("bestTask")).toMatchObject({ kind: "failed", words: "Claude works in Obsidian on the Mac." });
		expect(transport.asked).toEqual([]);
	});

	it("a model no profile has is chosen: nothing quietly asks Claude instead", async () => {
		const { assistant, transport } = rig({ settings: withModel("local") });
		expect(assistant.offers("more")).toEqual([]);
		const page = await assistant.page();
		expect(page).toMatchObject({ chosen: "local", unavailable: NO_MODEL_WORDS, fields: [] });
		expect(page.models).toEqual([
			{ id: "claude", name: "Claude", available: true },
			{ id: "local", name: "local", available: false },
		]);
		expect(await assistant.press("bestTask")).toMatchObject({ kind: "failed", words: NO_MODEL_WORDS });
		await settle();
		expect(transport.asked).toEqual([]);
	});
});

describe("the Assistant page", () => {
	it("draws the chosen model's fields with their values, notes and the host's hints, the timeout and each prompt", async () => {
		const { assistant, transport } = rig({ settings: { ...SETTINGS, assistant: { ...SETTINGS.assistant, models: { claude: { model: "haiku" } } } } });
		transport.hints = { path: "/opt/homebrew/bin/claude" };
		const page = await assistant.page();
		expect(page).toMatchObject({ chosen: "claude", unavailable: null, timeoutSeconds: 120 });
		expect(page.models).toEqual([{ id: "claude", name: "Claude", available: true }]);
		expect(page.fields).toEqual([
			{ key: "model", label: "Model", kind: "choice", choices: ["sonnet", "opus", "haiku"], value: "haiku", note: null, hint: null },
			{ key: "path", label: "Path to claude", kind: "text", choices: [], value: "", note: "Empty: found by itself", hint: "/opt/homebrew/bin/claude" },
		]);
		expect(page.prompts).toHaveLength(1);
		expect(page.prompts[0]).toMatchObject({ actionId: "bestTask", title: "Best task", isDefault: true });
		expect(page.prompts[0].prompt).toMatch(/^You help me choose/);
	});

	it("on a host without the model: the fields with no hints, the prompts still editable", async () => {
		const { assistant, loads } = rig({ models: () => ({ ids: [] }) });
		const page = await assistant.page();
		expect(page.fields.map((f) => [f.key, f.value, f.hint])).toEqual([["model", "sonnet", null], ["path", "", null]]);
		expect(page.prompts[0].isDefault).toBe(true);
		expect(loads.count).toBe(0);
	});

	it("a hint that fails is no hint", async () => {
		const { assistant, transport } = rig();
		transport.hint = () => Promise.reject(new Error("no fs"));
		expect((await assistant.page()).fields.map((f) => f.hint)).toEqual([null, null]);
	});
});

describe("set", () => {
	it("writes the chosen model", async () => {
		const { assistant, settings } = rig();
		await assistant.set({ kind: "model", id: "local" });
		expect(settings.get().assistant.model).toBe("local");
	});

	it("writes a model's field; a blank one is its default again", async () => {
		const { assistant, settings } = rig();
		await assistant.set({ kind: "field", modelId: "claude", key: "model", value: "opus" });
		await assistant.set({ kind: "field", modelId: "claude", key: "path", value: "/bin/claude" });
		expect(settings.get().assistant.models).toEqual({ claude: { model: "opus", path: "/bin/claude" } });
		await assistant.set({ kind: "field", modelId: "claude", key: "model", value: " " });
		expect(settings.get().assistant.models).toEqual({ claude: { path: "/bin/claude" } });
		expect((await assistant.page()).fields[0].value).toBe("sonnet");
	});

	it("writes a prompt; Reset or a blank one takes it off, the default again", async () => {
		const { assistant, settings } = rig();
		await assistant.set({ kind: "prompt", actionId: "bestTask", value: "Pick one." });
		expect((await assistant.page()).prompts[0]).toMatchObject({ prompt: "Pick one.", isDefault: false });
		await assistant.set({ kind: "prompt", actionId: "bestTask", value: null });
		expect(settings.get().assistant.prompts).toEqual({});
		await assistant.set({ kind: "prompt", actionId: "bestTask", value: "Pick one." });
		await assistant.set({ kind: "prompt", actionId: "bestTask", value: "  " });
		expect(settings.get().assistant.prompts).toEqual({});
		expect((await assistant.page()).prompts[0].isDefault).toBe(true);
	});

	it("writes the timeout within 10..600 seconds", async () => {
		const { assistant, settings } = rig();
		await assistant.set({ kind: "timeout", seconds: 30 });
		expect(settings.get().assistant.timeoutSeconds).toBe(30);
		await assistant.set({ kind: "timeout", seconds: 2 });
		expect(settings.get().assistant.timeoutSeconds).toBe(10);
		await assistant.set({ kind: "timeout", seconds: 9999 });
		expect(settings.get().assistant.timeoutSeconds).toBe(600);
	});

	it("keeps the rest of the settings", async () => {
		const { assistant, settings } = rig();
		await assistant.set({ kind: "timeout", seconds: 30 });
		expect(settings.get()).toEqual({ ...SETTINGS, assistant: { ...DEFAULT_SETTINGS.assistant, timeoutSeconds: 30 } });
	});
});
