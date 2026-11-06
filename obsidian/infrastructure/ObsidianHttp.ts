import { requestUrl } from "obsidian";
import type { Http } from "./Http";

export const obsidianHttp: Http = (request) => requestUrl({ ...request, throw: false });
