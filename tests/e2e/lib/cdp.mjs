/**
 * What the scenarios and the shared input reach the page by (`t.cdp`, made in tests/e2e/fixture.mjs over a Playwright page):
 * `eval(expression)` its value in the page, `call(fn, ...args)`, `send(method, params)` a DevTools Protocol command over
 * the page's own session, `on(method, listener)` its events (returns the unsubscribe).
 * @typedef {{ eval(expression: string): Promise<any>, call(fn: Function, ...args: unknown[]): Promise<any>, send(method: string, params?: object): Promise<any>, on(method: string, listener: (params: any) => void): () => void }} Cdp
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
