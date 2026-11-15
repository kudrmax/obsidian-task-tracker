import type { JSX } from "preact";
import { type BlockModel, canUndo, shownLists, viewChoice } from "../model/block";
import { Icon, modeIcon } from "./icons";
import { List } from "./List";
import { FullCard } from "./full/FullCard";
import { SearchInBlock } from "./search/Search";

/** The core's icon of a mode (a Lucide name) as the design draws it. */

export interface BlockProps {
	readonly model: BlockModel;
}

/** The lists of the block's mode: Rows (each list under its label, stacked) or By subprojects (the project's parts). */
function Lists({ model }: BlockProps): JSX.Element | null {
	const lists = shownLists(model);
	switch (lists.kind) {
		case "rows":
			return (
				<>
					{lists.rows.map((row) => (
						<div key={row.column} class="tc-n-row">
							<div class="tc-n-row-label">{row.label}</div>
							<List list={row.list} classes="tc-n-row-list" found={model.found?.id ?? null} />
						</div>
					))}
				</>
			);
		case "byProject":
			return <List list={lists.list} classes="tc-n-projects-list" found={model.found?.id ?? null} />;
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
	return (
		<>
			<div class={shownLists(model).kind === "byProject" ? "tc-n-stack tc-n-stack-projects" : "tc-n-stack"}>
				<Lists model={model} />
			</div>
			<div class="tc-n-fade" />
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
			<FullCard model={model} />
			<SearchInBlock model={model} />
		</>
	);
}
