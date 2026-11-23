import { useRef } from "react";
import { useScreenApi } from "../store";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * First step's field (F199–F201): the step line of the task's card (on the calendar its one line), empty, the caret in it.
 * Enter or a tap elsewhere hands what was typed to the store, Escape nothing; it ends once and opens no field after it.
 */
export function FirstStepLine() {
	const api = useScreenApi();
	const ended = useRef(false);
	const end = (text: string | null) => {
		if (ended.current) return;
		ended.current = true;
		api.getState().endFirstStep(text);
	};
	return (
		<div className="tc-first-step">
			<ObsidianEditor text="" className="tc-quick-field tc-title-field" placeholder="First step" onEnter={end} onEscape={() => end(null)} onLeave={(_, text) => end(text())} />
		</div>
	);
}
