import type { JSX } from "preact";
import { type BlockModel, blends, canUndo, viewChoice } from "../model/block";
import type { Layer } from "../model/layers";
import type { SectionMenuLayer } from "../model/section";
import { Icon, modeIcon } from "./icons";
import { Backdrop, MenuGroup, Placed } from "./Sheet";
import { CarryFloat } from "./carry/CarryFloat";
import { TaskMenu } from "./menu/TaskMenu";
import { SearchOver } from "./search/Search";


interface LayerProps {
	readonly model: BlockModel;
	readonly index: number;
	readonly closing: boolean;
}

/** The view button's menu (board V1): «View» over the modes the core offers, the current one checked; the Subprojects row as its own group. */
function ViewMenu({ model, index, closing }: LayerProps): JSX.Element | null {
	const choice = viewChoice(model);
	if (!choice) return null;
	const icon = modeIcon(choice.icon) ?? "rows";
	return (
		<>
			<Backdrop layer={index} closing={closing} />
			<Placed layer={index} closing={closing} anchor="view" how="copy" part="copy" kind="viewCopy">
				<Icon name={icon} />
			</Placed>
			<Placed layer={index} closing={closing} anchor="view" how="centre" part="panel" kind="viewPanel">
				<div class="tc-n-menu-title">View</div>
				<MenuGroup rows={choice.modes.map((option) => ({ label: option.label, icon: option.checked ? "check" : undefined, choice: true, act: "mode", value: option.mode }))} />
				{choice.subprojects ? <MenuGroup rows={[{ label: choice.subprojects.label, icon: choice.subprojects.checked ? "check" : undefined, choice: true, act: "subprojects" }]} /> : null}
			</Placed>
		</>
	);
}

/** What «⋯» opens over the capsule: Search and Select tasks. */
function MoreMenu({ model, index, closing }: LayerProps): JSX.Element {
	return (
		<>
			<Backdrop layer={index} closing={closing} />
			<Placed layer={index} closing={closing} anchor="capsule" how="copy" part="copy" kind="capsuleCopy">
				<span class={canUndo(model) ? "tc-n-btn tc-n-undo" : "tc-n-btn tc-n-undo is-off"}>
					<Icon name="undo" />
				</span>
				<span class="tc-n-btn tc-n-more">
					<Icon name="more" />
				</span>
			</Placed>
			<Placed layer={index} closing={closing} anchor="capsule" how="start" part="panel" kind="morePanel">
				<MenuGroup
					rows={[
						{ label: "Search", icon: "search", act: "search" },
						{ label: "Select tasks", icon: "select", act: "select" },
					]}
				/>
			</Placed>
		</>
	);
}

/** A section's header tapped (the old screen's `GroupMenu`): the header stays as it is over the blur, the panel under it. */
function SectionMenu({ index, closing, layer }: LayerProps & { readonly layer: SectionMenuLayer }): JSX.Element {
	return (
		<>
			<Backdrop layer={index} closing={closing} />
			<Placed layer={index} closing={closing} anchor={layer.head} how="copy" part="copy" kind="headCopy">
				<span class="tc-n-group-name">{layer.section}</span>
			</Placed>
			<Placed layer={index} closing={closing} anchor={layer.head} how="start" part="panel" kind="headPanel">
				<MenuGroup
					rows={[
						...(layer.rename ? [{ label: "Rename", icon: "rename" as const, act: "section:rename" }] : []),
						...(layer.remove ? [{ label: "Remove section", icon: "removeSection" as const, act: "section:remove" }] : []),
					]}
				/>
			</Placed>
		</>
	);
}

function LayerView(props: LayerProps & { readonly layer: Layer }): JSX.Element | null {
	switch (props.layer.kind) {
		case "viewMenu":
			return <ViewMenu {...props} />;
		case "moreMenu":
			return <MoreMenu {...props} />;
		case "taskMenu":
			return <TaskMenu model={props.model} layer={props.layer} index={props.index} />;
		case "full":
			return null;
		case "sectionMenu":
			return <SectionMenu {...props} layer={props.layer} />;
	}
}

/** Every layer over the block, bottom first, in the overlay host; the whole set under the screen's root class. */
export function Layers({ model }: { readonly model: BlockModel }): JSX.Element {
	return (
		<div class={blends(model) ? "task-calendar tc-n-layers is-blend" : "task-calendar tc-n-layers"}>
			{model.layers.map((layer, index) => (
				<LayerView key={`${index}:${layer.kind}`} layer={layer} model={model} index={index} closing={layer.closing} />
			))}
			<CarryFloat model={model} />
			<SearchOver model={model} />
		</div>
	);
}
