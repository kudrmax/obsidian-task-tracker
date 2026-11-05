import type { TraceSink } from "./entryTrace";

/**
 * A temporary record of what a finger on the timeline does on the phone, event by event: the pointer and touch events,
 * whether the touch moves were kept from scrolling, who holds the screen, what scrolled. Written to the note of the entry
 * trace, so a phone with no console can show it. To be removed with the fix it was made for.
 */
const FLUSH_MS = 1000;
const TAIL_MS = 600;
const POINTER_EVENTS = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
const TOUCH_EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel"] as const;

export class GestureTrace {
	private lines: string[] = [];
	private flushTimer = 0;
	private until = 0;
	private fingers = 0;
	private readonly start = performance.now();
	private readonly win: Window;
	private readonly pointer = (e: PointerEvent) => {
		if (e.type === "pointerdown" && e.pointerType !== "mouse" && this.onTimeline(e.target)) this.fingers++;
		if (!this.recording) return;
		if (e.type === "pointerup" || e.type === "pointercancel") this.fingers = Math.max(0, this.fingers - 1);
		if (this.fingers === 0) this.until = Math.max(this.until, performance.now() + TAIL_MS);
		this.log(`${short(e.type)} #${e.pointerId} ${Math.round(e.clientX)},${Math.round(e.clientY)} ${name(e.target)} ${this.state()}`);
	};
	private readonly touch = (e: TouchEvent) => {
		if (!this.recording) return;
		const t = e.changedTouches[0];
		const at = t ? `${Math.round(t.clientX)},${Math.round(t.clientY)}` : "";
		this.win.setTimeout(() => this.log(`${short(e.type)} ${at} n=${e.touches.length} cancelable=${e.cancelable ? 1 : 0} prevented=${e.defaultPrevented ? 1 : 0}`), 0);
	};
	private readonly scrolled = (e: Event) => {
		if (!this.recording) return;
		const target = e.target instanceof Element ? e.target : null;
		this.log(`scroll ${name(target)} ${target ? Math.round(target.scrollTop) + ":" + Math.round(target.scrollLeft) : ""}`);
	};

	constructor(
		private readonly doc: Document,
		private readonly sink: TraceSink,
		private readonly holder: () => string | null,
	) {
		this.win = doc.defaultView ?? window;
		for (const type of POINTER_EVENTS) doc.addEventListener(type, this.pointer, true);
		for (const type of TOUCH_EVENTS) doc.addEventListener(type, this.touch, { capture: true, passive: true });
		doc.addEventListener("scroll", this.scrolled, true);
	}

	destroy(): void {
		for (const type of POINTER_EVENTS) this.doc.removeEventListener(type, this.pointer, true);
		for (const type of TOUCH_EVENTS) this.doc.removeEventListener(type, this.touch, true);
		this.doc.removeEventListener("scroll", this.scrolled, true);
		this.flush();
	}

	log(line: string): void {
		this.lines.push(`${Math.round(performance.now() - this.start)} ${line}`);
		if (!this.flushTimer) this.flushTimer = this.win.setTimeout(() => this.flush(), FLUSH_MS);
	}

	private get recording(): boolean {
		return this.fingers > 0 || performance.now() < this.until;
	}

	private onTimeline(target: EventTarget | null): boolean {
		return target instanceof Element && !!target.closest(".tc-timeline, .tc-backdrop, .tc-level");
	}

	private state(): string {
		const menu = this.doc.querySelector(".tc-backdrop.is-shown") ? " menu" : "";
		const float = this.doc.querySelector(".tc-float") ? " float" : "";
		return `[${this.holder() ?? "free"}${menu}${float}]`;
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

function short(type: string): string {
	return type.replace("pointer", "p:").replace("touch", "t:");
}

function name(target: EventTarget | null): string {
	if (!(target instanceof Element)) return "none";
	const own = (target.getAttribute("class") ?? "").split(" ").filter(Boolean).slice(0, 2).join(".");
	return `${target.tagName.toLowerCase()}${own ? "." + own : ""}`;
}
