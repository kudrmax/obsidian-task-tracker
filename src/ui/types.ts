import type { TaskItem } from "../application/contracts";

/** The domain's value types as the contracts expose them, so the UI never reaches into the domain itself. */
export type LocalDate = NonNullable<TaskItem["dueDate"]>;
export type Slot = NonNullable<TaskItem["slot"]>;
export type TaskStatus = TaskItem["status"];
