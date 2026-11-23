const headBy = (t, name) => t.cdp.eval(`(() => { const e = [...document.querySelectorAll(".tc-group-head")].find((h) => h.textContent === ${JSON.stringify(name)}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
export default {
	name: "zz-debug",
	features: ["debug"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-sections"); await new Promise((r) => setTimeout(r, 600)); const l = document.querySelector('[data-list="inbox"]'); l.scrollTop = l.scrollHeight; return 1; })()`);
		await t.sleep(400);
		const h = await headBy(t, "Идеи");
		const phone = t.platform === "phone";
		if (phone) { await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: h.x, y: h.y, id: 0 }] }); await t.sleep(400); for (let i = 1; i < 10; i++) { await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: h.x, y: h.y + i * 8, id: 0 }] }); await t.sleep(16); } }
		else { await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: h.x, y: h.y }); await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: h.x, y: h.y, button: "left", buttons: 1, clickCount: 1 }); for (let i = 1; i < 10; i++) { await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: h.x, y: h.y + i * 8, buttons: 1 }); await t.sleep(16); } }
		await t.sleep(400);
		await t.shot("lifted");
		if (phone) await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: h.x, y: h.y + 72, button: "left", buttons: 0, clickCount: 1 });
		await t.sleep(800);
		const g = await headBy(t, "Идеи");
		if (phone) await t.input.tap(g.x, g.y); else await t.input.click(g.x, g.y);
		await t.sleep(600);
		await t.shot("menu");
	},
};
