import { holds, resultAbove } from "../domain/Result";
import { foldedText } from "../domain/search";
import { isOpen } from "../domain/Task";
import { flatten, type TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { plainText } from "../domain/TaskText";
import type { MenuResult, MenuResultRowId, ResultPage, TaskItem } from "./contracts";
import { resultRef } from "./taskItems";

/** The words of the result rows and of the Add to result page, the same in every frontend. */
export const RESULT_WORDS = {
	addToResult: "Add to result",
	makeResult: "Make result",
	makeTask: "Make task",
	newResult: "New result…",
	search: "Search results",
	name: "Result name",
} as const;

/**
 * The result rows of a menu of `items`: Add to result and the toggle for one open task, Add to result alone for several
 * open ones (`bulk`), none while one of them is closed. The row's value and the page's tick: the result they all are
 * steps of.
 */
export function menuResult(items: readonly TaskItem[], bulk: boolean): MenuResult {
	const open = items.length > 0 && items.every((item) => item.can.result);
	const rows: readonly MenuResultRowId[] = !open ? [] : bulk ? ["addToResult"] : ["addToResult", "toggle"];
	const first = items[0]?.resultOf ?? null;
	const current = first !== null && items.every((item) => item.resultOf?.id === first.id) ? first : null;
	const isResult = !bulk && items[0]?.isResult === true;
	return {
		rows,
		label: RESULT_WORDS.addToResult,
		value: current?.title ?? "",
		current,
		toggle: isResult ? { label: RESULT_WORDS.makeTask, result: false } : { label: RESULT_WORDS.makeResult, result: true },
	};
}

/**
 * The Add to result page for `chosen`, `query` typed in its search: every open result of the file in file order but the
 * chosen tasks and those inside them, those whose title holds the query (case and accents aside); ticked, the result
 * every chosen task is a step of. `projectName`: a project's name by its link.
 */
export function resultPage(doc: TaskDocument, chosen: readonly TaskEntry[], query: string, projectName: (link: string) => string): ResultPage {
	const nearest = chosen.map((entry) => resultAbove(doc, entry)?.id ?? null);
	const ticked = nearest.length > 0 && nearest.every((id) => id === nearest[0]) ? nearest[0] : null;
	const typed = foldedText(query.trim());
	const options = flatten(doc.allTasks())
		.filter((entry) => entry.section !== "done" && entry.task.result && isOpen(entry.task.status))
		.filter((entry) => !chosen.some((task) => holds(task, entry)))
		.filter((entry) => typed === "" || foldedText(plainText(entry.task.text)).includes(typed))
		.map((entry) => ({ entry, line: doc.lineOf(entry) }))
		.sort((a, b) => a.line - b.line)
		.map(({ entry }) => ({ result: resultRef(entry), list: entry.section, project: entry.project === null ? null : projectName(entry.project), checked: entry.id === ticked }));
	return { options, placeholder: RESULT_WORDS.search, newLabel: RESULT_WORDS.newResult, namePlaceholder: RESULT_WORDS.name };
}
