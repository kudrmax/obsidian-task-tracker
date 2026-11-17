import { describe, expect, it } from "vitest";
import { TIMEOUT_GRACE_MS } from "../../../core/application/assistant/AssistantServiceImpl";
import { claudeProfile } from "../../../core/application/assistant/models/claude";
import { durationWords } from "../../../core/application/assistant/outcomes";
import type { AssistantOutcome, PreparedQuestion } from "../../../core/application/contracts";
import { FAILURE_KINDS } from "../../../core/application/assistant/model";
import { MODEL_PROFILES } from "../../../core/application/assistant/models";
import { rig, SETTINGS, settle } from "./assistantFakes";

const BEST = "bestTask";

describe("pressing Best task", () => {
	it("asks the chosen model once with the prompt, the briefing of Today and Soon and the answer's shape", async () => {
		const { assistant, transport, loads } = rig();
		void assistant.press(BEST);
		await settle();
		expect(loads.count).toBe(1);
		expect(transport.asked).toHaveLength(1);
		const { question, settings } = transport.asked[0];
		expect(question.instructions).toMatch(/^You help me choose the one task that matters most\./);
		expect(question.answerSchema).toEqual({ type: "object", properties: { taskRef: { type: "string" }, reason: { type: "string" } }, required: ["taskRef", "reason"], additionalProperties: false });
		expect(JSON.parse(question.input).candidates.map((t: { title: string }) => t.title)).toEqual(["Find the template", "Pay rent", "Find the contract", "Read a book", "Dentist"]);
		expect(settings).toEqual({ model: "sonnet", path: "" });
	});

	it("comes back with the task named, drawn as its card, and the reason", async () => {
		const { assistant, transport } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent is **due**." });
		const result = await outcome;
		expect(result).toMatchObject({ kind: "task", title: "Best task", note: "Rent is **due**." });
		expect(result.kind === "task" && result.task.title).toBe("Pay rent");
	});

	it("a step of an unfolded task can be the answer, drawn with its task's title above", async () => {
		const { assistant, transport } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.answer({ taskRef: transport.refOf("Find the contract"), reason: "First step." });
		const result = await outcome;
		expect(result.kind === "task" && [result.task.title, result.card.over]).toEqual(["Find the contract", "Call the bank"]);
	});

	it("a ref the question never sent is a bad answer", async () => {
		const { assistant, transport } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.answer({ taskRef: "t99", reason: "?" });
		expect(await outcome).toMatchObject({ kind: "failed", title: "Couldn't find the best task", words: "Claude's answer didn't name one of the tasks. Try again." });
	});

	it("an answer of another shape is a bad answer, its detail for the console", async () => {
		const { assistant, transport } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.answer({ task: "t1" });
		const result = await outcome;
		expect(result).toMatchObject({ kind: "failed", words: claudeProfile.words.badAnswer });
		expect(result.kind === "failed" && result.detail).toContain('{"task":"t1"}');
	});

	it("a task done during the wait is gone, not the model's failure", async () => {
		const { assistant, transport, tasks } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		const rent = (await tasks.listed()).lists.now.find((t) => t.title === "Pay rent")!;
		await tasks.setStatus(rent.key, "done");
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent." });
		expect(await outcome).toMatchObject({ kind: "failed", title: "Couldn't find the best task", words: "That task was closed while Claude was thinking." });
	});

	it("a task deleted during the wait is gone", async () => {
		const { assistant, transport, tasks } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		const rent = (await tasks.listed()).lists.now.find((t) => t.title === "Pay rent")!;
		await tasks.remove(rent.key);
		transport.answer({ taskRef: transport.refOf("Pay rent"), reason: "Rent." });
		expect(await outcome).toMatchObject({ kind: "failed", words: "That task was closed while Claude was thinking." });
	});

	it("a task moved and renamed through the plugin during the wait is still the one named", async () => {
		const { assistant, transport, tasks } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		const book = (await tasks.listed()).lists.soon.find((t) => t.title === "Read a book")!;
		await tasks.moveToEnd(book.key, "backlog");
		const moved = (await tasks.listed()).lists.backlog.find((t) => t.title === "Read a book")!;
		await tasks.rename(moved.key, "Read a good book");
		transport.answer({ taskRef: transport.refOf("Read a book"), reason: "Rest." });
		const result = await outcome;
		expect(result.kind === "task" && [result.task.title, result.task.list, result.task.id]).toEqual(["Read a good book", "backlog", book.id]);
	});

	it("with Today and Soon empty asks nothing and says so", async () => {
		const { assistant, transport } = rig({ text: "## Now\n\n- [x] Done\n\n## Soon\n\n## Backlog\n\n- [ ] Later\n" });
		expect(await assistant.press(BEST)).toMatchObject({ kind: "failed", title: "Couldn't find the best task", words: "Today and Soon have no open tasks." });
		expect(transport.asked).toEqual([]);
	});

	it("without a tasks file asks nothing", async () => {
		const { assistant, transport } = rig({ text: null });
		expect(await assistant.press(BEST)).toMatchObject({ kind: "failed", words: "Today and Soon have no open tasks." });
		expect(transport.asked).toEqual([]);
	});

	it("uses the prompt from the settings, a blank one the default", async () => {
		const custom = rig({ settings: { ...SETTINGS, assistant: { ...SETTINGS.assistant, prompts: { bestTask: "Pick the one." } } } });
		void custom.assistant.press(BEST);
		await settle();
		expect(custom.transport.asked[0].question.instructions).toBe("Pick the one.");
		const blank = rig({ settings: { ...SETTINGS, assistant: { ...SETTINGS.assistant, prompts: { bestTask: "  " } } } });
		void blank.assistant.press(BEST);
		await settle();
		expect(blank.transport.asked[0].question.instructions).toMatch(/^You help me choose/);
	});

	it("rejects, never throws, for an action no button has", async () => {
		const { assistant } = rig();
		let outcome: Promise<unknown> | undefined;
		expect(() => {
			outcome = assistant.press("noSuchAction");
		}).not.toThrow();
		await expect(outcome).rejects.toThrow(/noSuchAction/);
	});

	it("never rejects when the transport fails to load", async () => {
		const { assistant } = rig({ models: () => ({ ids: ["claude"], transport: () => () => Promise.reject(new Error("no sdk")) }) });
		const result = await assistant.press(BEST);
		expect(result).toMatchObject({ kind: "failed", words: claudeProfile.words.unknown });
		expect(result.kind === "failed" && result.detail).toContain("no sdk");
	});
});

