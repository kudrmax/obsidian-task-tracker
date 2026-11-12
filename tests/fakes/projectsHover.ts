import type { TaskService } from "../../core/application/contracts";
import { PROJECTS_HOVER_MS } from "../../core/application/projectsScreen";

/**
 * A card (or, `plus`, the plus) held over `node`'s row of the shown panel for the core's pause, and let go elsewhere: what
 * the row does under a held card (`carryAt`), the panel and the carry as they were after.
 */
export async function hoverRow(svc: Pick<TaskService, "setProjectsPanel" | "startCarry" | "carryAt" | "endCarry" | "funnelView">, node: string, plus = false): Promise<void> {
	const open = (await svc.funnelView(true)).panel?.reason === "button";
	if (!open) await svc.setProjectsPanel(true);
	await svc.startCarry({ keys: [], ...(plus && { plus: true }) }, true);
	await svc.carryAt({ edge: false, node }, 0);
	await svc.carryAt({ edge: false, node }, PROJECTS_HOVER_MS);
	await svc.endCarry("dropped");
	if (!open) await svc.setProjectsPanel(false);
}
