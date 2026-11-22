// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { MarkdownView, Plugin } from "obsidian";
import type { FunnelView } from "../../core/application/contracts";
import { NoteBlocks } from "../../obsidian/host/NoteBlocks";
import type { ScreenHost } from "../../obsidian/host/ScreenHost";
import { ScreenHost as Host } from "../../obsidian/host/ScreenHost";
import { leafFor } from "../../obsidian/host/ScreenLeaf";
import type { ScreenMounts } from "../../obsidian/host/ScreenMounts";
import type { ScreenContext } from "../../obsidian/ui/engine/port";

const LOOK = { type: "task-calendar", title: "Task Calendar", icon: "calendar-days" };
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A host whose mounts come when the test says, recording every screen mounted and let go. */
function fakeHost() {
	const mounted: { el: HTMLElement; place: string; sourcePath: string; context?: ScreenContext }[] = [];
	const released: unknown[] = [];
	let arrive: (mounts: ScreenMounts) => void = () => undefined;
	const ready = new Promise<ScreenMounts>((resolve) => (arrive = resolve));
	const mounts = {
		mount: (el: HTMLElement, place: string, sourcePath: string, context?: ScreenContext) => {
			const screen = { store: { getState: () => ({}) }, unmount: () => undefined };
			mounted.push({ el, place, sourcePath, context });
			return screen;
		},
	} as unknown as ScreenMounts;
	const host = { look: LOOK, mounts: () => ready, opened: () => undefined, unmount: (screen: unknown) => screen && released.push(screen) } as unknown as ScreenHost;
	return { host, mounted, released, arrive: () => arrive(mounts) };
}

describe("the host's leaf", () => {
	it("knows its view type while Obsidian constructs it (found in the test Obsidian: «Plugin no longer active»)", () => {
		const Leaf = leafFor(LOOK);
		const leaf = new Leaf({ app: {} } as never, fakeHost().host) as unknown as { constructedAs: string };
		expect(leaf.constructedAs).toBe("task-calendar");
	});

	it("closed before its screen's parts arrive, it mounts nothing", async () => {
		const fake = fakeHost();
		const Leaf = leafFor(LOOK);
		const leaf = new Leaf({ app: {} } as never, fake.host);
		const opening = leaf.onOpen();
		await leaf.onClose();
		fake.arrive();
		await opening;
		expect(fake.mounted).toEqual([]);
	});

	it("open, it mounts the screen at `leaf` in its content", async () => {
		const fake = fakeHost();
		const Leaf = leafFor(LOOK);
		const leaf = new Leaf({ app: {} } as never, fake.host);
		const opening = leaf.onOpen();
		fake.arrive();
		await opening;
		expect(fake.mounted.map(({ place, sourcePath }) => [place, sourcePath])).toEqual([["leaf", ""]]);
		expect(fake.mounted[0].el.classList.contains("tc-view")).toBe(true);
	});
});

/** A Markdown view of `path` in Live Preview, with the editor's sizer the block stands in. */
function noteView(path: string): MarkdownView {
	const view = new MarkdownView({ app: {} } as never);
	const settable = view as unknown as { file: { path: string }; getMode(): string };
	settable.file = { path };
	settable.getMode = () => "source";
	const sizer = view.containerEl.appendChild(document.createElement("div"));
	sizer.className = "markdown-source-view";
	const cm = sizer.appendChild(document.createElement("div"));
	cm.className = "cm-sizer";
	const content = cm.appendChild(document.createElement("div"));
	content.className = "cm-contentContainer";
	content.appendChild(document.createElement("div")).className = "cm-content";
	return view;
}

/** Obsidian's workspace and vault, with the open views; events fired by the test. */
function fakeApp(views: MarkdownView[]) {
	const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
	const on = (name: string, run: (...args: unknown[]) => void) => {
		handlers.set(name, [...(handlers.get(name) ?? []), run]);
		return () => undefined;
	};
	const fire = (name: string, ...args: unknown[]) => handlers.get(name)?.forEach((run) => run(...args));
	const app = {
		workspace: { on, onLayoutReady: (run: () => void) => run(), iterateAllLeaves: (visit: (leaf: { view: MarkdownView }) => void) => views.forEach((view) => visit({ view })) },
		vault: { on },
	};
	return { app, fire };
}

/** The core's answer for a note: «Дружба.md» is the project «Близкие»'s, any other none. */
const projectNoteView = vi.fn(async (path: string) => (path === "Дружба.md" || path === "Друзья.md" ? ({ filter: { node: "project:Близкие", title: "Близкие", menu: { project: { name: "Близкие" } } } } as unknown as FunnelView) : null));

describe("a project note's block", () => {
	it("stands at the end of a project's note, in that project; a note of no project has none", async () => {
		const fake = fakeHost();
		const project = noteView("Дружба.md");
		const plain = noteView("Просто заметка.md");
		const { app } = fakeApp([project, plain]);
		const blocks = new NoteBlocks(app as never, { projectNoteView, onChange: () => () => undefined }, fake.host);
		blocks.load();
		fake.arrive();
		await settled();
		await settled();
		expect(fake.mounted.map(({ place, sourcePath, context }) => [place, sourcePath, context])).toEqual([["note", "Дружба.md", { project: "Близкие" }]]);
		expect(project.containerEl.querySelector(".cm-sizer > .tc-project-block.tc-note-block")).not.toBeNull();
		expect(plain.containerEl.querySelector(".tc-project-block")).toBeNull();
	});

	it("follows its note renamed, the same block, never a new one", async () => {
		const fake = fakeHost();
		const view = noteView("Дружба.md");
		const { app, fire } = fakeApp([view]);
		const blocks = new NoteBlocks(app as never, { projectNoteView, onChange: () => () => undefined }, fake.host);
		blocks.load();
		fake.arrive();
		await settled();
		await settled();
		(view as unknown as { file: { path: string } }).file = { path: "Друзья.md" };
		fire("rename", { path: "Друзья.md" }, "Дружба.md");
		await settled();
		await settled();
		expect(fake.mounted).toHaveLength(1);
		expect(fake.released).toEqual([]);
	});
});

describe("the host's source", () => {
	it("opened after the plugin unloaded, its port is let go at once", async () => {
		const dispose = vi.fn();
		let open: () => void = () => undefined;
		const plugin = Object.assign(new Plugin({ workspace: { iterateAllLeaves: () => undefined, on: () => () => undefined } }), {
			manifest: { id: "task-calendar" },
			ends: [] as (() => void)[],
			register(end: () => void) {
				this.ends.push(end);
			},
			registerView: () => undefined,
			registerEvent: () => undefined,
			addCommand: () => undefined,
		});
		const host = new Host(plugin as never, {
			look: LOOK,
			source: () => new Promise((resolve) => (open = () => resolve({ port: { dispose } as never, device: {} as never }))),
			paint: { get: () => ({ cardHeight: 35, cardGap: 2, priorities: [], labels: [], labelPaint: "blend" }) as never, onChange: () => () => undefined },
		});
		host.load();
		const mounts = host.mounts();
		for (const end of plugin.ends) end();
		open();
		await mounts;
		expect(dispose).toHaveBeenCalled();
	});
});
