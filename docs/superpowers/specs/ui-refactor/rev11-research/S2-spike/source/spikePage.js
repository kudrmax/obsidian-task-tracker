// Installed into the page by spike.ts: window.__sp. Throwaway.
(() => {
	const S = window.__spike;
	const { h, render, Fragment } = S;
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
	const sp = { saved: {}, out: [] };
	window.__sp = sp;

	const countCards = (l) => (l.kind === "rows" ? l.rows.reduce((n, r) => n + r.list.rows.filter((x) => x.kind === "card").length, 0) : l.list.rows.filter((x) => x.kind === "card").length);
	sp.save = (name) => {
		const l = S.drawnLists(S.host.model);
		sp.saved[name] = l;
		return { kind: l.kind, cards: countCards(l) };
	};

	const Lists = ({ l }) =>
		l.kind === "rows"
			? h(Fragment, null, l.rows.map((r) => h("div", { key: r.column, class: "tc-n-row" }, h("div", { class: "tc-n-row-label" }, r.label), h(S.List, { list: r.list, kind: "row", column: r.column }))))
			: h(S.List, { list: l.list, kind: "projects", column: "projects" });
	sp.Lists = Lists;

	/** A host in the block's place, with the block's own classes so the stylesheet is the block's. */
	sp.host = () => {
		document.querySelector(".sp-host")?.remove();
		S.host.node.style.display = "none";
		const host = document.createElement("div");
		host.className = "task-calendar tc-n-block sp-host";
		const stack = document.createElement("div");
		stack.className = "tc-n-stack tc-n-stack-projects";
		host.append(stack);
		host.style.marginBottom = "100vh";
		S.host.node.after(host);
		host.scrollIntoView({ block: "start" });
		sp.stack = stack;
		sp.subs = [];
		return true;
	};
	sp.restore = () => {
		for (const s of sp.subs ?? []) render(null, s);
		document.querySelector(".sp-host")?.remove();
		S.host.node.style.display = "";
		return true;
	};
	sp.sub = (hide) => {
		const d = document.createElement("div");
		d.className = "sp-sub";
		d.style.display = "flex";
		d.style.flexDirection = "column";
		sp.setHidden(d, hide);
		sp.stack.append(d);
		sp.subs.push(d);
		return d;
	};
	sp.setHidden = (d, hide) => {
		d.style.contentVisibility = "";
		d.style.display = "flex";
		if (hide === "cv") d.style.contentVisibility = "hidden";
		if (hide === "none") d.style.display = "none";
	};
	sp.clear = () => {
		for (const s of sp.subs) {
			render(null, s);
			s.remove();
		}
		sp.subs = [];
		return true;
	};

	/** Runs `fn` in a task of its own, marked; answers its script time and the time to the frame after it. */
	sp.task = (mark, fn) =>
		new Promise((resolve) => {
			setTimeout(() => {
				console.timeStamp(`sp:${mark}`);
				const t0 = performance.now();
				const extra = fn();
				const t1 = performance.now();
				requestAnimationFrame(() =>
					setTimeout(() => {
						const t2 = performance.now();
						resolve({ mark, scriptMs: +(t1 - t0).toFixed(2), toAfterFrameMs: +(t2 - t0).toFixed(2), extra });
					}, 0),
				);
			}, 0);
		});

	// 1. Cold render ----------------------------------------------------------------------------------------------
	sp.cold = async (name, mark) => {
		sp.clear();
		const d = sp.sub(null);
		await sleep(300);
		const r = await sp.task(mark, () => render(h(Lists, { l: sp.saved[name] }), d));
		r.cards = d.querySelectorAll(".tc-n-card").length;
		r.nodes = d.getElementsByTagName("*").length;
		return r;
	};

	// 2. Reveal a mounted hidden subtree --------------------------------------------------------------------------
	/** Current = `from` shown; `to` mounted hidden by `how`; `shownBefore`: `to` drawn visible once before it was hidden. */
	sp.prepReveal = async (from, to, how, shownBefore) => {
		sp.clear();
		const a = sp.sub(null);
		render(h(Lists, { l: sp.saved[from] }), a);
		const b = sp.sub(shownBefore ? null : how);
		render(h(Lists, { l: sp.saved[to] }), b);
		await frame();
		if (shownBefore) {
			a.style.display = "none";
			await frame();
			b.getBoundingClientRect();
			sp.setHidden(b, how);
			sp.setHidden(a, null);
			await frame();
		}
		await sleep(600);
		return true;
	};
	sp.reveal = (how, mark) =>
		sp.task(mark, () => {
			const [a, b] = sp.subs;
			sp.setHidden(a, how);
			sp.setHidden(b, null);
		});

	// 3. Mounted subtrees: memory and the cost of a write ---------------------------------------------------------
	sp.mountMany = async (k, how) => {
		sp.clear();
		const names = ["rows", "byProject", "rows", "byProject"];
		for (let i = 0; i < k; i++) {
			const d = sp.sub(i === 0 ? null : how);
			render(h(Lists, { l: sp.saved[names[i]] }), d);
		}
		await frame();
		await sleep(300);
		return { nodes: document.getElementsByTagName("*").length, cards: document.querySelectorAll(".sp-host .tc-n-card").length };
	};
	let writes = 0;
	const changeOne = (l, share) => {
		writes++;
		const row = (r, first) => {
			if (r.kind !== "card") return r;
			if (first) return { ...r, face: { ...r.face, title: [{ kind: "text", text: `Changed by write ${writes}` }] } };
			return share ? r : { ...r, face: { ...r.face } };
		};
		const list = (m) => {
			let done = false;
			return { ...m, rows: m.rows.map((r) => { const f = !done && r.kind === "card"; if (f) done = true; return row(r, f); }) };
		};
		return l.kind === "rows" ? { ...l, rows: l.rows.map((x, i) => ({ ...x, list: i === 0 ? list(x.list) : share ? x.list : { ...x.list, rows: x.list.rows.map((r) => row(r, false)) } })) } : { ...l, list: list(l.list) };
	};
	sp.write = (share, mark) => {
		const names = ["rows", "byProject", "rows", "byProject"];
		const next = sp.subs.map((_, i) => changeOne(sp.saved[names[i]], share));
		return sp.task(mark, () => sp.subs.forEach((d, i) => render(h(Lists, { l: next[i] }), d)));
	};

	// 4. The editor -----------------------------------------------------------------------------------------------
	const events = { typed() {}, key() {}, blurred() {} };
	const keys = () => ({ hold() {}, dispose() {} });
	sp.fields = [];
	sp.editorPlaces = async () => {
		sp.clear();
		const d = sp.sub(null);
		render(h(Lists, { l: sp.saved.rows }), d);
		await frame();
		sp.places = [...d.querySelectorAll(".tc-n-card")].slice(0, 8).map((c) => {
			const p = document.createElement("div");
			p.className = "tc-n-field";
			c.after(p);
			return p;
		});
		await frame();
		return sp.places.length;
	};
	sp.editorNew = (kind, i, mark) =>
		sp.task(mark, () => {
			const place = sp.places[i];
			if (kind === "obsidian") {
				const f = S.titleField(keys)(document, events);
				place.append(f.el);
				f.setPlaceholder("New task");
				f.setText(`Typed ${i}`);
				f.focusEnd();
				sp.fields.push(f);
			} else {
				const v = new S.EditorView({ state: S.EditorState.create({ doc: `Typed ${i}` }), parent: place });
				v.focus();
				sp.fields.push({ destroy: () => v.destroy() });
			}
		});
	sp.editorRekey = (i, mark) =>
		sp.task(mark, () => {
			const f = sp.fields[0];
			sp.places[i].append(f.el);
			f.setPlaceholder(i % 2 ? "Section name" : "New task");
			f.setText(`Rekeyed ${i}`);
			f.focusEnd();
		});
	sp.editorsGone = () => {
		for (const f of sp.fields) f.destroy();
		sp.fields = [];
		document.activeElement?.blur?.();
		return true;
	};

	// 5. Chunked rendering ----------------------------------------------------------------------------------------
	/** The first `first` cards at once, then `chunk` more each frame. What stands in view is recorded at the first paint and at the end. */
	sp.chunked = async (name, first, chunk, mark) => {
		sp.clear();
		const d = sp.sub(null);
		await sleep(300);
		const l = sp.saved[name];
		const all = l.kind === "rows" ? null : l.list.rows;
		if (!all) throw new Error("chunked takes byProject");
		const draw = (n) => render(h(S.List, { list: { ...l.list, rows: all.slice(0, n) }, kind: "projects", column: "projects" }), d);
		const seen = () => [...d.querySelectorAll(".tc-n-card")].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((c) => `${c.dataset.nKey ?? c.textContent.slice(0, 20)}@${Math.round(c.getBoundingClientRect().top)}`);
		const steps = [];
		const t0 = performance.now();
		return new Promise((resolve) => {
			let n = Math.min(first, all.length);
			let atFirstPaint = null;
			setTimeout(() => {
				console.timeStamp(`sp:${mark}`);
				const s = performance.now();
				draw(n);
				steps.push({ n, ms: +(performance.now() - s).toFixed(2) });
				const next = () =>
					requestAnimationFrame(() => {
						if (atFirstPaint === null) atFirstPaint = { at: +(performance.now() - t0).toFixed(1), seen: seen() };
						if (n >= all.length) {
							setTimeout(() => resolve({ steps, firstPaint: atFirstPaint.at, done: +(performance.now() - t0).toFixed(1), sameInView: JSON.stringify(seen()) === JSON.stringify(atFirstPaint.seen), inView: atFirstPaint.seen.length, scrollH: sp.stack.scrollHeight, cards: d.querySelectorAll(".tc-n-card").length }), 0);
							return;
						}
						n = Math.min(all.length, n + chunk);
						const s2 = performance.now();
						draw(n);
						steps.push({ n, ms: +(performance.now() - s2).toFixed(2) });
						next();
					});
				next();
			}, 0);
		});
	};
	sp.cardsInView = () => {
		const r = sp.stack.getBoundingClientRect();
		const c = sp.stack.querySelector(".tc-n-card");
		return { stackH: Math.round(r.height), viewH: innerHeight, cardH: c ? Math.round(c.getBoundingClientRect().height) : null };
	};
	/** Two panes side by side (the ribbon): the current one and its neighbour, both drawn; then the ribbon slides one pane in `ms`. */
	sp.prepSwipe = async (paneCV) => {
		sp.clear();
		const ribbon = sp.sub(null);
		ribbon.style.flexDirection = "row";
		ribbon.style.width = "200%";
		ribbon.style.willChange = "transform";
		sp.stack.style.overflowX = "hidden";
		const panes = ["rows", "byProject"].map((name) => {
			const p = document.createElement("div");
			p.style.width = "50%";
			p.style.display = "flex";
			p.style.flexDirection = "column";
			if (paneCV) p.style.contentVisibility = "auto";
			ribbon.append(p);
			render(h(Lists, { l: sp.saved[name] }), p);
			return p;
		});
		sp.panes = panes;
		sp.ribbon = ribbon;
		await frame();
		await sleep(600);
		return true;
	};
	sp.swipe = (ms, mark) =>
		new Promise((resolve) => {
			setTimeout(() => {
				console.timeStamp(`sp:${mark}`);
				const t0 = performance.now();
				const step = () =>
					requestAnimationFrame((now) => {
						const k = Math.min(1, (performance.now() - t0) / ms);
						sp.ribbon.style.transform = `translateX(${-50 * k}%)`;
						if (k < 1) step();
						else setTimeout(() => resolve({ ms: +(performance.now() - t0).toFixed(1) }), 50);
					});
				step();
			}, 0);
		});
	sp.cardCV = (on, h) => {
		document.getElementById("sp-cv")?.remove();
		if (!on) return true;
		const st = document.createElement("style");
		st.id = "sp-cv";
		st.textContent = `.sp-host .tc-n-card, .sp-host .tc-n-group-head { content-visibility: auto; contain-intrinsic-size: auto ${h}px; }`;
		document.head.append(st);
		return true;
	};
	/** The host without the plugin's class: Obsidian's rules only match (a diagnostic of what the style cost is). */
	sp.bare = (on) => {
		const host = document.querySelector(".sp-host");
		host.className = on ? "sp-host" : "task-calendar tc-n-block sp-host";
		return true;
	};
	sp.styleRules = () => {
		let n = 0;
		for (const sh of document.styleSheets) { try { n += sh.cssRules.length; } catch {} }
		return { sheets: document.styleSheets.length, rules: n };
	};
	return true;
})();
