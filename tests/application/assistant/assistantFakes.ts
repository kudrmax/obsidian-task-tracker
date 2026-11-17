import { AssistantServiceImpl, type AssistantDeps } from "../../../core/application/assistant/AssistantServiceImpl";
import type { AssistantAction } from "../../../core/application/assistant/actions/action";
import type { HostModels, ModelQuestion, ModelReply, ModelTransport, StopReason, StopSignal } from "../../../core/application/assistant/model";
import type { ModelProfile } from "../../../core/application/assistant/models/profile";
import type { Clock } from "../../../core/application/ports";
import type { AssistantTasks } from "../../../core/application/assistant/tasks";
import { TaskServiceImpl } from "../../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../../core/application/UndoHistory";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../../core/settings";
import { FakeSettingsStore } from "../../fakes/FakeSettingsStore";
import { FakeTimers } from "../../fakes/FakeTimers";
import { InMemoryTaskFileStore } from "../../fakes/InMemoryTaskFileStore";

export const TODAY = "2026-10-30";
export const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };

export const FILE = [
	"## Inbox",
	"",
	"- [ ] Sort the mail",
	"",
	"## Projects",
	"",
	"- Job",
	"\t- Offers",
	"- Home",
	"",
	"## Now",
	"",
	"- [/] p1 Write the offer ⏰ 2026-10-30 14:00 🗂️ Offers",
	"\t- [ ] Find the template",
	"\t- [x] Old step",
	"- [ ] Pay rent 🗂️ Home",
	"- [x] Closed today",
	"",
	"## Soon",
	"",
	"- [ ] Call the bank 📅 2026-11-20",
	"\t- [ ] Find the contract",
	"- [ ] Read a book #label/Good_fun",
	"- [ ] Dentist ⏰ 2026-11-03 10:00",
	"",
	"## Backlog",
	"",
	"- [ ] Learn Go 🗂️ Job",
	"",
	"## Done",
	"",
].join("\n");

export const SETTINGS: TaskCalendarSettings = { ...DEFAULT_SETTINGS, labels: [{ name: "Good_fun", color: "red" }] };

/** A transport asked by hand: each question waits until the test replies, or stops when the signal says. */
export class FakeTransport implements ModelTransport {
	readonly asked: { question: ModelQuestion; settings: Readonly<Record<string, string>>; stop: StopSignal }[] = [];
	private readonly waiting: ((reply: ModelReply) => void)[] = [];
	/** What a stop replies: by default, a user stop `stopped`, a timeout `timeout`. */
	onStopReply: (reason: StopReason) => ModelReply | null = (reason) => ({ ok: false, failure: { kind: reason === "user" ? "stopped" : "timeout", detail: `stopped: ${reason}` } });
	hints: Readonly<Record<string, string>> = {};

	ask(question: ModelQuestion, settings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply> {
		this.asked.push({ question, settings, stop });
		return new Promise((resolve) => {
			this.waiting.push(resolve);
			stop.onStop((reason) => {
				const reply = this.onStopReply(reason);
				if (reply) resolve(reply);
			});
		});
	}

	async hint(key: string): Promise<string | null> {
		return this.hints[key] ?? null;
	}

	/** The last question's candidates' refs by title, read from its input. */
	refOf(title: string, at = this.asked.length - 1): string {
		const candidates = JSON.parse(this.asked[at].question.input).candidates as { ref: string; title: string }[];
		return candidates.find((t) => t.title === title)!.ref;
	}

	reply(reply: ModelReply, at = 0): void {
		this.waiting[at](reply);
	}

	answer(answer: unknown, at = 0): void {
		this.reply({ ok: true, answer }, at);
	}
}

/** Lets the awaits of a run go on: the file read, the transport loaded, the reply read. */
export async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

export interface Rig {
	readonly assistant: AssistantServiceImpl;
	readonly tasks: TaskServiceImpl;
	readonly undo: UndoHistory;
	readonly store: InMemoryTaskFileStore;
	readonly settings: FakeSettingsStore;
	readonly timers: FakeTimers;
	readonly transport: FakeTransport;
	readonly loads: { count: number };
}

export interface RigOptions {
	readonly text?: string | null;
	readonly settings?: TaskCalendarSettings;
	/** The host's models; by default Claude, asked through the fake transport. */
	readonly models?: (transport: FakeTransport, loads: { count: number }) => HostModels;
	readonly actions?: readonly AssistantAction[];
	readonly profiles?: readonly ModelProfile[];
	/** The task service as the assistant reaches it; by default the rig's own. */
	readonly tasksPort?: (tasks: TaskServiceImpl) => AssistantTasks;
}

export function rig(options: RigOptions = {}): Rig {
	const store = new InMemoryTaskFileStore(options.text === undefined ? FILE : options.text);
	const settings = new FakeSettingsStore(options.settings ?? SETTINGS);
	const timers = new FakeTimers();
	const undo = new UndoHistory(store);
	const tasks = new TaskServiceImpl(store, settings, clock, undo);
	const transport = new FakeTransport();
	const loads = { count: 0 };
	const servedClaude = (t: FakeTransport, l: { count: number }): HostModels => ({
		ids: ["claude"],
		transport: () => async () => {
			l.count++;
			return t;
		},
	});
	const deps: AssistantDeps = {
		tasks: options.tasksPort ? options.tasksPort(tasks) : tasks,
		settings,
		timers,
		steps: undo,
		models: (options.models ?? servedClaude)(transport, loads),
		actions: options.actions,
		profiles: options.profiles,
	};
	return { assistant: new AssistantServiceImpl(deps), tasks, undo, store, settings, timers, transport, loads };
}
