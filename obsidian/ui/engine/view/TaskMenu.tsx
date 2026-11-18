import { memo } from "react";
import { Popover } from "../layers/Layers";
import { useScreen, useScreenApi } from "../store";
import { useHost } from "./host";

/** The task's menu, over its card: the items the port offers, each run by the port. */
export const TaskMenu = memo(function TaskMenu() {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const layer = useScreen((s) => s.layer);
	const menu = layer?.kind === "menu" ? layer : null;
	const id = menu?.id ?? null;
	const items = menu?.items ?? [];
	return (
		<Popover open={id !== null} onClose={() => api.getState().closeLayer()} root={layerRoot} label="Task menu" className="tc-panel tc-floating-menu">
			<div className="tc-menu-group">
				{items.map((item) => (
					<button key={item.id} type="button" className="tc-btn tc-menu-row" role="menuitem" onClick={() => id && api.getState().act(id, item.id)}>
						<span className="tc-menu-label">{item.label}</span>
					</button>
				))}
			</div>
		</Popover>
	);
});
