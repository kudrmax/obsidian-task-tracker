/** Changes to the section presets, each made to the presets as they are saved at that moment, as with the priority levels. */
export class PresetEdits {
	constructor(
		private readonly current: () => readonly string[],
		private readonly save: (presets: readonly string[]) => Promise<void>,
	) {}

	rename(index: number, name: string): Promise<void> {
		return this.save(this.current().map((preset, i) => (i === index ? name.trim() : preset)));
	}

	remove(index: number): Promise<void> {
		return this.save(this.current().filter((_, i) => i !== index));
	}

	add(): Promise<void> {
		return this.save([...this.current(), ""]);
	}

	/** The preset at `from` goes to `to`, the others keeping their order. */
	move(from: number, to: number): Promise<void> {
		const presets = [...this.current()];
		const [moved] = presets.splice(from, 1);
		presets.splice(to, 0, moved);
		return this.save(presets);
	}
}
