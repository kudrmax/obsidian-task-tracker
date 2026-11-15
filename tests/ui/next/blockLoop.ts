import { type BlockModel, blockModel, blockNeeds } from "../../../obsidian/ui/next/model/block";
import type { Command } from "../../../obsidian/ui/next/model/commands";
import type { BlockMsg } from "../../../obsidian/ui/next/model/messages";
import { updateBlock } from "../../../obsidian/ui/next/update/block";
import type { Runtime } from "../../../obsidian/runtime/Runtime";
import type { StoredSettings } from "../../../obsidian/settingsFile";
import { harness, type Harness } from "../../runtime/harness";

/** A tasks file whose project Дружба has its note attached and two tasks in Inbox: the block of `Дружба.md` shows them. */
export const BLOCK_FILE = [
	"## Inbox",
	"",
	"- [ ] Idea 🗂️ Дружба",
	"- [ ] Call the bank 🗂️ Дружба",
	"",
	"## Projects",
	"",
	"- Дружба [[Дружба]]",
	"",
	"## Now",
	"",
	"## Soon",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");

/**
 * The block's loop as the runtime's store runs it (P2), without a DOM: each message's update, its door commands run at
 * once over the runtime with their answers fed back, then the views the model needs, until nothing changes. Effects are
 * kept for the test to read.
 */
export class BlockLoop {
	model: BlockModel;
	readonly effects: Command<BlockMsg>[] = [];
	readonly calls: string[] = [];

	constructor(
		readonly h: Harness,
		note = "Дружба.md",
	) {
		this.model = blockModel(note, true);
		this.settle();
	}

	static async open(file = BLOCK_FILE): Promise<BlockLoop> {
		return new BlockLoop(await harness({ file }));
	}

	get runtime(): Runtime<StoredSettings> {
		return this.h.runtime;
	}

	send(msg: BlockMsg): this {
		const queue: BlockMsg[] = [msg];
		while (queue.length > 0) {
			const [next, commands] = updateBlock(this.model, queue.shift()!);
			this.model = next;
			for (const command of commands) {
				if (command.kind !== "door") {
					this.effects.push(command);
					continue;
				}
				this.calls.push(command.method);
				const reply = command.reply(this.runtime.call(command.method, command.args));
				if (reply) queue.push(reply);
			}
			this.settle();
		}
		return this;
	}

	/** The views the model needs, handed in until they stand. */
	settle(): this {
		for (let i = 0; i < 20; i++) {
			const views = this.runtime.views(blockNeeds(this.model));
			const same = views.size === this.model.answers.size && [...views].every(([key, answer]) => this.model.answers.get(key) === answer);
			if (same) return this;
			const [next, commands] = updateBlock(this.model, { kind: "views", answers: views });
			this.model = next;
			for (const command of commands) if (command.kind === "door") this.runtime.call(command.method, command.args);
		}
		throw new Error("the views never stood");
	}
}
