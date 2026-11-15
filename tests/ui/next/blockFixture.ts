import { fakeTitleFields } from "../../helpers/FakeTitleField";
import { Platform } from "obsidian";
import type { TaskItem } from "../../../core/application/contracts";
import type { EditorFactory, EditorHooks } from "../../../obsidian/ui/next/drivers/islands";
import { BlockHost } from "../../../obsidian/ui/next/host/block/BlockHost";
import { harness, type Harness, itemOf, settle } from "../../runtime/harness";

/** A tasks file whose project Дружба has its note, a task with subtasks, and tasks of no project. */
export const BLOCK_FILE = [
	"## Inbox",
	"",
	"- [ ] Idea 🗂️ Дружба",
	"- [ ] Other task",
	"",
	"## Projects",
	"",
	"- Дружба",
	"",
	"## Now",
	"",
	"- [ ] Parent 🗂️ Дружба",
	"\t- [ ] Child",
	"\t- [x] Done child",
	"- [ ] Elsewhere",
	"",
	"## Soon",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");

/** An editor that stands in for Obsidian's: what it was given, and the hooks to type in it. */
export class FakeEditors {
	readonly made: { container: HTMLElement; text: string; hooks: EditorHooks; value: string; destroyed: boolean }[] = [];
	readonly factory: EditorFactory = (container, text, hooks) => {
		const made = { container, text, hooks, value: text, destroyed: false };
		this.made.push(made);
		const input = container.ownerDocument.createElement("div");
		input.contentEditable = "true";
		container.appendChild(input);
		return {
			setValue: (value) => void (made.value = value),
			caretAtEnd: () => input,
			destroy: () => {
				made.destroyed = true;
				input.remove();
			},
		};
	};

	get last() {
		return this.made[this.made.length - 1];
	}
}

export interface MountedBlock {
	readonly h: Harness;
	readonly host: BlockHost;
	readonly editors: FakeEditors;
	readonly notices: string[];
	readonly opened: string[];
	item(title: string): TaskItem;
	unmount(): void;
}

/** The block of note «Дружба.md» on the harness's runtime, mounted in the page. */
export async function mountBlock(options: { readonly wide?: boolean } = {}): Promise<MountedBlock> {
	const h = await harness({ file: BLOCK_FILE });
	const session = h.runtime.openHost();
	const answer = session.call("tasks.setProjectNote", ["Дружба", "Дружба"]).answer;
	if (!answer.ok) throw new Error(answer.error.message);
	await settle(h.runtime);
	(Platform as { isMobile: boolean }).isMobile = options.wide === false;
	const editors = new FakeEditors();
	const notices: string[] = [];
	const opened: string[] = [];
	const host = new BlockHost(
		{
			session,
			app: { keymap: { pushScope: () => undefined, popScope: () => undefined }, scope: {} } as never,
			failure: (error) => `failed: ${error.code}`,
			openTasksFile: () => undefined,
			titleField: () => fakeTitleFields().factory,
			notice: (text) => void notices.push(text),
			openLink: (link) => void opened.push(link.target),
			editors: editors.factory,
		},
		"Дружба.md",
		document,
	);
	document.body.appendChild(host.node);
	host.mount();
	return {
		h,
		host,
		editors,
		notices,
		opened,
		item: (title) => itemOf(h.runtime, title),
		unmount: () => {
			host.dispose();
			(Platform as { isMobile: boolean }).isMobile = false;
		},
	};
}
