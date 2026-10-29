// Scriptable: выгружает события календаря iPhone (все аккаунты, включая Exchange)
// за сегодня и завтра в <vault>/calendar/work.json для плагина Task Calendar spike.
//
// Нужна файловая закладка на папку vault:
//  - для запуска внутри Scriptable: Settings → File Bookmarks → + → папка vault, имя ObsidianVault;
//  - для запуска из Shortcuts: в самом Shortcut перед "Run Script" действие Scriptable
//    "Create File Bookmark" с тем же именем и той же папкой.

const BOOKMARK = "ObsidianVault";
const OUTPUT = "calendar/work.json";

const fm = FileManager.local();
if (!fm.bookmarkExists(BOOKMARK)) {
	throw new Error(`Нет файловой закладки "${BOOKMARK}" на папку vault`);
}
const vault = fm.bookmarkedPath(BOOKMARK);

const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 2);

const events = await CalendarEvent.between(start, end);
const payload = {
	exportedAt: new Date().toISOString(),
	device: Device.name(),
	events: events.map((e) => ({
		id: e.identifier,
		title: e.title,
		start: e.startDate.toISOString(),
		end: e.endDate.toISOString(),
		allDay: e.isAllDay,
		calendar: e.calendar.title,
		color: "#" + e.calendar.color.hex,
		location: e.location,
		source: "apple",
	})),
};

const outPath = fm.joinPath(vault, OUTPUT);
const dir = fm.joinPath(vault, OUTPUT.split("/").slice(0, -1).join("/"));
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
fm.writeString(outPath, JSON.stringify(payload, null, 2));

if (config.runsInApp) {
	const alert = new Alert();
	alert.title = "Экспорт готов";
	alert.message = `${events.length} событий → ${OUTPUT}`;
	alert.addAction("OK");
	await alert.present();
}
Script.complete();
