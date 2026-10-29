import { TasksFileMissingError } from "../../src/application/contracts";
import type { TaskFileStore } from "../../src/application/ports";

export class InMemoryTaskFileStore implements TaskFileStore {
	writes = 0;
	private readonly listeners = new Set<() => void>();

	constructor(public text: string | null) {}

	async read(): Promise<string | null> {
		return this.text;
	}

	async write(fn: (text: string) => string): Promise<void> {
		if (this.text === null) throw new TasksFileMissingError("memory");
		this.writes++;
		this.text = fn(this.text);
	}

	async create(text: string): Promise<void> {
		this.text = text;
	}

	onModify(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emitModify(): void {
		for (const listener of this.listeners) listener();
	}
}
