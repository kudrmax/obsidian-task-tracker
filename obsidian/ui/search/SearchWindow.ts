import type { SearchGroup, SearchHit, SectionKey, TaskService } from "../../../core/application/contracts";
import { ownUndo } from "../fieldUndo";
import { PROPERTY } from "../design";
import { el, px } from "../dom";
import { Button } from "../kit/Button";
import { icon } from "../kit/icons";
import { type CloseHow, Overlay } from "../menu/Overlay";
import { renderSearchRows, type SearchRow } from "./searchRows";

export interface SearchWindowDeps {
	/** The view: the phone's search covers it, the desktop's panel hangs from its top. */
	readonly root: HTMLElement;
	readonly tasks: Pick<TaskService, "search">;
	readonly desktop: boolean;
	/** The project whose view the search was opened from: it finds only that project's tasks. */
	readonly project?: string;
	sectionName(section: SectionKey): string;
	/** The sheet of the window it replaces («⋯»), taken over as it stands; without it the search opens its own. */
	readonly sheet?: (onClose: (how: CloseHow) => void) => Overlay;
	onPick(hit: SearchHit): void;
	onClose(): void;
}

const PICKED = "is-picked";

/**
 * The search: one field and the tasks it finds, grouped by section. On the phone it covers the view, the field over the
 * keyboard and the results above it; on the desktop a panel hangs at the top in the middle over the dimmed view, the
 * arrows walk its rows and Enter opens one. A pick or Cancel closes it.
 */
export class SearchWindow {
	readonly el: HTMLElement;
	readonly input: HTMLInputElement;
	private readonly results: HTMLElement;
	private readonly overlay: Overlay;
	private rows: SearchRow[] = [];
	private picked = -1;
	/** The search last asked for: an answer to an older one comes too late to show. */
	private asked = 0;
	private closed = false;

	static open(deps: SearchWindowDeps): SearchWindow {
		return new SearchWindow(deps);
	}

	private constructor(private readonly deps: SearchWindowDeps) {
		this.overlay = deps.sheet ? deps.sheet(() => this.cancel()) : new Overlay(() => this.cancel(), deps.root);
		this.el = el(null, "div", deps.desktop ? "tc-search is-desk" : "tc-search");
		const field = el(null, "label", "tc-search-field");
		field.appendChild(icon("search"));
		this.input = el(field, "input", "tc-search-input");
		this.input.type = "text";
		this.input.placeholder = "Search tasks";
		this.input.setAttribute("aria-label", "Search tasks");
		this.input.addEventListener("input", () => void this.find(this.input.value));
		ownUndo(this.input);
		this.input.addEventListener("keydown", (e) => this.onKey(e));
		this.results = el(null, "div", "tc-search-results");
		if (deps.desktop) {
			this.el.append(field, this.results);
			this.placeOver(deps.root);
			this.overlay.add(this.el);
		} else {
			const bar = el(null, "div", "tc-search-bar");
			bar.appendChild(field);
			Button.create(bar, { kind: "text", tone: "accent", label: "Cancel", cls: "tc-search-cancel", onPress: () => this.cancel() });
			this.el.append(this.results, bar);
			this.overlay.addIn(deps.root, this.el);
			this.overlay.dropSheet();
		}
		this.overlay.show();
		this.input.focus();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.asked++;
		void this.overlay.close();
	}

	/** The rows drawn for the last answer. */
	get shown(): readonly SearchRow[] {
		return this.rows;
	}

	private cancel(): void {
		this.close();
		this.deps.onClose();
	}

	/** A result picked: the window closes, and the screen goes to the task once it has, as every pick of a window does. */
	private pick(hit: SearchHit): void {
		if (this.closed) return;
		this.close();
		this.overlay.afterClose(() => this.deps.onPick(hit));
	}

	private async find(query: string): Promise<void> {
		const asked = ++this.asked;
		const project = this.deps.project;
		const groups = await (project === undefined ? this.deps.tasks.search(query) : this.deps.tasks.search(query, project));
		if (asked !== this.asked) return;
		this.show(query, groups);
	}

	private show(query: string, groups: readonly SearchGroup[]): void {
		this.results.textContent = "";
		this.rows = renderSearchRows(this.results, groups, (section) => this.deps.sectionName(section));
		for (const row of this.rows) row.el.addEventListener("click", () => this.pick(row.hit));
		if (groups.length === 0 && query !== "") el(this.results, "div", "tc-search-empty", "No tasks found");
		this.picked = -1;
		if (this.deps.desktop) this.walk(1);
	}

	private onKey(e: KeyboardEvent): void {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			this.walk(e.key === "ArrowDown" ? 1 : -1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const row = this.rows[this.picked];
			if (row) this.pick(row.hit);
		}
	}

	/** The arrows move the picked row, stopping at either end. */
	private walk(step: 1 | -1): void {
		if (this.rows.length === 0) return;
		this.rows[this.picked]?.el.classList.remove(PICKED);
		this.picked = Math.min(this.rows.length - 1, Math.max(0, this.picked + step));
		const row = this.rows[this.picked].el;
		row.classList.add(PICKED);
		row.scrollIntoView?.({ block: "nearest" });
	}

	/** The panel hangs from the top of the view, in its middle. */
	private placeOver(root: HTMLElement): void {
		const rect = root.getBoundingClientRect();
		this.el.style.setProperty(PROPERTY.searchLeft, px(rect.left + rect.width / 2));
		this.el.style.setProperty(PROPERTY.searchTop, px(rect.top));
		this.el.style.setProperty(PROPERTY.searchRoom, px(rect.height));
	}
}
