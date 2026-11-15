/**
 * What the guards' samples are handed (`tests/uiRules.test.ts`): an element, a window, a document, a function, a flag, an
 * untyped value. Declared here, outside `next/`, so a sample's own text holds only what it is judged by; the guard lets
 * the samples import this module and nothing in the real tree.
 */
export declare const el: HTMLElement;
export declare const win: Window;
export declare const doc: Document;
export declare const target: Element;
export declare const f: () => void;
export declare const flag: boolean;
export declare const x: string;
export declare function go(): void;
export declare const untyped: any;
