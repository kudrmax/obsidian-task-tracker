/**
 * Step 7, one stroke one axis (Max, 2026-11-20: «Во время горизонтального скролла НЕ запрещен вертикальный — это не ок»;
 * spec 2026-11-18, Decision 126): a stroke that starts sideways moves the columns and scrolls no list up or down, however it
 * turns; one that starts up or down scrolls the list and moves no column. On the desktop by the trackpad's wheel, on the
 * phone by a finger.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
	name: "e9-ribbon-axis",
	features: ["Step 7: swipe the columns (one axis a stroke)"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("soon");
		const list = await t.oracle.rect('[data-list="soon"]');
		const at = { x: list.left + list.width * 0.5, y: list.top + list.height * 0.4 };
		const scrolled = () => t.cdp.eval(`document.querySelector('[data-list="soon"]').scrollTop`);
		const track = () => t.cdp.eval(`Math.round(document.querySelector(".tc-ribbon-track").getBoundingClientRect().left)`);
		const desk = !(await t.cdp.eval(`document.body.classList.contains("is-mobile")`));

		const top0 = await scrolled();
		const strip0 = await track();
		let moved = strip0;
		if (desk) {
			for (const [dx, dy] of [[6, 0], [10, 1], [14, 2], [6, 14], [2, 30], [0, 40], [0, 40], [0, 30]]) {
				await t.input.wheel(at.x, at.y, dx, dy);
				await sleep(16);
			}
			moved = await track();
		} else {
			await t.input.touch("touchStart", [at]);
			const path = [[-8, 0], [-16, 1], [-24, 2], [-30, 20], [-32, 60], [-32, 110], [-32, 160]];
			for (const [dx, dy] of path) {
				await t.input.touch("touchMove", [{ x: at.x + dx, y: at.y - dy }]);
				await sleep(16);
			}
			moved = await track();
			await t.input.touch("touchEnd", []);
		}
		await sleep(700);
		const top1 = await scrolled();
		t.expect(moved !== strip0, `a sideways start moves the columns: ${strip0} → ${moved}`);
		t.expect(top1 === top0, `a stroke that starts sideways scrolls the list not at all, however it turns: ${top0} → ${top1}`);

		await t.setStop("soon");
		await sleep(400);
		const strip2 = await track();
		if (desk) {
			for (const dy of [3, 10, 30, 40, 40, 30]) {
				await t.input.wheel(at.x, at.y, dy > 20 ? 4 : 0, dy);
				await sleep(16);
			}
		} else {
			await t.input.swipe(at, { x: at.x - 6, y: at.y - 160 }, { steps: 8, stepMs: 16 });
		}
		await sleep(700);
		t.expect((await scrolled()) > top1, `a stroke that starts down scrolls the list: ${top1} → ${await scrolled()}`);
		t.expect((await track()) === strip2, `and moves no column: ${strip2} → ${await track()}`);
	},
};
