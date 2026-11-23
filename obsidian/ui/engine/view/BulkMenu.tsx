import { memo, useRef } from "react";
import { useMenuOrigin } from "../layers/Layers";
import { type Placement, Popover } from "../layers/Popover";
import type { MenuAction } from "../port";
import { type Layer, useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { taskGroups } from "./TaskMenu";

/**
 * Where the menu for every picked task stands (the design's «Массовые действия», «Выбор задач»): over the circle in the
 * plus's place by its right edge, over the capsule's count by its left, beside the card clicked on the Mac.
 */
function placementBy(element: Element | null): Placement {
	if (element?.closest(".tc-capsule")) return "top-start";
	if (element?.closest("[data-picked-menu]")) return "top-end";
	return "right-start";
}

/**
 * The menu for every picked task at once (F137, F139–F144): «N tasks» over the groups the port offers for them all, the
 * same tiles and pages as one task's menu, each tap written on them all; a label or a project keeps the menu and the
 * picks for the next, any other action ends Select tasks.
 */
export const BulkMenu = memo(function BulkMenu() {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const origin = useMenuOrigin();
	const layer = useScreen((s) => (s.layer?.many ? s.layer : null));
	const last = useRef<{ layer: Layer; reference: Element | null } | null>(null);
	if (layer) last.current = { layer, reference: last.current && last.current.layer.many === layer.many ? last.current.reference : origin.element };
	const shown = last.current;
	if (!shown || shown.layer.model.kind !== "task") return null;
	const model = shown.layer.model;
	const steps = { ...api.getState(), pick: (action: MenuAction) => api.getState().pick(action) };
	return (
		<Popover open={layer !== null} onClose={() => api.getState().closeLayer()} onGone={api.getState().layerGone} root={layerRoot} reference={shown.reference} placement={placementBy(shown.reference)} label="Picked tasks menu" className={`is-menu is-task is-bulk${shown.layer.page === "picker" ? " is-picker" : ""}`}>
			<div className="tc-menu-title">{model.title}</div>
			{taskGroups(shown.layer, false, model, steps)}
		</Popover>
	);
});
