/**
 * The user's truth, read independently of the code under test: what the screen shows (the words a person reads where they
 * stand) and what the tasks file says. Nothing here asks the plugin's state.
 */

/** The titles a person sees over the columns, left to right: each wholly inside the view. */
export function columnsInView(cdp, root = ".task-calendar") {
	return cdp.eval(`(() => {
		const view = document.querySelector(${JSON.stringify(root)});
		if (!view) return [];
		const box = view.getBoundingClientRect();
		const heads = [...view.querySelectorAll(".tc-stage-head .tc-head-title, .tc-pane-head .tc-head-title, .tc-row-label")];
		return heads
			.map((el) => ({ el, r: el.getBoundingClientRect() }))
			.filter(({ r }) => r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1)
			.sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top)
			.map(({ el }) => el.textContent.trim());
	})()`);
}

/** The titles of the cards a person sees in the list `list` (`data-list`), top to bottom; partly hidden ones too. */
export function cardsInView(cdp, list, root = ".task-calendar") {
	return cdp.eval(`(() => {
		const el = document.querySelector(\`${root} [data-list="${list}"]\`);
		if (!el) return [];
		const box = el.getBoundingClientRect();
		const view = document.querySelector(${JSON.stringify(root)}).getBoundingClientRect();
		return [...el.querySelectorAll(".tc-card")]
			.map((card) => ({ card, r: card.getBoundingClientRect() }))
			.filter(({ r }) => r.bottom > Math.max(box.top, view.top) && r.top < Math.min(box.bottom, view.bottom) && r.right > view.left && r.left < view.right)
			.sort((a, b) => a.r.top - b.r.top)
			.map(({ card }) => card.querySelector(".tc-card-title").textContent);
	})()`);
}

/** What the screen shows as a whole, for a look-check: every word of the view in reading order. */
export function screenText(cdp, root = ".task-calendar") {
	return cdp.eval(`document.querySelector(${JSON.stringify(root)})?.innerText ?? ""`);
}

/** The element's box, or null when there is none; `index` picks among several. */
export function rectOf(cdp, selector, index = 0) {
	return cdp.eval(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; })()`);
}

/** The words of the element under a point: what a person reads where they put the pointer. */
export function textAt(cdp, x, y) {
	return cdp.eval(`(() => { const el = document.elementFromPoint(${x}, ${y}); return el ? (el.closest(".tc-card, .tc-head-title, button, .tc-group-head, .tc-group-empty") ?? el).textContent.trim() : null; })()`);
}

/**
 * The tasks of one `## list` of the file as a person reads them: top-level tasks (with their section, `### name`, or null)
 * in file order, each its title without the fields, its status character and whether it has a due date or a time.
 */
export function tasksOf(text, list) {
	const lines = text.split("\n");
	const start = lines.indexOf(`## ${list}`);
	if (start < 0) return [];
	const tasks = [];
	let section = null;
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		if (line.startsWith("### ")) section = line.slice(4).trim();
		const m = /^- \[(.)\] (.*)$/.exec(line);
		if (!m) continue;
		const fields = m[2];
		const title = fields.split(/ (?:📅|📌|⏰|🚨|🔕|🔁|🗂️|📁)/u)[0].replace(/^p[12] /, "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
		tasks.push({ title, status: m[1], dated: fields.includes("📅"), timed: /📌|⏰|🚨|🔕/u.test(fields), section });
	}
	return tasks;
}