describe("a run under way", () => {
	it("is busy, and the row says Stop, from the tap until the answer", async () => {
		const { assistant, transport } = rig();
		expect(assistant.busy).toBe(false);
		expect(assistant.offers("more")).toEqual([{ actionId: BEST, label: "Best task", icon: "sparkles", running: false }]);
		const outcome = assistant.press(BEST);
		expect(assistant.busy).toBe(true);
		expect(assistant.offers("more")).toEqual([{ actionId: BEST, label: "Stop", icon: "sparkles", running: true }]);
		await settle();
		transport.answer({ taskRef: "t1", reason: "." });
		await outcome;
		expect(assistant.busy).toBe(false);
		expect(assistant.offers("more")[0]).toMatchObject({ label: "Best task", running: false });
	});

	it("tells its listeners when it starts and when it ends", async () => {
		const { assistant, transport } = rig();
		let changes = 0;
		const off = assistant.onChange(() => changes++);
		const outcome = assistant.press(BEST);
		expect(changes).toBe(1);
		await settle();
		transport.answer({ taskRef: "t1", reason: "." });
		await outcome;
		expect(changes).toBe(2);
		off();
		void assistant.press(BEST);
		expect(changes).toBe(2);
	});

	it("tells its listeners when the settings change: the offers may", async () => {
		const { assistant, settings } = rig();
		let changes = 0;
		assistant.onChange(() => changes++);
		await settings.update({ assistant: { ...settings.get().assistant, model: "local" } });
		expect(changes).toBe(1);
		expect(assistant.offers("more")).toEqual([]);
	});

	it("stop stops it: the run comes back stopped at once, nothing shown, the spinner gone", async () => {
		const { assistant, transport } = rig();
		const run = assistant.press(BEST);
		await settle();
		assistant.stop(BEST);
		expect(assistant.busy).toBe(false);
		expect(await run).toEqual({ kind: "stopped" });
		expect(transport.asked[0].stop.stopped).toBe("user");
	});

	it("stopped before the question goes out, asks nothing", async () => {
		const { assistant, transport } = rig();
		const run = assistant.press(BEST);
		assistant.stop(BEST);
		expect(await run).toEqual({ kind: "stopped" });
		await settle();
		expect(transport.asked).toEqual([]);
	});

	it("a press while the run is under way never stops it and never asks again: it waits for the same outcome", async () => {
		const { assistant, transport } = rig();
		const first = assistant.press(BEST);
		await settle();
		const second = assistant.press(BEST);
		await settle();
		expect(transport.asked).toHaveLength(1);
		expect(assistant.busy).toBe(true);
		transport.answer({ taskRef: "t3", reason: "." });
		const [a, b] = await Promise.all([first, second]);
		expect(a).toMatchObject({ kind: "task" });
		expect(b).toEqual(a);
	});

	it("a stale Stop, tapped after the answer came, does nothing: no new call (Max's menu left open)", async () => {
		const { assistant, transport } = rig();
		const run = assistant.press(BEST);
		await settle();
		transport.answer({ taskRef: "t1", reason: "." });
		await run;
		assistant.stop(BEST);
		await settle();
		expect(assistant.busy).toBe(false);
		expect(transport.asked).toHaveLength(1);
	});

	it("one run at a time per button: a press after the stop starts a new one", async () => {
		const { assistant, transport } = rig();
		void assistant.press(BEST);
		await settle();
		assistant.stop(BEST);
		const again = assistant.press(BEST);
		await settle();
		expect(transport.asked).toHaveLength(2);
		transport.answer({ taskRef: "t3", reason: "." }, 1);
		expect(await again).toMatchObject({ kind: "task" });
	});

	it("the same button on two targets: two runs side by side, each stopped alone", async () => {
		const { assistant, transport, tasks } = rig({});
		const [offer, rent] = (await tasks.listed()).lists.now;
		const one = assistant.press(BEST, { place: "task", taskIds: [offer.id] });
		const two = assistant.press(BEST, { place: "task", taskIds: [rent.id] });
		await settle();
		expect(transport.asked).toHaveLength(2);
		assistant.stop(BEST, { place: "task", taskIds: [offer.id] });
		expect(await one).toEqual({ kind: "stopped" });
		expect(assistant.busy).toBe(true);
		transport.answer({ taskRef: "t3", reason: "." }, 1);
		expect(await two).toMatchObject({ kind: "task" });
		expect(assistant.busy).toBe(false);
	});

	it("stopAll stops every run: the plugin's unload", async () => {
		const { assistant } = rig();
		const one = assistant.press(BEST);
		const two = assistant.press(BEST, { place: "selection", taskIds: ["x"] });
		assistant.stopAll();
		expect(assistant.busy).toBe(false);
		expect(await Promise.all([one, two])).toEqual([{ kind: "stopped" }, { kind: "stopped" }]);
	});
});

