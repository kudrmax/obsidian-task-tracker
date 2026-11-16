import type { AssistantAction } from "./action";
import { bestTask } from "./bestTask";

/** Every button, in the order a place offers them. A new button is one entry here. */
export const ASSISTANT_ACTIONS: readonly AssistantAction[] = [bestTask];
