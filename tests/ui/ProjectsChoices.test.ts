import { describe, expect, it, vi } from "vitest";
import type { ProjectsNodeId } from "../../core/application/contracts";
import { ProjectsChoices } from "../../obsidian/ui/projects/ProjectsChoices";

/** A core whose choices resolve only when told, and a screen that draws what the core chose. */
function screen(start: ProjectsNodeId) {
	const log: string[] = [];
	let chosen = start;
	let drawn = start;
	const waiting: (() => void)[] = [];
	const later = (then: () => void) => new Promise<void>((resolve) => waiting.push(() => (then(), resolve())));
	const choices = new ProjectsChoices({
		hover: (node) => later(() => (log.push(`hover ${node}`), (chosen = node))),
		select: async (node) => void (log.push(`select ${node}`), (chosen = node)),
		refresh: async () => void (log.push(`draw ${chosen}`), (drawn = chosen)),
		selected: () => drawn,
		onError: (error) => log.push(`error ${String(error)}`),
	});
	const answer = () => waiting.shift()?.();
	return { choices, log, answer, drawn: () => drawn };
}

describe("the nodes a held card chooses on the Projects screen", () => {
	it("is choosing from the hover until the chosen node is drawn", async () => {
		const { choices, answer } = screen("project:A");
		const hovering = choices.hover("project:B");
		expect(choices.choosing).toBe(true);
		await Promise.resolve();
		answer();
		await hovering;
		expect(choices.choosing).toBe(false);
	});

	it("a drag let go nowhere waits for a hover still loading, then goes back to the node it was lifted on", async () => {
		const { choices, log, answer, drawn } = screen("project:A");
		void choices.hover("project:B");
		const back = choices.backTo("project:A")!;
		await Promise.resolve();
		expect(log).toEqual([]);
		answer();
		await back;
		expect(log).toEqual(["hover project:B", "draw project:B", "select project:A", "draw project:A"]);
		expect(drawn()).toBe("project:A");
	});

	it("puts nothing back, draws nothing, when no choice is pending and the node it was lifted on still shows", () => {
		const { choices, log } = screen("project:A");
		expect(choices.backTo("project:A")).toBeNull();
		expect(log).toEqual([]);
	});

	it("goes back after a hover that opened another node and is drawn", async () => {
		const { choices, log, answer } = screen("project:A");
		const hovering = choices.hover("project:B");
		await Promise.resolve();
		answer();
		await hovering;
		await choices.backTo("project:A");
		expect(log).toEqual(["hover project:B", "draw project:B", "select project:A", "draw project:A"]);
	});

	it("has nothing to wait for when the drag was lifted elsewhere", () => {
		expect(screen("project:A").choices.backTo(null)).toBeNull();
	});

	it("a drop waits for every choice made so far to be drawn", async () => {
		const { choices, log, answer } = screen("project:A");
		void choices.hover("project:B");
		const written = vi.fn();
		const dropping = choices.settled().then(written);
		await Promise.resolve();
		expect(written).not.toHaveBeenCalled();
		answer();
		await dropping;
		expect(log).toEqual(["hover project:B", "draw project:B"]);
	});

	it("says a failed choice and goes on with the next", async () => {
		const log: string[] = [];
		const choices = new ProjectsChoices({ hover: async () => Promise.reject(new Error("gone")), select: async () => void log.push("select"), refresh: async () => void log.push("draw"), selected: () => "project:B", onError: (e) => log.push(`error ${(e as Error).message}`) });
		void choices.hover("project:C");
		await choices.backTo("project:A");
		expect(log).toEqual(["error gone", "select", "draw"]);
		expect(choices.choosing).toBe(false);
	});
});