describe("the timeout", () => {
	it("waits the seconds the settings give, through the host's timers", async () => {
		const { assistant, timers } = rig({ settings: { ...SETTINGS, assistant: { ...SETTINGS.assistant, timeoutSeconds: 45 } } });
		void assistant.press(BEST);
		expect(timers.delays).toEqual([45_000]);
	});

	it("stops the signal with «timeout»: the transport's reply says why, in the model's words", async () => {
		const { assistant, transport, timers } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.onStopReply = () => ({ ok: false, failure: { kind: "limit", detail: "429 on the last retry" } });
		timers.fire();
		expect(transport.asked[0].stop.stopped).toBe("timeout");
		expect(await outcome).toMatchObject({ kind: "failed", words: "Claude's usage limit is reached. Try again when it resets.", detail: "429 on the last retry" });
		expect(timers.pending.size).toBe(0);
	});

	it("a timeout stop and a user stop reply differently: the timeout is told, Stop shows nothing", async () => {
		const timed = rig();
		const outcome = timed.assistant.press(BEST);
		await settle();
		timed.timers.fire();
		expect(await outcome).toMatchObject({ kind: "failed", words: "Claude didn't answer in 2 minutes." });

		const stopped = rig();
		const run = stopped.assistant.press(BEST);
		await settle();
		stopped.assistant.stop(BEST);
		expect(await run).toEqual({ kind: "stopped" });
	});

	it("a transport that replies `stopped` to the timeout reads as the timeout", async () => {
		const { assistant, transport, timers } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.onStopReply = () => ({ ok: false, failure: { kind: "stopped", detail: "aborted" } });
		timers.fire();
		expect(await outcome).toMatchObject({ kind: "failed", words: "Claude didn't answer in 2 minutes." });
	});

	it("a transport that never replies ends as the timeout after a grace", async () => {
		const { assistant, transport, timers } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.onStopReply = () => null;
		timers.fire();
		expect(timers.delays).toEqual([TIMEOUT_GRACE_MS]);
		timers.fire();
		expect(await outcome).toMatchObject({ kind: "failed", words: "Claude didn't answer in 2 minutes." });
		expect(assistant.busy).toBe(false);
	});

	it("an answer in time clears the timer", async () => {
		const { assistant, transport, timers } = rig();
		const outcome = assistant.press(BEST);
		await settle();
		transport.answer({ taskRef: "t1", reason: "." });
		await outcome;
		expect(timers.pending.size).toBe(0);
	});
});

