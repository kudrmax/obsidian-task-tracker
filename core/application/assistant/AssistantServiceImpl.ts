import { ASSISTANT_TIMEOUTS, type AssistantSettings, sizeOf, type TaskCalendarSettings } from "../../settings";
import type {
	AssistantField,
	AssistantOffer,
	AssistantOptionRow,
	AssistantOutcome,
	AssistantPage,
	AssistantService,
	AssistantSetting,
	PreparedQuestion,
	TaskItem,
} from "../contracts";
import type { SettingsStore, Timers } from "../ports";
import type { AssistantAction } from "./actions/action";
import { ASSISTANT_ACTIONS } from "./actions";
import { briefingOf, isEmptyBriefing } from "./briefing";
import { ModelChoice } from "./ModelChoice";
import { type HostModels, type ModelReply, NO_MODELS, type StopSignal, StopSwitch } from "./model";
import { MODEL_PROFILES } from "./models";
import type { ModelProfile, SettingField } from "./models/profile";
import { type ActionOption, optionValue } from "./options/option";
import { failed, failureWords, goneWords, NO_MODEL_WORDS, PAGE_WORDS, STOPPED } from "./outcomes";
import { type AssistantPlace, type AssistantTarget, tasksIn } from "./scope";
import { type AssistantSteps, type AssistantTasks, drawnAnswer, type ListedTasks, TaskLookup } from "./tasks";

/** How long a transport stopped by the timeout may take to say why before the run ends as a timeout anyway. */
export const TIMEOUT_GRACE_MS = 5000;

const MORE: AssistantTarget = { place: "more" };

/** What the assistant is put together from: the host's ports, and the buttons and models it knows. */
export interface AssistantDeps {
	readonly tasks: AssistantTasks;
	/** Joins an answer's option writes into one step to take back; left out, each write is its own. */
	readonly steps?: AssistantSteps;
	readonly settings: SettingsStore;
	readonly timers: Timers;
	readonly models?: HostModels;
	readonly actions?: readonly AssistantAction[];
	readonly profiles?: readonly ModelProfile[];
}

/** A run as its reply is read: its stop, and the moment its answer's options begin, after which nothing stops it. */
interface RunGate {
	readonly stop: StopSignal;
	marking(): void;
}

interface Run {
	readonly stop: StopSwitch;
	readonly outcome: Promise<AssistantOutcome>;
}

/** The assistant over the task service, the settings and the host's models. */
export class AssistantServiceImpl implements AssistantService {
	private readonly runs = new Map<string, Run>();
	private readonly listeners = new Set<() => void>();
	private unsubscribeSettings: (() => void) | null = null;
	private readonly choice: ModelChoice;
	private readonly actions: readonly AssistantAction[];
	private readonly tasks: AssistantTasks;
	private readonly steps: AssistantSteps;
	private readonly settings: SettingsStore;
	private readonly timers: Timers;

	constructor(deps: AssistantDeps) {
		this.tasks = deps.tasks;
		this.steps = deps.steps ?? { together: (work) => work() };
		this.settings = deps.settings;
		this.timers = deps.timers;
		this.actions = deps.actions ?? ASSISTANT_ACTIONS;
		this.choice = new ModelChoice(deps.profiles ?? MODEL_PROFILES, deps.models ?? NO_MODELS, () => this.assistant());
	}

	get busy(): boolean {
		return this.runs.size > 0;
	}

	offers(place: AssistantPlace, target: AssistantTarget = { place }): readonly AssistantOffer[] {
		if (this.choice.chosen() === null) return [];
		return this.actions
			.filter((action) => action.places.includes(place))
			.map((action) => {
				const running = this.runs.has(runKey(action.id, target));
				return { actionId: action.id, label: running ? action.labels.running : action.labels.idle, icon: action.icon, running };
			});
	}

	press(actionId: string, target: AssistantTarget = MORE): Promise<AssistantOutcome> {
		const action = this.actions.find((each) => each.id === actionId);
		if (!action) return Promise.reject(new Error(`No assistant action "${actionId}".`));
		const key = runKey(action.id, target);
		return this.runs.get(key)?.outcome ?? this.start(action, target, key);
	}

	stop(actionId: string, target: AssistantTarget = MORE): void {
		this.runs.get(runKey(this.actionOf(actionId).id, target))?.stop.stop("user");
	}

