import type { App } from "obsidian";

/** Temporary diagnostics: records touches over the task lists and who stops their scrolling, into a file in the vault. */
export class TouchProbe {
	private lines: string[] = [];
	private timer = 0;
	private readonly restore: () => void;
	private readonly path = "task-calendar-touch-log.md";

	constructor(private readonly app: App) {
		const probe = this;
		const original = Event.prototype.preventDefault;
		Event.prototype.preventDefault = function (this: Event) {
			if (this.type.startsWith("touch") || this.type.startsWith("pointer")) {
				probe.log(`preventDefault ${this.type} on ${describe(this.target)} cancelable=${this.cancelable}\n    ${(new Error().stack ?? "").split("\n").slice(2, 8).join("\n    ")}`);
			}
			return original.call(this);
		};
		const capture = (e: Event) => this.onEvent(e, "capture");
		const bubble = (e: Event) => this.onEvent(e, "bubble");
		const types = ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointercancel", "pointerup"];
		for (const t of types) {
			window.addEventListener(t, capture, { capture: true, passive: true });
			window.addEventListener(t, bubble, { passive: true });
		}
		const scroll = (e: Event) => {
			const t = e.target as Element;
			if (t instanceof Element && t.closest(".tc-list, .tc-timeline")) this.log(`scroll ${describe(t)} top=${Math.round(t.scrollTop)}`);
		};
		document.addEventListener("scroll", scroll, { capture: true, passive: true });
		this.timer = window.setInterval(() => void this.flush(), 1000);
		this.log(`--- probe start ${new Date().toISOString()} ua=${navigator.userAgent}`);
		this.restore = () => {
			Event.prototype.preventDefault = original;
			for (const t of types) {
				window.removeEventListener(t, capture, { capture: true });
				window.removeEventListener(t, bubble);
			}
			document.removeEventListener("scroll", scroll, { capture: true });
			window.clearInterval(this.timer);
		};
	}

	private moves = 0;

	private onEvent(e: Event, phase: string): void {
		const list = e.target instanceof Element ? e.target.closest(".tc-list") : null;
		if (!list) return;
		if (e.type === "touchmove") {
			this.moves++;
			if (this.moves % 5 !== 1 && phase === "capture") return;
		} else this.moves = 0;
		const touch = (e as TouchEvent).touches?.[0];
		const where = touch ? ` y=${Math.round(touch.clientY)}` : "";
		let line = `${phase} ${e.type}${where} prevented=${e.defaultPrevented} target=${describe(e.target)}`;
		if (e.type === "touchstart" && phase === "capture") line += `\n    ${metrics(list as HTMLElement)}`;
		this.log(line);
	}

	log(line: string): void {
		this.lines.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
	}

	private async flush(): Promise<void> {
		if (this.lines.length === 0) return;
		const chunk = this.lines.join("\n") + "\n";
		this.lines = [];
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(this.path)) await adapter.append(this.path, chunk);
		else await adapter.write(this.path, chunk);
	}

	unload(): void {
		void this.flush();
		this.restore();
	}
}

function describe(target: EventTarget | null): string {
	if (!(target instanceof Element)) return String(target);
	const parts: string[] = [];
	let el: Element | null = target;
	for (let i = 0; el && i < 4; i++, el = el.parentElement) parts.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""));
	return parts.join(" < ");
}

function metrics(list: HTMLElement): string {
	const chain: string[] = [];
	let el: HTMLElement | null = list;
	for (let i = 0; el && i < 6; i++, el = el.parentElement) {
		const s = getComputedStyle(el);
		chain.push(`${el.className.toString().split(" ")[0] || el.tagName} h=${el.clientHeight}/${el.scrollHeight} oy=${s.overflowY} ta=${s.touchAction} pe=${s.pointerEvents} pos=${s.position}`);
	}
	const view = list.closest(".tc-view") as HTMLElement | null;
	const nav = document.querySelector(".mobile-navbar")?.getBoundingClientRect();
	chain.push(`nav-clear=${view ? getComputedStyle(view).getPropertyValue("--tc-nav-clear") : "?"} navbar top=${nav ? Math.round(nav.top) : "none"} h=${nav ? Math.round(nav.height) : 0} window=${window.innerHeight}`);
	const r = list.getBoundingClientRect();
	const kids = Array.from(list.children) as HTMLElement[];
	const last = kids[kids.length - 1]?.getBoundingClientRect();
	const sum = kids.reduce((t, k) => t + k.getBoundingClientRect().height, 0);
	const ps = getComputedStyle(list);
	chain.push(`list rect ${Math.round(r.top)}..${Math.round(r.bottom)} kids=${kids.length} sumH=${Math.round(sum)} last.bottom=${last ? Math.round(last.bottom) : "-"} padB=${ps.paddingBottom} gap=${ps.rowGap} display=${ps.display}`);
	chain.push(`kids: ${kids.map((k) => `${k.className.split(" ")[0]}:${Math.round(k.getBoundingClientRect().height)}`).join(" ")}`);
	const x = Math.round(r.left + r.width / 2);
	for (const y of [r.bottom - 200, r.bottom - 150, r.bottom - 100, r.bottom - 50, r.bottom - 10]) {
		const hit = document.elementFromPoint(x, y);
		chain.push(`at y=${Math.round(y)}: ${describe(hit)}`);
	}
	return chain.join("\n    ");
}
