// Scriptable: запускает выгрузку рабочего календаря для плагина Task Calendar.
// Вставляется в Scriptable один раз: саму выгрузку плагин держит в своей папке в vault и обновляет вместе с собой.
//
// Нужна файловая закладка на папку vault:
//  - для запуска внутри Scriptable: Settings → File Bookmarks → + → папка vault, имя ObsidianVault;
//  - для запуска из Shortcuts: в самом Shortcut перед "Run Script" действие Scriptable
//    "Create File Bookmark" с тем же именем и той же папкой.

const BOOKMARK = "ObsidianVault";
const EXPORT = ".obsidian/plugins/task-calendar/work-calendar-export.js";

const fm = FileManager.local();
if (!fm.bookmarkExists(BOOKMARK)) {
	throw new Error(`Нет файловой закладки "${BOOKMARK}" на папку vault`);
}
const vault = fm.bookmarkedPath(BOOKMARK);
const path = fm.joinPath(vault, EXPORT);
if (!fm.fileExists(path)) {
	throw new Error(`Нет ${EXPORT}: откройте Obsidian с плагином Task Calendar`);
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction("vault", fm.readString(path))(vault);
Script.complete();
