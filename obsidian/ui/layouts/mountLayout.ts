import type { ViewLayout } from "../../../core/application/contracts";
import { ByProjectLayout } from "./ByProjectLayout";
import { ColumnsLayout } from "./ColumnsLayout";
import type { LayoutHost } from "./LayoutHost";
import type { ModeLayout } from "./ModeLayout";
import { RibbonLayout } from "./RibbonLayout";
import { RowsLayout } from "./RowsLayout";

/** The layout of the core's `layout`, mounted on the screen: the one place a mode picks what it is drawn by. */
export function mountLayout(host: LayoutHost, layout: ViewLayout): ModeLayout {
	switch (layout.mode) {
		case "twoColumns":
			return new RibbonLayout(host, layout);
		case "allColumns":
			return new ColumnsLayout(host, layout);
		case "rows":
			return new RowsLayout(host, layout);
		case "byProject":
			return new ByProjectLayout(host, layout);
	}
}
