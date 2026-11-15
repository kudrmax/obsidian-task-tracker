import type { ComponentChildren, JSX } from "preact";
import { type BlockModel, canUndo, shownLists, viewChoice } from "../model/block";
import { dropLine, type Marks, rowMarks } from "../model/carryView";
import { drawnLists, listName, placeTitle } from "../model/entry";
import { Bar } from "./entry/Bar";
import { Icon, modeIcon } from "./icons";
import { List } from "./List";
import { SelectFoot } from "./carry/SelectFoot";
import { FullCard } from "./full/FullCard";
import { SearchInBlock } from "./search/Search";

export interface BlockProps {
	readonly model: BlockModel;
}

/** The lists of the block's mode: Rows (each list under its label, stacked) or By subprojects (the project's parts). */
function Lists({ model, marks }: BlockProps & { readonly marks: Marks }): JSX.Element | null {
	const lists = drawnLists(model);
	switch (lists.kind) {
		case "rows":
			return (
				<>
					{lists.rows.map((row) => (
						<div key={row.column} class="tc-n-row">
							<div class="tc-n-row-label">{row.label}</div>
							<List list={row.list} kind="row" column={row.column} marks={marks} found={model.found?.id ?? null} />
						</div>
					))}
				</>
			);
		case "byProject":
			return <List list={lists.list} kind="projects" column="projects" marks={marks} found={model.found?.id ?? null} />;
		case "none":
			return null;
	}
}

/**
 * A note's block (board D5): the project's view in a frame as tall as its rows (up to the stylesheet's tallest, past
 * which it scrolls inside), its bottom row over the end: the capsule with Undo and ⋯, the view button, the plus.
 */
export function Block({ model }: BlockProps): JSX.Element {
	const choice = viewChoice(model);
	const icon = choice ? modeIcon(choice.icon) : undefined;
	const line = dropLine(model);
	if (model.select?.selecting) return <SelectBlock model={model} />;
	return (
		<>
			<Stack model={model}>
				<Lists model={model} marks={rowMarks(model)} />
				{line ? (
					<div class="tc-n-drop" data-n-key="drop-line">
						<div class="tc-n-drop-dot" />
						<div class="tc-n-drop-line" />
					</div>
				) : null}
			</Stack>
			<div class="tc-n-fade" />
			<div class="tc-n-fade-entering" />
			<div class="tc-n-capsule" data-n-anchor="capsule">
				<button class={canUndo(model) ? "tc-n-btn tc-n-undo" : "tc-n-btn tc-n-undo is-off"} aria-label="Undo" data-n-act="undo">
					<Icon name="undo" />
				</button>
				<button class="tc-n-btn tc-n-more" aria-label="More" data-n-act="more">
					<Icon name="more" />
				</button>
			</div>
			{icon ? (
				<button class="tc-n-btn tc-n-round tc-n-view-btn" aria-label="View" data-n-anchor="view" data-n-act="view">
					<Icon name={icon} />
				</button>
			) : null}
			<button class="tc-n-btn tc-n-round tc-n-plus" aria-label="New task" data-n-act="plus">
				<Icon name="plus" />
			</button>
			{model.entry ? <Bar entry={model.entry} wide={model.wide} placeTitle={placeTitle(model)} listName={(list) => listName(model, list)} /> : null}
			<FullCard model={model} />
			<SearchInBlock model={model} />
		</>
	);
}

/** Select tasks: the lists with their circles, the capsule with the cross and the count, the actions button where the plus stood. */
function SelectBlock({ model }: BlockProps): JSX.Element {
	return (
		<>
			<Stack model={model}>
				<Lists model={model} marks={rowMarks(model)} />
			</Stack>
			<div class="tc-n-fade" />
			<SelectFoot picked={model.select?.picked.length ?? 0} />
		</>
	);
}

/** What scrolls the block's lists: By subprojects one list whose room at its end is the foot fade's, a stack of its own. */
function Stack({ model, children }: BlockProps & { readonly children: ComponentChildren }): JSX.Element {
	return shownLists(model).kind === "byProject" ? (
		<div class="tc-n-stack tc-n-stack-projects" data-n-stack="">
			{children}
		</div>
	) : (
		<div class="tc-n-stack" data-n-stack="">
			{children}
		</div>
	);
}
