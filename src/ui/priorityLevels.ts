import { PRIORITY_COLORS, type PriorityColor, type PriorityLevel } from "../settings";

/** Changes to the priority levels, each made to the levels as they are saved at that moment, so one edit never undoes the one before it. */
export class LevelEdits {
	constructor(
		private readonly current: () => readonly PriorityLevel[],
		private readonly save: (levels: readonly PriorityLevel[]) => Promise<void>,
	) {}

	rename(index: number, prefix: string): Promise<void> {
		return this.patch(index, { prefix: prefix.trim() });
	}

	recolour(index: number, color: PriorityColor): Promise<void> {
		return this.patch(index, { color });
	}

	remove(index: number): Promise<void> {
		return this.save(this.current().filter((_, i) => i !== index));
	}

	/** The next `p<n>` no level has, in the first colour no level has. */
	add(): Promise<void> {
		const levels = this.current();
		let n = levels.length + 1;
		while (levels.some((l) => l.prefix === `p${n}`)) n++;
		const color = PRIORITY_COLORS.find((c) => !levels.some((l) => l.color === c)) ?? PRIORITY_COLORS[0];
		return this.save([...levels, { prefix: `p${n}`, color }]);
	}

	private patch(index: number, patch: Partial<PriorityLevel>): Promise<void> {
		return this.save(this.current().map((level, i) => (i === index ? { ...level, ...patch } : level)));
	}
}
