/**
 * A temporary record of how quick entry opens and closes on the phone, frame by frame, written to a note in the vault so
 * a phone with no console can show it. To be removed with the fix it was made for.
 */
export interface TraceSink {
	write(text: string): void;
}

const RECORD_MS = 1600;
const FLUSH_MS = 1000;
const SLOW_FRAME_MS = 25;
const EVENTS = ["keyboardWillShow", "keyboardDidShow", "keyboardWillHide", "keyboardDidHide", "resize"] as const;

const PARTS: readonly (readonly [string, string])[] = [
	["plus", ".task-calendar > .tc-plus"],
	["seg", ".task-calendar > .tc-seg"],
	["field", ".tc-quick-row"],
	["bar", ".tc-quick-bar"],
	["tool", ".mobile-toolbar-options-container"],
	["view", ".task-calendar"],
	["nav", ".mobile-navbar"],
];

export class EntryTrace {
	private lines: string[] = [];
	private flushTimer = 0;
	private until = 0;
	private frame = 0;
	private lastFrame = 0;
	private lastRow = "";
	private readonly start = performance.now();
	private readonly win: Window;
	private readonly pressed = (e: PointerEvent) => {
		const target = e.target instanceof Element ? e.target : null;
		const plus = !!target?.closest(".tc-plus");
		if (!plus && !this.doc.querySelector(".tc-quick-row")) return;
		this.log(`pointerdown on=${plus ? "plus" : name(target)}`);
		this.record();
	};
	private readonly lifted = (e: PointerEvent) => {
		if (this.recording) this.log(`pointerup on=${name(e.target instanceof Element ? e.target : null)}`);
	};
	private readonly focused = (e: FocusEvent) => {
		if (this.recording) this.log(`${e.type} ${name(e.target instanceof Element ? e.target : null)}`);
	};
	private readonly heard = (e: Event) => {
		if (!this.recording) return;
		const height = (e as Event & { keyboardHeight?: number }).keyboardHeight;
		this.log(`${e.type}${height !== undefined ? ` keyboardHeight=${height}` : ""}`);
	};

	constructor(
		private readonly doc: Document,
		private readonly sink: TraceSink,
	) {
		this.win = doc.defaultView ?? window;
		doc.addEventListener("pointerdown", this.pressed, true);
		doc.addEventListener("pointerup", this.lifted, true);
		doc.addEventListener("focusin", this.focused, true);
		doc.addEventListener("focusout", this.focused, true);
		for (const type of EVENTS) this.win.addEventListener(type, this.heard);
		this.win.visualViewport?.addEventListener("resize", this.heard);
	}

	destroy(): void {
		this.doc.removeEventListener("pointerdown", this.pressed, true);
		this.doc.removeEventListener("pointerup", this.lifted, true);
		this.doc.removeEventListener("focusin", this.focused, true);
		this.doc.removeEventListener("focusout", this.focused, true);
		for (const type of EVENTS) this.win.removeEventListener(type, this.heard);
		this.win.visualViewport?.removeEventListener("resize", this.heard);
		this.win.cancelAnimationFrame(this.frame);
		this.flush();
	}

	log(line: string): void {
		this.lines.push(`${Math.round(performance.now() - this.start)} ${line}`);
		if (!this.flushTimer) this.flushTimer = this.win.setTimeout(() => this.flush(), FLUSH_MS);
	}

	private get recording(): boolean {
		return performance.now() < this.until;
	}

	private record(): void {
		const was = this.recording;
		this.until = performance.now() + RECORD_MS;
		if (was) return;
		this.lastFrame = 0;
		this.lastRow = "";
		this.frame = this.win.requestAnimationFrame((now) => this.step(now));
	}

	private step(now: number): void {
		if (this.lastFrame && now - this.lastFrame > SLOW_FRAME_MS) this.log(`slow frame ${Math.round(now - this.lastFrame)}ms`);
		this.lastFrame = now;
		const row = this.row();
		if (row !== this.lastRow) this.log(row);
		this.lastRow = row;
		if (this.recording) this.frame = this.win.requestAnimationFrame((next) => this.step(next));
		else this.log("---");
	}

	private row(): string {
		const style = getComputedStyle(this.doc.documentElement);
		const timeline = this.doc.querySelector<HTMLElement>(".tc-timeline");
		const parts = PARTS.map(([label, selector]) => `${label} ${box(this.doc.querySelector(selector))}`);
		const kb = `kbh ${style.getPropertyValue("--keyboard-height").trim() || "-"}${this.doc.body.classList.contains("keyboard-animating") ? " anim" : ""}`;
		const screen = `inner ${this.win.innerHeight} vv ${Math.round(this.win.visualViewport?.height ?? 0)}`;
		return [...parts, `tl ${timeline ? Math.round(timeline.scrollTop) : "-"}`, kb, screen].join(" | ");
	}

	private flush(): void {
		this.win.clearTimeout(this.flushTimer);
		this.flushTimer = 0;
		if (this.lines.length === 0) return;
		const text = this.lines.join("\n") + "\n";
		this.lines = [];
		this.sink.write(text);
	}
}

function box(el: Element | null): string {
	if (!el?.isConnected) return "-";
	const r = el.getBoundingClientRect();
	return r.height > 0 ? `${Math.round(r.top)}:${Math.round(r.bottom)}` : "0";
}

function name(target: Element | null): string {
	if (!target) return "none";
	const own = (target.getAttribute("class") ?? "").split(" ").filter(Boolean).slice(0, 2).join(".");
	return `${target.tagName.toLowerCase()}${own ? "." + own : ""}`;
}
