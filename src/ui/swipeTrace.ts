/**
 * A temporary record of what the fingers did and what the swipe made of it, written to a note in the vault so a phone
 * with no console can show it. To be removed with the fix it was made for.
 */
export interface TraceSink {
	write(text: string): void;
}

const FLUSH_MS = 1000;

class SwipeTrace {
	private lines: string[] = [];
	private sink: TraceSink | null = null;
	private timer = 0;
	private readonly start = performance.now();

	attach(sink: TraceSink | null): void {
		this.sink = sink;
	}

	log(line: string): void {
		if (!this.sink) return;
		this.lines.push(`${Math.round(performance.now() - this.start)} ${line}`);
		if (!this.timer) this.timer = window.setTimeout(() => this.flush(), FLUSH_MS);
	}

	flush(): void {
		window.clearTimeout(this.timer);
		this.timer = 0;
		if (!this.sink || this.lines.length === 0) return;
		const text = this.lines.join("\n") + "\n";
		this.lines = [];
		this.sink.write(text);
	}
}

export const swipeTrace = new SwipeTrace();

/** An element as the record names it: its classes, short. */
export function named(target: EventTarget | null): string {
	if (!(target instanceof Element)) return String(target);
	const own = (target.getAttribute("class") ?? "").split(" ").filter(Boolean).slice(0, 3).join(".");
	const column = target.closest(".tc-left, .tc-soon, .tc-inbox, .tc-right, .tc-divider, .tc-seg, .tc-head");
	const where = column && column !== target ? ` in ${(column.getAttribute("class") ?? "").split(" ").filter(Boolean).join(".")}` : "";
	return `${target.tagName.toLowerCase()}${own ? "." + own : ""}${where}`;
}
