import type { AssistantContextWords, AssistantOutcome, AssistantPageWords } from "../contracts";
import type { AssistantAction } from "./actions/action";
import type { FailureKind } from "./model";
import type { ModelProfile } from "./models/profile";

export const STOPPED: AssistantOutcome = { kind: "stopped" };

/** The chosen task was closed or removed during the wait: not the model's failure. */
const GONE_WORDS = "That task was closed while {model} was thinking.";

/** The settings name a model no profile has. */
export const NO_MODEL_WORDS = "No model is set for the assistant. Choose one in Settings → Assistant.";

/** The Assistant page's own words: every frontend draws these, none writes them. */
export const PAGE_WORDS: AssistantPageWords = {
	model: "Model",
	timeout: "Timeout",
	timeoutNote: "Seconds to wait for an answer.",
	prompts: "Prompts",
	promptsNote: "What each button asks. The shape of the answer is the plugin's own.",
	reset: "Reset to default",
};

/** The words of an answer's field for what the model missed. */
export const CONTEXT_WORDS: AssistantContextWords = {
	placeholder: "What did Claude miss?",
	save: "Save",
	saveAndAsk: "Save and ask again",
	failed: "Couldn't save to this task.",
};

/** A timeout in words: whole minutes as minutes, else seconds. */
export function durationWords(seconds: number): string {
	if (seconds % 60 === 0) return seconds === 60 ? "1 minute" : `${seconds / 60} minutes`;
	return `${seconds} seconds`;
}

/** What a failure tells Max, the model's own words, `{timeout}` filled. */
export function failureWords(profile: ModelProfile, kind: Exclude<FailureKind, "stopped">, timeoutSeconds: number): string {
	return profile.words[kind].replace("{timeout}", durationWords(timeoutSeconds));
}

export function goneWords(profile: ModelProfile): string {
	return GONE_WORDS.replace("{model}", profile.name);
}

export function failed(action: AssistantAction, words: string, detail: string): AssistantOutcome {
	return { kind: "failed", title: action.failureTitle, words, detail };
}
