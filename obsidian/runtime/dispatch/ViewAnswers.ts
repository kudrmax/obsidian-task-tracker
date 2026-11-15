import type { DoorAnswer } from "../../../core/application/PhoneCalls";
import type { ReplicaState } from "../replica/Replica";

/**
 * A view answer a screen needs (`needs(model)`, P2): a door read by its method and arguments, named by `key`, which the
 * screen's model finds the answer by.
 */
export interface Need {
	readonly key: string;
	readonly method: string;
	readonly args: readonly unknown[];
}

/** The answers to a screen's needs, by key. */
export type Views = ReadonlyMap<string, DoorAnswer>;

export interface ViewSource {
	readonly state: () => ReplicaState;
	readonly minute: () => number;
	readonly read: (method: string, args: readonly unknown[]) => DoorAnswer;
}

/** The identity of a need: what it reads, so two screens needing the same read share one answer. */
const needId = (need: Need): string => `${need.method}\u0000${JSON.stringify(need.args)}`;

/**
 * The view answers of the runtime, memoised by (replica, minute, need): an answer is read again only when the replica
 * is another value or the clock passed a minute, and is then the same object for every screen that needs it.
 */
export class ViewAnswers {
	private forState: ReplicaState | null = null;
	private forMinute = Number.NaN;
	private readonly answers = new Map<string, DoorAnswer>();

	constructor(private readonly source: ViewSource) {}

	answer(need: Need): DoorAnswer {
		const state = this.source.state();
		const minute = this.source.minute();
		if (state !== this.forState || minute !== this.forMinute) {
			this.answers.clear();
			this.forState = state;
			this.forMinute = minute;
		}
		const id = needId(need);
		let answer = this.answers.get(id);
		if (answer === undefined) {
			answer = this.source.read(need.method, need.args);
			this.answers.set(id, answer);
		}
		return answer;
	}

	views(needs: readonly Need[]): Views {
		return new Map(needs.map((need) => [need.key, this.answer(need)]));
	}
}

/** Whether two sets of views hold the same answers under the same keys. */
export function sameViews(a: Views | null, b: Views): boolean {
	if (a === null || a.size !== b.size) return false;
	for (const [key, answer] of b) if (a.get(key) !== answer) return false;
	return true;
}
