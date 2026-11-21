import { describeScreenPort } from "../ui/engine/screenPortContract";
import { corePortOver, NOW, standText } from "./standCore";

describeScreenPort("CorePort over the core", async (delay) => (await corePortOver(standText(NOW), NOW, delay)).port);
