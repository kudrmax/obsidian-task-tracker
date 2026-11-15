import type { TaskKey } from "../../../core/application/contracts";
import type { BlockModel } from "../../../obsidian/ui/next/model/block";
import { blockModel, blockNeeds } from "../../../obsidian/ui/next/model/block";
import type { Command } from "../../../obsidian/ui/next/model/commands";
import type { BlockMsg } from "../../../obsidian/ui/next/model/messages";
import { updateBlock } from "../../../obsidian/ui/next/update/block";
import { harness, type Harness, itemOf } from "../../runtime/harness";

/** A runtime whose project Дружба has its note attached and these tasks of the harness's file (by title) in it. */
export async function projectHarness(titles: readonly string[] = ["Idea", "Call the bank", "Parent", "Shop"]): Promise<Harness> {
	const h = await harness();
	const keys: TaskKey[] = titles.map((title) => itemOf(h.runtime, title).key);
	for (const [method, args] of [
		["tasks.setProjectNote", ["Дружба", "Дружба"]],
		["tasks.setProject", [keys, "Дружба"]],
	] as const) {
		const answer = h.runtime.call(method, args).answer;
		if (!answer.ok) throw new Error(answer.error.message);
	}
	return h;
}

/** The model with the views it needs read from the runtime's replica, to a fixed point (P2 step 3). */
export function withViews(h: Harness, model: BlockModel): BlockModel {
	let next = model;
	for (let i = 0; i < 4; i++) next = { ...next, answers: h.runtime.views(blockNeeds(next)) };
	return next;
}

/** The block's model of the note Дружба.md, its views read. */
export function noteModel(h: Harness, wide = true): BlockModel {
	return withViews(h, blockModel("Дружба.md", wide));
}

/** Two sets of answers hold the same answers under the same keys (the runtime memoises them). */
function same(a: BlockModel["answers"], b: BlockModel["answers"]): boolean {
	return a.size === b.size && [...b].every(([key, answer]) => a.get(key) === answer);
}

/** One message's pass as the store runs it: the update, its door calls run at once and their replies fed back, new views handed in; the effects left for the caller. */
export function pass(h: Harness, model: BlockModel, msg: BlockMsg): { readonly model: BlockModel; readonly effects: readonly Command<BlockMsg>[]; readonly doors: readonly string[] } {
	const effects: Command<BlockMsg>[] = [];
	const doors: string[] = [];
	const queue: BlockMsg[] = [msg];
	let current = model;
	for (let steps = 0; queue.length > 0; steps++) {
		if (steps > 64) throw new Error("the chain ran on");
		const [next, commands] = updateBlock(current, queue.shift()!);
		current = next;
		for (const command of commands) {
			if (command.kind !== "door") {
				effects.push(command);
				/** No layout here: the card is in view already, as in a block that does not scroll. */
				if (command.kind === "intoView") queue.push(command.then);
				continue;
			}
			doors.push(command.method);
			const reply = command.reply(h.runtime.call(command.method, command.args));
			if (reply) queue.push(reply);
		}
		if (queue.length === 0) {
			const answers = h.runtime.views(blockNeeds(current));
			if (!same(current.answers, answers)) queue.push({ kind: "views", answers });
		}
	}
	return { model: current, effects, doors };
}
