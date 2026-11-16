import { describe, expect, it } from "vitest";
import { MODEL_PROFILES } from "../../../core/application/assistant/models";
import type { ModelProfile } from "../../../core/application/assistant/models/profile";
import { FakeTransport, rig, SETTINGS, settle } from "./assistantFakes";

/** R5's proof: a local model is a profile and a transport, added here alone; no other file changes. */
const localProfile: ModelProfile = {
	id: "local",
	name: "Local model",
	fields: [
		{ key: "url", label: "Server", kind: "text", default: "http://localhost:1234" },
		{ key: "model", label: "Model", kind: "text", default: "qwen" },
	],
	words: {
		notInstalled: "No local server.",
		signedOut: "Not signed in.",
		noAccess: "No access.",
		limit: "Limit.",
		busy: "Busy.",
		offline: "The local server doesn't answer.",
		badModel: "Unknown local model.",
		timeout: "The local model didn't answer in {timeout}.",
		badAnswer: "Bad answer.",
		unknown: "The local model failed.",
	},
	unavailable: "The local model isn't set up here.",
};

describe("a second model, added in this file alone", () => {
	const settings = { ...SETTINGS, assistant: { ...SETTINGS.assistant, model: "local", models: { local: { model: "llama" } } } };
	const local = new FakeTransport();
	const claude = new FakeTransport();
	const both = () => {
		const transports: Record<string, FakeTransport> = { claude, local };
		return { ids: Object.keys(transports), transport: (id: string) => async () => transports[id] };
	};

	it("is offered and asked when chosen, with its own settings; Claude is not asked", async () => {
		const { assistant } = rig({ settings, profiles: [...MODEL_PROFILES, localProfile], models: both });
		expect(assistant.offers("more").map((o) => o.label)).toEqual(["Best task"]);
		const outcome = assistant.press("bestTask");
		await settle();
		expect(claude.asked).toEqual([]);
		expect(local.asked).toHaveLength(1);
		expect(local.asked[0].settings).toEqual({ url: "http://localhost:1234", model: "llama" });
		local.answer({ taskRef: local.refOf("Pay rent"), reason: "Rent." });
		expect(await outcome).toMatchObject({ kind: "task", note: "Rent." });
	});

	it("speaks its own words", async () => {
		const { assistant, timers } = rig({ settings, profiles: [...MODEL_PROFILES, localProfile], models: both });
		const outcome = assistant.press("bestTask");
		await settle();
		timers.fire();
		expect(await outcome).toMatchObject({ kind: "failed", words: "The local model didn't answer in 2 minutes." });
	});

	it("has its page: both models offered, its fields drawn", async () => {
		const { assistant } = rig({ settings, profiles: [...MODEL_PROFILES, localProfile], models: both });
		const page = await assistant.page();
		expect(page.models.map((m) => m.id)).toEqual(["claude", "local"]);
		expect(page.fields.map((f) => [f.key, f.value])).toEqual([["url", "http://localhost:1234"], ["model", "llama"]]);
	});
});
