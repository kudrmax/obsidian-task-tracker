import type { ResultOption, ResultPage, SectionKey, TaskKey } from "../../../core/application/contracts";
import { GroupNameField } from "../GroupNameField";
import { clear, el } from "../dom";
import { ownUndo } from "../fieldUndo";
import { icon, type IconName } from "../kit/icons";
import { backRow, menuGroup, menuRow } from "./MenuPanel";

/** A result's place on the Add to result page: its column's icon, as the wheel and the quick bar draw it. */
const PLACE_ICONS: Readonly<Record<SectionKey, IconName>> = { inbox: "inbox", now: "now", soon: "soon", backlog: "backlog", done: "done" };

export interface ResultChooserSpec {
	/** The way back's title: the row's own label, «Add to result». */
	readonly title: string;
	/** The page for an empty search (`TaskService.resultPage`). */
	readonly page: ResultPage;
	onBack(): void;
	/** The page for what is typed in the search field. */
	find(query: string): Promise<ResultPage>;
	onPick(result: TaskKey): void;
	/** «New result…», which asks for the name (`resultNamePage`). */
	onNew(): void;
	/** The results shown changed in place: the panel grows or shrinks to them. */
	onChange(): void;
}

/**
 * The Add to result page, in place of the menu: the way back, a search field over the open results (focused on the
 * desktop, where the keys are there; on the phone a tap raises the keyboard), the results the core finds, each with its
 * column's icon, its title and its project's name under it, the one the tasks are in ticked; «New result…» apart under
 * them, as New project… is. Enter in the field takes the first result shown.
 */
export function resultChooser(panel: HTMLElement, spec: ResultChooserSpec): void {
	backRow(panel, spec.title, () => spec.onBack());
	const search = menuGroup(panel, []);
	search.classList.add("tc-result-search");
	const field = el(search, "label", "tc-search-field");
	field.appendChild(icon("search"));
	const input = el(field, "input", "tc-search-input");
	input.type = "text";
	input.placeholder = spec.page.placeholder;
	input.setAttribute("aria-label", spec.page.placeholder);
	input.enterKeyHint = "go";
	ownUndo(input);
	const results = menuGroup(panel, []);
	results.classList.add("tc-result-options");
	let shown = spec.page;
	const fill = (page: ResultPage) => {
		shown = page;
		clear(results);
		for (const option of page.options) resultRow(results, option, () => spec.onPick(option.result.key));
		results.hidden = page.options.length === 0;
	};
	fill(spec.page);
	menuRow(panel, { label: spec.page.newLabel, icon: "plus", apart: true, add: true, cls: "tc-new-result", onPick: () => spec.onNew() });
	let asked = 0;
	input.addEventListener("input", () => {
		const ask = ++asked;
		void spec.find(input.value).then((page) => {
			if (ask !== asked || !input.isConnected) return;
			fill(page);
			spec.onChange();
		});
	});
	input.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const first = shown.options[0];
		if (first) spec.onPick(first.result.key);
	});
	if (!panel.ownerDocument.body.classList.contains("is-mobile")) queueMicrotask(() => input.focus({ preventScroll: true }));
}

/** One open result: its column's icon, its title fading out, its project's name small under it, the tick when the tasks are in it. */
function resultRow(parent: HTMLElement, option: ResultOption, onPick: () => void): HTMLButtonElement {
	const row = el(parent, "button", "tc-btn tc-menu-row is-choice tc-result-option");
	row.appendChild(icon(PLACE_ICONS[option.list])).classList.add("tc-result-place");
	const text = el(row, "span", "tc-result-text");
	el(text, "span", "tc-result-title", option.result.title);
	if (option.project !== null) el(text, "span", "tc-result-project", option.project);
	if (option.checked) row.appendChild(icon("check")).classList.add("tc-result-check");
	row.addEventListener("click", onPick);
	return row;
}

export interface ResultNameSpec {
	/** The name field's placeholder: «Result name». */
	readonly placeholder: string;
	onBack(): void;
	/** The name as typed on Enter; null for Escape or a tap elsewhere. Called once. */
	onDone(name: string | null): void;
}

/** «New result…»'s page: the way back, then the name typed in a capsule ringed in the accent, the keyboard up, as New project…'s. */
export function resultNamePage(panel: HTMLElement, spec: ResultNameSpec): HTMLElement {
	backRow(panel, "New result", () => spec.onBack());
	const holder = menuGroup(panel, []);
	holder.classList.add("tc-project-name");
	return GroupNameField.open(holder, { value: "", placeholder: spec.placeholder, onDone: (name) => spec.onDone(name) });
}
