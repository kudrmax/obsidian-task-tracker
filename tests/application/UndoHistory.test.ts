import { describe, expect, it } from "vitest";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { UndoHistory } from "../../src/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-10-30";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const FILE = "## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Backlog\n\n## Done\n";

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const history = new UndoHistory(store);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, history);
	const key = async (i: number) => (await svc.dayView(T)).list[i].key;
	return { store, history, svc, key };
}

describe("UndoHistory", () => {
	it("takes an action back and does it again", async () => {
		const { store, history, svc, key } = setup();
		await svc.setStatus(await key(0), "done");
		const done = store.text;
		expect(await history.undo()).toBe("done");
		expect(store.text).toBe(FILE);
		expect(await history.redo()).toBe("done");
		expect(store.text).toBe(done);
	});

	it("goes back step by step, the last action first", async () => {
		const { store, history, svc, key } = setup();
		await svc.remove(await key(1));
		const removed = store.text;
		await svc.setStatus(await key(0), "done");
		await history.undo();
		expect(store.text).toBe(removed);
		await history.undo();
		expect(store.text).toBe(FILE);
		expect(history.canUndo()).toBe(false);
		expect(await history.undo()).toBe("nothing");
	});

	it("forgets what could be done again once a new action is made", async () => {
		const { history, svc, key } = setup();
		await svc.setStatus(await key(0), "done");
		await history.undo();
		expect(history.canRedo()).toBe(true);
		await svc.remove(await key(2));
		expect(history.canRedo()).toBe(false);
	});

	it("keeps an edit by hand elsewhere in the file", async () => {
		const { store, history, svc, key } = setup();
		await svc.remove(await key(2));
		store.text = store.text!.replace("## Soon\n", "## Soon\n- [ ] typed by hand\n");
		expect(await history.undo()).toBe("done");
		expect(store.text).toBe(FILE.replace("## Soon\n", "## Soon\n- [ ] typed by hand\n"));
	});

	it("leaves the file alone and drops the step when its lines were edited since", async () => {
		const { store, history, svc, key } = setup();
		await svc.setStatus(await key(0), "done");
		const edited = store.text!.replace("- [x] A", "- [x] A, renamed by hand");
		store.text = edited;
		expect(await history.undo()).toBe("conflict");
		expect(store.text).toBe(edited);
		expect(history.canUndo()).toBe(false);
	});

	it("takes no step for tidying the file, only for actions", async () => {
		const { history, svc } = setup("## Now\n- [ ] A\n");
		await svc.normalize();
		expect(history.canUndo()).toBe(false);
	});

	it("keeps the last hundred steps", async () => {
		const store = new InMemoryTaskFileStore("a");
		const history = new UndoHistory(store);
		for (let i = 0; i < 101; i++) history.record(String(i), String(i + 1));
		let steps = 0;
		while (history.canUndo()) {
			store.text = String(101 - steps);
			await history.undo();
			steps++;
		}
		expect(steps).toBe(100);
	});

	it("tells its listeners when a step is added or taken back", async () => {
		const { history, svc, key } = setup();
		let heard = 0;
		history.onChange(() => heard++);
		await svc.setStatus(await key(0), "done");
		await history.undo();
		expect(heard).toBe(2);
	});
});
