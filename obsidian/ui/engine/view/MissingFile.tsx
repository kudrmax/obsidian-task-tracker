import { memo } from "react";
import { useScreen, useScreenApi } from "../store";

/** No tasks file (F6, `docs/plugin/file.md`): the port's words over the screen, and its button creating the file with its five sections. */
export const MissingFile = memo(function MissingFile() {
	const api = useScreenApi();
	const missing = useScreen((s) => s.read.missing);
	if (!missing) return null;
	return (
		<div className="tc-missing">
			<div>{missing.text}</div>
			<button type="button" className="tc-btn tc-missing-btn" onClick={() => api.getState().createFile()}>
				{missing.create}
			</button>
		</div>
	);
});
