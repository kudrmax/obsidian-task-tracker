import loader from "./mainLoader.cjs?raw";
import binary from "../../../native/trackpad/trackpad.node";
import type { TrackpadModule } from "./MacTrackpadFingers";

/** The native module and its loader as the plugin's build embeds them (Decision 125). */
export const TRACKPAD_MODULE: TrackpadModule = { binary, loader };