	stopAll(): void {
		for (const run of [...this.runs.values()]) run.stop.stop("user");
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		this.unsubscribeSettings ??= this.settings.onChange(() => this.emit());
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size > 0) return;
			this.unsubscribeSettings?.();
			this.unsubscribeSettings = null;
		};
	}

	async page(): Promise<AssistantPage> {
		const settings = this.assistant();
		const named = this.choice.named();
		const chosen = this.choice.chosen();
		const available = this.choice.available().map((profile) => ({ id: profile.id, name: profile.name, available: true }));
		const unserved = chosen ? [] : [{ id: settings.model, name: named?.name ?? settings.model, available: false }];
		return {
			models: [...available, ...unserved],
			chosen: settings.model,
			unavailable: chosen ? null : (named?.unavailable ?? NO_MODEL_WORDS),
			fields: chosen ? await this.fieldsOf(chosen) : [],
			timeoutSeconds: settings.timeoutSeconds,
			words: PAGE_WORDS,
			prompts: this.actions.map((action) => {
				const saved = settings.prompts[action.id];
				const isDefault = saved === undefined || saved.trim() === "";
				return { actionId: action.id, title: action.title, prompt: isDefault ? action.defaultPrompt : saved, isDefault, options: this.optionRows(action) };
			}),
		};
	}

	async set(change: AssistantSetting): Promise<void> {
		const settings = this.assistant();
		await this.settings.update({ assistant: changed(settings, change) });
	}

	async prepare(actionId: string, target: AssistantTarget = MORE): Promise<PreparedQuestion | AssistantOutcome> {
		const action = this.actionOf(actionId);
		const profile = this.choice.chosen();
		if (profile === null) return failed(action, this.choice.named()?.unavailable ?? NO_MODEL_WORDS, `model "${this.assistant().model}" is not served here`);
		const listed = await this.tasks.listed();
		const tasks = tasksIn(action.scope, target, listed);
		const keepers = this.keepers(action);
		const briefing = briefingOf(action.briefing, listed.today, tasks, (task) => keepers.some((keeper) => keeper.keeps(task)));
		if (isEmptyBriefing(briefing)) {
			const keptAll = keepers.length > 0 && !isEmptyBriefing(briefingOf(action.briefing, listed.today, tasks));
			return keptAll ? failed(action, keepers[0].allKeptWords, "every open task is kept back") : failed(action, action.emptyWords, "no open tasks to send");
		}
		return {
			kind: "question",
			actionId: action.id,
			modelId: profile.id,
			target,
			question: { instructions: this.promptOf(action), input: briefing.input, answerSchema: action.answerSchema },
			refs: briefing.refs,
		};
	}

	finish(prepared: PreparedQuestion, reply: ModelReply): Promise<AssistantOutcome> {
		return this.finished(prepared, reply, null);
	}

	/**
	 * The reply read; `run`, a run's: stopped before the options' part, the run ends as stopped or timed out, nothing marked.
	 * Once that part has begun (`run.marking()`), a Stop or the timeout is too late: it runs to the end, the run ends with the answer.
	 */
	private async finished(prepared: PreparedQuestion, reply: ModelReply, run: RunGate | null): Promise<AssistantOutcome> {
		const action = this.actionOf(prepared.actionId);
		const profile = this.choice.profileOf(prepared.modelId);
		if (profile === null) return failed(action, NO_MODEL_WORDS, `model "${prepared.modelId}" has no profile`);
		if (!reply.ok) {
			const { kind, detail } = reply.failure;
			return kind === "stopped" ? STOPPED : failed(action, failureWords(profile, kind, this.assistant().timeoutSeconds), detail);
		}
		const listed = await this.tasks.listed();
		const tasks = new TaskLookup(listed);
		const result = action.read(reply.answer, { input: prepared.question.input, refs: prepared.refs }, tasks);
		if (result.kind === "task") {
			if (run?.stop.stopped) return this.finished(prepared, stoppedReply(run.stop.stopped), null);
			run?.marking();
			return this.answered(action, result.taskId, result.note, listed);
		}
		const answer = `answer: ${JSON.stringify(reply.answer)}`;
		if (result.why === "gone") return failed(action, goneWords(profile), `the task named is closed or gone; ${answer}`);
		return failed(action, failureWords(profile, "badAnswer", this.assistant().timeoutSeconds), `the answer names no task sent; ${answer}`);
	}

	/**
	 * A `task` answer: the action's options do their part on the card it is drawn on, all their writes one step to take back,
	 * then it is drawn as the tasks then stand (as it stood, if it is gone by then). An option whose write failed leaves its
	 * words under the card and its error in `detail`; the answer stays.
	 */
	private async answered(action: AssistantAction, taskId: string, note: string, listed: ListedTasks): Promise<AssistantOutcome> {
		const before = new TaskLookup(listed);
		const drawn = drawnAnswer(before.find(taskId)!, before);
		const notices: string[] = [];
		const errors: string[] = [];
		const marked = await this.steps.together(async () => {
			let wrote = false;
			for (const option of action.options ?? []) {
				const value = this.valueOf(action, option);
				if (value === null || !option.afterAnswer) continue;
				wrote = true;
				try {
					const notice = await option.afterAnswer.run(value, { task: drawn.task, listed }, this.tasks);
					if (notice !== null) notices.push(notice);
				} catch (error) {
					notices.push(option.afterAnswer.failedWords(value));
					errors.push(`${option.key}: ${String(error)}`);
				}
			}
			return wrote;
		});
		const now = marked ? new TaskLookup(await this.tasks.listed()) : before;
		const chosen = now.find(taskId);
		return {
			kind: "task",
			title: action.title,
			...(chosen ? drawnAnswer(chosen, now) : drawn),
			note,
			notice: notices.length > 0 ? notices.join("\n") : null,
			detail: errors.length > 0 ? errors.join("\n") : null,
		};
	}

	/** The action's options that keep tasks from the model now, each with its value set. */
	private keepers(action: AssistantAction): readonly { keeps(task: TaskItem): boolean; readonly allKeptWords: string }[] {
		return (action.options ?? []).flatMap((option) => {
			const value = this.valueOf(action, option);
			if (value === null || !option.keepsBack) return [];
			const { keepsBack } = option;
			return [{ keeps: (task: TaskItem) => keepsBack.keeps(value, task), allKeptWords: keepsBack.allKeptWords(value) }];
		});
	}

	private valueOf(action: AssistantAction, option: ActionOption): string | null {
		return optionValue(option, this.assistant().options[action.id]?.[option.key], this.settings.get());
	}

	private optionRows(action: AssistantAction): readonly AssistantOptionRow[] {
		const settings: TaskCalendarSettings = this.settings.get();
		return (action.options ?? []).map((option) => ({
			key: option.key,
			label: option.label,
			choices: option.choices(settings),
			value: optionValue(option, settings.assistant.options[action.id]?.[option.key], settings),
		}));
	}

	/** A run: under way from now (the spinner), stopped by the timeout or by Max, ended once, whichever comes first. */
	private start(action: AssistantAction, target: AssistantTarget, key: string): Promise<AssistantOutcome> {
		const stop = new StopSwitch();
		const timeoutMs = this.assistant().timeoutSeconds * 1000;
		let grace: number | null = null;
		let settle!: (outcome: AssistantOutcome) => void;
		const outcome = new Promise<AssistantOutcome>((resolve) => (settle = resolve));
		let ended = false;
		let marking = false;
		const end = (result: AssistantOutcome): void => {
			if (ended) return;
			ended = true;
			this.timers.clear(timer);
			if (grace !== null) this.timers.clear(grace);
			this.runs.delete(key);
			this.emit();
			settle(result);
		};
		const timer = this.timers.set(() => {
			stop.stop("timeout");
			grace = this.timers.set(() => {
				if (!marking) end(this.timedOut(action));
			}, TIMEOUT_GRACE_MS);
		}, timeoutMs);
		stop.onStop((reason) => {
			if (reason === "user" && !marking) end(STOPPED);
		});
		this.runs.set(key, { stop, outcome });
		this.emit();
		const gate: RunGate = { stop, marking: () => (marking = true) };
		this.work(action, target, gate).then(end, (error: unknown) => end(failed(action, this.unknownWords(), `the run failed: ${String(error)}`)));
		return outcome;
	}

	private async work(action: AssistantAction, target: AssistantTarget, gate: RunGate): Promise<AssistantOutcome> {
		const { stop } = gate;
		const prepared = await this.prepare(action.id, target);
		if (prepared.kind !== "question") return prepared;
		if (stop.stopped !== null) return this.finish(prepared, stoppedReply(stop.stopped));
		const profile = this.choice.profileOf(prepared.modelId)!;
		const loader = this.choice.loader(profile.id);
		if (!loader) return failed(action, profile.unavailable, `no transport for model "${profile.id}" on this host`);
		const transport = await loader();
		if (stop.stopped !== null) return this.finish(prepared, stoppedReply(stop.stopped));
		const reply = await transport.ask(prepared.question, this.choice.settingsOf(profile), stop);
		return this.finished(prepared, stop.stopped === "timeout" && !reply.ok && reply.failure.kind === "stopped" ? stoppedReply("timeout") : reply, gate);
	}

	private timedOut(action: AssistantAction): AssistantOutcome {
		const profile = this.choice.chosen() ?? this.choice.named();
		const words = profile ? failureWords(profile, "timeout", this.assistant().timeoutSeconds) : NO_MODEL_WORDS;
		return failed(action, words, "no reply after the timeout stopped the run");
	}

	private unknownWords(): string {
		const profile = this.choice.chosen() ?? this.choice.named();
		return profile ? failureWords(profile, "unknown", this.assistant().timeoutSeconds) : NO_MODEL_WORDS;
	}

	private async fieldsOf(profile: ModelProfile): Promise<readonly AssistantField[]> {
		const settings = this.choice.settingsOf(profile);
		const loader = this.choice.loader(profile.id);
		const transport = loader ? await loader().catch(() => null) : null;
		const hintOf = async (field: SettingField): Promise<string | null> => (transport?.hint ? transport.hint(field.key, settings).catch(() => null) : null);
		return Promise.all(
			profile.fields.map(async (field) => ({
				key: field.key,
				label: field.label,
				kind: field.kind,
				choices: field.choices ?? [],
				value: settings[field.key],
				note: field.note ?? null,
				hint: await hintOf(field),
			})),
		);
	}

	private promptOf(action: AssistantAction): string {
		const saved = this.assistant().prompts[action.id];
		return saved !== undefined && saved.trim() !== "" ? saved : action.defaultPrompt;
	}

	private actionOf(id: string): AssistantAction {
		const action = this.actions.find((a) => a.id === id);
		if (!action) throw new Error(`no assistant action "${id}"`);
		return action;
	}

	private assistant(): AssistantSettings {
		return this.settings.get().assistant;
	}

	private emit(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

/** One run per button and target: the target's place, tasks and project. */
function runKey(actionId: string, target: AssistantTarget): string {
	return JSON.stringify([actionId, target.place, [...(target.taskIds ?? [])].sort(), target.projectId ?? null]);
}

/** What a stopped run replies for itself: Max's Stop shows nothing; the timeout says so. */
function stoppedReply(reason: "user" | "timeout"): ModelReply {
	return reason === "user"
		? { ok: false, failure: { kind: "stopped", detail: "stopped by the user" } }
		: { ok: false, failure: { kind: "timeout", detail: "stopped by the timeout" } };
}

/** The assistant's settings after a change on its page. */
function changed(settings: AssistantSettings, change: AssistantSetting): AssistantSettings {
	switch (change.kind) {
		case "model":
			return { ...settings, model: change.id };
		case "timeout":
			return { ...settings, timeoutSeconds: sizeOf(change.seconds, ASSISTANT_TIMEOUTS, settings.timeoutSeconds) };
		case "prompt":
			return { ...settings, prompts: withKey(settings.prompts, change.actionId, change.value) };
		case "field":
			return { ...settings, models: { ...settings.models, [change.modelId]: withKey(settings.models[change.modelId] ?? {}, change.key, change.value) } };
		case "option":
			return { ...settings, options: withMap(settings.options, change.actionId, withKey(settings.options[change.actionId] ?? {}, change.key, change.value)) };
	}
}

/** `maps` with `key`'s map set to `map`; an empty one takes the key off. */
function withMap(maps: Readonly<Record<string, Readonly<Record<string, string>>>>, key: string, map: Readonly<Record<string, string>>): Readonly<Record<string, Readonly<Record<string, string>>>> {
	const { [key]: _old, ...rest } = maps;
	return Object.keys(map).length === 0 ? rest : { ...rest, [key]: map };
}

/** `map` with `key` set to `value`; null or blank takes the key off (the default again). */
function withKey(map: Readonly<Record<string, string>>, key: string, value: string | null): Readonly<Record<string, string>> {
	const { [key]: _old, ...rest } = map;
	return value === null || value.trim() === "" ? rest : { ...rest, [key]: value };
}
