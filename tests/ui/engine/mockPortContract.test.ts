// @vitest-environment happy-dom
import { MockPort } from "../../../obsidian/stand/MockPort";
import { describeScreenPort } from "./screenPortContract";

const NOW = new Date(2026, 10, 18, 14, 20);

describeScreenPort("the stand's MockPort", async (delay) => {
	const port = new MockPort(() => NOW);
	port.delay = delay as 0 | 30 | 300;
	return port;
});
