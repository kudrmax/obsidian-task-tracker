import { claudeProfile } from "./claude";
import type { ModelProfile } from "./profile";

/** Every model the core knows, in the order the Assistant page offers them. A new model is one entry here. */
export const MODEL_PROFILES: readonly ModelProfile[] = [claudeProfile];
