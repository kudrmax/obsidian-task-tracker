import { type CSSProperties, useRef } from "react";
import { PROPERTY } from "../../design";
import type { CardFace } from "../port";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * A task's rename field (F117): its card turned into Obsidian's editor holding its title, the caret at the end, the
 * level's colour kept; Enter and a tap elsewhere write it, Escape takes it back.
 */
export function RenameField({ face, onDone, className, depth }: { readonly face: CardFace; readonly onDone: (text: string | null) => void; readonly className: string; readonly depth?: number }) {
	const done = useRef(false);
	const finish = (text: string | null) => {
		if (done.current) return;
		done.current = true;
		onDone(text);
	};
	return (
		<div className={`tc-quick-row ${className}`} data-renaming={face.id} style={depth === undefined ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			{face.inProgress ? <span className="tc-progress-dot" /> : null}
			<ObsidianEditor text={face.title} className="tc-quick-field tc-title-field" priority={face.color} onEnter={finish} onEscape={() => finish(null)} onLeave={(event, text) => !event.currentTarget.contains(event.relatedTarget as Node | null) && finish(text())} />
		</div>
	);
}
