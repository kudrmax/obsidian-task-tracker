/** A scroller's fades as the browser draws them now (its mask's two depths), and how far it is scrolled. */
const edges = (t, selector) =>
	t.cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const s = getComputedStyle(el); return { top: parseFloat(s.getPropertyValue("--tc-fade-top")), bottom: parseFloat(s.getPropertyValue("--tc-fade-bottom")), scroll: el.scrollTop, more: el.scrollHeight - el.clientHeight - el.scrollTop }; })()`);
const scrollTo = async (t, selector, to) => {
	await t.cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollTop = ${to === "end" ? "el.scrollHeight" : to}; return 1; })()`);
	await t.sleep(250);
};

/**
 * The scroll's edges (F65, F66; `docs/plugin/screen.md` «Край прокрутки»): content scrolled under a list's or the
 * calendar's edge fades there, over about half a card, growing in with the first pixels of scroll; a list at its very top
 * shows no fade at the top, one with more below fades at the bottom until its end. A list scrolled stays where it stood
 * when a write changes it.
 */
export default {
	name: "e31-scroll-edges",
	features: ["F65: the scroll's edges fade", "F66: a scrolled list stays where it stood"],
	cases: ["list", "calendar", "write", "rows leave at the end"],
	async run(t, item) {
		if (item === "list") {
			await t.setStop("soon");
			const list = '[data-list="soon"]';
			const rest = await edges(t, list);
			t.expect(rest.top === 0 && rest.bottom > 10, `at its top: no fade over the first card, one at the bottom while more is below: ${JSON.stringify(rest)}`);
			await scrollTo(t, list, 4);
			const little = await edges(t, list);
			t.expect(little.top > 2 && little.top < 8, `the top fade grows in with the first pixels: ${JSON.stringify(little)}`);
			await scrollTo(t, list, 300);
			const far = await edges(t, list);
			t.expect(far.top >= 17 && far.top <= 18, `scrolled on, the fade is half a card deep: ${JSON.stringify(far)}`);
			await scrollTo(t, list, "end");
			const end = await edges(t, list);
			t.expect(end.bottom <= 1.5 && end.more <= 1.5, `at its end, none at the bottom: ${JSON.stringify(end)}`);
			await t.shot("list-edges");
		}
		if (item === "calendar") {
			await t.setStop("calendar");
			const room = ".tc-slide .tc-timeline, .tc-timeline";
			await scrollTo(t, room, 0);
			t.expect((await edges(t, room)).top === 0, "the calendar at its top: no fade there");
			await scrollTo(t, room, 200);
			t.expect((await edges(t, room)).top >= 17, `scrolled, its hours fade under the top: ${JSON.stringify(await edges(t, room))}`);
		}
		if (item === "write") {
			await t.setStop("soon");
			const list = '[data-list="soon"]';
			await scrollTo(t, list, 400);
			const before = await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="soon"]').getBoundingClientRect(); const c = [...document.querySelectorAll('[data-list="soon"] .tc-card[data-id]')].find((e) => e.getBoundingClientRect().top > l.top + 100); return { id: c.dataset.id, top: c.getBoundingClientRect().top }; })()`);
			const first = (await t.oracle.tasks("Soon"))[0].title;
			await t.stand(`moveFromOutside(${JSON.stringify(first)}, "backlog", null)`);
			await t.sleep(900);
			const after = await t.cdp.eval(`(() => { const c = document.querySelector('[data-list="soon"] .tc-card[data-id="${before.id}"]'); return c ? c.getBoundingClientRect().top : null; })()`);
			t.expect(after !== null && Math.abs(after - before.top) <= 2, `a task above it moved away from outside, the card under the finger stays where it stood: ${before.top} → ${after}`);
		}
		if (item === "rows leave at the end") {
			await t.setStop("soon");
			const list = '[data-list="soon"]';
			await scrollTo(t, list, "end");
			const soon = await t.oracle.tasks("Soon");
			const watched = soon.at(-4).title;
			const top = () => t.cdp.eval(`(() => { const c = [...document.querySelectorAll('[data-list="soon"] .tc-card[data-id]')].find((e) => e.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(watched)}); return c ? c.getBoundingClientRect().top : null; })()`);
			const before = await top();
			for (const task of soon.slice(-2)) await t.stand(`moveFromOutside(${JSON.stringify(task.title)}, "backlog", null)`);
			await t.sleep(900);
			const after = await top();
			t.expect(after !== null && Math.abs(after - before) <= 2, `the last rows gone, the cards above stay where they stood, empty room under them: ${before} → ${after}`);
		}
	},
};
