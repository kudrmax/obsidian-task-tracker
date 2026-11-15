import type { JSX } from "preact";
import { type BlockModel, canUndo, shownLists, viewChoice } from "../model/block";
import { dropLine, type Marks, rowMarks } from "../model/carryView";
import { drawnLists, listName, placeTitle } from "../model/entry";
import { Bar } from "./entry/Bar";
import { Icon, modeIcon } from "./icons";
import { List } from "./List";
import { SelectFoot } from "./carry/SelectFoot";

/** The core's icon of a mode (a Lucide name) as the design draws it. */

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
							<List list={row.list} classes="tc-n-row-list" column={row.column} marks={marks} />
						</div>
					))}
				</>
			);
		case "byProject":
			return <List list={lists.list} classes="tc-n-projects-list" column="projects" marks={marks} />;
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
			<div class={shownLists(model).kind === "byProject" ? "tc-n-stack tc-n-stack-projects" : "tc-n-stack"} data-n-stack="">
				<Lists model={model} marks={rowMarks(model)} />
				{line ? (
					<div class="tc-n-drop" data-n-key="drop-line">
						<div class="tc-n-drop-dot" />
						<div class="tc-n-drop-line" />
					</div>
				) : null}
			</div>
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
		</>
	);
}

/** Select tasks: the lists with their circles, the capsule with the cross and the count, the actions button where the plus stood. */
function SelectBlock({ model }: BlockProps): JSX.Element {
	return (
		<>
			<div class={shownLists(model).kind === "byProject" ? "tc-n-stack tc-n-stack-projects" : "tc-n-stack"} data-n-stack="">
				<Lists model={model} marks={rowMarks(model)} />
			</div>
			<div class="tc-n-fade" />
			<SelectFoot picked={model.select?.picked.length ?? 0} />
		</>
	);
}
