import type { ModelProfile } from "./profile";

/** Claude through Max's subscription, asked by Claude Code on the Mac. */
export const claudeProfile: ModelProfile = {
	id: "claude",
	name: "Claude",
	fields: [
		{ key: "model", label: "Model", kind: "choice", choices: ["sonnet", "opus", "haiku"], default: "sonnet" },
		{ key: "path", label: "Path to claude", kind: "text", default: "", note: "Empty: found by itself" },
	],
	words: {
		notInstalled: "Claude Code isn't installed. Install it, or set the path to `claude` in Settings → Assistant.",
		signedOut: "Claude Code isn't signed in. Run `claude` in Terminal and log in.",
		noAccess: "Claude refused: your subscription or account has no access now. Check it at claude.ai.",
		limit: "Claude's usage limit is reached. Try again when it resets.",
		busy: "Claude is overloaded. Try again in a minute.",
		offline: "Can't reach Claude. Check the network or the VPN.",
		badModel: "Claude doesn't know the model set in Settings → Assistant.",
		timeout: "Claude didn't answer in {timeout}.",
		badAnswer: "Claude's answer didn't name one of the tasks. Try again.",
		unknown: "Claude failed. The details are in the console.",
	},
	unavailable: "Claude works in Obsidian on the Mac.",
};
