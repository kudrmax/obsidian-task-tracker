import { sleep } from "./cdp.mjs";

/**
 * A card carried as a person carries it: pressed (on the phone held past the long press), lifted a little, then moved at a
 * hand's pace to where `target()` says once the card is up (the screen has parted under it by then), held there, and let
 * go, or cancelled with Escape (desktop) or dropped back where it started.
 */
export async function carry(t, from, target, { steps = 24, stepMs = 16, holdMs = 250, end = "drop", longPressMs = 250, during = null } = {}) {
	const phone = t.platform === "phone";
	const cdp = t.cdp;
	const mouse = (type, p, buttons) => cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons, clickCount: 1 });
	const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [] });
	const move = (p) => (phone ? touch("touchMove", p) : mouse("mouseMoved", p, 1));
	if (phone) {
		await touch("touchStart", from);
		await sleep(longPressMs + 120);
	} else {
		await mouse("mouseMoved", from, 0);
		await mouse("mousePressed", from, 1);
	}
	/** A few pixels first: past the mouse's start distance, the long press already done on the phone. */
	let at = from;
	for (let i = 1; i <= 4; i++) {
		at = { x: from.x, y: from.y + i * 2 };
		await move(at);
		await sleep(stepMs);
	}
	await sleep(120);
	/** A person aims at what they see: once there, the cards have parted under the card, and the hand corrects to the place. */
	let to = at;
	for (let round = 0; round < 2; round++) {
		const from = to;
		to = await target();
		const n = round === 0 ? steps : Math.ceil(steps / 3);
		for (let i = 1; i <= n; i++) {
			await move({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
			await sleep(stepMs);
		}
		await sleep(160);
	}
	if (during) await during();
	await sleep(holdMs);
	if (end === "cancel" && !phone) {
		await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await mouse("mouseReleased", to, 0);
		return;
	}
	if (phone) await touch("touchEnd", null);
	else await mouse("mouseReleased", to, 0);
}

/** A card's box and its task's id, found by the title a person reads on it; null when no card shows it. */
export function cardBy(t, title, list = null) {
	return t.cdp.eval(`(() => {
		const scope = ${list ? `document.querySelector('[data-list="${list}"]')` : "document.querySelector(" + JSON.stringify(t.target.root) + ")"};
		const el = scope && [...scope.querySelectorAll(".tc-card[data-id]")].find((c) => c.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(title)});
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { id: el.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
	})()`);
}

/** The titles of a list's cards top to bottom as drawn now, with whether a gap shows and where. */
export function listNow(t, list) {
	return t.cdp.eval(`(() => {
		const el = document.querySelector('[data-list="${list}"]');
		if (!el) return null;
		const rows = [...el.querySelectorAll(".tc-list-item")].map((item) => ({ item, r: item.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
		return rows.map(({ item }) => item.querySelector(".tc-gap:not(.is-home)") ? "[gap]" : item.querySelector(".tc-gap.is-home") ? "[home]" : (item.querySelector(".tc-card-title")?.textContent ?? item.textContent));
	})()`);
}
