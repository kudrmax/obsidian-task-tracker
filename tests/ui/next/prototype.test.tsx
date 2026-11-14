// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyedList } from "../../../obsidian/ui/next/KeyedList";
import { STILL, type Cause } from "../../../obsidian/ui/next/motion";
import { Store, type Reduce, type Run } from "../../../obsidian/ui/next/Store";

interface S {
	readonly project: string | null;
	readonly tasks: readonly string[];
}
type A = { type: "delete"; id: string } | { type: "project"; project: string | null } | { type: "read"; tasks: readonly string[] };
type E = { type: "write"; id: string } | { type: "read"; project: string | null };

describe("Store: one queue", () => {
	it("a read asked after a delete sees the delete, however fast the project switches (decision 77)", async () => {
		const file = new Set(["a", "b", "c"]);
		const reduce: Reduce<S, A, E> = (s, a) => {
			if (a.type === "delete") return { state: { ...s, tasks: s.tasks.filter((t) => t !== a.id) }, effects: [{ type: "write", id: a.id }] };
			if (a.type === "project") return { state: { ...s, project: a.project }, effects: [{ type: "read", project: a.project }] };
			return { state: { ...s, tasks: a.tasks } };
		};
		const run: Run<A, E> = async (e, dispatch) => {
			if (e.type === "write") {
				await new Promise((r) => setTimeout(r, 20));
				file.delete(e.id);
			} else dispatch({ type: "read", tasks: [...file] });
		};
		const store = new Store<S, A, E>({ project: null, tasks: [...file] }, reduce, run);
		store.dispatch({ type: "delete", id: "b" });
		store.dispatch({ type: "project", project: "p" });
		await store.idle();
		expect(store.state.tasks).toEqual(["a", "c"]);
	});
});

describe("KeyedList: motion by cause", () => {
	const host = document.createElement("div");
	document.body.append(host);
	afterEach(() => vi.restoreAllMocks());

	function draw(rows: string[], cause: Cause): void {
		render(<KeyedList id="inbox" rows={rows} keyOf={(r) => r} cause={cause} row={(r) => r} duration={200} />, host);
	}

	function layout(): ReturnType<typeof vi.fn> {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			const index = [...(this.parentElement?.children ?? [])].indexOf(this);
			return { top: index * 40 } as DOMRect;
		});
		const animate = vi.fn();
		HTMLElement.prototype.animate = animate as never;
		return animate;
	}

	it("a write in this list slides the rows that moved", () => {
		draw(["a", "b", "c"], STILL);
		const animate = layout();
		draw(["a", "c"], { kind: "write", lists: new Set(["inbox"]) });
		expect(animate).toHaveBeenCalledTimes(1);
	});

	it("another context draws in place: nothing flies in", () => {
		draw(["a", "b", "c"], STILL);
		const animate = layout();
		draw(["c", "a"], { kind: "context" });
		expect(animate).not.toHaveBeenCalled();
	});

	it("a write in another list leaves this one still", () => {
		draw(["a", "b", "c"], STILL);
		const animate = layout();
		draw(["a", "c"], { kind: "write", lists: new Set(["today"]) });
		expect(animate).not.toHaveBeenCalled();
	});
});
