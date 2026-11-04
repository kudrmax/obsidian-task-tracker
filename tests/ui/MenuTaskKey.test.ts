import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../src/application/contracts";
import { MenuTaskKey } from "../../src/ui/menu/MenuTaskKey";

const key = (raw: string): TaskKey => ({ section: "now", index: 0, path: [], raw });

describe("MenuTaskKey", () => {
	it("hands the next change the key the change before it gave", async () => {
		const tracked = new MenuTaskKey(key("- [ ] A"));
		const seen: string[] = [];
		await tracked.run(async (k) => {
			seen.push(k.raw);
			return key("- [ ] A 🔁 every day");
		});
		await tracked.run(async (k) => {
			seen.push(k.raw);
		});
		expect(seen).toEqual(["- [ ] A", "- [ ] A 🔁 every day"]);
	});

	it("runs a change only after the one before it ends, even when both are asked at once", async () => {
		const tracked = new MenuTaskKey(key("a"));
		const seen: string[] = [];
		let release: (() => void) | null = null;
		const first = tracked.run(async () => {
			await new Promise<void>((r) => (release = r));
			return key("b");
		});
		const second = tracked.run(async (k) => {
			seen.push(k.raw);
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual([]);
		release!();
		await Promise.all([first, second]);
		expect(seen).toEqual(["b"]);
	});

	it("goes on after a change that failed, with the key it had", async () => {
		const tracked = new MenuTaskKey(key("a"));
		await expect(tracked.run(async () => Promise.reject(new Error("stale")))).rejects.toThrow("stale");
		const seen: string[] = [];
		await tracked.run(async (k) => {
			seen.push(k.raw);
		});
		expect(seen).toEqual(["a"]);
	});
});
