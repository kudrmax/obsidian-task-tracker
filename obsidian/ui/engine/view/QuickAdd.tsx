import { memo } from "react";
import { useScreen, useScreenApi } from "../store";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";

/** The plus, and the field it opens: Enter adds the typed task where the port puts new tasks, Escape closes it. */
export const QuickAdd = memo(function QuickAdd() {
	const api = useScreenApi();
	const adding = useScreen((s) => s.adding);
	return (
		<>
			{adding ? (
				<div className="tc-quick-bar tc-quick-add">
					<ObsidianEditor
						text=""
						className="tc-quick-field"
						onEnter={(text) => {
							if (text.trim() !== "") void api.getState().add(text);
						}}
						onEscape={() => api.getState().setAdding(false)}
					/>
				</div>
			) : null}
			<button type="button" className="tc-btn is-round is-accent tc-plus" aria-label="New task" onClick={() => api.getState().setAdding(!adding)}>
				<Icon name={adding ? "cross" : "plus"} />
			</button>
		</>
	);
});
