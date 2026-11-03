/** One HTTP request: Obsidian's requestUrl in the app, a fake in tests. */
export interface HttpRequest {
	readonly url: string;
	readonly method?: "GET" | "POST";
	readonly headers?: Record<string, string>;
	readonly body?: string;
}

export interface HttpResponse {
	readonly status: number;
	readonly json: unknown;
	readonly text: string;
}

/** Answers every status; a status of 400 or more is the caller's to judge. */
export type Http = (request: HttpRequest) => Promise<HttpResponse>;
