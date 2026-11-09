import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { clock, D, type DropCase, FILE, P, SEVERAL, SINGLE, T } from "../application/dropCases";

/**
 * `tasks.dropPreview` through the door the iOS app calls: for every drop of spec §5.1, the screen it answers is the one
 * `tasks.screen` reads after `tasks.drop` with the same arguments and the same state handed in, ids included; its
 * landings are `tasks.landing`'s; its text is the file the drop writes; and it writes nothing.
 */

type Fn = (...args: unknown[]) => unknown;
const sandbox: { TaskCalendarPhone?: Record<string, Fn> } = {};
runInNewContext(readFileSync("core/task-calendar-phone.js", "utf8"), sandbox);
const phone = sandbox.TaskCalendarPhone!;

const NOW = clock.now().getTime();

interface Item {
	readonly key: unknown;
	readonly text: string;
	readonly allSubtasks: readonly Item[];
}

interface Answer {
	readonly ok: true;
	readonly result: unknown;
	readonly tasks?: string;
	readonly ids?: unknown;
	readonly history?: unknown;
}

/** What the app keeps between calls: the file, and the history and ids the answers gave. */
interface State {
	readonly tasks: string;
	readonly kept: Readonly<Record<string, unknown>>;
}

function call(state: State, method: string, ...args: unknown[]): { answer: Answer; state: State } {
	const answer = JSON.parse(phone.call(method, JSON.stringify(args), JSON.stringify({ tasks: state.tasks, nowMs: NOW, ...state.kept })) as string);
	if (!answer.ok) throw new Error(answer.error.message);
	const kept = { ...state.kept };
	for (const field of ["history", "ids"]) if (answer[field] !== undefined) kept[field] = answer[field];
	return { answer, state: { tasks: answer.tasks ?? state.tasks, kept } };
}

/** The app after reading the screens of the three days: every task has its id and key. */
function opened(): { state: State; key: (text: string) => unknown } {
	let state: State = { tasks: FILE, kept: {} };
	const byText = new Map<string, Item>();
	const walk = (item: Item) => {
		byText.set(item.text, item);
		item.allSubtasks.forEach(walk);
	};
	for (const day of [T, D, P]) {
		const read = call(state, "tasks.screen", day);
		state = read.state;
		const screen = read.answer.result as Record<string, Item[]> & { day: { list: Item[]; slotted: Item[] } };
		[...screen.inbox, ...screen.soon, ...screen.backlog, ...screen.day.list, ...screen.day.slotted].forEach(walk);
	}
	return { state, key: (text) => byText.get(text)!.key };
}

describe("tasks.dropPreview: the screen a drop leaves, before it is written", () => {
	for (const c of [...SINGLE, ...SEVERAL] as DropCase[]) {
		it(c.name, () => {
			const { state, key } = opened();
			const tasks = c.tasks.map(([text, from]) => ({ key: key(text), from }));
			const to = c.to(key as never);
			const preview = call(state, "tasks.dropPreview", tasks, to, c.day);
			expect(preview.answer.tasks).toBeUndefined();
			expect(preview.answer.history).toBeUndefined();
			expect(preview.answer.ids).toBeUndefined();
			const { landings, screen, tasks: text } = preview.answer.result as { landings: unknown; screen: unknown; tasks: string };
			expect(landings).toEqual(call(state, "tasks.landing", tasks, to, c.day).answer.result);

			const dropped = call(state, "tasks.drop", tasks, to, c.day).state;
			expect(screen).toEqual(call(dropped, "tasks.screen", c.day).answer.result);
			expect(text).toBe(dropped.tasks);

			const afterPreview = call(preview.state, "tasks.drop", tasks, to, c.day).state;
			expect(screen).toEqual(call(afterPreview, "tasks.screen", c.day).answer.result);
		});
	}
});
