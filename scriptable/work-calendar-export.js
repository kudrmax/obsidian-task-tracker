// Выгрузка событий календаря iPhone (все аккаунты, включая Exchange) в vault для плагина Task Calendar.
// Это тело асинхронной функции: плагин кладёт его в свою папку, дописав сверху `const OUTPUT = "<путь из настроек>";`,
// а скрипт Scriptable «Export Work Calendar» читает файл и запускает с `vault`, путём к папке vault.

const DAYS_BACK = 1;
const DAYS_AHEAD = 14;

const fm = FileManager.local();

const start = new Date();
start.setHours(0, 0, 0, 0);
start.setDate(start.getDate() - DAYS_BACK);
const end = new Date(start);
end.setDate(end.getDate() + DAYS_BACK + DAYS_AHEAD + 1);

const declinedByMe = (e) => (e.attendees ?? []).some((a) => a.isCurrentUser && a.status === "declined");
const hexColor = (color) => (color.hex.startsWith("#") ? color.hex : "#" + color.hex);

const events = (await CalendarEvent.between(start, end)).filter((e) => !declinedByMe(e));
const payload = {
	exportedAt: new Date().toISOString(),
	device: Device.name(),
	events: events.map((e) => ({
		id: `${e.identifier}@${e.startDate.toISOString()}`,
		title: e.title,
		start: e.startDate.toISOString(),
		end: e.endDate.toISOString(),
		allDay: e.isAllDay,
		calendar: e.calendar.title,
		color: hexColor(e.calendar.color),
		location: e.location ?? null,
		source: "apple",
	})),
};

const outPath = fm.joinPath(vault, OUTPUT);
const dir = outPath.split("/").slice(0, -1).join("/");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
fm.writeString(outPath, JSON.stringify(payload, null, 2));

if (config.runsInApp) {
	const alert = new Alert();
	alert.title = "Экспорт готов";
	alert.message = `${events.length} событий → ${OUTPUT}`;
	alert.addAction("OK");
	await alert.present();
}
