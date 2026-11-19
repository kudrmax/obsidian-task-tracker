import { cardBy } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

/**
 * A card's keyboard focus looks designed (Decision 58): a task's menu closed by Escape gives the focus back to its card,
 * and neither a calendar block nor a list card shows the browser's square outline; on the desktop the card draws the
 * design's focus ring inside its own rounded edge, on the phone nothing.
 */
const FOCUS = `(() => {
	const source = document.activeElement?.closest?.(".tc-drag-source");
	const card = source?.querySelector(":scope > .tc-card, :scope > .tc-block-card");
	if (!source || !card) return { focused: document.activeElement?.className ?? null };
	const s = getComputedStyle(source);
	const c = getComputedStyle(card);
	const probe = document.createElement("div");
	probe.style.color = "var(--tc-accent)";
	card.append(probe);
	const accent = getComputedStyle(probe).color;
	probe.remove();
	return { title: card.querySelector(".tc-card-title")?.textContent, visible: source.matches(":focus-visible"), source: { outline: s.outlineStyle, shadow: s.boxShadow }, card: { outline: c.outlineStyle, colour: c.outlineColor, width: c.outlineWidth, offset: c.outlineOffset, radius: c.borderTopLeftRadius }, accent };
})()`;

export default {
	name: "e8-card-focus",
	features: ["E3: a card's keyboard focus after its menu closes is the design's rounded ring, never the browser's square outline (Decision 58)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const base = (await cal.timeOf("Созвон с командой")).start - 60;
		await cal.scrollTo(base + 5 * 60, 20);
		await t.sleep(300);

		const gym = await cal.blockBy("Тренировка");
		const mail = await cardBy(t, "Разобрать почту", "day");
		const desktop = t.platform === "desktop";
		for (const [name, at] of [["Тренировка", { x: gym.x, y: gym.bottom - 8 }], ["Разобрать почту", { x: mail.x, y: mail.y }]]) {
			await cal.tap(at);
			await t.sleep(500);
			t.expect(await t.cdp.eval(`!!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)")`), `«${name}»'s menu opens`);
			await cal.key("Escape", "Escape", 27);
			await t.sleep(500);
			const focus = await t.cdp.eval(FOCUS);
			t.expect(focus.title === name && focus.visible, `Escape gives the keyboard's focus back to «${name}»'s card: ${JSON.stringify(focus)}`);
			t.expect(focus.source?.outline === "none" && focus.source?.shadow === "none", `«${name}»: no square outline around the card: ${JSON.stringify(focus.source)}`);
			if (desktop)
				t.expect(
					focus.card?.outline === "solid" && focus.card.colour === focus.accent && focus.card.width === "2px" && focus.card.offset === "-2px" && parseFloat(focus.card.radius) > 0,
					`«${name}»: on the desktop the card draws the accent focus ring inside its own rounded edge: ${JSON.stringify(focus)}`,
				);
			else t.expect(focus.card?.outline === "none", `«${name}»: on the phone the card draws no focus ring: ${JSON.stringify(focus.card)}`);
			const box = await t.cdp.eval(`(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 }; })()`);
			await t.shot(`focus-${name === "Тренировка" ? "block" : "card"}`, box);
		}
	},
};
