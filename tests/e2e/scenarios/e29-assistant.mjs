/**
 * Best task (F261–F266, F312; docs/plugin/assistant.md; the design's answer popup): on the desktop «⋯» offers Best task; a
 * tap closes the menu and «⋯»'s dots become a spinning ring while the question waits, the screen usable meanwhile; «⋯»
 * then offers Stop, which stops it and shows nothing. The answer opens in the window's middle: «Best task», the chosen
 * task's card, the reason, the field «What did Claude miss?» and Close; text in the field turns Close into Save and Save
 * and ask again, ⌘Enter saving it into the task's notes and asking again. A failure takes the same popup. The model is
 * the page's own in memory, answered by the check: no real model is ever asked.
 */
export default {
	name: "e29-assistant",
	features: ["Best task and its answer (F261–F265, F312)"],
	platforms: ["desktop"],
	cases: ["answer", "stop", "failed"],
	async run(t, item) {
		const click = (p) => t.input.click(p.x, p.y);
		const more = ".task-calendar > .tc-capsule:not(.tc-select-capsule) .tc-more-open";
		const openMore = async () => {
			await click(await t.oracle.rect(more));
			await t.sleep(400);
		};
		const row = (words) => t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-panel.is-more button")].find((e) => e.textContent.trim() === ${JSON.stringify(words)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, spins: !!b.querySelector(".tc-spinner") }; })()`);
		const spinning = () => t.cdp.eval(`!!document.querySelector(${JSON.stringify(more)} + "> .tc-spinner") || !!document.querySelector(".tc-more-open.is-busy .tc-spinner")`);
		const popup = () => t.cdp.eval(`(() => { const p = document.querySelector(".tc-panel.is-answer"); if (!p) return null; return { title: p.querySelector(".tc-answer-title")?.textContent, card: p.querySelector(".tc-answer-card .tc-card-title")?.textContent ?? null, note: p.querySelector(".tc-answer-note")?.textContent, buttons: [...p.querySelectorAll(".tc-answer-foot button")].map((b) => b.textContent.trim()), field: !!p.querySelector(".tc-answer-field") }; })()`);

		await openMore();
		const best = await row("Best task");
		if (!t.expect(best !== null, "«⋯» offers Best task on the desktop")) return;
		await click(best);
		await t.sleep(400);
		t.expect((await row("Search")) === null, "the menu closes");
		t.expect(await spinning(), "«⋯»'s dots become a spinning ring");
		t.expect(await t.stand("assistantAsked()"), "the question waits for the model");

		if (item === "stop") {
			await openMore();
			const stop = await row("Stop");
			t.expect(stop?.spins === true, `«⋯» offers Stop with the ring: ${JSON.stringify(stop)}`);
			await click(stop);
			await t.sleep(600);
			t.expect(!(await spinning()) && (await popup()) === null, "Stop stops it and shows nothing");
			return;
		}

		if (item === "failed") {
			await t.stand("answerAssistant(null)");
			await t.sleep(700);
			const shown = await popup();
			t.expect(shown?.title === "Couldn't find the best task" && !shown.field && JSON.stringify(shown.buttons) === JSON.stringify(["Close"]), `a failure takes the popup, no field: ${JSON.stringify(shown)}`);
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(400);
			t.expect((await popup()) === null, "Escape closes it");
			return;
		}

		const [chosen] = await t.stand("assistantCandidates()");
		await t.stand(`answerAssistant(${JSON.stringify(chosen)}, "It moves the most.")`);
		await t.sleep(700);
		const shown = await popup();
		t.expect(shown?.title === "Best task" && shown.card === chosen && shown.note === "It moves the most." && shown.field && JSON.stringify(shown.buttons) === JSON.stringify(["Close"]), `the answer: its card, the reason, the field and Close: ${JSON.stringify(shown)}`);
		t.expect(!(await spinning()), "the ring stops once the answer came");
		const panel = await t.oracle.rect(".tc-panel.is-answer");
		t.expect(panel && Math.abs(panel.x - 640) < 2, `it stands in the window's middle: ${JSON.stringify(panel)}`);
		await click(await t.oracle.rect(".tc-answer-field"));
		await t.cdp.send("Input.insertText", { text: "это шестая встреча" });
		await t.sleep(300);
		t.expect(JSON.stringify((await popup())?.buttons) === JSON.stringify(["Save", "Save and ask again"]), `text turns Close into Save and Save and ask again: ${JSON.stringify((await popup())?.buttons)}`);
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 4 });
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 4 });
		await t.sleep(800);
		t.expect((await t.file()).includes("Контекст: это шестая встреча"), "⌘Enter writes the text into the task's notes");
		t.expect((await popup()) === null && (await spinning()) && (await t.stand("assistantAsked()")), "and asks again: the popup closes, the ring spins");
	},
};