describe("the words", () => {
	it("every model tells each failure but stopped", () => {
		for (const profile of MODEL_PROFILES) for (const kind of FAILURE_KINDS.filter((k) => k !== "stopped")) expect(profile.words[kind as Exclude<typeof kind, "stopped">], `${profile.id} ${kind}`).toMatch(/\S/);
	});

	it("each failure the transport replies comes as the model's words, its detail for the console", async () => {
		for (const kind of FAILURE_KINDS) {
			const { assistant, transport } = rig();
			const outcome = assistant.press(BEST);
			await settle();
			transport.reply({ ok: false, failure: { kind, detail: `why ${kind}` } });
			const result = await outcome;
			if (kind === "stopped") expect(result).toEqual({ kind: "stopped" });
			else expect(result).toEqual({ kind: "failed", title: "Couldn't find the best task", words: claudeProfile.words[kind].replace("{timeout}", "2 minutes"), detail: `why ${kind}` });
		}
	});

	it("say the timeout in minutes or seconds", () => {
		expect([durationWords(120), durationWords(60), durationWords(90), durationWords(10), durationWords(600)]).toEqual(["2 minutes", "1 minute", "90 seconds", "10 seconds", "10 minutes"]);
	});
});

describe("prepare and finish: the halves of a run, for a host that asks the model itself", () => {
	it("together come to what press comes to", async () => {
		const { assistant, transport } = rig();
		const pressed = assistant.press(BEST);
		await settle();
		const answer = { taskRef: transport.refOf("Read a book"), reason: "Rest." };
		transport.answer(answer);
		const prepared = (await assistant.prepare(BEST)) as PreparedQuestion;
		expect(prepared).toMatchObject({ kind: "question", actionId: BEST, modelId: "claude", target: { place: "more" } });
		expect(prepared.question).toEqual(transport.asked[0].question);
		expect(await assistant.finish(prepared, { ok: true, answer })).toEqual(await pressed);
	});

	it("the prepared question survives JSON both ways", async () => {
		const { assistant } = rig();
		const prepared = (await assistant.prepare(BEST)) as PreparedQuestion;
		const carried = JSON.parse(JSON.stringify(prepared)) as PreparedQuestion;
		expect(carried).toEqual(prepared);
		const answer = { taskRef: "t3", reason: "." };
		expect(await assistant.finish(carried, { ok: true, answer })).toEqual(await assistant.finish(prepared, { ok: true, answer }));
	});

	it("a host that serves the model but asks it itself (the door) gets the offers and the question, never a transport", async () => {
		const { assistant } = rig({ models: () => ({ ids: ["claude"] }) });
		expect(assistant.offers("more")).toHaveLength(1);
		const prepared = await assistant.prepare(BEST);
		expect(prepared.kind).toBe("question");
		expect(await assistant.press(BEST)).toMatchObject({ kind: "failed", words: claudeProfile.unavailable });
	});

	it("with no tasks gives the outcome, not a question", async () => {
		const { assistant } = rig({ text: "## Now\n\n## Soon\n" });
		expect(await assistant.prepare(BEST)).toMatchObject({ kind: "failed", words: "Today and Soon have no open tasks." });
	});

	it("a stopped reply finishes as stopped", async () => {
		const { assistant } = rig();
		const prepared = (await assistant.prepare(BEST)) as PreparedQuestion;
		const outcome: AssistantOutcome = await assistant.finish(prepared, { ok: false, failure: { kind: "stopped", detail: "" } });
		expect(outcome).toEqual({ kind: "stopped" });
	});
});
