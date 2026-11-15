import type { JSX } from "preact";
import { type BlockModel, canUndo } from "../../model/block";
import { titleParts } from "../../model/card";
import { fullItem, fullLayer, fullTree } from "../../model/full";
import { fullList } from "../../model/fullList";
import { Title } from "../Card";
import { Icon } from "../icons";
import { List } from "../List";

/** The full card's layer index among the block's layers: what `motion` fades it in and out by. */
function layerIndex(model: BlockModel): number {
	return model.layers.findIndex((layer) => layer.kind === "full");
}

/**
 * One task over the whole block (the old `FullScreen`, docs «Задача на весь экран»): Close and Done in its bar; the task
 * it belongs to over its title (a tap goes up); its title, its project, every subtask as a tree with the circle that
 * ticks it done and leaves it crossed out in place; its description in Obsidian's editor, an island the host mounts
 * (`data-n-island`); the bottom row of the block: Undo, ⋯ (the task's own menu), the plus (a new last subtask).
 */
export function FullCard({ model }: { readonly model: BlockModel }): JSX.Element | null {
	const layer = fullLayer(model.layers);
	if (!layer) return null;
	const item = layer.closing ? null : fullItem(model.answers);
	const shown = item && item.id === layer.id ? item : null;
	const tree = shown ? fullTree(model.answers) : null;
	const typing = layer.description?.focused === true;
	const subtasks = shown ? fullList(model) : null;
	return (
		<div
			class={typing ? "tc-n-sheet tc-n-full is-typing" : "tc-n-sheet tc-n-full"}
			data-n-part="sheet"
			data-n-layer={layerIndex(model)}
			data-n-closing={layer.closing ? "" : undefined}
		>
			<div class="tc-n-sheet-bar">
				<button class="tc-n-btn tc-n-text" data-n-act="full:close">
					Close
				</button>
				<button class={typing ? "tc-n-btn tc-n-text tc-n-strong" : "tc-n-btn tc-n-text tc-n-strong is-hidden"} data-n-act="full:done">
					Done
				</button>
			</div>
			<div class="tc-n-full-body">
				<div class="tc-n-full-column">
					{shown?.parentText !== null && shown?.parentText !== undefined ? (
						<button class="tc-n-btn tc-n-full-parent" data-n-act="full:up">
							<Icon name="subtask" />
							<span class="tc-n-full-parent-text">
								<Title parts={titleParts(shown.parentText)} />
							</span>
						</button>
					) : null}
					<div class="tc-n-full-title">{shown ? <Title parts={titleParts(shown.text)} /> : null}</div>
					{tree?.project ? (
						<button class="tc-n-btn tc-n-full-project" data-n-act="full:project">
							<Icon name="project" />
							<span class="tc-n-full-project-text">{tree.project.name}</span>
						</button>
					) : null}
					{subtasks && subtasks.rows.length > 0 ? <List list={subtasks} kind="full" /> : null}
					{layer.closing ? <div class="tc-n-desc tc-n-full-desc" /> : <div key={layer.id} class="tc-n-desc tc-n-full-desc" data-n-island="description" />}
				</div>
			</div>
			<div class="tc-n-capsule">
				<button class={canUndo(model) ? "tc-n-btn tc-n-undo" : "tc-n-btn tc-n-undo is-off"} aria-label="Undo" data-n-act="undo">
					<Icon name="undo" />
				</button>
				<button class="tc-n-btn tc-n-more" aria-label="More" data-n-act="full:more">
					<Icon name="more" />
				</button>
			</div>
			<button class="tc-n-btn tc-n-round tc-n-plus" aria-label="Add subtask" data-n-act="full:add">
				<Icon name="plus" />
			</button>
		</div>
	);
}
