import type { ProjectsScreenState } from "../../../core/application/contracts";
import type { Replica } from "../replica/Replica";

/** What this device keeps of the Projects screen, shared by every screen: `LocalProjectsScreenStore`. */
export interface ProjectsScreenSource {
	get(): ProjectsScreenState;
	set(state: ProjectsScreenState): void;
	onChange(listener: () => void): () => void;
}

/** The replica's Projects screen follows the device's one store, and every change of it is kept there at once. */
export class ProjectsScreenLink {
	constructor(
		private readonly store: ProjectsScreenSource,
		private readonly replica: Replica,
	) {}

	follow(): () => void {
		this.replica.update({ projectsScreen: this.store.get() });
		return this.store.onChange(() => this.replica.update({ projectsScreen: this.store.get() }));
	}

	save(state: ProjectsScreenState): void {
		this.replica.update({ projectsScreen: state });
		this.store.set(state);
	}
}
