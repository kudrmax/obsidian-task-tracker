import type { ReactNode } from "react";
import { ControlMenu } from "../layers/Layers";
import type { SourceRow } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { Row } from "./MenuRows";

/** A source's row as the core tones and words it; its time carries what its mark says, on hover and to a screen reader. */
function Source({ row }: { readonly row: SourceRow }) {
	const marked = row.alert === "" ? {} : { title: row.alert, "aria-label": row.time === "" ? row.alert : `${row.time}, ${row.alert}`, ...(row.time === "" ? { role: "img" } : {}) };
	return (
		<div className={`tc-source-row is-${row.tone}`}>
			<Icon name={row.source} />
			<div className="tc-source-lines">
				<span className="tc-source-name">{row.name}</span>
				<span className="tc-source-sub">{row.sub}</span>
			</div>
			<span className="tc-source-time" {...marked}>
				{row.time}
			</span>
		</div>
	);
}

/**
 * The calendar sources window (F273–F277; the design's «Источники календарей»): over the wheel held while the calendar
 * shows, the wheel's copy standing over the backdrop; a row per calendar file, those the day takes calendars from first,
 * the spare ones under «Not in use»; Refresh now closes it and asks the sources again.
 */
export function SourcesWindow({ wheel, copy }: { readonly wheel: HTMLElement | null; readonly copy: ReactNode }) {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const open = useScreen((s) => s.sources);
	const sources = useData((d) => d.day.sources);
	const groups = [
		<div key="rows">
			{sources.inUse.map((row) => (
				<Source key={row.source} row={row} />
			))}
			{sources.spare.length > 0 ? <div className="tc-source-caption">{sources.notInUse}</div> : null}
			{sources.spare.map((row) => (
				<Source key={row.source} row={row} />
			))}
		</div>,
		<Row key="refresh" label="Refresh now" icon="refresh" lead className="tc-source-refresh" onPick={() => api.getState().refreshSources()} />,
	];
	return <ControlMenu open={open} onClose={() => api.getState().closeSources()} root={layerRoot} reference={wheel} label="Calendar sources" title={null} kind="sources" copy={copy} groups={groups} />;
}
