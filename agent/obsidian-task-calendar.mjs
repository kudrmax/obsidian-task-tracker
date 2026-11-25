#!/usr/bin/env node
// obsidian-task-calendar: built from agent/ by `node agent/build.mjs`. Do not edit.

// agent/compose.ts
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as join2 } from "node:path";

// core/application/CalendarPolling.ts
var CalendarPolling = class {
  constructor(deps) {
    this.deps = deps;
    this.timer = null;
    this.running = null;
    this.started = false;
    this.missed = false;
    this.lastAt = -Infinity;
  }
  /** The view opens with a fetch of its own. */
  start() {
    this.started = true;
    this.lastAt = this.deps.now();
    this.schedule();
  }
  stop() {
    this.started = false;
    this.cancel();
  }
  /** Always fetches: Refresh now. */
  refresh() {
    this.schedule();
    this.running ??= this.deps.refresh().finally(() => {
      this.running = null;
      this.lastAt = this.deps.now();
      this.missed = false;
    });
    return this.running;
  }
  /** The window got the focus or the app came to the front: a fetch, unless the last one is recent. */
  wake() {
    if (this.deps.hidden()) {
      this.missed = true;
      return;
    }
    const ms = this.deps.intervalMs();
    if (ms > 0 && this.deps.now() - this.lastAt < ms / 2) return;
    void this.refresh();
  }
  /** The view is on screen again: the tick it missed is fetched now. */
  catchUp() {
    if (this.missed && !this.deps.hidden()) void this.refresh();
  }
  tick() {
    this.timer = null;
    if (this.deps.hidden()) {
      this.missed = true;
      this.schedule();
    } else void this.refresh();
  }
  schedule() {
    this.cancel();
    const ms = this.deps.intervalMs();
    if (this.started && ms > 0) this.timer = this.deps.timers.set(() => this.tick(), ms);
  }
  cancel() {
    if (this.timer !== null) this.deps.timers.clear(this.timer);
    this.timer = null;
  }
};

// core/domain/LocalDate.ts
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var TIME_RE = /^(\d{2}):(\d{2})$/;
var DAY_MS = 864e5;
var HOUR_MINUTES = 60;
var MINUTES_PER_DAY = 1440;
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function formatUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function localDateOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isValidLocalDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return year >= 1e3 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
function addDays(date, n) {
  return formatUtc(new Date(utcMs(date) + n * DAY_MS));
}
function addMonths(date, n) {
  const { year, month, day } = partsOf(date);
  const index = year * 12 + (month - 1) + n;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(Math.min(day, daysInMonth(y, m)))}`;
}
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isLeapYear(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}
function daysInMonth(year, month) {
  const index = year * 12 + month - 1;
  const y = Math.floor(index / 12);
  const m = index - y * 12;
  return m === 1 && isLeapYear(y) ? 29 : MONTH_DAYS[m];
}
function weekdayOf(date) {
  return (new Date(utcMs(date)).getUTCDay() + 6) % 7;
}
function partsOf(date) {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
function daysBetween(from, to) {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}
function utcMs(date) {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function minutesToHHMM(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}
function parseHHMM(s) {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 24 || minutes > 59) return null;
  const total = hours * HOUR_MINUTES + minutes;
  return total > MINUTES_PER_DAY ? null : total;
}

// core/application/dayLabels.ts
var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var WORDS = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" };
function dayTitle(date, relation, today) {
  if (relation !== "other") return WORDS[relation];
  const { year, month, day } = partsOf(date);
  const base = `${WEEKDAYS[weekdayOf(date)]}, ${day} ${MONTHS[month - 1]}`;
  return year === partsOf(today).year ? base : `${base} ${year}`;
}
function dayMonth(date) {
  const { month, day } = partsOf(date);
  return `${day} ${MONTHS[month - 1]}`;
}
function dueLabel(date) {
  const { month, day } = partsOf(date);
  return { day: String(day), month: MONTHS[month - 1].toUpperCase() };
}

// core/application/sourceWords.ts
function alertText(tone) {
  if (tone === "old") return "Out of date";
  if (tone === "broken") return "Refresh failed";
  return "";
}
function dayWords(alert) {
  return { alert: alertText(alert), notInUse: "Not in use", notInUseNote: "The timeline takes a calendar from these only when the files above go out of date." };
}
var NAMES = { google: { name: "Google Calendar", short: "Google" }, iphone: { name: "iPhone calendars", short: "iPhone" }, work: { name: "Work calendar", short: "Work" } };
function problemText(problem) {
  switch (problem.kind) {
    case "loggedOut":
      return "not logged in";
    case "fileMissing":
      return "file missing";
    case "unreadable":
      return "file unreadable";
    case "noAnswer":
      return `no answer in ${problem.seconds} s`;
    case "failed":
      return shortFailure(problem.detail);
  }
}
var FAILURE_CHARS = 40;
function shortFailure(detail) {
  const head = detail.replace(/:\s*[{[<][\s\S]*$/, "").trim();
  const line = head.split(/\r?\n/)[0].trim();
  return line.length <= FAILURE_CHARS ? line : `${line.slice(0, FAILURE_CHARS - 1)}…`;
}
function sourceWords(status) {
  const names = NAMES[status.source];
  const at = status.updatedAt;
  const date = status.updatedDate === null ? "" : dayMonth(status.updatedDate);
  const relative = !at ? "" : status.updatedDay === "today" ? "today" : status.updatedDay === "yesterday" ? "yesterday" : date;
  const clock = at ? minutesToHHMM(at.getHours() * 60 + at.getMinutes()) : "";
  const time = !at ? "" : status.updatedDay === "today" ? clock : status.updatedDay === "yesterday" ? `Yesterday ${clock}` : `${date} ${clock}`;
  const sub = status.problem ? problemText(status.problem) : status.kind === "exported" ? `Exported from ${status.detail ?? "file"}` : at ? `Updated ${relative}` : "Not updated yet";
  return { name: names.name, short: names.short, sub, time, alert: alertText(status.tone) };
}

// core/domain/Days.ts
function dayColumn(day, today) {
  if (day === today) return { list: "now", date: null, sections: true };
  return day > today ? { list: "soon", date: day, sections: true } : { list: "now", date: day, sections: false };
}
function placementOfDay(day, today) {
  return day === today ? { kind: "now" } : { kind: "date", date: day };
}
function dayOfPlacement(placement, today) {
  if (placement.kind === "now") return today;
  return placement.kind === "date" ? placement.date : null;
}
function dayOfTask(section, task, today, boundary) {
  if (task.slot) return boundary.dayOfSlot(task.slot);
  return section === "now" ? today : task.dueDate;
}
function canPostpone(section) {
  return section !== "done";
}
function canRemoveDue(dueDate, today) {
  return dueDate !== null && dueDate !== today;
}
function taskScreen(section, day) {
  if (section === "done" || section === "inbox" || section === "backlog") return { kind: "list", list: section };
  return day === null ? { kind: "list", list: "soon" } : { kind: "day", date: day };
}
function dayRelation(date, today) {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return date === addDays(today, -1) ? "yesterday" : "other";
}

// core/application/calendarChoice.ts
var keyText = (key) => `${key.account}
${key.title}`.toLowerCase();
var PHONE_ACCOUNT = "iPhone";
var apart = (title) => `${PHONE_ACCOUNT} · ${title}`;
var GOOGLE_ORDER = ["google", "iphone", "work"];
var OTHER_ORDER = ["iphone", "work"];
var CalendarChoice = class {
  constructor(files, hidden, staleAfterMs, now) {
    this.files = files;
    this.staleAfterMs = staleAfterMs;
    this.now = now;
    this.googleEmail = files.get("google")?.calendars.find((c) => c.account !== null)?.account ?? null;
    const phone = files.get("iphone")?.calendars ?? [];
    const google = this.googleEmail === null ? null : phoneGoogleAccount(files.get("google").calendars, phone);
    this.phoneGoogleIds = new Set(
      phone.filter((c) => google !== null && phoneAccountOf(c) === google).flatMap((c) => c.calendarId === null ? [] : [c.calendarId])
    );
    this.hidden = new Set(hidden.map(keyText));
  }
  known() {
    const found = /* @__PURE__ */ new Map();
    for (const source of GOOGLE_ORDER) {
      for (const calendar of this.files.get(source)?.calendars ?? []) {
        const key = this.keyOf(source, calendar);
        const text = keyText(key);
        if (found.has(text)) continue;
        const name = source === "work" && key.title === apart(calendar.title) ? calendar.title : key.title;
        found.set(text, { key, accountName: key.account === "" ? PHONE_ACCOUNT : key.account, name, color: calendar.color, google: source === "google" || this.isGoogle(key) });
      }
    }
    return [...found.values()].sort(
      (a, b) => Number(b.google) - Number(a.google) || byAccount(a.key.account, b.key.account) || textOrder(a.key.title, b.key.title)
    );
  }
  day(start2, end) {
    const events = [];
    const used = /* @__PURE__ */ new Set();
    let stale = false;
    for (const calendar of this.known()) {
      if (this.hidden.has(keyText(calendar.key))) continue;
      const source = this.sourceFor(calendar, start2);
      if (source === null) continue;
      const file = this.files.get(source);
      used.add(source);
      if (!this.fresh(file)) stale = true;
      const text = keyText(calendar.key);
      events.push(...file.events.filter((e) => keyText(this.keyOf(source, calendarOf(e))) === text && e.start < end && e.end > start2));
    }
    return { events: events.sort((a, b) => a.start.getTime() - b.start.getTime()), used, stale };
  }
  sourceFor(calendar, day) {
    const text = keyText(calendar.key);
    const candidates = (calendar.google ? GOOGLE_ORDER : OTHER_ORDER).filter((source) => {
      const file = this.files.get(source);
      return file !== void 0 && covers(file, day) && file.calendars.some((c) => keyText(this.keyOf(source, c)) === text);
    });
    const fresh = candidates.find((source) => this.fresh(this.files.get(source)));
    if (fresh) return fresh;
    return candidates.reduce(
      (best, source) => best === null || this.files.get(source).exportedAt > this.files.get(best).exportedAt ? source : best,
      null
    );
  }
  fresh(file) {
    return this.now.getTime() - file.exportedAt.getTime() <= this.staleAfterMs;
  }
  isGoogle(key) {
    return this.googleEmail !== null && key.account === this.googleEmail;
  }
  /** The calendar a file's row or event belongs to, the same across the files. */
  keyOf(source, ref) {
    if (source === "work") return this.scriptableKey(ref);
    if (source === "iphone" && ref.calendarId !== null && this.phoneGoogleIds.has(ref.calendarId)) return { account: this.googleEmail, title: ref.title };
    return { account: ref.account ?? "", title: ref.title };
  }
  /** Scriptable knows no account: the phone's calendar with the same id, else the only calendar so titled, else its own. */
  scriptableKey(ref) {
    const phone = this.files.get("iphone")?.calendars.find((c) => ref.calendarId !== null && c.calendarId === ref.calendarId);
    if (phone) return this.keyOf("iphone", phone);
    const titled = /* @__PURE__ */ new Map();
    for (const source of ["google", "iphone"]) {
      for (const c of this.files.get(source)?.calendars ?? []) {
        if (c.title !== ref.title) continue;
        const key = this.keyOf(source, c);
        titled.set(keyText(key), key);
      }
    }
    if (titled.size === 1) return [...titled.values()][0];
    return { account: "", title: titled.size === 0 ? ref.title : apart(ref.title) };
  }
};
function phoneAccountOf(calendar) {
  return calendar.sourceId ? `id:${calendar.sourceId}` : `name:${calendar.account ?? ""}`;
}
function phoneGoogleAccount(google, phone) {
  const titles = new Set(google.map((c) => c.title.toLowerCase()));
  const shared = /* @__PURE__ */ new Map();
  for (const calendar of phone) {
    if (!titles.has(calendar.title.toLowerCase())) continue;
    const account = phoneAccountOf(calendar);
    shared.set(account, (shared.get(account) ?? 0) + 1);
  }
  const ranked = [...shared.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || ranked[1]?.[1] === ranked[0][1]) return null;
  return ranked[0][0];
}
function byAccount(a, b) {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  return textOrder(a, b);
}
function textOrder(a, b) {
  const x = letters(a);
  const y = letters(b);
  if (x !== y) return x < y ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}
function letters(name) {
  return name.toLowerCase().replace(/ё/g, "е");
}
function calendarOf(e) {
  return { title: e.calendar, account: e.account, calendarId: e.calendarId };
}
function covers(file, day) {
  if (file.from !== null && file.to !== null) return file.from <= day && day < file.to;
  if (file.events.length === 0) return false;
  const first = Math.min(...file.events.map((e) => e.start.getTime()));
  const last = Math.max(...file.events.map((e) => e.end.getTime()));
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return first < dayEnd && day.getTime() <= last;
}

// core/domain/DayBoundary.ts
var HOUR_MINUTES2 = 60;
var DAY_HOURS = MINUTES_PER_DAY / HOUR_MINUTES2;
var MIN_SLOT_MINUTES = 5;
function clampSlot(start2, end) {
  const duration = end === null ? null : end - start2;
  const latest = MINUTES_PER_DAY - (duration ?? MIN_SLOT_MINUTES);
  const moved2 = Math.min(latest, Math.max(0, start2));
  return { start: moved2, end: duration === null ? null : moved2 + duration };
}
var DayBoundary = class _DayBoundary {
  static {
    this.MIDNIGHT = new _DayBoundary(0);
  }
  constructor(startHour) {
    const hour = Math.floor(startHour);
    this.startHour = hour >= 0 && hour < DAY_HOURS ? hour : 0;
  }
  get startMinute() {
    return this.startHour * HOUR_MINUTES2;
  }
  dayOf(at) {
    return this.dayOfClock(localDateOf(at), at.getHours() * HOUR_MINUTES2 + at.getMinutes());
  }
  dayOfSlot(slot) {
    return this.dayOfClock(slot.date, slot.start);
  }
  /** Minutes from the start of `day` to `at`; negative before it, past 1440 after it. */
  offsetOf(day, at) {
    return this.offsetOfClock(day, localDateOf(at), at.getHours() * HOUR_MINUTES2 + at.getMinutes());
  }
  /** Minutes from the start of `day` to `start` and to `end`, cut at the day's edges: an event that began before it or ends after it. */
  clipToDay(day, start2, end) {
    return { start: Math.max(0, this.offsetOf(day, start2)), end: Math.min(MINUTES_PER_DAY, this.offsetOf(day, end)) };
  }
  /** Minutes from the start of `day` to the start and the end of `slot`. */
  spanOf(slot, day) {
    const start2 = this.offsetOfClock(day, slot.date, slot.start);
    return { start: start2, end: slot.end === null ? null : start2 + slot.end - slot.start };
  }
  /** The slot that takes the minutes from `start` to `end` past the start of `day`, at the clock's date and time. */
  slotAt(day, start2, end) {
    const clock = this.startMinute + start2;
    const nextDay = clock >= MINUTES_PER_DAY;
    const slotStart = nextDay ? clock - MINUTES_PER_DAY : clock;
    return { date: nextDay ? addDays(day, 1) : day, start: slotStart, end: end === null ? null : slotStart + end - start2 };
  }
  /** The clock hour the `index`-th hour line of a day stands at. */
  hourAt(index) {
    return (this.startHour + index) % DAY_HOURS;
  }
  /** Minutes from the start of a day to `hour` o'clock in it. */
  offsetOfHour(hour) {
    return (hour - this.startHour + DAY_HOURS) % DAY_HOURS * HOUR_MINUTES2;
  }
  /** The slot moved and cut to lie within its day and last at least `stepMinutes`; one without a duration starts a step before the day ends. */
  clamp(slot, stepMinutes) {
    const day = this.dayOfClock(slot.date, Math.max(0, slot.start));
    const span = this.spanOf(slot, day);
    if (span.end === null) return this.slotAt(day, Math.max(0, Math.min(span.start, MINUTES_PER_DAY - stepMinutes)), null);
    let { start: start2, end } = span;
    if (start2 < 0) {
      end -= start2;
      start2 = 0;
    }
    end = Math.min(Math.max(end, stepMinutes), MINUTES_PER_DAY);
    start2 = Math.max(0, Math.min(start2, end - stepMinutes));
    return this.slotAt(day, start2, end);
  }
  dayOfClock(date, minutes) {
    return minutes < this.startMinute ? addDays(date, -1) : date;
  }
  offsetOfClock(day, date, minutes) {
    return daysBetween(day, date) * MINUTES_PER_DAY + minutes - this.startMinute;
  }
};

// core/application/calendarDays.ts
function localTime(date, plusDays, hour) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + plusDays, hour);
}
var DayWindow = class {
  constructor(date, boundary) {
    this.timedStart = localTime(date, 0, boundary.startHour);
    this.timedEnd = localTime(date, 1, boundary.startHour);
    this.dateStart = localTime(date, 0, 0);
    this.dateEnd = localTime(date, 1, 0);
  }
  /** What to choose the events from: both spans. */
  get fetchStart() {
    return this.dateStart;
  }
  get fetchEnd() {
    return this.timedEnd;
  }
  shows(e) {
    return e.allDay ? this.touches(e, this.dateStart, this.dateEnd) : this.touches(e, this.timedStart, this.timedEnd);
  }
  touches(e, start2, end) {
    const overlaps = e.start < end && e.end > start2;
    const startsInside = e.start >= start2 && e.start < end;
    return overlaps || e.allDay && startsInside;
  }
};
var CalendarDays = class {
  constructor(choice, boundary) {
    this.choice = choice;
    this.boundary = boundary;
  }
  day(date) {
    const span = new DayWindow(date, this.boundary);
    const chosen = this.choice.day(span.fetchStart, span.fetchEnd);
    return { ...chosen, events: chosen.events.filter((e) => span.shows(e)) };
  }
  /** The timed events that overlap `from`–`to`, each as the day showing it has it, once each, by start. */
  timedBetween(from, to) {
    const found = /* @__PURE__ */ new Map();
    for (let date = this.boundary.dayOf(from); new DayWindow(date, this.boundary).timedStart < to; date = addDays(date, 1)) {
      for (const e of this.day(date).events) {
        if (!e.allDay && e.start < to && e.end > from && !found.has(e.id)) found.set(e.id, e);
      }
    }
    return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  }
};

// core/application/calendarMigration.ts
function migratedHidden(settings, known, googleIds2) {
  const checked = new Set(settings.google.calendarIds.map((id) => googleIds2.get(id)).filter((t) => t !== void 0));
  const googleChoice = settings.google.calendarIds.length > 0 && googleIds2.size > 0;
  const named = settings.workCalendarTitles.map((t) => t.trim().toLowerCase()).filter((t) => t !== "");
  return known.filter((c) => c.google ? googleChoice && !checked.has(c.key.title) : named.length > 0 && !named.includes(c.key.title.toLowerCase())).map((c) => c.key);
}
function hiddenNow(settings, known, google) {
  return settings.calendarsMigrated ? [...settings.hiddenCalendars] : migratedHidden(settings, known, googleIds(google));
}
function googleIds(google) {
  return new Map((google?.calendars ?? []).flatMap((c) => c.calendarId === null ? [] : [[c.calendarId, c.title]]));
}

// core/application/shownCalendars.ts
var MINUTE_MS = 6e4;
var ShownCalendars = class {
  constructor(files, settings, now) {
    this.files = files;
    this.settings = settings;
    this.now = now;
  }
  /** Every calendar the files hold, hidden or not. */
  known() {
    return this.choice([]).known();
  }
  /** The calendars the settings hide, the old choice carried over until it is. */
  hidden() {
    return hiddenNow(this.settings, this.known(), this.files.get("google"));
  }
  /** The calendar's days, cut at the day's start, of the calendars shown. */
  days() {
    return new CalendarDays(this.choice(this.hidden()), new DayBoundary(this.settings.dayStartHour));
  }
  choice(hidden) {
    return new CalendarChoice(this.files, hidden, this.settings.staleAfterMinutes * MINUTE_MS, this.now);
  }
};

// core/application/googleLogin.ts
function googleLoggedIn(settings) {
  return settings.google.refreshToken !== "";
}

// core/application/calendarDay.ts
var KINDS = { google: "synced", iphone: "exported", work: "exported" };
var MINUTE_MS2 = 6e4;
var LOGGED_OUT = { kind: "loggedOut" };
var WINDOW_ORDER = ["google", "iphone", "work"];
var NO_DAY_EVENTS = { events: [], allDay: [], timed: [], statuses: [], stale: false, alert: "none", words: dayWords("none") };
var ALERTS = ["none", "old", "broken"];
function alertOf(tone) {
  return tone === "old" || tone === "broken" ? tone : "none";
}
var CalendarDay = class {
  constructor(reading, settings, now) {
    this.reading = reading;
    this.settings = settings;
    this.now = now;
  }
  /** The day's events as the screen shows them; staleness counts from now. */
  events(date) {
    const chosen = this.shown().days().day(date);
    const events = chosen.events;
    const shown3 = (name) => events.filter((e) => e.source === name).length;
    const statuses = [...this.reading.sources].sort((a, b) => WINDOW_ORDER.indexOf(a) - WINDOW_ORDER.indexOf(b)).map((source) => this.status(source, shown3(source), chosen.used.has(source)));
    const inUse = statuses.filter((s) => s.used);
    const alert = inUse.map((s) => alertOf(s.tone)).reduce((worst, a) => ALERTS.indexOf(a) > ALERTS.indexOf(worst) ? a : worst, "none");
    return {
      events,
      allDay: events.filter((e) => e.allDay),
      timed: events.filter((e) => !e.allDay),
      statuses: [...inUse, ...statuses.filter((s) => !s.used)],
      stale: chosen.stale,
      alert,
      words: dayWords(alert)
    };
  }
  /** The timed events of the calendars shown that overlap `from`–`to`: the phone's meetings. */
  timedBetween(from, to) {
    return this.shown().days().timedBetween(from, to);
  }
  /** The event is over by the clock: it is drawn grey. */
  isPast(event) {
    return event.end.getTime() <= this.now.getTime();
  }
  /** Every calendar the files list, Google's first, each once; whether each is shown. */
  known() {
    const hidden = new Set(this.hidden().map(keyText));
    return this.shown().known().map((c) => ({ account: c.key.account, title: c.key.title, accountName: c.accountName, name: c.name, color: c.color, shown: !hidden.has(keyText(c.key)) }));
  }
  /** The settings that show or hide one calendar. */
  shownChange(account, title, shown3) {
    const others = this.hidden().filter((k) => k.account !== account || k.title !== title);
    return { hiddenCalendars: shown3 ? others : [...others, { account, title }], calendarsMigrated: true };
  }
  /** On the phone, once both Google's and the phone's files are there: the old choice becomes the list of hidden calendars; null when not now. */
  carryOver(canMigrate) {
    const google = this.reading.files.get("google");
    const withIds = google !== void 0 && google.calendars.some((c) => c.calendarId !== null);
    if (this.settings.calendarsMigrated || !canMigrate || !withIds || !this.reading.files.has("iphone")) return null;
    return { hiddenCalendars: this.hidden(), calendarsMigrated: true };
  }
  hidden() {
    return this.shown().hidden();
  }
  shown() {
    return new ShownCalendars(this.reading.files, this.settings, this.now);
  }
  status(source, shown3, used) {
    const problem = this.problem(source);
    const file = this.reading.files.get(source);
    const updatedAt = file?.exportedAt ?? null;
    const old = this.isOld(updatedAt);
    const tone = toneOf(used, old, problem !== null);
    const facts = {
      source,
      kind: KINDS[source],
      problem,
      updatedAt,
      updatedDay: updatedAt === null ? null : this.relationOf(updatedAt),
      updatedDate: updatedAt === null ? null : localDateOf(updatedAt),
      detail: this.reading.fed(source) ? null : file?.device ?? null,
      tone
    };
    return { ...facts, events: shown3, stale: problem !== null || old, used, words: sourceWords(facts) };
  }
  /** Google logged out says so, whatever its file: there is none to fetch, or what is left of an old login. */
  problem(source) {
    if (source === "google" && !googleLoggedIn(this.settings)) return LOGGED_OUT;
    return this.reading.problem(source);
  }
  /** How the calendar date of `at` stands to the clock's: a moment's today and yesterday are calendar days, not the plugin's day. */
  relationOf(at) {
    return dayRelation(localDateOf(at), localDateOf(this.now));
  }
  isOld(updatedAt) {
    if (updatedAt === null) return true;
    return this.now.getTime() - updatedAt.getTime() > this.settings.staleAfterMinutes * MINUTE_MS2;
  }
};
function toneOf(used, old, problem) {
  if (!used) return "spare";
  if (!old) return "plain";
  return problem ? "broken" : "old";
}

// core/application/EventSource.ts
var SourceProblemError = class extends Error {
  constructor(problem, message) {
    super(message);
    this.problem = problem;
    this.name = "SourceProblemError";
  }
};

// core/application/CalendarServiceImpl.ts
var SECOND_MS = 1e3;
var ANSWER_TIMEOUT_MS = 15e3;
function problemOf(e) {
  if (e instanceof SourceProblemError) return e.problem;
  return { kind: "failed", detail: e instanceof Error ? e.message : String(e) };
}
var CalendarServiceImpl = class {
  constructor(files, feeds, clock, settings, timers, work, migration) {
    this.files = files;
    this.feeds = feeds;
    this.clock = clock;
    this.settings = settings;
    this.timers = timers;
    this.work = work;
    this.migration = migration;
    this.lastRead = /* @__PURE__ */ new Map();
    this.fileProblems = /* @__PURE__ */ new Map();
    this.feedProblems = /* @__PURE__ */ new Map();
  }
  async known() {
    await this.readFiles();
    return this.day().known();
  }
  async setShown(account, title, shown3) {
    await this.settings.update(this.day().shownChange(account, title, shown3));
  }
  events(date, reason) {
    const cached = this.cached(date);
    if (reason === "refresh") return { cached, fresh: () => this.eventsOn(date) };
    if (reason === "peek" && cached) return { cached, fresh: null };
    return { cached, fresh: () => this.eventsAround(date) };
  }
  isPast(event) {
    return this.day().isPast(event);
  }
  keepFresh(screen) {
    const polling = new CalendarPolling({
      refresh: () => screen.refresh(),
      intervalMs: () => this.settings.get().google.refreshSeconds * SECOND_MS,
      hidden: () => screen.hidden(),
      now: () => this.clock.now().getTime(),
      timers: this.timers
    });
    polling.start();
    return {
      wake: () => polling.wake(),
      catchUp: () => polling.catchUp(),
      refreshNow: () => {
        this.work.export();
        return polling.refresh();
      },
      stop: () => polling.stop()
    };
  }
  onChange(listener) {
    const offs = this.files.map((f) => f.onChange(listener));
    return () => offs.forEach((off) => off());
  }
  /** Refreshes the feeds, forced, then reads the files. */
  async eventsOn(date) {
    await this.refreshFeeds(true);
    await this.readFiles();
    return this.dayOf(date);
  }
  /** The files as they are; a feed due for a refresh runs behind, and its file's change redraws the day. */
  async eventsAround(date) {
    void this.refreshFeeds(false);
    await this.readFiles();
    return this.dayOf(date);
  }
  /** Any day from the files as last read, null before the first read. Staleness counts from now: a file written yesterday shows its orange dot today. */
  cached(date) {
    return this.lastRead.size === 0 && this.fileProblems.size === 0 ? null : this.dayOf(date);
  }
  refreshFeeds(force) {
    return Promise.all(
      this.feeds.map(
        (feed) => this.answerWithin(feed.refresh(force), ANSWER_TIMEOUT_MS).then(
          () => this.feedProblems.delete(feed.name),
          (e) => this.feedProblems.set(feed.name, problemOf(e))
        )
      )
    ).then(() => void 0);
  }
  readFiles() {
    return Promise.all(
      this.files.map(
        (file) => file.read().then(
          (read) => {
            this.lastRead.set(file.name, read);
            this.fileProblems.delete(file.name);
          },
          (e) => this.fileProblems.set(file.name, problemOf(e))
        )
      )
    ).then(() => this.carryOver());
  }
  /** Once, on the phone, when both Google's and the phone's files are there: the old choice becomes the list of hidden calendars. */
  async carryOver() {
    const carried = this.day().carryOver(this.migration.canMigrate());
    if (carried) await this.settings.update(carried);
  }
  /** The calendars' rules over the files as last read, at the clock's moment. */
  day() {
    const reading = {
      sources: this.files.map((f) => f.name),
      files: this.lastRead,
      problem: (source) => this.fileProblems.get(source) ?? this.feedProblems.get(source) ?? null,
      fed: (source) => this.feeds.some((f) => f.name === source)
    };
    return new CalendarDay(reading, this.settings.get(), this.clock.now());
  }
  answerWithin(answer2, ms) {
    let timer;
    const silence = new Promise((_, reject) => {
      timer = this.timers.set(() => reject(new SourceProblemError({ kind: "noAnswer", seconds: ms / SECOND_MS }, `no answer in ${ms / SECOND_MS} s`)), ms);
    });
    return Promise.race([answer2, silence]).finally(() => {
      if (timer !== void 0) this.timers.clear(timer);
    });
  }
  dayOf(date) {
    return this.day().events(date);
  }
};

// core/domain/IsoMoment.ts
var ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
var MINUTE_MS3 = 6e4;
function isoMoment(text) {
  const m = ISO.exec(text.trim());
  if (!m) return new Date(Number.NaN);
  const [, y, mo, d, h, mi, s, fraction, zone] = m;
  const ms = fraction === void 0 ? 0 : Math.floor(Number(`0.${fraction}`) * 1e3);
  const fields = [Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms];
  if (!valid(fields)) return new Date(Number.NaN);
  if (h === void 0) return new Date(Date.UTC(...fields));
  if (zone === void 0) return new Date(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]);
  return new Date(Date.UTC(...fields) - offsetMinutes(zone) * MINUTE_MS3);
}
function valid([, month, day, hour, minute, second]) {
  return month <= 11 && day >= 1 && day <= 31 && hour <= 24 && minute <= 59 && second <= 59;
}
function offsetMinutes(zone) {
  if (zone === "Z") return 0;
  const digits = zone.slice(1).replace(":", "");
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  return zone.startsWith("-") ? -minutes : minutes;
}

// core/application/calendarFile.ts
var GOOGLE_CALENDAR_FILE = "calendar/google.json";
var IPHONE_CALENDAR_FILE = "calendar/iphone.json";
var CALENDAR_SOURCES = ["google", "iphone", "work"];
function calendarPath(source, settings) {
  if (source === "google") return GOOGLE_CALENDAR_FILE;
  if (source === "iphone") return IPHONE_CALENDAR_FILE;
  return settings.workCalendarFile;
}
var dateOrNull = (text) => text ? isoMoment(text) : null;
function readCalendarFile(text, source) {
  const content = fileContent(text);
  const events = (content.events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    start: isoMoment(e.start),
    end: isoMoment(e.end),
    allDay: e.allDay,
    calendar: e.calendar,
    color: e.color ?? null,
    source,
    account: e.account ?? null,
    calendarId: e.calendarId ?? null
  }));
  const listed2 = content.calendars ?? eventCalendars(content.events ?? []);
  return {
    events,
    calendars: listed2.map((c) => ({ title: c.calendar, account: c.account ?? null, calendarId: c.calendarId ?? null, color: c.color ?? null, ...c.sourceId ? { sourceId: c.sourceId } : {} })),
    exportedAt: isoMoment(content.exportedAt),
    device: content.device ?? null,
    from: dateOrNull(content.from),
    to: dateOrNull(content.to),
    validUntil: dateOrNull(content.validUntil)
  };
}
function fileContent(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadable("not JSON");
  }
  if (!isObject(value)) throw unreadable("not an object");
  if (typeof value.exportedAt !== "string" || Number.isNaN(isoMoment(value.exportedAt).getTime())) throw unreadable("no exportedAt");
  if (!listOf(value.events, (e) => typeof e.start === "string" && typeof e.end === "string" && typeof e.calendar === "string")) throw unreadable("events");
  if (!listOf(value.calendars, (c) => typeof c.calendar === "string")) throw unreadable("calendars");
  return value;
}
function unreadable(why) {
  return new SourceProblemError({ kind: "unreadable" }, `calendar file unreadable: ${why}`);
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function listOf(value, row) {
  return value === void 0 || value === null || Array.isArray(value) && value.every((r) => isObject(r) && row(r));
}
function eventCalendars(events) {
  const seen = /* @__PURE__ */ new Map();
  for (const e of events) {
    const key = `${e.account ?? ""}
${e.calendarId ?? ""}
${e.calendar}`;
    if (!seen.has(key)) seen.set(key, { calendar: e.calendar, calendarId: e.calendarId ?? null, account: e.account ?? null, color: e.color ?? null });
  }
  return [...seen.values()];
}
var IPHONE_FRESH_MS = 10 * 6e4;

// core/domain/TaskTitle.ts
var LINE_BREAK = /\s*(?:\r\n|[\n\r\u2028\u2029])\s*/gu;
function oneLine(text) {
  return text.replace(LINE_BREAK, " ");
}
var LINE_MARKERS = /^(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?|\[.\]\s+|#{1,6}\s+|>\s*)+/u;
function taskTitle(text) {
  return oneLine(text).trim().replace(LINE_MARKERS, "").trim();
}

// core/domain/Priority.ts
var PRIORITY_COLORS = ["red", "orange", "yellow", "green", "teal", "blue"];
function isPresetColor(color) {
  return PRIORITY_COLORS.includes(color);
}
function usableColor(color) {
  return isPresetColor(color) || hexColor(color) === color;
}
var HEX_RE = /^#?([0-9a-f]{6})$/i;
function hexColor(text) {
  const m = HEX_RE.exec(text.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}
function usablePrefix(prefix) {
  return /^\S+$/.test(prefix);
}
function sameLevels(a, b) {
  return a.length === b.length && a.every((level, i) => level.prefix === b[i].prefix && level.color === b[i].color);
}
function usableLevels(levels) {
  return levels.filter((level, i) => usablePrefix(level.prefix) && levels.findIndex((l) => l.prefix === level.prefix) === i);
}
var FIRST_WORD_RE = /^(\S+)\s+(.*)$/;
function priorityOfText(text, prefixes) {
  const m = FIRST_WORD_RE.exec(text);
  if (!m || !prefixes.includes(m[1])) return { priority: null, text };
  return { priority: m[1], text: m[2] };
}
function priorityOfTitle(text, prefixes) {
  return priorityOfText(taskTitle(text), prefixes);
}
function isBlankTitle(text, prefixes) {
  return priorityOfText(text, prefixes).text.trim() === "";
}
function withPriority(text, prefix, prefixes) {
  const rest = priorityOfTitle(text, prefixes).text;
  return prefix === null ? rest : `${prefix} ${rest}`;
}

// core/domain/Label.ts
var CLEAR_COLOR = "clear";
var LABEL_SWATCHES = [...PRIORITY_COLORS, CLEAR_COLOR];
function usableLabelColor(color) {
  return color === CLEAR_COLOR || usableColor(color);
}
function labelTitle(name) {
  return name.replace(/_/g, " ");
}
function labelNameOf(title) {
  return title.trim().replace(/\s+/g, "_");
}
function usableLabelName(name) {
  return /^[^\s#]+$/.test(name);
}
function usableLabels(labels) {
  return labels.filter((label, i) => usableLabelName(label.name) && labels.findIndex((l) => l.name === label.name) === i);
}
function sameLabels(a, b) {
  return a.length === b.length && a.every((label, i) => label.name === b[i].name && label.color === b[i].color);
}
function usableLabelTag(tag) {
  return /^[^\s#/]+$/.test(tag);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function labelsOfText(text, tag, names) {
  if (!usableLabelTag(tag) || names.length === 0) return { labels: [], text };
  const labels = [];
  const rest = text.replace(new RegExp(`(^|\\s)#${escapeRegExp(tag)}/(\\S+)(?=\\s|$)`, "g"), (whole, space, name) => {
    if (!names.includes(name)) return whole;
    if (!labels.includes(name)) labels.push(name);
    return space;
  });
  return labels.length === 0 ? { labels, text } : { labels, text: rest.replace(/\s{2,}/g, " ").trim() };
}
function labelTags(tag, labels) {
  return labels.map((name) => ` #${tag}/${name}`).join("");
}

// core/settings.ts
var DEFAULT_RESULT_MARK = "🎯";
var LABEL_PAINTS = ["stripes", "blend"];
var CARD_HEIGHTS = { min: 28, max: 40 };
var CARD_GAPS = { min: 0, max: 10 };
var DEFAULT_CARD_SIZE = { height: 35, gap: 2 };
var DEFAULT_ZOOM_LEVELS = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];
var ASSISTANT_TIMEOUTS = { min: 10, max: 600 };
var DEFAULT_SETTINGS = {
  tasksFile: "TODOs Tasks.md",
  sections: { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" },
  dueDateMarker: "📅",
  slotMarker: "⏰",
  alarmSlotMarker: "🚨",
  liveSlotMarker: "📌",
  silentSlotMarker: "🔕",
  repeatMarker: "🔁",
  collapsedMarker: "📁",
  workCalendarFile: "calendar/work.json",
  workCalendarTitles: [],
  hiddenCalendars: [],
  calendarsMigrated: false,
  google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
  longPressMs: 250,
  scrollToHour: 9,
  dayStartHour: 5,
  staleAfterMinutes: 180,
  priorities: [
    { prefix: "p1", color: "red" },
    { prefix: "p2", color: "orange" }
  ],
  resultMark: DEFAULT_RESULT_MARK,
  labelTag: "label",
  labels: [],
  labelPaint: LABEL_PAINTS[0],
  cardHeight: DEFAULT_CARD_SIZE.height,
  cardGap: DEFAULT_CARD_SIZE.gap,
  zoomLevels: DEFAULT_ZOOM_LEVELS,
  projectTag: "#project",
  groups: { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" },
  assistant: { model: "claude", timeoutSeconds: 120, prompts: {}, models: {}, options: {} }
};
function settingsFrom(saved) {
  const s = saved ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    sections: { ...DEFAULT_SETTINGS.sections, ...s.sections ?? {} },
    google: { ...DEFAULT_SETTINGS.google, ...s.google ?? {} },
    groups: { ...DEFAULT_SETTINGS.groups, ...s.groups ?? {} },
    labelPaint: labelPaintOf(s.labelPaint),
    resultMark: typeof s.resultMark === "string" ? s.resultMark : DEFAULT_SETTINGS.resultMark,
    cardHeight: sizeOf(s.cardHeight, CARD_HEIGHTS, DEFAULT_SETTINGS.cardHeight),
    cardGap: sizeOf(s.cardGap, CARD_GAPS, DEFAULT_SETTINGS.cardGap),
    zoomLevels: zoomLevelsOf(saved),
    assistant: assistantOf(s.assistant)
  };
}
function assistantOf(saved) {
  const fallback = DEFAULT_SETTINGS.assistant;
  if (!isRecord(saved)) return fallback;
  return {
    model: typeof saved.model === "string" ? saved.model : fallback.model,
    timeoutSeconds: sizeOf(saved.timeoutSeconds, ASSISTANT_TIMEOUTS, fallback.timeoutSeconds),
    prompts: stringsOf(saved.prompts),
    models: mapsOf(saved.models),
    options: mapsOf(saved.options)
  };
}
function mapsOf(saved) {
  if (!isRecord(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter(([, inner]) => isRecord(inner)).map(([key, inner]) => [key, stringsOf(inner)]));
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function stringsOf(saved) {
  if (!isRecord(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter((entry) => typeof entry[1] === "string"));
}
function sizeOf(saved, bounds, fallback) {
  if (typeof saved !== "number" || !Number.isFinite(saved)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(saved)));
}
function labelPaintOf(saved) {
  return LABEL_PAINTS.find((paint) => paint === saved) ?? DEFAULT_SETTINGS.labelPaint;
}
function zoomLevelsOf(saved) {
  const kept = saved !== null && typeof saved === "object" ? saved.zoomLevels : void 0;
  if (!Array.isArray(kept) || kept.length === 0) return [...DEFAULT_ZOOM_LEVELS];
  const levels = kept.map((level) => level !== null && typeof level === "object" ? level.hourPx : void 0);
  if (!levels.every((hourPx) => typeof hourPx === "number" && Number.isFinite(hourPx) && hourPx > 0)) return [...DEFAULT_ZOOM_LEVELS];
  return levels.map((hourPx) => ({ hourPx }));
}

// core/domain/Repeat.ts
function sameRule(a, b) {
  if (a === null || b === null) return a === b;
  const days = (rule) => [...rule.days].sort((x, y) => x - y).join();
  return a.kind === b.kind && a.every === b.every && a.unit === b.unit && a.dayOfMonth === b.dayOfMonth && days(a) === days(b);
}
var WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var RULE_RE = /^every(?: (\d+))? (day|week|month)(s)?(?: (when done)| on (.+?))?(?: from (\d{4}-\d{2}-\d{2}))?$/;
var ORDINAL_RE = /^the (\d{1,2})(?:st|nd|rd|th)$/;
function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
function repeatParts({ kind, every, unit, days, dayOfMonth }) {
  const head = every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
  const schedule = kind === "schedule";
  const weekly = schedule && unit === "week";
  const on = weekly ? `on ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}` : schedule && unit === "month" ? `on the ${ordinal(dayOfMonth ?? 1)}` : null;
  return { every: head, on, days: weekly ? days : null, afterDone: kind === "afterDone" };
}
function monthIndexOf(date) {
  const { year, month } = partsOf(date);
  return year * 12 + month - 1;
}
function mondayOf(date) {
  return addDays(date, -weekdayOf(date));
}
var Repeat = class _Repeat {
  constructor(rule) {
    this.rule = rule;
  }
  /** Throws for a rule the grammar cannot write: it would loop in `next` or not read back. */
  static of(rule) {
    const problem = _Repeat.problemWith(rule);
    if (problem) throw new Error(`Invalid repeat rule: ${problem}`);
    return new _Repeat(rule);
  }
  /** A schedule of every few units counts from `date`; any other rule as it is. */
  static anchored(rule, date) {
    return rule.kind === "schedule" && rule.every > 1 ? { ...rule, from: date } : rule;
  }
  /** What keeps the rule from being written, or null: every from 1, weekdays for a weekly schedule only and at least one, a month's day for a monthly one only, `from` for a schedule of every few units only. */
  static problemWith({ kind, every, unit, days, dayOfMonth, from }) {
    if (!Number.isInteger(every) || every < 1) return "every must be a whole number from 1";
    const wantsDays = kind === "schedule" && unit === "week";
    const wantsDayOfMonth = kind === "schedule" && unit === "month";
    if (wantsDays && (days.length === 0 || !days.every((d, i) => Number.isInteger(d) && d >= 0 && d <= 6 && (i === 0 || d > days[i - 1])))) {
      return "days must be Monday to Sunday, in week order, without repeats";
    }
    if (!wantsDays && days.length > 0) return "days belong to a weekly schedule only";
    if (wantsDayOfMonth && !(dayOfMonth !== null && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31)) {
      return "the day of the month must be from 1 to 31";
    }
    if (!wantsDayOfMonth && dayOfMonth !== null) return "a day of the month belongs to a monthly schedule only";
    const wantsFrom = kind === "schedule" && every > 1;
    if (wantsFrom && (from === null || !isValidLocalDate(from))) return "a schedule with every above 1 needs a valid from date";
    if (!wantsFrom && from !== null) return "from belongs to a schedule with every above 1 only";
    return null;
  }
  /**
   * The rule a line's field writes. A schedule of every few units written without `from` (by hand: `every 2 months on
   * the 5th`) counts from `anchor`, the task's own day, as though written with it; without an anchor it is no rule.
   */
  static parse(text, anchor = null) {
    const m = RULE_RE.exec(text.trim());
    if (!m) return null;
    const [, count, unit, plural, whenDone, on, written] = m;
    const every = count === void 0 ? 1 : Number(count);
    if (every < 1 || count !== void 0 && every === 1) return null;
    if (written !== void 0 && (every === 1 || !isValidLocalDate(written))) return null;
    if (plural !== void 0 !== every > 1) return null;
    if (whenDone !== void 0) {
      const rule2 = { every, unit, days: [], dayOfMonth: null, from: null };
      return written === void 0 ? new _Repeat({ ...rule2, kind: "afterDone" }) : null;
    }
    const from = written ?? (every > 1 ? anchor : null);
    if (every > 1 && from === null) return null;
    const rule = { every, unit, days: [], dayOfMonth: null, from };
    if (unit === "day") return on === void 0 ? new _Repeat({ ...rule, kind: "schedule" }) : null;
    if (on === void 0) return null;
    if (unit === "week") {
      const days = _Repeat.parseDays(on);
      return days ? new _Repeat({ ...rule, kind: "schedule", days }) : null;
    }
    const dayOfMonth = Number(ORDINAL_RE.exec(on)?.[1]);
    if (!(dayOfMonth >= 1 && dayOfMonth <= 31) || on !== `the ${ordinal(dayOfMonth)}`) return null;
    return new _Repeat({ ...rule, kind: "schedule", dayOfMonth });
  }
  static parseDays(text) {
    const days = text.split(", ").map((name) => WEEKDAY_NAMES.indexOf(name));
    const inWeekOrder = days.every((d, i) => d >= 0 && (i === 0 || d > days[i - 1]));
    return inWeekOrder ? days : null;
  }
  format() {
    const { every, on, afterDone } = repeatParts(this.rule);
    if (afterDone) return `${every} when done`;
    const from = this.rule.from;
    return `${every}${on ? ` ${on}` : ""}${from ? ` from ${from}` : ""}`;
  }
  /** Spec §3.2: strictly after max(today, taskDate); afterDone: today + N. */
  next(taskDate, today) {
    const { kind, every, unit } = this.rule;
    if (kind === "afterDone") {
      return unit === "month" ? addMonths(today, every) : addDays(today, every * (unit === "week" ? 7 : 1));
    }
    const base = taskDate !== null && taskDate > today ? taskDate : today;
    return this.firstAfter(this.rule.from ?? taskDate ?? today, base);
  }
  /** Spec §3.5: first matching day ≥ today for a schedule, null for afterDone. */
  first(today) {
    if (this.rule.kind === "afterDone") return null;
    return this.firstAfter(this.rule.from ?? today, addDays(today, -1));
  }
  /** The same rule anchored: `from` set to `date` when every > 1, else unchanged. */
  anchoredAt(date) {
    const rule = _Repeat.anchored(this.rule, date);
    return rule === this.rule ? this : new _Repeat(rule);
  }
  firstAfter(anchor, base) {
    switch (this.rule.unit) {
      case "day":
        return this.firstDayAfter(anchor, base);
      case "week":
        return this.firstWeekdayAfter(anchor, base);
      case "month":
        return this.firstMonthDayAfter(anchor, base);
    }
  }
  firstDayAfter(anchor, base) {
    const { every } = this.rule;
    const cycles = Math.max(0, Math.floor(daysBetween(anchor, base) / every) + 1);
    return addDays(anchor, cycles * every);
  }
  firstWeekdayAfter(anchor, base) {
    const { every, days } = this.rule;
    const anchorWeek = mondayOf(anchor);
    const weeks = Math.floor(daysBetween(anchorWeek, mondayOf(base)) / 7);
    for (let cycle = Math.max(0, Math.floor(weeks / every)); ; cycle++) {
      const week = addDays(anchorWeek, cycle * every * 7);
      const hit = days.map((d) => addDays(week, d)).find((date) => date > base);
      if (hit) return hit;
    }
  }
  firstMonthDayAfter(anchor, base) {
    const { every, dayOfMonth } = this.rule;
    const anchorMonth = monthIndexOf(anchor);
    const months = monthIndexOf(base) - anchorMonth;
    for (let cycle = Math.max(0, Math.floor(months / every)); ; cycle++) {
      const index = anchorMonth + cycle * every;
      const year = Math.floor(index / 12);
      const month = index - year * 12 + 1;
      const day = Math.min(dayOfMonth ?? 1, daysInMonth(year, month));
      const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (date > base) return date;
    }
  }
};

// core/application/repeatWords.ts
function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function onTheDay(rule) {
  return capital(repeatParts(rule).on ?? "");
}
function repeatValue(rule) {
  const { every, on, days, afterDone } = repeatParts(rule);
  if (afterDone) return `${capital(every)} after done`;
  if (days) return null;
  if (on) return rule.every === 1 ? capital(on) : `${capital(every)} ${on}`;
  return capital(every);
}
function repeatSentence(rule) {
  const { every, on } = repeatParts(rule);
  return repeatValue(rule) ?? `${capital(every)} ${on}`;
}
var REPEAT_WORDS = {
  kinds: { schedule: "Schedule", afterDone: "After done" },
  every: "Every",
  units: { day: "days", week: "weeks", month: "months" },
  weekdays: [
    { short: "Mon", name: "Monday", letter: "M" },
    { short: "Tue", name: "Tuesday", letter: "T" },
    { short: "Wed", name: "Wednesday", letter: "W" },
    { short: "Thu", name: "Thursday", letter: "T" },
    { short: "Fri", name: "Friday", letter: "F" },
    { short: "Sat", name: "Saturday", letter: "S" },
    { short: "Sun", name: "Sunday", letter: "S" }
  ],
  remove: "Remove repeat"
};
function repeatRow(rule) {
  if (rule === null) return { value: "", days: null };
  return { value: repeatValue(rule) ?? "", days: repeatParts(rule).days };
}

// core/domain/Task.ts
function isOpen(status) {
  return status === "todo" || status === "inProgress";
}
function nextProgress(statuses) {
  return statuses.every((status) => status === "inProgress") ? "todo" : "inProgress";
}
function sameSlot(a, b) {
  return a !== null && b !== null && a.date === b.date && a.start === b.start && a.end === b.end;
}
var REMINDER_KINDS = ["live", "notification", "alarm", "none"];
var DEFAULT_REMINDER = "live";
function canRemind(slot) {
  return slot !== null;
}
var STATUS_CHARS = {
  todo: " ",
  inProgress: "/",
  done: "x",
  cancelled: "-"
};

// core/domain/Project.ts
var PROJECT_MARKER = "🗂️";
var MARK_RE = /(^|\s+)\u{1F5C2}\u{FE0F}?(?=\s|$)/gu;
var LINK_RE = /^\s+\[\[([^[\]|#]+?)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\](?=\s|$)/u;
function escapeRegExp2(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stopsRe(stops) {
  const words = ["🗂️?", ...stops.filter((s) => s !== "").map(escapeRegExp2)];
  return new RegExp(`\\s+(?:(?:${words.join("|")})(?=\\s|$)|#\\S)`, "u");
}
var stopCache = /* @__PURE__ */ new Map();
function stopOf(stops) {
  const key = stops.join("\0");
  let re = stopCache.get(key);
  if (!re) stopCache.set(key, re = stopsRe(stops));
  return re;
}
function projectsOfText(text, stops = []) {
  const names = [];
  let rest = "";
  let at = 0;
  const marks = [...text.matchAll(MARK_RE)];
  if (marks.length === 0) return { projects: [], text };
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const start2 = mark.index;
    if (start2 < at) continue;
    rest += text.slice(at, start2);
    const from = start2 + mark[0].length;
    const link = LINK_RE.exec(text.slice(from));
    if (link) {
      names.push(projectName(link[1]));
      at = from + link[0].length;
      continue;
    }
    const tail = text.slice(from);
    const stop2 = stopOf(stops).exec(tail);
    const end = stop2 ? from + stop2.index : text.length;
    names.push(text.slice(from, end).trim());
    at = end;
  }
  rest += text.slice(at);
  return { projects: uniqueNames(names), text: rest.trim() };
}
function uniqueNames(names) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const name of names) {
    const key = projectKey(name);
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}
function projectFields(names) {
  return names.map((name) => ` ${PROJECT_MARKER} ${name}`).join("");
}
function projectName(link) {
  const last = link.split("/").pop() ?? link;
  return last.replace(/\.md$/i, "").trim();
}
var DEFAULT_STOPS = ["📅", "⏰", "🚨", "📌", "🔕", "🔁", "📁"];
function cleanProjectName(typed2, stops = DEFAULT_STOPS) {
  const marks = stops.filter((m) => m !== "").map(escapeRegExp2);
  const fields = marks.length === 0 ? null : new RegExp(`(^|\\s)(?:${marks.join("|")})(?=\\s|$)`, "gu");
  const name = (fields ? typed2.replace(fields, "$1") : typed2).replace(/[\u{1F5C2}\u{1F5C3}]\u{FE0F}?/gu, " ").replace(/[[\]]/g, "").replace(/(^|\s)#(?=\S)/g, "$1").replace(/\s+/g, " ").trim();
  return name === "" ? null : name;
}
function projectKey(name) {
  return name.normalize("NFC").toLowerCase();
}
function namesProject(names, name) {
  const key = projectKey(name);
  return names.some((n) => projectKey(n) === key);
}
function inProject(name, zone) {
  if (name === null || zone === null) return name === zone;
  return projectKey(name) === projectKey(zone);
}

// core/domain/NoteTags.ts
function noteTags(text) {
  const { properties, body } = split(text);
  return [...properties === null ? [] : propertyTags(properties), ...bodyTags(body)];
}
var FENCE = /^\s*(```|~~~)/;
var INLINE_CODE = /`[^`]*`/g;
var BODY_TAG = /(?<=^|\s)#([^\s!"#$%&'()*+,.:;<=>?@^`{|}~[\]\\]+)/gm;
function split(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines[0]?.trim() !== "---") return { properties: null, body: text };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return { properties: null, body: text };
  return { properties: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}
function propertyTags(yaml) {
  const lines = yaml.split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(":");
    if (colon < 0 || /^\s/.test(line)) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (key !== "tags" && key !== "tag") continue;
    const value = line.slice(colon + 1).trim();
    if (value === "") {
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("-")) found.push(lines[++i].trim().slice(1));
    } else {
      const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
      found.push(...inner.split(/[,\s]+/));
    }
  }
  return found.map(cleanTag).filter((tag) => tag !== "").map((tag) => `#${tag}`);
}
function cleanTag(raw) {
  return raw.trim().replace(/^["']+|["']+$/g, "").trim().replace(/^#/, "");
}
function bodyTags(body) {
  let fenced = false;
  const kept = [];
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) kept.push(line.replace(/\r$/, "").replace(INLINE_CODE, " "));
  }
  return [...kept.join("\n").matchAll(BODY_TAG)].map((m) => m[1]).filter((tag) => !/^\d+$/.test(tag)).map((tag) => `#${tag}`);
}

// core/domain/description.ts
var INDENT_RE = /^[ \t]*/;
var DESCRIPTION_TEMPLATE = "- ";
function indentOf(line) {
  return INDENT_RE.exec(line)[0];
}
function descriptionLines(entry) {
  const lines = [];
  const children = entry.task.children;
  let next = 0;
  for (let i = 0; i < children.length; i++) {
    const sub = entry.subtasks[next];
    if (sub && children[i] === sub.raw) {
      i += sub.task.children.length;
      next++;
    } else lines.push(children[i]);
  }
  return lines;
}
function descriptionIndent(entry) {
  const lines = descriptionLines(entry);
  if (lines.length === 0) return null;
  return lines.map(indentOf).reduce((a, b) => b.length < a.length ? b : a);
}
function descriptionMarkdown(entry) {
  const indent = descriptionIndent(entry);
  if (indent === null) return null;
  return descriptionLines(entry).map((line) => line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()).join("\n");
}
function markdownLines(markdown) {
  if (markdown.trim() === DESCRIPTION_TEMPLATE.trim()) return [];
  return markdown.split(/\r?\n/).filter((line) => line.trim() !== "");
}
var CONTEXT_PREFIX = "Контекст: ";
function contextLine(text) {
  const joined = text.trim().replace(/\s+/g, " ");
  return joined === "" ? null : `- ${CONTEXT_PREFIX}${joined}`;
}
function withContext(markdown, text) {
  const line = contextLine(text);
  if (line === null) return null;
  return markdown === null ? line : `${markdown}
${line}`;
}

// core/domain/TaskLine.ts
var ANY_DAY = "2000-01-01";
var LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
var DATE = "(\\d{4}-\\d{2}-\\d{2})";
var TIME = "(\\d{2}:\\d{2})";
function statusOf(char) {
  for (const status of Object.keys(STATUS_CHARS)) {
    if (STATUS_CHARS[status] === char) return status;
  }
  return "todo";
}
function escapeRegExp3(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function slotMarkers(markers) {
  const kinds = /* @__PURE__ */ new Map();
  for (const [marker, kind] of [[markers.slot, "notification"], [markers.alarmSlot, "alarm"], [markers.liveSlot, "live"], [markers.silentSlot, "none"]]) {
    if (marker && !kinds.has(marker)) kinds.set(marker, kind);
  }
  return kinds;
}
function markerOf(kind, markers) {
  const own = { notification: markers.slot, alarm: markers.alarmSlot, live: markers.liveSlot, none: markers.silentSlot }[kind];
  return own || markers.slot;
}
var FieldSlicer = class {
  constructor(markers) {
    this.kinds = slotMarkers(markers);
    const alternatives = [...this.kinds.keys()].map(escapeRegExp3).join("|");
    this.slotRe = new RegExp(`(?:^|\\s+)(${alternatives})\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
    this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp3(markers.dueDate)}\\s+${DATE}$`);
    this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp3(markers.repeat)}\\s+(.+?)$`) : null;
    this.collapsedRe = markers.collapsed ? new RegExp(`(?:^|\\s+)${escapeRegExp3(markers.collapsed)}$`) : null;
  }
  /**
   * The fields at the end of a line's body. A rule of every few units written without `from` counts from the line's own
   * day, its due date or its slot's, whichever stands on it; a line with neither keeps it as text.
   */
  slice(body) {
    const { unanchored, ...read } = this.fields(body, true);
    if (!unanchored || read.repeat === null) return read;
    const day = read.dueDate ?? read.slot?.date ?? null;
    return day === null ? this.fields(body, false) : { ...read, repeat: read.repeat.anchoredAt(day) };
  }
  /** The fields; `lenient`, a rule without its `from` is read anchored anywhere, and said to be (`unanchored`). */
  fields(body, lenient) {
    let unanchored = false;
    let text = body;
    let dueDate = null;
    let slot = null;
    let reminder = DEFAULT_REMINDER;
    let repeat = null;
    let collapsed = false;
    for (; ; ) {
      const slotMatch = slot === null ? this.slotRe.exec(text) : null;
      if (slotMatch) {
        const parsed = this.slotOf(slotMatch);
        if (!parsed) break;
        slot = parsed;
        reminder = this.kinds.get(slotMatch[1]) ?? "notification";
        text = text.slice(0, slotMatch.index);
        continue;
      }
      const dueMatch = dueDate === null ? this.dueRe.exec(text) : null;
      if (dueMatch) {
        if (!isValidLocalDate(dueMatch[1])) break;
        dueDate = dueMatch[1];
        text = text.slice(0, dueMatch.index);
        continue;
      }
      const collapsedMatch = collapsed ? null : this.collapsedRe?.exec(text) ?? null;
      if (collapsedMatch) {
        collapsed = true;
        text = text.slice(0, collapsedMatch.index);
        continue;
      }
      const repeatMatch = repeat === null ? this.repeatRe?.exec(text) ?? null : null;
      if (repeatMatch) {
        const strict = Repeat.parse(repeatMatch[1]);
        const parsed = strict ?? (lenient ? Repeat.parse(repeatMatch[1], ANY_DAY) : null);
        if (!parsed) break;
        unanchored = strict === null;
        repeat = parsed;
        text = text.slice(0, repeatMatch.index);
        continue;
      }
      break;
    }
    return { text: text.trim(), dueDate, slot, reminder, repeat, collapsed, unanchored };
  }
  slotOf(m) {
    const date = m[2];
    const start2 = parseHHMM(m[3]);
    if (!isValidLocalDate(date) || start2 === null || start2 >= MINUTES_PER_DAY) return null;
    if (m[4] === void 0) return { date, start: start2, end: null };
    const end = parseHHMM(m[4]);
    if (end === null || start2 === end) return null;
    return { date, start: start2, end: end < start2 ? end + MINUTES_PER_DAY : end };
  }
};
var slicers = /* @__PURE__ */ new Map();
function fieldSlicerFor(markers) {
  const key = [markers.slot, markers.alarmSlot ?? "", markers.liveSlot ?? "", markers.silentSlot ?? "", markers.dueDate, markers.repeat ?? "", markers.collapsed ?? ""].join("\0");
  let slicer = slicers.get(key);
  if (!slicer) {
    slicer = new FieldSlicer(markers);
    slicers.set(key, slicer);
  }
  return slicer;
}
var readLines = /* @__PURE__ */ new WeakMap();
var KEPT_LINES = 2e4;
function isTaskLine(line) {
  return LINE_RE.test(line);
}
function parseTaskLine(line, markers) {
  let kept = readLines.get(markers);
  if (!kept) readLines.set(markers, kept = /* @__PURE__ */ new Map());
  const known = kept.get(line);
  if (known !== void 0) return known;
  if (kept.size >= KEPT_LINES) kept.clear();
  const parsed = readTaskLine(line, markers);
  kept.set(line, parsed);
  return parsed;
}
function readTaskLine(line, markers) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const statusChar = m[3];
  const tagged = labelsOfText(m[4], markers.labelTag ?? "", markers.labels ?? []);
  const named = projectsOfText(tagged.text, fieldStops(markers));
  const fields = fieldSlicerFor(markers).slice(named.text);
  return {
    indent: m[1],
    bullet: m[2],
    task: { status: statusOf(statusChar), statusChar, ...fields, ...priorityOfText(fields.text, markers.priorities ?? []), labels: tagged.labels, projects: named.projects, children: [] }
  };
}
function fieldStops(markers) {
  return [markers.dueDate, markers.slot, markers.alarmSlot ?? "", markers.liveSlot ?? "", markers.silentSlot ?? "", markers.repeat ?? "", markers.collapsed ?? ""];
}
function formatTaskLine(parsed, markers) {
  const { indent, bullet, task } = parsed;
  let line = `${indent}${bullet} [${task.statusChar}] ${task.priority ? `${task.priority} ` : ""}${task.text}`;
  line += projectFields(task.projects);
  if (task.labels.length > 0 && markers.labelTag) line += labelTags(markers.labelTag, task.labels);
  if (task.collapsed && markers.collapsed) line += ` ${markers.collapsed}`;
  if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
  if (task.slot) {
    const { date, start: start2, end } = task.slot;
    line += ` ${markerOf(task.reminder, markers)} ${date} ${minutesToHHMM(start2)}${end === null ? "" : `-${minutesToHHMM(end > MINUTES_PER_DAY ? end - MINUTES_PER_DAY : end)}`}`;
  }
  if (task.repeat && markers.repeat) line += ` ${markers.repeat} ${task.repeat.format()}`;
  return line;
}

// core/domain/TextPatch.ts
var CONTEXT = 2;
var TextPatch = class _TextPatch {
  constructor(changes) {
    this.changes = changes;
  }
  /** `ids`, who the tasks are on each side: each changed block keeps its lines' (`Hunk.removedIds`, `addedIds`). */
  static between(before, after, ids) {
    const hunks = hunksOf(before.split("\n"), after.split("\n"));
    if (!ids) return new _TextPatch(hunks);
    const of = (map, from, count) => Array.from({ length: count }, (_, k) => map.get(from + k) ?? null);
    return new _TextPatch(hunks.map((h) => ({ ...h, removedIds: of(ids.before, h.before, h.removed.length), addedIds: of(ids.after, h.after, h.added.length) })));
  }
  /** The patch as plain data, for a host that keeps the steps itself; `TextPatch.of` reads it back. */
  get hunks() {
    return this.changes;
  }
  static of(hunks) {
    return new _TextPatch(hunks);
  }
  get empty() {
    return this.changes.length === 0;
  }
  /** `current` with the change taken back, or null when a changed block is no longer to be found. */
  revert(current) {
    return this.reverted(current)?.text ?? null;
  }
  /** `current` with the change made again, or null when a block it changes is no longer to be found. */
  apply(current) {
    return this.applied(current)?.text ?? null;
  }
  /** `revert`, with where each line came from and who the lines it gave back were. */
  reverted(current) {
    return this.swap(current, "added", "removed");
  }
  /** `apply`, with where each line came from and who the lines it made again were. */
  applied(current) {
    return this.swap(current, "removed", "added");
  }
  swap(current, from, to) {
    const lines = current.split("\n");
    const shift = (hunk) => from === "added" ? hunk.after : hunk.before;
    const places = this.changes.map((hunk) => find(lines, hunk, hunk[from], shift(hunk)));
    if (places.some((place, i) => place === null || i > 0 && place <= places[i - 1] + this.changes[i - 1][from].length - 1)) return null;
    const rows = lines.map((line, origin) => ({ line, origin, id: null }));
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const hunk = this.changes[i];
      const ids2 = to === "removed" ? hunk.removedIds : hunk.addedIds;
      rows.splice(places[i], hunk[from].length, ...hunk[to].map((line, k) => ({ line, origin: null, id: ids2?.[k] ?? null })));
    }
    const ids = /* @__PURE__ */ new Map();
    rows.forEach((row, i) => row.id !== null && ids.set(i, row.id));
    return { text: rows.map((row) => row.line).join("\n"), origins: rows.map((row) => row.origin), ids };
  }
};
function find(text, hunk, lines, near) {
  const block = [...hunk.above, ...lines, ...hunk.below];
  let best = null;
  for (let start2 = 0; start2 + block.length <= text.length; start2++) {
    if (hunk.atStart && start2 !== 0) break;
    if (hunk.atEnd && start2 + block.length !== text.length) continue;
    if (!block.every((line, i) => text[start2 + i] === line)) continue;
    const at = start2 + hunk.above.length;
    if (best === null || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best;
}
function hunksOf(before, after) {
  const hunks = [];
  for (const [b0, b1, a0, a1] of mergedBlocks(changedBlocks(before, after))) {
    const above = Math.max(0, b0 - CONTEXT);
    const below = Math.min(before.length, b1 + CONTEXT);
    hunks.push({
      before: b0,
      after: a0,
      removed: before.slice(b0, b1),
      added: after.slice(a0, a1),
      above: before.slice(above, b0),
      below: before.slice(b1, below),
      atStart: b0 < CONTEXT,
      atEnd: before.length - b1 < CONTEXT
    });
  }
  return hunks;
}
function mergedBlocks(blocks) {
  const merged = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && block[0] - last[1] <= 2 * CONTEXT) {
      last[1] = block[1];
      last[3] = block[3];
    } else merged.push([...block]);
  }
  return merged;
}
function changedBlocks(before, after) {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const b = before.slice(head, before.length - tail);
  const a = after.slice(head, after.length - tail);
  const same2 = sharedLines(b, a);
  const blocks = [];
  let i = 0;
  let j = 0;
  let open = null;
  const close = () => {
    if (open) blocks.push([head + open[0], head + i, head + open[1], head + j]);
    open = null;
  };
  for (const [x, y] of [...same2, [b.length, a.length]]) {
    if (i < x || j < y) {
      open ??= [i, j];
      i = x;
      j = y;
    }
    if (x === b.length && y === a.length) break;
    close();
    i++;
    j++;
  }
  close();
  return blocks;
}
var TABLE_CELLS = 1e6;
function sharedLines(b, a) {
  return (b.length + 1) * (a.length + 1) <= TABLE_CELLS ? tableLines(b, a) : myersLines(b, a);
}
function tableLines(b, a) {
  const width = a.length + 1;
  const common = new Uint16Array((b.length + 1) * width);
  for (let i2 = b.length - 1; i2 >= 0; i2--) {
    for (let j2 = a.length - 1; j2 >= 0; j2--) {
      common[i2 * width + j2] = b[i2] === a[j2] ? common[(i2 + 1) * width + j2 + 1] + 1 : Math.max(common[(i2 + 1) * width + j2], common[i2 * width + j2 + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < b.length || j < a.length) {
    if (i < b.length && j < a.length && b[i] === a[j]) pairs.push([i++, j++]);
    else if (j < a.length && (i === b.length || common[i * width + j + 1] >= common[(i + 1) * width + j])) j++;
    else i++;
  }
  return pairs;
}
function myersLines(b, a) {
  const n = b.length;
  const m = a.length;
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace = [];
  const down = (k, d, at) => k === -d || k !== d && at(k - 1) < at(k + 1);
  let found = n === 0 && m === 0 ? 0 : -1;
  for (let d = 0; found < 0; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x2 = down(k, d, (i) => v[offset + i]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < n && y2 < m && b[x2] === a[y2]) {
        x2++;
        y2++;
      }
      v[offset + k] = x2;
      if (x2 >= n && y2 >= m) {
        found = d;
        break;
      }
    }
  }
  const pairs = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const before = trace[d];
    const at = (k2) => before[k2 + d];
    const k = x - y;
    const prevK = down(k, d, at) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    const startX = prevK === k + 1 ? prevX : prevX + 1;
    while (x > startX) pairs.push([--x, --y]);
    x = prevX;
    y = prevY;
  }
  while (x > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

// core/domain/LineMatch.ts
function matchLines(before, after, alike) {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const shared = sharedLines(before.slice(head, before.length - tail), after.slice(head, after.length - tail)).map(([b2, a2]) => [b2 + head, a2 + head]);
  const anchors = [...Array.from({ length: head }, (_, i) => [i, i]), ...shared, ...Array.from({ length: tail }, (_, i) => [before.length - tail + i, after.length - tail + i])];
  const pairs = [];
  let b = 0;
  let a = 0;
  for (const anchor of [...anchors, [before.length, after.length]]) {
    pairs.push(...inPlace(b, anchor[0], a, anchor[1], alike));
    if (anchor[0] < before.length) pairs.push(anchor);
    b = anchor[0] + 1;
    a = anchor[1] + 1;
  }
  return pairs;
}
function inPlace(b0, b1, a0, a1, alike) {
  if (b1 - b0 !== a1 - a0 || b1 === b0) return [];
  const pairs = Array.from({ length: b1 - b0 }, (_, k) => [b0 + k, a0 + k]);
  return pairs.every(([x, y]) => alike(x, y)) ? pairs : [];
}

// core/domain/ProjectTree.ts
var PROJECTS_HEADING = "Projects";
var FOLDER_MARK = "🗃️";
var FOLDER_RE = /(?:^|\s)\u{1F5C3}\u{FE0F}?(?=\s|$)/u;
var LINK_RE2 = /(\[\[[^[\]]*\]\])/;
var HEADING_RE = /^##\s+(.*?)\s*$/;
var LIST_END_RE = /^#{1,2}(\s|$)/;
var ITEM_RE = /^([ \t]*)[-*+][ \t]+(.*?)\s*$/;
var NOTE_RE = /^(.*?)\s*\[\[([^[\]]+)\]\]$/;
var DEFAULT_UNIT = "	";
function widthOf(indent) {
  return indent.replace(/\t/g, "  ").length;
}
function treeSpan(lines) {
  const sections = [];
  lines.forEach((line, heading) => {
    if (HEADING_RE.exec(line)?.[1] !== PROJECTS_HEADING) return;
    let end = heading + 1;
    while (end < lines.length && !LIST_END_RE.test(lines[end])) end++;
    const items2 = [];
    let bare = true;
    for (let i = heading + 1; i < end; i++) {
      if (ITEM_RE.test(lines[i]) && !isTaskLine(lines[i])) items2.push(i);
      else if (lines[i].trim() !== "") bare = false;
    }
    sections.push({ heading, end, items: items2, bare });
  });
  if (sections.length === 0) return { heading: null, end: lines.length, items: [], own: [], extra: [], unit: DEFAULT_UNIT };
  const [first, ...extra] = sections;
  const items = sections.flatMap((s) => s.items);
  return { heading: first.heading, end: first.end, items, own: first.items, extra: extra.map(({ heading, end, bare }) => ({ heading, end, bare })), unit: unitOf(items.map((i) => ITEM_RE.exec(lines[i])[1])) };
}
function unitOf(indents) {
  for (let i = 1; i < indents.length; i++) {
    if (indents[i].length > indents[i - 1].length && indents[i].startsWith(indents[i - 1])) return indents[i].slice(indents[i - 1].length);
  }
  return DEFAULT_UNIT;
}
function readTree(lines) {
  const span = treeSpan(lines);
  const roots = [];
  const known = /* @__PURE__ */ new Map();
  const stack = [];
  for (const i of span.items) {
    const [, indent, body] = ITEM_RE.exec(lines[i]);
    const width = widthOf(indent);
    while (stack.length > 0 && stack[stack.length - 1].width >= width) stack.pop();
    const read = itemOf(body);
    if (read === null) continue;
    const parent = stack[stack.length - 1]?.node ?? null;
    let node = known.get(projectKey(read.name));
    if (!node) {
      node = { name: read.name, note: read.note, folder: read.folder, children: [] };
      known.set(projectKey(read.name), node);
      (parent ? parent.children : roots).push(node);
    } else {
      node.note ??= read.note;
      node.folder ||= read.folder;
    }
    stack.push({ width, node });
  }
  return new ProjectTree(roots.map(frozen));
}
function frozen(node) {
  return { name: node.name, note: node.note, folder: node.folder, children: node.children.map(frozen) };
}
function itemOf(line) {
  const parts = line.split(LINK_RE2);
  const folder = parts.some((part2, i) => i % 2 === 0 && FOLDER_RE.test(part2));
  const body = folder ? parts.map((part2, i) => i % 2 === 0 ? part2.replace(new RegExp(FOLDER_RE.source, "gu"), "") : part2).join("").trim() : line;
  const linked = NOTE_RE.exec(body);
  const name = (linked ? linked[1] : body).trim() || (linked ? projectName(linked[2].split("|")[0]) : "");
  return name === "" ? null : { name, note: linked ? linked[2] : null, folder };
}
function treeLines(tree, unit) {
  const lines = [];
  const write = (nodes, depth) => {
    for (const node of nodes) {
      lines.push(`${unit.repeat(depth)}- ${node.name}${node.folder ? ` ${FOLDER_MARK}` : ""}${node.note === null ? "" : ` [[${node.note}]]`}`);
      write(node.children, depth + 1);
    }
  };
  write(tree.roots, 0);
  return lines;
}
var ProjectTree = class _ProjectTree {
  constructor(roots) {
    this.roots = roots;
  }
  static {
    this.EMPTY = new _ProjectTree([]);
  }
  /** Every project, each before its subprojects, with its path. */
  all() {
    const out = [];
    const walk = (nodes, path) => {
      for (const node of nodes) {
        const own = [...path, node.name];
        out.push({ node, path: own });
        walk(node.children, own);
      }
    };
    walk(this.roots, []);
    return out;
  }
  /** The project of that name (case aside), with its path; null when the tree has none. */
  find(name) {
    const key = projectKey(name);
    return this.all().find((p) => projectKey(p.node.name) === key) ?? null;
  }
  has(name) {
    return this.find(name) !== null;
  }
  /** The tree with each of `names` it lacks as a project of its own, last at the top level. */
  withMissing(names) {
    let tree = this;
    for (const name of names) if (!tree.has(name)) tree = tree.added(name, { parent: null, before: null });
    return tree;
  }
  /** A new project at `place`; a name the tree has, a parent or a `before` it lacks: the tree as it is. */
  added(name, place, note = null) {
    if (this.has(name) || !this.fits(place)) return this;
    return new _ProjectTree(inserted(this.roots, { name, note, folder: false, children: [] }, place));
  }
  /** The project with its subprojects moved to `place`; never into itself or below it. */
  moved(name, place) {
    const found = this.find(name);
    if (!found || !this.fits(place)) return this;
    const into2 = place.parent === null ? null : this.find(place.parent);
    if (into2 && into2.path.some((n) => projectKey(n) === projectKey(found.node.name))) return this;
    if (place.before !== null && projectKey(place.before) === projectKey(found.node.name)) return this;
    const without = removed(this.roots, found.node.name);
    const tree = new _ProjectTree(inserted(without, found.node, place));
    return tree.same(this) ? this : tree;
  }
  /** The project renamed; a blank name, or one another project has, leaves the tree as it is. */
  renamed(from, to) {
    const found = this.find(from);
    const taken = this.find(to);
    if (!found || taken && taken.node !== found.node) return this;
    return new _ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, name: to })));
  }
  /** The note attached to a project (its link), or taken off with null. */
  withNote(name, note) {
    const found = this.find(name);
    if (!found || found.node.note === note) return this;
    return new _ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, note })));
  }
  /** The project made a folder, or a project again. */
  withFolder(name, folder) {
    const found = this.find(name);
    if (!found || found.node.folder === folder) return this;
    return new _ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, folder })));
  }
  /** The project gone from the tree, its subprojects lifted a level into its place, in their order. */
  deleted(name) {
    const found = this.find(name);
    if (!found) return this;
    return new _ProjectTree(lifted(this.roots, found.node.name));
  }
  same(other) {
    return treeLines(this, "	").join("\n") === treeLines(other, "	").join("\n");
  }
  /** The place names a parent the tree has and a `before` among that parent's subprojects. */
  fits(place) {
    const siblings = place.parent === null ? this.roots : this.find(place.parent)?.node.children;
    if (!siblings) return false;
    return place.before === null || siblings.some((n) => projectKey(n.name) === projectKey(place.before));
  }
};
function removed(nodes, name) {
  return nodes.filter((n) => n.name !== name).map((n) => ({ ...n, children: removed(n.children, name) }));
}
function lifted(nodes, name) {
  return nodes.flatMap((n) => n.name === name ? n.children : [{ ...n, children: lifted(n.children, name) }]);
}
function inserted(nodes, node, place) {
  if (place.parent === null) return into(nodes, node, place.before);
  return nodes.map((n) => projectKey(n.name) === projectKey(place.parent) ? { ...n, children: into(n.children, node, place.before) } : { ...n, children: inserted(n.children, node, place) });
}
function into(siblings, node, before) {
  const at = before === null ? -1 : siblings.findIndex((n) => projectKey(n.name) === projectKey(before));
  return at < 0 ? [...siblings, node] : [...siblings.slice(0, at), node, ...siblings.slice(at)];
}
function mapped(nodes, name, change) {
  return nodes.map((n) => n.name === name ? change(n) : { ...n, children: mapped(n.children, name, change) });
}

// core/domain/TaskDocument.ts
function ungroupedIndex(groups) {
  for (let i = groups.length - 1; i > 0; i--) if (groups[i].name === null) return i;
  return 0;
}
function linesOfText(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = text.endsWith(eol) ? text.slice(0, -eol.length) : text;
  return body === "" && text === "" ? [] : body.split(eol);
}
var Mint = class {
  constructor(next) {
    this.next = next;
  }
  rows(lines) {
    return lines.map((line) => ({ line, tag: `t${this.next++}` }));
  }
};
function linesOfRows(rows) {
  return rows.map((row) => row.line);
}
var SECTION_KEYS = ["inbox", "backlog", "now", "soon", "done"];
var LIST_END_RE2 = /^#{1,2}(\s|$)/;
var GROUP_HEADING_RE = /^###\s+(.*?)\s*$/;
var SECTION_HEADING_RE = /^##\s+(.*?)\s*$/;
var INDENT_RE2 = /^[ \t]*/;
var DEFAULT_INDENT_UNIT = "	";
function indentWidth(line) {
  return INDENT_RE2.exec(line)[0].length;
}
function sameTask(a, b) {
  return sameOwnLine(a, b) && sameLines(a.children, b.children);
}
function sameOwnLine(a, b) {
  return a.status === b.status && a.statusChar === b.statusChar && a.text === b.text && a.dueDate === b.dueDate && a.priority === b.priority && a.labels.length === b.labels.length && a.labels.every((label, i) => label === b.labels[i]) && (a.repeat?.format() ?? null) === (b.repeat?.format() ?? null) && a.slot?.date === b.slot?.date && a.slot?.start === b.slot?.start && a.slot?.end === b.slot?.end && a.reminder === b.reminder && a.collapsed === b.collapsed && sameLines(a.projects, b.projects);
}
function tagNumber(tag) {
  return Number(tag.slice(1));
}
function flatten(entries) {
  return entries.flatMap((entry) => [entry, ...flatten(entry.subtasks)]);
}
function sameLines(a, b) {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
function contains(entry, other) {
  return entry.section === other.section && entry.index === other.index && entry.path.every((i, k) => other.path[k] === i) && other.path.length >= entry.path.length;
}
function reindented(rows, from, to) {
  if (from === to) return [...rows];
  return rows.map((row) => row.line.startsWith(from) ? { line: to + row.line.slice(from.length), tag: row.tag } : row);
}
var TaskDocument = class _TaskDocument {
  constructor(rows, eol, trailingEol, names, markers, next) {
    this.rows = rows;
    this.eol = eol;
    this.trailingEol = trailingEol;
    this.names = names;
    this.markers = markers;
    this.next = next;
    this.lines = linesOfRows(rows);
    this.sections = this.findSections();
    const entries = /* @__PURE__ */ new Map();
    const spans = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    const blocks = /* @__PURE__ */ new Map();
    for (const [key, section] of this.sections) {
      const listBlocks = this.findBlocks(section);
      const listEntries = [];
      groups.set(key, listBlocks.map((block, index) => this.readGroup(key, block, index, listEntries, spans)));
      entries.set(key, listEntries);
      blocks.set(key, listBlocks);
    }
    this.entries = entries;
    this.spans = spans;
    this.groupLists = groups;
    this.blockLists = blocks;
  }
  /** Each line tagged by its line, `t0` on. */
  static parse(text, sections, markers) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const trailingEol = text.endsWith(eol);
    const lines = linesOfText(text);
    const rows = lines.map((line, i) => ({ line, tag: `t${i}` }));
    return new _TaskDocument(rows, eol, trailingEol, sections, markers, lines.length);
  }
  /** The document with every tag renamed by `ids`; the tags its changes make go on past every new one. */
  retagged(ids) {
    const rows = this.rows.map((row) => {
      const n = tagNumber(row.tag);
      return { line: row.line, tag: ids.known.get(n) ?? `t${ids.next + n}` };
    });
    return new _TaskDocument(rows, this.eol, this.trailingEol, this.names, this.markers, ids.next + this.next);
  }
  /** The headings and the task lines, in file order, each with its tag's number. */
  outline() {
    return this.rows.flatMap((row, line) => {
      const task = isTaskLine(row.line);
      return task || SECTION_HEADING_RE.test(row.line) || GROUP_HEADING_RE.test(row.line) ? [{ line, raw: row.line, task, tag: tagNumber(row.tag) }] : [];
    });
  }
  static empty(all2) {
    return _TaskDocument.parse("", { inbox: "", now: "", soon: "", done: "" }, { dueDate: "", slot: "" }).ensureSections(all2).serialize();
  }
  /** The prefixes of the priority levels the file is read with. */
  priorityPrefixes() {
    return this.markers.priorities ?? [];
  }
  serialize() {
    return this.lines.join(this.eol) + (this.trailingEol ? this.eol : "");
  }
  /** The projects of `## Projects`, as the file has them: none without the heading. */
  projectTree() {
    return readTree(this.lines);
  }
  /** The file has `## Projects`. */
  hasProjectTree() {
    return treeSpan(this.lines).heading !== null;
  }
  /**
   * The file with `tree` as its `## Projects`: the list's lines in place of the ones it had (where the first stood, else
   * under the heading), every other line where it was; without the heading, the section made right after Inbox (at the
   * file's end without Inbox). The same tree changes nothing.
   */
  withProjectTree(tree) {
    const span = treeSpan(this.lines);
    if (span.heading !== null && span.extra.length === 0 && tree.same(readTree(this.lines))) return this;
    const mint = this.mint();
    const lines = mint.rows(treeLines(tree, span.unit));
    if (span.heading === null) return this.withRows(this.newTreeRows(lines, mint), mint);
    const gone = new Set(span.items);
    for (const extra of span.extra) {
      if (!extra.bare) continue;
      for (let i = extra.heading; i < extra.end; i++) gone.add(i);
    }
    const kept = this.rows.map((row, i) => ({ row, i })).filter(({ i }) => !gone.has(i));
    const rows = kept.map(({ row }) => row);
    const firstOwn = span.own.length > 0 ? kept.findIndex(({ i }) => i > span.own[0]) : -1;
    let at = span.own.length > 0 ? firstOwn < 0 ? rows.length : firstOwn : kept.findIndex(({ i }) => i === span.heading) + 1;
    if (span.own.length === 0) {
      if (at < rows.length && rows[at].line.trim() === "") at++;
      else rows.splice(at++, 0, ...mint.rows([""]));
    }
    rows.splice(at, 0, ...lines);
    const after = at + lines.length;
    if (span.own.length === 0 && after < rows.length && rows[after].line.trim() !== "") rows.splice(after, 0, ...mint.rows([""]));
    return this.withRows(rows, mint);
  }
  /** The rows with a new `## Projects` holding `lines`, right after Inbox, apart from what is around it by blank lines. */
  newTreeRows(lines, mint) {
    const inbox = this.sections.get("inbox");
    const rows = [...this.rows];
    let at = inbox ? inbox.endLine : rows.length;
    while (at > (inbox?.firstLine ?? 0) && rows[at - 1].line.trim() === "") at--;
    const block = [...at > 0 ? mint.rows([""]) : [], ...mint.rows([`## ${PROJECTS_HEADING}`, ""]), ...lines];
    const rest = rows.slice(at);
    const blankAfter = rest.findIndex((row) => row.line.trim() !== "");
    const tail = blankAfter < 0 ? [] : rest.slice(blankAfter);
    return [...rows.slice(0, at), ...block, ...tail.length > 0 ? mint.rows([""]) : [], ...tail];
  }
  /** Each entry's own line written anew from its task, as the file's format has it now, even where its task reads the same. */
  rewrittenLines(entries, change = (task) => task) {
    const rows = [...this.rows];
    let changed3 = false;
    for (const entry of entries) {
      const line = this.spanOf(entry).line;
      const written = formatTaskLine({ indent: entry.indent, bullet: entry.bullet, task: change(entry.task) }, this.markers);
      if (written === rows[line].line) continue;
      rows[line] = { line: written, tag: rows[line].tag };
      changed3 = true;
    }
    return changed3 ? this.withRows(rows) : this;
  }
  hasSection(section) {
    return this.sections.has(section);
  }
  tasks(section) {
    return this.entries.get(section) ?? [];
  }
  /** The list's groups in file order, the top block first even when empty. Before normalization names may repeat. */
  groups(section) {
    return this.groupLists.get(section) ?? [];
  }
  /** The task or subtask whose tag is `id`, wherever it stands; undefined when none has it. */
  byId(id) {
    return flatten(this.allTasks()).find((entry) => entry.id === id);
  }
  /** The task or subtask at that place, if there is one. */
  find(section, index, path) {
    let entry = this.tasks(section)[index];
    for (const i of path) entry = entry?.subtasks[i];
    return entry;
  }
  /** The line the entry's task stands on, from 0. */
  lineOf(entry) {
    return this.spanOf(entry).line;
  }
  allTasks() {
    return SECTION_KEYS.flatMap((key) => this.tasks(key));
  }
  /** Where the tags of the lines a change makes after this document begin: past every tag it has. */
  nextTag() {
    return this.next;
  }
  /** The tag of each heading and task line, by its line, from 0. */
  outlineTags() {
    return new Map(this.outline().map((o) => [o.line, this.rows[o.line].tag]));
  }
  /**
   * The task a change made since `before`, wherever the rules then moved it: the first one it made, as its tag tells; the
   * rules may make others after it (a repeating task's next copy).
   */
  insertedSince(before) {
    const old = new Set(flatten(before.allTasks()).map((entry) => entry.id));
    const made = flatten(this.allTasks()).filter((entry) => !old.has(entry.id));
    return made.sort((a, b) => tagNumber(a.id) - tagNumber(b.id))[0];
  }
  /** Where each of `moved`, tasks of `before`, stands after a change moved them, by its tag; undefined when it is gone. */
  movedSince(_before, moved2) {
    const all2 = new Map(flatten(this.allTasks()).map((entry) => [entry.id, entry]));
    return moved2.map((entry) => all2.get(entry.id));
  }
  insert(section, position, task) {
    const line = this.insertionLine(section, position);
    const mint = this.mint();
    return this.withRows(this.splice(line, 0, mint.rows(this.linesOf("", "-", task))), mint);
  }
  replace(entry, task) {
    const span = this.spanOf(entry);
    if (sameTask(entry.task, task)) return this;
    const mint = this.mint();
    return this.withRows(this.splice(span.line, span.lineCount, this.rewritten(span, this.linesOf(entry.indent, entry.bullet, task), mint)), mint);
  }
  /**
   * Each entry of this document becomes its task, as `replace` one after another would, in one rewrite. Only the task's
   * own line changes unless its description and subtasks do; those rewritten lines may not hold another change. With
   * `asRead`, the entry as it was read before: a task whose own line says what it said then gets that line back as it was.
   */
  replaceAll(changes) {
    const edits = [];
    const mint = this.mint();
    for (const [entry, task, asRead] of changes) {
      const span = this.spanOf(entry);
      if (sameTask(entry.task, task)) continue;
      const line = asRead && sameOwnLine(asRead.task, task) && asRead.indent === entry.indent && asRead.bullet === entry.bullet ? asRead.raw : formatTaskLine({ indent: entry.indent, bullet: entry.bullet, task }, this.markers);
      const own = sameLines(entry.task.children, task.children);
      edits.push(
        own ? { line: span.line, count: 1, rows: this.rewritten({ line: span.line, lineCount: 1 }, [line], mint) } : { line: span.line, count: span.lineCount, rows: this.rewritten(span, [line, ...task.children], mint) }
      );
    }
    if (edits.length === 0) return this;
    edits.sort((a, b) => b.line - a.line);
    const rows = [...this.rows];
    let below = rows.length;
    for (const edit of edits) {
      if (edit.line + edit.count > below) throw new Error(`Changes overlap at line ${edit.line + 1}`);
      rows.splice(edit.line, edit.count, ...edit.rows);
      below = edit.line;
    }
    return this.withRows(rows, mint);
  }
  /** The last task taken out of a section takes the section away, unless something but blank lines is left under it. */
  removeEntry(entry) {
    const span = this.spanOf(entry);
    return this.leftBy(entry, this.withRows(this.splice(span.line, span.lineCount, [])));
  }
  /**
   * A subtask moved here leaves its task and becomes a task of `section`, with the projects it had through it; `projects`
   * gives it others. The section it leaves empty goes, as with `removeEntry`.
   */
  moveEntry(entry, section, position, projects) {
    const span = this.spanOf(entry);
    const moved2 = this.ownRows(entry, span, "", projects ?? (entry.path.length > 0 ? entry.projects : entry.task.projects));
    const without = this.withRows(this.splice(span.line, span.lineCount, []));
    const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
    return this.leftBy(entry, without.withRows(without.splice(target, 0, moved2)));
  }
  /** An empty `### name` before group `before`; `before` equal to the number of groups puts it last. */
  addGroup(section, name, before) {
    if (before < 1) throw new Error("No group goes above the tasks outside any section");
    const mint = this.mint();
    return this.withRows(this.splice(this.groupStartLine(section, before), 0, mint.rows([`### ${name}`])), mint);
  }
  /**
   * The `moved` tasks of group `index`, with their subtasks and in their order, go under a new `### name` right after the
   * group's last line that stays; the rest of the group stays as it is, even when nothing is left in it. Nothing to move is `addGroup` after the group.
   */
  splitGroup(section, index, name, moved2) {
    if (moved2.length === 0) return this.addGroup(section, name, index + 1);
    const block = this.blockOf(section, index);
    const spans = moved2.map((entry) => this.spanOf(entry));
    const inMoved = (line) => spans.some((span) => line >= span.line && line < span.line + span.lineCount);
    let at = block.end;
    while (at > block.start && (this.lines[at - 1].trim() === "" || inMoved(at - 1))) at--;
    if (at === block.start) at = Math.min(...spans.map((span) => span.line));
    const rows = moved2.flatMap((entry, i) => reindented(this.rows.slice(spans[i].line, spans[i].line + spans[i].lineCount), entry.indent, ""));
    const kept = this.rows.filter((_, line) => !inMoved(line));
    const mint = this.mint();
    kept.splice(at - spans.filter((span) => span.line < at).reduce((sum, span) => sum + span.lineCount, 0), 0, ...mint.rows([`### ${name}`]), ...rows);
    return this.withRows(kept, mint);
  }
  /** Group `from` goes before group `before`. The top block moved down gets the heading of the tasks outside any section. */
  moveGroup(section, from, before) {
    if (before < 1) throw new Error("No group goes above the tasks outside any section");
    if (before === from || before === from + 1) return this;
    const block = this.blockOf(section, from);
    const content = this.contentOf(block);
    const mint = this.mint();
    const core = this.rows.slice(block.headingLine ?? content.first, content.last);
    if (block.headingLine === null) core.unshift(...mint.rows([`### ${this.ungroupedName()}`]));
    const cut = this.cutOf(section, from);
    const apart2 = mint.rows(Array(cut.to - cut.from - (content.last - (block.headingLine ?? content.first))).fill(""));
    const last = before === this.blockLists.get(section).length;
    const moved2 = last ? [...apart2, ...core] : [...core, ...apart2];
    return this.withRows(this.cutAndInsert(cut, this.groupStartLine(section, before), moved2), mint);
  }
  renameGroup(section, index, name) {
    const line = this.blockOf(section, index).headingLine;
    if (line === null) throw new Error("The tasks outside any section have no heading");
    return this.withRows(this.splice(line, 1, [{ line: `### ${name}`, tag: this.rows[line].tag }]));
  }
  /** What group `from` holds goes to the start or the end of the tasks of group `into`; the heading of `from` goes. */
  mergeGroup(section, from, into2, at) {
    if (from === into2) throw new Error("A group merges into another one");
    const content = this.contentOf(this.blockOf(section, from));
    const moved2 = this.rows.slice(content.first, content.last);
    return this.withRows(this.cutAndInsert(this.cutOf(section, from), this.groupInsertionLine(section, into2, at), moved2));
  }
  /** A group with nothing but blank lines goes, its blank lines with it unless they part the list from the next one. */
  deleteGroup(section, index) {
    const group = this.groups(section)[index];
    const block = this.blockOf(section, index);
    if (!group?.blank || block.headingLine === null) throw new Error("Only an empty section is deleted");
    const cut = this.cutOf(section, index);
    return this.withRows(this.splice(cut.from, cut.to - cut.from, []));
  }
  /** Puts the entry with its subtasks among `parent`'s subtasks, right before `before` (one of them) or last. */
  nestEntry(entry, parent, before) {
    if (contains(entry, parent)) throw new Error(`A task cannot go under itself: ${entry.raw}`);
    const span = this.spanOf(entry);
    const target = before ? this.spanOf(before).line : this.endOf(parent);
    const moved2 = this.ownRows(entry, span, this.childIndent(parent), []);
    const without = this.splice(span.line, span.lineCount, []);
    without.splice(target > span.line ? target - span.lineCount : target, 0, ...moved2);
    return this.leftBy(entry, this.withRows(without));
  }
  /**
   * The task's description from Markdown, as one block right under its line and before its subtasks, at the indent its
   * description has, else its subtasks'. The same text changes nothing; an empty one, or a lone empty point, takes the description away.
   */
  setDescription(entry, markdown) {
    const lines = markdownLines(markdown);
    if (lines.join("\n") === (descriptionMarkdown(entry) ?? "")) return this;
    const indent = descriptionIndent(entry) ?? this.childIndent(entry);
    const subtasks = entry.subtasks.flatMap((sub) => [sub.raw, ...sub.task.children]);
    return this.replace(entry, { ...entry.task, children: [...lines.map((line) => indent + line), ...subtasks] });
  }
  /**
   * The entry's child lines with every subtask `[ ]` and without its due date, slot (with its reminder kind) and repeat;
   * description lines as they are. Indented as a task of its own's, even for a subtask.
   */
  freshChildren(entry) {
    const first = this.spanOf(entry).line + 1;
    const children = [...entry.task.children];
    const open = (sub) => {
      const task = { ...sub.task, status: "todo", statusChar: STATUS_CHARS.todo, dueDate: null, slot: null, reminder: DEFAULT_REMINDER, repeat: null };
      children[this.spanOf(sub).line - first] = formatTaskLine({ indent: sub.indent, bullet: sub.bullet, task }, this.markers);
      sub.subtasks.forEach(open);
    };
    entry.subtasks.forEach(open);
    return children.map((line) => line.startsWith(entry.indent) ? line.slice(entry.indent.length) : line);
  }
  /** A new subtask of `parent`, right before its subtask `before` or last. */
  insertUnder(parent, task, before = null) {
    const line = before ? this.spanOf(before).line : this.endOf(parent);
    const mint = this.mint();
    return this.withRows(this.splice(line, 0, mint.rows(this.linesOf(this.childIndent(parent), parent.bullet, task))), mint);
  }
  ensureSections(all2) {
    const present2 = new Set(this.headingNames());
    const missing = all2.filter((name) => !present2.has(name));
    if (missing.length === 0) return this;
    const rows = [...this.rows];
    const mint = this.mint();
    for (const name of missing) {
      if (rows.length > 0 && rows[rows.length - 1].line !== "") rows.push(...mint.rows([""]));
      rows.push(...mint.rows([`## ${name}`]));
    }
    return new _TaskDocument(rows, this.eol, true, this.names, this.markers, mint.next);
  }
  /** Under each list's heading one blank line, then what is under it; a heading with nothing below it stays as it is. */
  spacedHeadings() {
    const headings = [...this.sections.values()].map((s) => s.headingLine).sort((a, b) => b - a);
    let rows = null;
    const mint = this.mint();
    for (const heading of headings) {
      const current = rows ?? this.rows;
      let filled = heading + 1;
      while (filled < current.length && current[filled].line.trim() === "") filled++;
      if (filled === current.length || filled === heading + 2 && current[heading + 1].line === "") continue;
      rows ??= [...this.rows];
      rows.splice(heading + 1, filled - heading - 1, ...mint.rows([""]));
    }
    return rows ? this.withRows(rows, mint) : this;
  }
  /**
   * `after`, this document once `entry` was taken from its place (and put elsewhere): without the section it was the
   * last task of, when only blank lines are left under its heading. No section's heading is left to the rules.
   */
  leftBy(entry, after) {
    if (entry.path.length > 0 || entry.group === null) return after;
    const group = this.groups(entry.section).find((g) => g.entries.some((e) => e.index === entry.index));
    const left = group && after.groups(entry.section)[group.index];
    if (!group || !left?.heading || left.name !== group.name || !left.blank) return after;
    return after.deleteGroup(entry.section, left.index);
  }
  /**
   * The entry's lines under another indent, its own line written with `projects` as its projects: a subtask that becomes
   * a task takes the ones it had through its parent, a task put under another one needs none.
   */
  ownRows(entry, span, indent, projects) {
    const rows = reindented(this.rows.slice(span.line, span.line + span.lineCount), entry.indent, indent);
    if (!sameLines(entry.task.projects, projects)) rows[0] = { line: formatTaskLine({ indent, bullet: entry.bullet, task: { ...entry.task, projects } }, this.markers), tag: rows[0].tag };
    return rows;
  }
  /**
   * `lines` in place of the span's: its first line keeps the tag of the span's first, as a rewritten task keeps who it
   * is; the lines under it keep theirs where they stay or are edited in place, a task line for a task line.
   */
  rewritten(span, lines, mint) {
    const old = this.rows.slice(span.line + 1, span.line + span.lineCount);
    const fresh = lines.slice(1);
    const isTask = (line) => parseTaskLine(line, this.markers) !== null;
    const kept = new Map(matchLines(linesOfRows(old), fresh, (b, a) => isTask(old[b].line) === isTask(fresh[a])).map(([b, a]) => [a, old[b].tag]));
    const rows = fresh.map((line, i) => ({ line, tag: kept.get(i) ?? mint.rows([line])[0].tag }));
    return [{ line: lines[0], tag: this.rows[span.line].tag }, ...rows];
  }
  mint() {
    return new Mint(this.next);
  }
  withRows(rows, mint = null) {
    return new _TaskDocument(rows, this.eol, this.trailingEol, this.names, this.markers, mint?.next ?? this.next);
  }
  splice(start2, deleteCount, insert) {
    const rows = [...this.rows];
    rows.splice(start2, deleteCount, ...insert);
    return rows;
  }
  linesOf(indent, bullet, task) {
    return [formatTaskLine({ indent, bullet, task }, this.markers), ...task.children];
  }
  spanOf(entry) {
    const own = this.find(entry.section, entry.index, entry.path);
    const span = own && own.raw === entry.raw ? this.spans.get(own) : void 0;
    if (!span) throw new Error(`Task not found in the document: ${entry.section}[${entry.index}]${entry.path.map((i) => `[${i}]`).join("")} ${entry.raw}`);
    return span;
  }
  endOf(entry) {
    const span = this.spanOf(entry);
    return span.line + span.lineCount;
  }
  /** The indent of `parent`'s subtasks: the one they have, else one level deeper by the file's own step. */
  childIndent(parent) {
    return parent.subtasks[0]?.indent ?? parent.indent + this.indentUnit();
  }
  indentUnit() {
    const step = (entry) => {
      for (const sub of entry.subtasks) {
        if (sub.indent.startsWith(entry.indent) && sub.indent.length > entry.indent.length) return sub.indent.slice(entry.indent.length);
        const deeper = step(sub);
        if (deeper) return deeper;
      }
      return null;
    };
    for (const entry of this.allTasks()) {
      const unit = step(entry);
      if (unit) return unit;
    }
    return DEFAULT_INDENT_UNIT;
  }
  positionAfterRemoval(entry, section, position) {
    if (typeof position !== "number" || entry.path.length > 0 || section !== entry.section || position <= entry.index) return position;
    return position - 1;
  }
  insertionLine(section, position) {
    const s = this.sections.get(section);
    if (!s) throw new Error(`Section missing: ${this.names[section]}`);
    if (typeof position === "number") {
      const tasks = this.tasks(section);
      if (tasks.length === 0) return s.firstLine;
      if (position >= tasks.length) return this.lineAfter(tasks[tasks.length - 1]);
      return this.spans.get(tasks[Math.max(0, position)]).line;
    }
    const groups = this.groups(section);
    const index = typeof position === "object" ? position.endOf : ungroupedIndex(groups);
    const group = groups[index];
    if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
    if (group.entries.length === 0) return this.emptyBlockLine(section, index);
    if (position === "start") return this.spans.get(group.entries[0]).line;
    return this.lineAfter(group.entries[group.entries.length - 1]);
  }
  groupInsertionLine(section, index, at) {
    const group = this.groups(section)[index];
    if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
    if (group.entries.length === 0) return this.emptyBlockLine(section, index);
    return at === "start" ? this.spans.get(group.entries[0]).line : this.lineAfter(group.entries[group.entries.length - 1]);
  }
  /**
   * Where a task goes in a block without tasks: right under its heading. The top block's blank lines stay under the
   * list's heading when a `###` follows, and part the list from the next one when it is the last.
   */
  emptyBlockLine(section, index) {
    const block = this.blockOf(section, index);
    const last = index === this.blockLists.get(section).length - 1;
    return block.headingLine === null && !last ? this.firstFilled(block) : block.start;
  }
  /** Where group `index` begins; the number of groups: after the list's last filled line. */
  groupStartLine(section, index) {
    const blocks = this.blockLists.get(section);
    if (!blocks) throw new Error(`Section missing: ${this.names[section]}`);
    if (index < blocks.length) return blocks[index].headingLine ?? blocks[index].start;
    const list = this.sections.get(section);
    let line = list.endLine;
    while (line > list.firstLine && this.lines[line - 1].trim() === "") line--;
    return line;
  }
  blockOf(section, index) {
    const block = this.blockLists.get(section)?.[index];
    if (!block) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
    return block;
  }
  /** A block's filled lines under its heading, from the first to past the last; empty, at its start, when all are blank. */
  contentOf(block) {
    const first = this.firstFilled(block);
    if (first === block.end) return { first: block.start, last: block.start };
    return { first, last: this.lastFilled(block) };
  }
  /**
   * The lines a block takes with it when it leaves: its heading, its lines and the blank lines under them. The last
   * block of a list leaves its blank lines to part the list from the next one and takes those above it instead, so
   * a block cut anywhere leaves the blank lines around it as they were.
   */
  cutOf(section, index) {
    const block = this.blockOf(section, index);
    const content = this.contentOf(block);
    const start2 = block.headingLine ?? content.first;
    if (index < this.blockLists.get(section).length - 1) return { from: start2, to: block.end };
    let from = start2;
    const top = this.sections.get(section).firstLine;
    while (from > top && this.lines[from - 1].trim() === "") from--;
    return { from, to: Math.max(start2, content.last) };
  }
  /** Removes the cut and puts `moved` in at `target`, a line of the document before the cut. */
  cutAndInsert(cut, target, moved2) {
    const size = cut.to - cut.from;
    const rows = this.splice(cut.from, size, []);
    rows.splice(target >= cut.to ? target - size : Math.min(target, cut.from), 0, ...moved2);
    return rows;
  }
  /** The first line under the block's heading that is not blank; its end when there is none. */
  firstFilled(block) {
    let line = block.start;
    while (line < block.end && this.lines[line].trim() === "") line++;
    return line;
  }
  /** Past the block's last line that is not blank: the blank lines after it stay where they are. */
  lastFilled(block) {
    let line = block.end;
    while (line > block.start && this.lines[line - 1].trim() === "") line--;
    return line;
  }
  ungroupedName() {
    if (this.names.ungrouped === void 0) throw new Error("No name for the tasks outside any section");
    return this.names.ungrouped;
  }
  lineAfter(entry) {
    const span = this.spans.get(entry);
    return span.line + span.lineCount;
  }
  headingNames() {
    const names = [];
    for (const line of this.lines) {
      const m = SECTION_HEADING_RE.exec(line);
      if (m) names.push(m[1]);
    }
    return names;
  }
  findSections() {
    const found = /* @__PURE__ */ new Map();
    this.lines.forEach((line, i) => {
      const m = SECTION_HEADING_RE.exec(line);
      if (!m) return;
      const key = SECTION_KEYS.find((k) => this.names[k] === m[1] && !found.has(k));
      if (key) found.set(key, { headingLine: i, firstLine: i + 1, endLine: this.sectionEnd(i + 1) });
    });
    return found;
  }
  sectionEnd(from) {
    for (let i = from; i < this.lines.length; i++) {
      if (LIST_END_RE2.test(this.lines[i])) return i;
    }
    return this.lines.length;
  }
  findBlocks(section) {
    const blocks = [];
    let name = null;
    let headingLine = null;
    let start2 = section.firstLine;
    for (let i = section.firstLine; i <= section.endLine; i++) {
      const m = i < section.endLine ? GROUP_HEADING_RE.exec(this.lines[i]) : null;
      if (!m && i < section.endLine) continue;
      blocks.push({ name, headingLine, start: start2, end: i });
      if (!m) break;
      name = m[1] === this.names.ungrouped ? null : m[1];
      headingLine = i;
      start2 = i + 1;
    }
    return blocks;
  }
  /** A block's tasks, numbered on from the tasks of the blocks above it in `entries`. */
  readGroup(key, block, index, entries, spans) {
    const blank = this.lines.slice(block.start, block.end).every((line) => line.trim() === "");
    const own = this.readLevel(key, block.start, block.end, null, block.name, entries.length, spans, null);
    entries.push(...own);
    return { index, name: block.name, heading: block.headingLine !== null, id: block.headingLine === null ? null : this.rows[block.headingLine].tag, entries: own, blank };
  }
  /** The task lines from `from` to `end` that no task line above them in that range holds, each with its own subtasks. */
  readLevel(section, from, end, parent, group, firstIndex, spans, parentProjects) {
    const entries = [];
    let i = from;
    while (i < end) {
      const raw = this.lines[i];
      const parsed = parseTaskLine(raw, this.markers);
      if (!parsed) {
        i++;
        continue;
      }
      const children = this.childrenOf(i, end, parsed.indent.length);
      const place = parent ? { index: parent.index, path: [...parent.path, entries.length] } : { index: firstIndex + entries.length, path: [] };
      const projects = parent ? parentProjects ?? [] : parsed.task.projects;
      const subtasks = this.readLevel(section, i + 1, i + 1 + children.length, place, group, 0, spans, projects);
      const entry = { id: this.rows[i].tag, section, ...place, raw, indent: parsed.indent, bullet: parsed.bullet, task: { ...parsed.task, children }, group, projects, subtasks };
      entries.push(entry);
      spans.set(entry, { line: i, lineCount: 1 + children.length });
      i += 1 + children.length;
    }
    return entries;
  }
  childrenOf(taskLine, endLine, indent) {
    const children = [];
    for (let i = taskLine + 1; i < endLine; i++) {
      const line = this.lines[i];
      if (line.trim() === "" || indentWidth(line) <= indent) break;
      children.push(line);
    }
    return children;
  }
};

// core/domain/ProjectWrites.ts
var LEGACY_RESULT_MARK = "🎯";
function taskProjects(doc) {
  return uniqueNames(doc.allTasks().flatMap((entry) => entry.task.projects));
}
function withTasksInTree(doc) {
  const named = taskProjects(doc);
  if (named.length === 0) return doc;
  const tree = doc.projectTree();
  const full = tree.withMissing(named);
  return doc.hasProjectTree() && full === tree ? doc : doc.withProjectTree(full);
}
function notesOfOldFields(doc, notes, resultMark) {
  const named = new Set(oldLines(doc, resultMark).flatMap((entry) => [...entry.raw.matchAll(OLD_LINK_RE)].map((m) => projectKey(projectName(m[1])))));
  const linked = new Set(doc.projectTree().all().flatMap((p) => p.node.note === null ? [] : [projectKey(projectName(p.node.note.split("|")[0].split("#")[0]))]));
  return notes.filter((note) => named.has(projectKey(note.name)) && !linked.has(projectKey(projectName(note.link))));
}
function attachedAny(doc) {
  return doc.hasProjectTree() && doc.projectTree().all().some((p) => p.node.note !== null);
}
var OLD_LINK_RE = /(?:^|\s)\u{1F5C2}\u{FE0F}?\s+\[\[([^[\]|#]+)/gu;
var OLD_FIELD_RE = /(?:^|\s)\u{1F5C2}\u{FE0F}?\s+\[\[/u;
function oldLines(doc, resultMark) {
  return flatten(doc.allTasks()).filter((entry) => OLD_FIELD_RE.test(entry.raw) || startsWithMark(entry.task.text, resultMark));
}
function awaitsMove(doc, notes, resultMark = LEGACY_RESULT_MARK) {
  if (oldLines(doc, resultMark).length > 0) return true;
  return !doc.hasProjectTree() && (notes.length > 0 || taskProjects(doc).length > 0);
}
function movedToProjects(doc, given, resultMark = LEGACY_RESULT_MARK) {
  const notes = attachedAny(doc) ? notesOfOldFields(doc, given, resultMark) : given;
  const byName2 = [...notes].sort((a, b) => projectKey(a.name) < projectKey(b.name) ? -1 : projectKey(a.name) > projectKey(b.name) ? 1 : 0);
  let tree = doc.projectTree();
  for (const note of byName2) {
    const found = tree.find(note.name);
    tree = found ? found.node.note === null ? tree.withNote(found.node.name, note.link) : tree : tree.added(note.name, { parent: null, before: null }, note.link);
  }
  tree = tree.withMissing(taskProjects(doc));
  const prefixes = doc.priorityPrefixes();
  const rewritten = doc.rewrittenLines(oldLines(doc, resultMark), (task) => {
    if (!startsWithMark(task.text, resultMark)) return task;
    const rest = task.text.slice(resultMark.length).trimStart();
    return task.priority === null ? { ...task, ...priorityOfText(rest, prefixes) } : { ...task, text: rest };
  });
  return rewritten.withProjectTree(tree);
}
function startsWithMark(text, mark) {
  return mark !== "" && text.startsWith(`${mark} `) && text.slice(mark.length).trim() !== "";
}
function renameProject(doc, from, to) {
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const renamed = tree.renamed(from, to);
  if (renamed === tree) return doc;
  const key = projectKey(from);
  const named = flatten(doc.allTasks()).filter((entry) => entry.task.projects.some((p) => projectKey(p) === key));
  const rewritten = doc.replaceAll(named.map((entry) => [entry, { ...entry.task, projects: uniqueNames(entry.task.projects.map((p) => projectKey(p) === key ? to : p)) }]));
  return rewritten.withProjectTree(renamed);
}
function deleteProject(doc, name) {
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const deleted = tree.deleted(name);
  if (deleted === tree) return doc;
  const key = projectKey(name);
  const named = flatten(doc.allTasks()).filter((entry) => entry.task.projects.some((p) => projectKey(p) === key));
  const rewritten = doc.replaceAll(named.map((entry) => [entry, { ...entry.task, projects: entry.task.projects.filter((p) => projectKey(p) !== key) }]));
  return rewritten.withProjectTree(deleted);
}
function addProject(doc, name, place) {
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const added = tree.added(name, place);
  return added === tree ? doc : doc.withProjectTree(added);
}
function moveProject(doc, name, place) {
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const moved2 = tree.moved(name, place);
  return moved2 === tree ? doc : doc.withProjectTree(moved2);
}
function hasOwnTasks(doc, name) {
  const key = projectKey(name);
  return doc.allTasks().some((entry) => entry.task.projects.some((p) => projectKey(p) === key));
}
function isFolder(doc, name) {
  return name !== null && (doc.projectTree().find(name)?.node.folder ?? false);
}
function setProjectFolder(doc, name, folder) {
  if (folder && hasOwnTasks(doc, name)) return doc;
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const changed3 = tree.withFolder(name, folder);
  return changed3 === tree ? doc : doc.withProjectTree(changed3);
}
function setProjectNote(doc, name, note) {
  const tree = doc.projectTree().withMissing(taskProjects(doc));
  const changed3 = tree.withNote(name, note);
  return changed3 === tree ? doc : doc.withProjectTree(changed3);
}
function swappedProjects(projects, from, to) {
  if (from !== null && to !== null && projectKey(from) === projectKey(to)) return projects;
  const at = from === null ? -1 : projects.findIndex((p) => projectKey(p) === projectKey(from));
  const has = to !== null && projects.some((p) => projectKey(p) === projectKey(to));
  if (at < 0) return uniqueNames(to === null || has ? projects : [...projects, to]);
  const swapped = projects.flatMap((p, i) => i !== at ? [p] : to === null || has ? [] : [to]);
  return uniqueNames(swapped);
}
function projectHolder(doc, entry) {
  return entry.path.length === 0 ? entry : doc.find(entry.section, entry.index, []);
}

// core/application/projects.ts
var NO_PROJECT = "No project";
function projectTreeOf(doc) {
  return doc.projectTree().withMissing(taskProjects(doc));
}
var ProjectIndex = class {
  constructor(tree) {
    this.tree = tree;
    this.byKey = new Map(tree.all().map((placed) => [projectKey(placed.node.name), placed]));
  }
  /** The project named `name` as a card shows it (`mark`); a name the tree lacks stands at its top; null for none. */
  refOf(name, mark = true) {
    if (name === null) return null;
    const placed = this.byKey.get(projectKey(name));
    if (!placed) return { name, path: [name], note: null, canOpenNote: false, mark, folder: false };
    return refOfPlaced(placed, mark);
  }
  /** Every project of the tree, in its order. */
  known() {
    return this.tree.all().map((placed) => refOfPlaced(placed, true));
  }
  placed() {
    return this.tree.all();
  }
};
function refOfPlaced(placed, mark = true) {
  const { name, note, folder } = placed.node;
  return { name, path: placed.path, note, canOpenNote: note !== null, mark, folder };
}
function bareTag(tag) {
  return tag.trim().replace(/^#/, "").toLowerCase();
}
function hasProjectTag(tags, tag) {
  const wanted = bareTag(tag);
  return wanted !== "" && tags.some((t) => bareTag(t) === wanted);
}
function projectNotesOf(notes, tag) {
  return byName(notes.filter((note) => hasProjectTag(note.tags, tag)).map(({ name, path, link }) => ({ name, path, link })));
}
function projectNotesOfTexts(notes, tag) {
  const names = /* @__PURE__ */ new Map();
  for (const note of notes) names.set(projectKey(nameOfPath(note.path)), (names.get(projectKey(nameOfPath(note.path))) ?? 0) + 1);
  const read = [...notes].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map((note) => {
    const name = nameOfPath(note.path);
    const link = (names.get(projectKey(name)) ?? 0) > 1 ? note.path.replace(/\.md$/i, "") : name;
    return { name, path: note.path, link, tags: note.tags ?? noteTags(note.text ?? "") };
  });
  return projectNotesOf(read, tag);
}
function nameOfPath(path) {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}
function byName(list) {
  return [...list].sort((a, b) => {
    const x = projectKey(a.name);
    const y = projectKey(b.name);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

// core/application/placeChoices.ts
var ENTRY_PLACES = ["inbox", "backlog", "soon", "now"];
function listChoices(places) {
  return ENTRY_PLACES.map((kind) => ({ kind, on: places.length > 0 && places.every((place) => place.kind === kind) }));
}
function placeChoices(place) {
  const date = place?.kind === "date" ? place.date : null;
  return [...listChoices(place ? [place] : []), { kind: "date", on: date !== null, date }];
}
function placeable(tasks) {
  return tasks.length > 0 && tasks.every((task) => !task.isSubtask);
}

// core/application/taskActions.ts
var shown = (offered2) => offered2 ? "shown" : "hidden";
var one = (ctx) => ctx.of.kind === "task";
var always = () => "shown";
var COLUMNS = /* @__PURE__ */ new Set(["day", "soon", "inbox", "backlog"]);
var FIRST_STEP_FROM = /* @__PURE__ */ new Set([...COLUMNS, "timeline"]);
var fromOf = (ctx) => ctx.of.kind === "task" ? ctx.of.from : null;
function offersDay(ctx, days) {
  const date = addDays(ctx.today, days);
  return ctx.items.some((item) => item.can.postpone && item.day !== date);
}
var levelOffer = (count, holders) => count === 0 ? "hidden" : holders ? "shown" : "disabled";
var ONE_TASK = "It is about one task: each picked task has its own.";
var NOT_WRITTEN = "The task isn't written yet, or a rename edits only its title and marks; Escape cancels a new task.";
var IN_THE_MENU = "In the task's menu (⋯) on the full screen.";
var IN_THE_PLACE = "The field's place button sends the task to a list or a day.";
var TASK_ACTIONS = {
  done: {
    name: "Done",
    places: {
      taskMenu: { group: "statuses", order: 0, offer: always },
      bulkMenu: { group: "statuses", order: 0, offer: always },
      field: { absent: NOT_WRITTEN },
      fullScreen: { group: "title", order: 0, offer: always }
    }
  },
  progress: {
    name: "In progress",
    places: {
      taskMenu: { group: "statuses", order: 1, offer: always },
      bulkMenu: { group: "statuses", order: 1, offer: always },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  wontDo: {
    name: "Won't do",
    places: {
      taskMenu: { group: "statuses", order: 2, offer: always, asks: one },
      bulkMenu: { group: "statuses", order: 2, offer: always },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  stop: {
    name: "Stop",
    places: {
      taskMenu: { group: "statuses", order: 3, offer: (ctx) => shown(ctx.statusTasks.every((item) => item.can.stop)), asks: one },
      bulkMenu: { absent: "Stopping a repeat ends one task's series; it is asked for one task at a time." },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  level: {
    name: "Priority",
    places: {
      taskMenu: { group: "levels", order: 0, offer: (ctx) => levelOffer(ctx.levels, ctx.items.some((item) => item.can.setPriority)) },
      bulkMenu: { group: "levels", order: 0, offer: (ctx) => levelOffer(ctx.levels, ctx.items.some((item) => item.can.setPriority)) },
      field: { group: "flag", order: 0, offer: (ctx) => shown(ctx.task && ctx.levels > 0) },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  label: {
    name: "Labels",
    places: {
      taskMenu: { group: "labels", order: 0, offer: (ctx) => levelOffer(ctx.labels, ctx.items.some((item) => item.can.setLabels)) },
      bulkMenu: { group: "labels", order: 0, offer: (ctx) => levelOffer(ctx.labels, ctx.items.some((item) => item.can.setLabels)) },
      field: { group: "flag", order: 1, offer: (ctx) => shown(ctx.task && ctx.labels > 0) },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  today: {
    name: "Today",
    places: {
      taskMenu: { group: "when", order: 0, offer: (ctx) => shown(offersDay(ctx, 0)) },
      bulkMenu: { group: "when", order: 0, offer: (ctx) => shown(offersDay(ctx, 0)) },
      field: { absent: IN_THE_PLACE },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  tomorrow: {
    name: "Tomorrow",
    places: {
      taskMenu: { group: "when", order: 1, offer: (ctx) => shown(offersDay(ctx, 1)) },
      bulkMenu: { group: "when", order: 1, offer: (ctx) => shown(offersDay(ctx, 1)) },
      field: { absent: IN_THE_PLACE },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  pickDate: {
    name: "Pick a date",
    places: {
      taskMenu: { group: "when", order: 2, offer: (ctx) => shown(ctx.items.some((item) => item.can.postpone)) },
      bulkMenu: { group: "when", order: 2, offer: (ctx) => shown(ctx.items.some((item) => item.can.postpone)) },
      field: { group: "place", order: 0, offer: (ctx) => shown(ctx.task && ctx.place) },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  repeat: {
    name: "Repeat",
    places: {
      taskMenu: { group: "when", order: 3, offer: (ctx) => shown(ctx.items.every((item) => item.repeatable)) },
      bulkMenu: { group: "when", order: 3, offer: (ctx) => shown(ctx.items.some((item) => item.repeatable)) },
      field: { group: "marks", order: 1, offer: (ctx) => shown(ctx.task && (ctx.renaming?.repeatable ?? true)) },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  reminder: {
    name: "Reminder",
    places: {
      taskMenu: { group: "when", order: 4, offer: (ctx) => shown(ctx.items.every((item) => item.can.remind)) },
      bulkMenu: { absent: "A reminder belongs to one task on a time; each is set in its own menu." },
      field: { absent: "A reminder belongs to a task on a time; it is set in the task's menu once the task is written." },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  rename: {
    name: "Rename",
    places: {
      taskMenu: { group: "edit", order: 0, offer: always },
      bulkMenu: { absent: ONE_TASK },
      field: { absent: "The field is the title itself: typing in it is the rename." },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  description: {
    name: "Notes",
    places: {
      taskMenu: { group: "edit", order: 1, offer: (ctx) => shown(ctx.items.every((item) => item.can.addDescription)) },
      bulkMenu: { absent: ONE_TASK },
      field: { group: "marks", order: 2, offer: (ctx) => shown(ctx.task) },
      fullScreen: { group: "description", order: 0, offer: always }
    }
  },
  project: {
    name: "Project",
    places: {
      taskMenu: { group: "edit", order: 2, offer: (ctx) => ctx.project.disabled ? "disabled" : "shown" },
      bulkMenu: { group: "edit", order: 2, offer: (ctx) => ctx.project.disabled ? "disabled" : "shown" },
      field: { group: "marks", order: 0, offer: (ctx) => shown(ctx.task && ctx.topLevel) },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  section: {
    name: "Section",
    places: {
      taskMenu: { group: "edit", order: 3, offer: (ctx) => shown(ctx.sections !== null) },
      bulkMenu: { group: "edit", order: 3, offer: (ctx) => shown(ctx.sections !== null) },
      field: { absent: "The field stands in the section it is typed in; a drag or the task's menu moves the task to another." },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  subtask: {
    name: "Subtask",
    places: {
      taskMenu: { group: "rows", order: 1, offer: (ctx) => shown(fromOf(ctx) !== "stack") },
      bulkMenu: { absent: ONE_TASK },
      field: { absent: "Enter, then Tab, types a subtask under the task just typed." },
      fullScreen: { group: "subtasks", order: 0, offer: always }
    }
  },
  newSection: {
    name: "New section",
    places: {
      taskMenu: { absent: "The Section page offers «New section…» for the task." },
      bulkMenu: { absent: "A new section is named for one task, from its Section page or the field." },
      field: { group: "mode", order: 0, offer: (ctx) => shown(ctx.maySection) },
      fullScreen: { absent: "The full screen shows one task's subtasks, which have no sections." }
    }
  },
  indent: {
    name: "Move in",
    places: {
      taskMenu: { absent: "A written task is moved in by dragging it onto another." },
      bulkMenu: { absent: "Picked tasks are moved by dragging them." },
      field: { group: "shifts", order: 1, offer: (ctx) => !ctx.indents ? "hidden" : ctx.canIndent ? "shown" : "disabled" },
      fullScreen: { absent: "Subtasks on the full screen are moved by dragging them." }
    }
  },
  outdent: {
    name: "Move out",
    places: {
      taskMenu: { absent: "A written task is moved out by dragging it." },
      bulkMenu: { absent: "Picked tasks are moved by dragging them." },
      field: { group: "shifts", order: 0, offer: (ctx) => !ctx.indents ? "hidden" : ctx.canOutdent ? "shown" : "disabled" },
      fullScreen: { absent: "Subtasks on the full screen are moved by dragging them." }
    }
  },
  firstStep: {
    name: "First step",
    places: {
      taskMenu: { group: "rows", order: 0, offer: (ctx) => shown(ctx.items.every((item) => item.can.firstStep) && FIRST_STEP_FROM.has(fromOf(ctx) ?? "full")) },
      bulkMenu: { absent: ONE_TASK },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: "The full screen's plus types the task's subtasks, its first step among them." }
    }
  },
  openFull: {
    name: "Open full screen",
    places: {
      taskMenu: { group: "rows", order: 2, offer: (ctx) => shown(fromOf(ctx) !== "full") },
      bulkMenu: { absent: ONE_TASK },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: "The full screen already shows the task." }
    }
  },
  openInObsidian: {
    name: "Open in Obsidian",
    places: {
      taskMenu: { group: "rows", order: 3, offer: always },
      bulkMenu: { absent: ONE_TASK },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: IN_THE_MENU }
    }
  },
  delete: {
    name: "Delete",
    places: {
      taskMenu: { group: "remove", order: 0, offer: always, asks: one },
      bulkMenu: { group: "remove", order: 0, offer: always },
      field: { absent: NOT_WRITTEN },
      fullScreen: { absent: IN_THE_MENU }
    }
  }
};
var TASK_ACTION_IDS = Object.keys(TASK_ACTIONS);
var TASK_MENU_GROUPS = ["statuses", "levels", "labels", "copy", "when", "edit", "rows", "remove"];
var FIELD_GROUPS = ["mode", "shifts", "flag", "marks", "place"];
function placementOf(id, surface) {
  return TASK_ACTIONS[id].places[surface];
}
function arrange(surface, order, ctx) {
  const offered2 = TASK_ACTION_IDS.flatMap((id) => {
    const cell = placementOf(id, surface);
    if ("absent" in cell) return [];
    const offer = cell.offer(ctx);
    if (offer === "hidden") return [];
    return [{ id, group: cell.group, order: cell.order, disabled: offer === "disabled", asks: cell.asks?.(ctx) ?? false }];
  });
  return order.flatMap((group) => {
    const actions = offered2.filter((action) => action.group === group).sort((a, b) => a.order - b.order).map(({ id, disabled, asks }) => ({ id, disabled, asks }));
    return actions.length > 0 ? [{ group, actions }] : [];
  });
}
function menuActions(ctx) {
  return arrange(ctx.of.kind === "task" ? "taskMenu" : "bulkMenu", TASK_MENU_GROUPS, ctx);
}
function fieldActions(ctx) {
  return arrange("field", FIELD_GROUPS, ctx);
}
function statusOf2(id, progress) {
  const statuses = { done: "done", progress, wontDo: "wontDo", stop: "stop" };
  return statuses[id] ?? null;
}

// core/application/sections.ts
function rowsOf(items, level = 0) {
  return items.flatMap((item) => [{ item, level }, ...item.collapsed ? [] : rowsOf(item.subtasks, level + 1)]);
}
var NO_SECTION_ID = "none";
function sectionId(name, sections) {
  if (name === null) return NO_SECTION_ID;
  return sections.find((s) => s.name === name)?.id ?? `section:${name}`;
}
function groupOf(name, items, header = true, id = sectionId(name, [])) {
  const section = name !== null;
  return { id, name, items, rows: rowsOf(items), empty: section && items.length === 0, menu: section ? { section: name, rename: true, remove: true } : null, header, reorder: header };
}
function listView(items, sections, listSections = []) {
  if (!sections) return { showsHeaders: false, groups: [groupOf(null, items, false)] };
  const groups = withEmptySections(byGroup(items, listSections), listSections);
  const showsHeaders = groups.some((g) => g.name !== null);
  return { showsHeaders, groups: groups.map((g) => ({ ...g, header: showsHeaders, reorder: showsHeaders })) };
}
function byGroup(items, sections) {
  const groups = [];
  for (const item of items) {
    const group = groups.find((g) => g.name === item.group);
    if (group) group.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups.map((g) => groupOf(g.name, g.items, true, sectionId(g.name, sections)));
}
function withEmptySections(groups, sections) {
  const drawn = [...groups];
  sections.forEach((section, i) => {
    if (!section.empty || drawn.some((g) => g.name === section.name)) return;
    const above = new Set(sections.slice(0, i).map((s) => s.name));
    let at = 0;
    drawn.forEach((g, j) => {
      if (above.has(g.name)) at = j + 1;
    });
    drawn.splice(at, 0, groupOf(section.name, [], true, section.id));
  });
  return drawn;
}
function shownSections(groups, sections) {
  const shown3 = groups.reduce((all2, name) => all2.some((g) => g.name === name) ? all2 : [...all2, groupOf(name, [])], []);
  return withEmptySections(shown3, sections).map((g) => g.name);
}
function offeredNames(groups, presets, ungrouped) {
  const names = [...groups.flatMap((group) => group === null ? [] : [group]), ...presets.map((preset) => preset.trim())];
  return [...new Set(names)].filter((name) => name !== "" && name !== ungrouped);
}
function sectionChoice(tasks, offer) {
  const first = tasks[0];
  const list = first?.list;
  if (!first || list === "done" || tasks.some((task) => task.isSubtask || task.list !== list)) return null;
  return { names: offer.lists[list], current: first.group, ungrouped: offer.ungrouped };
}

// core/application/taskKeys.ts
function keyOf(entry) {
  return { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw, id: entry.id };
}
function samePlace(a, b) {
  return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
}
function sameLine(a, b) {
  return a.raw === b.raw;
}
function sameTaskTree(a, b) {
  return a.section === b.section && a.index === b.index;
}
function keyId(key) {
  return `${key.section}:${key.index}:${key.path.join(".")}:${key.raw}`;
}
function isUnder(a, b) {
  return a.section === b.section && a.index === b.index && b.path.length < a.path.length && b.path.every((i, k) => a.path[k] === i);
}

// core/application/menus.ts
function priorityHolders(items) {
  return items.filter((item) => item.can.setPriority);
}
function labelHolders(items) {
  return items.filter((item) => item.can.setLabels);
}
function levelOn(items, prefix) {
  const holders = priorityHolders(items);
  return holders.length > 0 && holders.every((item) => item.priority?.prefix === prefix);
}
function toggledPriority(items, prefix) {
  return levelOn(items, prefix) ? null : prefix;
}
function labelOn(items, name) {
  const holders = labelHolders(items);
  return holders.length > 0 && holders.every((item) => item.labels.some((label) => label.name === name));
}
function toggledLabels(items, name) {
  const on = labelOn(items, name);
  return items.map((item) => {
    const names = item.labels.map((label) => label.name);
    if (!item.can.setLabels) return names;
    if (on) return names.filter((n) => n !== name);
    return names.includes(name) ? names : [...names, name];
  });
}
var MOVE_ORDER = ["today", "tomorrow", "pick"];
function quickMoves(item, today) {
  if (!item.can.postpone) return [];
  const moves = [
    { id: "today", date: today },
    { id: "tomorrow", date: addDays(today, 1) },
    { id: "pick", date: null }
  ];
  return moves.filter((move) => move.date === null || move.date !== item.day);
}
function sharedMoves(items, today) {
  const offered2 = items.flatMap((item) => quickMoves(item, today));
  return MOVE_ORDER.flatMap((id) => offered2.find((move) => move.id === id) ?? []);
}
function sharedDueDate(items) {
  const first = items[0]?.dueDate ?? null;
  return items.every((item) => item.dueDate === first) ? first : null;
}
var A_LIST_CARD = { kind: "task", from: "day" };
var COLUMNS2 = /* @__PURE__ */ new Set(["day", "soon", "inbox", "backlog"]);
var LIST_CARD_MENU = { now: "day", soon: "soon", inbox: "inbox", backlog: "backlog", done: "done" };
function listCardMenuFrom(item) {
  return LIST_CARD_MENU[item.list];
}
function canPick(from) {
  return COLUMNS2.has(from);
}
function menuOffer(froms, screen, columnSections) {
  const shown3 = froms.every((from) => COLUMNS2.has(from) && columnSections(from, screen.day) !== null);
  return shown3 ? screen.offer : null;
}
function tileStatus(id) {
  const statuses = { done: "done", inProgress: "inProgress", stopProgress: "todo", wontDo: "cancelled", stop: null };
  return statuses[id];
}
function statusTask(item, from) {
  if (from === "timeline") return item.block.step ?? item;
  return COLUMNS2.has(from) ? item.card.step ?? item : item;
}
function statusTasks(items, of, froms) {
  return items.map((item, i) => statusTask(item, of.kind === "task" ? of.from : froms[i] ?? "full"));
}
var OLD_EDITS = ["rename", "reminder", "description", "repeat", "section", "project", "subtask", "firstStep"];
var OLD_OPENS = ["openFull", "openInObsidian"];
function progressOf(items) {
  return nextProgress(items.map((item) => item.status)) === "todo" ? "stopProgress" : "inProgress";
}
function menuLayout(ctx, statusFor, moves) {
  const progress = progressOf(statusFor);
  const dayOf2 = (id) => moves.find((move) => move.id === id)?.date ?? (id === "today" ? ctx.today : id === "tomorrow" ? addDays(ctx.today, 1) : null);
  const groups = menuActions(ctx).map(({ group, actions }) => ({ group, actions: actions.map((action) => ({ ...action, status: statusOf2(action.id, progress), date: dayOf2(action.id) })) }));
  if (ctx.of.kind === "bulk") return groups;
  const copyAt = TASK_MENU_GROUPS.indexOf("copy");
  const before = groups.filter((g) => TASK_MENU_GROUPS.indexOf(g.group) < copyAt);
  return [...before, { group: "copy", actions: [] }, ...groups.slice(before.length)];
}
function offeredIds(layout) {
  return new Set(layout.flatMap((group) => group.actions.map((action) => action.id)));
}
function menuStatuses(layout) {
  return layout.flatMap((group) => group.actions.flatMap((action) => action.status ? [{ id: action.status, confirm: action.asks }] : []));
}
function menuSections(items, offer, of) {
  const choice = offer ? sectionChoice(items, offer) : null;
  if (!choice) return null;
  const shared = items.every((item) => item.group === choice.current);
  const names = [...choice.names, null];
  return { choice, options: names.map((name) => ({ name, checked: shared && name === choice.current })), create: of.kind === "task" };
}
function menuProject(items, known) {
  return projectPage(
    items.map((item) => item.projects),
    known,
    items.every((item) => !item.can.setProject)
  );
}
var NEW_PROJECT = "New project…";
function projectPage(chosen, known, disabled = false) {
  const key = (ref) => projectKey(ref.name);
  const options = [...known];
  for (const refs of chosen) for (const ref of refs) if (!options.some((option) => key(option.project) === key(ref))) options.push({ project: { ...ref, mark: true }, depth: 0 });
  const all2 = (ref) => chosen.length > 0 && chosen.every((refs) => refs.some((r) => key(r) === key(ref)));
  const first = chosen[0] ?? [];
  const same2 = chosen.every((refs) => refs.length === first.length && refs.every((ref, i) => key(ref) === key(first[i])));
  const none2 = chosen.every((refs) => refs.length === 0);
  const shared = first.find(all2) ?? null;
  return {
    value: none2 ? NO_PROJECT : same2 ? first.length === 1 ? first[0].name : `${first[0].name} +${first.length - 1}` : "",
    current: shared,
    options: options.map(({ project, depth }) => {
      const checked = all2(project);
      return { project, depth, checked, disabled: project.folder && !checked };
    }),
    none: none2,
    noneLabel: NO_PROJECT,
    disabled,
    newLabel: NEW_PROJECT
  };
}
var MENU_GROUPS = ["statuses", "levels", "labels", "moves", "edits", "opens", "remove"];
function sharedRule(items) {
  const first = items[0]?.repeat ?? null;
  return items.every((item) => sameRule(item.repeat, first)) ? first : null;
}
function repeatOf(items, today) {
  const holder = items.find((item) => item.repeatable) ?? items[0];
  return { repeat: sharedRule(items), repeatDay: holder?.repeatDay ?? today };
}
function taskMenu(items, today, levels, labels, offer, of = A_LIST_CARD, projects = [], froms = [], placements = []) {
  const sections = menuSections(items, offer, of);
  const statusFor = statusTasks(items, of, froms);
  const project = menuProject(items, projects);
  const moves = sharedMoves(items, today);
  const ctx = { items, statusTasks: statusFor, of, today, sections, project, levels: levels.length, labels: labels.length };
  const layout = menuLayout(ctx, statusFor, moves);
  const offered2 = offeredIds(layout);
  const edits = OLD_EDITS.filter((id) => offered2.has(id));
  return {
    layout,
    groups: MENU_GROUPS,
    opens: OLD_OPENS.filter((id) => offered2.has(id)),
    places: placeable(items) && offered2.has("pickDate") ? listChoices(placements) : [],
    repeatOf: repeatOf(items, today),
    statuses: menuStatuses(layout),
    statusTasks: statusFor,
    peek: of.kind === "task" && statusFor[0]?.description != null ? statusFor[0] : null,
    levels: { tiles: levels.map((level) => ({ level, on: levelOn(items, level.prefix) })), disabled: priorityHolders(items).length === 0 },
    labels: { tiles: labels.map((label) => ({ label, on: labelOn(items, label.name) })), disabled: labelHolders(items).length === 0 },
    moves,
    removeDue: items.some((item) => item.can.removeDue),
    dueDate: sharedDueDate(items),
    sections,
    project,
    edits,
    reminders: edits.includes("reminder") ? REMINDER_KINDS.map((kind) => ({ kind, checked: kind === items[0].reminder })) : [],
    repeat: repeatRow(sharedRule(items)),
    remove: offered2.has("delete") ? { confirm: layout.some((g) => g.actions.some((a) => a.id === "delete" && a.asks)) } : null
  };
}
function oneTaskMenu(item, today, levels, labels, offer, from, projects = [], placement) {
  return taskMenu([item], today, levels, labels, offer, { kind: "task", from }, projects, [], placement ? [placement] : []);
}
function bulkMenuOf(items, today, levels, labels, offer, projects = [], froms = [], placements = []) {
  return taskMenu(items, today, levels, labels, offer, { kind: "bulk" }, projects, froms, placements);
}
function carriedWith(lifted2, picked2) {
  const id = keyId(lifted2);
  return picked2.filter((key) => keyId(key) !== id && !picked2.some((other) => other !== key && isUnder(key, other)));
}

// core/application/assistant/tasks.ts
var TaskLookup = class {
  constructor(listed2) {
    this.byId = /* @__PURE__ */ new Map();
    this.parents = /* @__PURE__ */ new Map();
    const add = (item) => {
      this.byId.set(item.id, item);
      for (const sub of item.allSubtasks) {
        this.parents.set(sub.id, item);
        add(sub);
      }
    };
    for (const items of Object.values(listed2.lists)) items.forEach(add);
  }
  /** Every task, closed ones and subtasks at every depth too. */
  all() {
    return [...this.byId.values()];
  }
  find(id) {
    return this.byId.get(id) ?? null;
  }
  /** The tasks above this one, the top one first; empty for a task. */
  above(id) {
    const chain = [];
    for (let parent = this.parents.get(id); parent; parent = this.parents.get(parent.id)) chain.unshift(parent);
    return chain;
  }
};
function drawnAnswer(chosen, tasks) {
  const above = tasks.above(chosen.id);
  const folded2 = above.find((item) => item.collapsed);
  if (folded2 && folded2.card.step?.id === chosen.id) return { task: folded2, card: folded2.card };
  const over = above.length > 0 ? above[above.length - 1].title : null;
  return { task: chosen, card: { text: chosen.text, title: chosen.title, over, step: null } };
}

// core/application/assistant/options/labelChoices.ts
function labelChoices(settings) {
  return [{ value: null, title: "None" }, ...usableLabels(settings.labels).map((label) => ({ value: label.name, title: labelTitle(label.name) }))];
}

// core/application/assistant/options/answerLabel.ts
var REFUSED = "Couldn't add the label {name} to this task.";
var FAILED = "Couldn't move the label {name}.";
function carries(task, name) {
  return task?.labels.some((label) => label.name === name) ?? false;
}
var answerLabel = {
  key: "label",
  label: "Label",
  choices: labelChoices,
  afterAnswer: {
    async run(name, { task, listed: listed2 }, tasks) {
      const refused = REFUSED.replace("{name}", labelTitle(name));
      const today = listed2.today;
      const menu = tasks.menu(task, listCardMenuFrom(task), { today, day: today, offer: await tasks.sectionOffer(today) });
      const tile = menu.labels.tiles.find((each) => each.label.name === name);
      if (!menu.groups.includes("labels") || menu.labels.disabled || !tile) return refused;
      if (!tile.on) {
        const [marked] = await tasks.toggleLabel([task.key], name);
        if (!carries(marked, name)) return refused;
      }
      const others = new TaskLookup(await tasks.listed()).all().filter((each) => each.id !== task.id && carries(each, name));
      if (others.length > 0) await tasks.toggleLabel(others.map((each) => each.key), name);
      return null;
    },
    failedWords: (name) => FAILED.replace("{name}", labelTitle(name))
  }
};

// core/application/assistant/options/skipLabel.ts
var ALL_KEPT = "Every task in Today and Soon is marked {name}.";
var skipLabel = {
  key: "skip",
  label: "Skip label",
  choices: labelChoices,
  keepsBack: {
    keeps: (name, task) => task.labels.some((label) => label.name === name),
    allKeptWords: (name) => ALL_KEPT.replace("{name}", labelTitle(name))
  }
};

// core/application/assistant/outcomes.ts
var STOPPED = { kind: "stopped" };
var GONE_WORDS = "That task was closed while {model} was thinking.";
var NO_MODEL_WORDS = "No model is set for the assistant. Choose one in Settings → Assistant.";
var PAGE_WORDS = {
  model: "Model",
  timeout: "Timeout",
  timeoutNote: "Seconds to wait for an answer.",
  prompts: "Prompts",
  promptsNote: "What each button asks. The shape of the answer is the plugin's own.",
  reset: "Reset to default"
};
var CONTEXT_WORDS = {
  placeholder: "What did Claude miss?",
  save: "Save",
  saveAndAsk: "Save and ask again",
  failed: "Couldn't save to this task."
};
function durationWords(seconds) {
  if (seconds % 60 === 0) return seconds === 60 ? "1 minute" : `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}
function failureWords(profile, kind, timeoutSeconds) {
  return profile.words[kind].replace("{timeout}", durationWords(timeoutSeconds));
}
function goneWords(profile) {
  return GONE_WORDS.replace("{model}", profile.name);
}
function failed(action, words, detail) {
  return { kind: "failed", title: action.failureTitle, words, detail };
}

// core/application/assistant/actions/bestTask.ts
var bestTask = {
  id: "bestTask",
  places: ["more"],
  labels: { idle: "Best task", running: "Stop" },
  icon: "sparkles",
  title: "Best task",
  failureTitle: "Couldn't find the best task",
  scope: { kind: "columns", columns: ["today", "soon"] },
  briefing: "candidates",
  defaultPrompt: "You help me choose the one task that matters most. Below is each thing I could start now: a task, or the next step of a bigger task, with the goals above it and, for a step, the steps after it. Pick the one whose doing would change my life the most: what becomes different for me — my relationships, health, money, work, home, freedom — once it is done. Judge by meaning, not by how the task sounds: a step is not more important because it is big, concrete, ends in a finished product or sounds responsible; a short task can matter more than a long one. Count only what this step itself gives: its goals show what it is for, but what the goals or the steps after it would give is not done by it. A due date is urgency, not impact. Don't invent what a task is for; judge by what is written. A description line that starts with «Контекст:» is context I added myself, often after an assistant misjudged that task: take it as true and weigh the task with it; it doesn't rule the task out. Answer with its ref, and in two or three short sentences in the language of my tasks, say what changes in my life when this one is done; don't speak about the other tasks.",
  answerSchema: {
    type: "object",
    properties: { taskRef: { type: "string" }, reason: { type: "string" } },
    required: ["taskRef", "reason"],
    additionalProperties: false
  },
  emptyWords: "Today and Soon have no open tasks.",
  options: [answerLabel, skipLabel],
  context: CONTEXT_WORDS,
  read(answer2, briefing, tasks) {
    const { taskRef, reason } = answer2 ?? {};
    if (typeof taskRef !== "string" || typeof reason !== "string" || !isCandidate(briefing, taskRef)) return { kind: "failed", why: "badAnswer" };
    const task = tasks.find(briefing.refs[taskRef]);
    if (!task?.open) return { kind: "failed", why: "gone" };
    return { kind: "task", taskId: task.id, note: reason };
  }
};
function isCandidate(briefing, ref) {
  return Object.prototype.hasOwnProperty.call(briefing.refs, ref);
}

// core/application/assistant/actions/index.ts
var ASSISTANT_ACTIONS = [bestTask];

// core/application/assistant/briefing.ts
var NONE_KEPT = () => false;
var LIST_WORDS = { now: "today", soon: "soon", inbox: "inbox", backlog: "backlog", done: "done" };
function candidatesOf(tasks, kept = NONE_KEPT) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (candidate) => {
    if (seen.has(candidate.item.id)) return;
    seen.add(candidate.item.id);
    found.push(candidate);
  };
  const walk = (item, top, goals) => {
    if (!item.open || kept(item)) return;
    const step = item.collapsed ? item.card.step : null;
    if (step) {
      const candidate = stepOf(item, step, top, goals);
      if (!kept(step) && !candidate.goals.some(kept)) add(candidate);
    } else if (item.subtasks.length === 0) add({ item, top, goals, after: [] });
    else for (const sub of item.subtasks) walk(sub, top, [...goals, item]);
  };
  for (const item of tasks) walk(item, item, []);
  return found;
}
function stepOf(folded2, step, top, goals) {
  const flat = [];
  const flatten2 = (item, above) => {
    flat.push({ item, above });
    for (const sub of item.subtasks) flatten2(sub, [...above, item]);
  };
  for (const sub of folded2.subtasks) flatten2(sub, [folded2]);
  const at = flat.findIndex((entry) => entry.item.id === step.id);
  return { item: step, top, goals: [...goals, ...flat[at].above], after: flat.slice(at + 1).map((entry) => entry.item) };
}
function briefingOf(kind, today, tasks, kept = NONE_KEPT) {
  return kind === "candidates" ? candidatesBriefing(today, tasks, kept) : tasksBriefing(today, tasks, kept);
}
function tasksBriefing(today, tasks, kept) {
  const briefed = [];
  const refs = {};
  const seen = /* @__PURE__ */ new Set();
  const add = (item, top, parent) => {
    if (!item.open || kept(item) || seen.has(item.id)) return;
    seen.add(item.id);
    const ref = `t${briefed.length + 1}`;
    refs[ref] = item.id;
    const { title, description, ...marks } = briefedGoal(item, today);
    briefed.push({ ref, title, list: LIST_WORDS[top.list], inProgress: item.status === "inProgress", ...marks, description, parent });
    for (const sub of item.subtasks) add(sub, top, ref);
  };
  for (const item of tasks) add(item, item, null);
  return { input: JSON.stringify({ today, tasks: briefed }), refs };
}
function candidatesBriefing(today, tasks, kept) {
  const refs = {};
  const candidates = candidatesOf(tasks, kept).map((candidate, index) => {
    const ref = `t${index + 1}`;
    refs[ref] = candidate.item.id;
    const { title, description, ...marks } = briefedGoal(candidate.item, today);
    return {
      ref,
      title,
      list: LIST_WORDS[candidate.top.list],
      inProgress: candidate.item.status === "inProgress",
      ...marks,
      description,
      goals: candidate.goals.map((goal) => briefedGoal(goal, today)),
      after: candidate.after.map((item) => ({ title: item.title, description: item.description }))
    };
  });
  return { input: JSON.stringify({ today, candidates }), refs };
}
function isEmptyBriefing(briefing) {
  return Object.keys(briefing.refs).length === 0;
}
function briefedGoal(item, today) {
  return {
    title: item.title,
    description: item.description,
    priority: item.priority?.prefix ?? null,
    due: item.dueDate,
    time: item.slot ? `${item.slot.date === today ? "" : `${item.slot.date}T`}${minutesToHHMM(item.slot.start)}` : null,
    projects: item.projects.map((project) => project.path.join(" → ")),
    labels: item.labels.map((label) => labelTitle(label.name))
  };
}

// core/application/assistant/ModelChoice.ts
var ModelChoice = class {
  constructor(profiles, host, settings) {
    this.profiles = profiles;
    this.host = host;
    this.settings = settings;
  }
  /** The profiles whose model this host serves, in the profiles' order. */
  available() {
    return this.profiles.filter((profile) => this.host.ids.includes(profile.id));
  }
  /** The profile the settings name; null for an id no profile has. */
  named() {
    return this.profileOf(this.settings().model);
  }
  /** The profile the settings name, if this host serves it; else null. */
  chosen() {
    const named = this.named();
    return named && this.host.ids.includes(named.id) ? named : null;
  }
  profileOf(id) {
    return this.profiles.find((profile) => profile.id === id) ?? null;
  }
  /** How this host asks the model; undefined where the host asks it itself, or doesn't serve it. */
  loader(id) {
    return this.host.ids.includes(id) ? this.host.transport?.(id) : void 0;
  }
  /** A model's settings: each field's value saved, a blank one or none its default; keys no field has kept as saved. */
  settingsOf(profile) {
    const saved = this.settings().models[profile.id] ?? {};
    return { ...saved, ...Object.fromEntries(profile.fields.map((field) => [field.key, valueOf(field, saved)])) };
  }
};
function valueOf(field, saved) {
  const value = saved[field.key];
  return value !== void 0 && value.trim() !== "" ? value : field.default;
}

// core/application/assistant/model.ts
var NO_MODELS = { ids: [] };
var StopSwitch = class {
  constructor() {
    this.reason = null;
    this.listeners = /* @__PURE__ */ new Set();
  }
  get stopped() {
    return this.reason;
  }
  onStop(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** The first stop counts; a later one changes nothing. */
  stop(reason) {
    if (this.reason !== null) return;
    this.reason = reason;
    for (const fn of [...this.listeners]) fn(reason);
  }
};

// core/application/assistant/models/claude.ts
var claudeProfile = {
  id: "claude",
  name: "Claude",
  fields: [
    { key: "model", label: "Model", kind: "choice", choices: ["sonnet", "opus", "haiku"], default: "sonnet" },
    { key: "path", label: "Path to claude", kind: "text", default: "", note: "Empty: found by itself" }
  ],
  words: {
    notInstalled: "Claude Code isn't installed. Install it, or set the path to `claude` in Settings → Assistant.",
    signedOut: "Claude Code isn't signed in. Run `claude` in Terminal and log in.",
    noAccess: "Claude refused: your subscription or account has no access now. Check it at claude.ai.",
    limit: "Claude's usage limit is reached. Try again when it resets.",
    busy: "Claude is overloaded. Try again in a minute.",
    offline: "Can't reach Claude. Check the network or the VPN.",
    badModel: "Claude doesn't know the model set in Settings → Assistant.",
    timeout: "Claude didn't answer in {timeout}.",
    badAnswer: "Claude's answer didn't name one of the tasks. Try again.",
    unknown: "Claude failed. The details are in the console."
  },
  unavailable: "Claude works in Obsidian on the Mac."
};

// core/application/assistant/models/index.ts
var MODEL_PROFILES = [claudeProfile];

// core/application/assistant/options/option.ts
function optionValue(option, saved, settings) {
  if (saved === void 0) return null;
  return option.choices(settings).some((choice) => choice.value === saved) ? saved : null;
}

// core/application/assistant/scope.ts
var OPEN_LISTS = ["now", "soon", "inbox", "backlog"];
function tasksIn(scope, target, listed2) {
  const open = (lists) => lists.flatMap((list) => listed2.lists[list].filter((item) => item.open));
  switch (scope.kind) {
    case "columns":
      return scope.columns.flatMap((column) => listed2.columns[column].filter((item) => item.open));
    case "all":
      return open(OPEN_LISTS);
    case "project":
      return open(OPEN_LISTS).filter((item) => item.projects.some((project) => project.path.includes(target.projectId ?? "")));
    case "target":
      return targeted(open(OPEN_LISTS), target.taskIds ?? []);
  }
}
function targeted(items, ids) {
  const wanted = new Set(ids);
  const found = [];
  const walk = (item) => {
    if (wanted.has(item.id)) found.push(item);
    else item.subtasks.forEach(walk);
  };
  items.forEach(walk);
  return found;
}

// core/application/assistant/AssistantServiceImpl.ts
var TIMEOUT_GRACE_MS = 5e3;
var MORE = { place: "more" };
var AssistantServiceImpl = class {
  constructor(deps) {
    this.runs = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.unsubscribeSettings = null;
    this.tasks = deps.tasks;
    this.steps = deps.steps ?? { together: (work) => work() };
    this.settings = deps.settings;
    this.timers = deps.timers;
    this.actions = deps.actions ?? ASSISTANT_ACTIONS;
    this.choice = new ModelChoice(deps.profiles ?? MODEL_PROFILES, deps.models ?? NO_MODELS, () => this.assistant());
  }
  get busy() {
    return this.runs.size > 0;
  }
  offers(place, target = { place }) {
    if (this.choice.chosen() === null) return [];
    return this.actions.filter((action) => action.places.includes(place)).map((action) => {
      const running = this.runs.has(runKey(action.id, target));
      return { actionId: action.id, label: running ? action.labels.running : action.labels.idle, icon: action.icon, running };
    });
  }
  press(actionId, target = MORE) {
    const action = this.actions.find((each) => each.id === actionId);
    if (!action) return Promise.reject(new Error(`No assistant action "${actionId}".`));
    const key = runKey(action.id, target);
    return this.runs.get(key)?.outcome ?? this.start(action, target, key);
  }
  stop(actionId, target = MORE) {
    this.runs.get(runKey(this.actionOf(actionId).id, target))?.stop.stop("user");
  }
  stopAll() {
    for (const run of [...this.runs.values()]) run.stop.stop("user");
  }
  onChange(listener) {
    this.listeners.add(listener);
    this.unsubscribeSettings ??= this.settings.onChange(() => this.emit());
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.unsubscribeSettings?.();
      this.unsubscribeSettings = null;
    };
  }
  async page() {
    const settings = this.assistant();
    const named = this.choice.named();
    const chosen = this.choice.chosen();
    const available = this.choice.available().map((profile) => ({ id: profile.id, name: profile.name, available: true }));
    const unserved = chosen ? [] : [{ id: settings.model, name: named?.name ?? settings.model, available: false }];
    return {
      models: [...available, ...unserved],
      chosen: settings.model,
      unavailable: chosen ? null : named?.unavailable ?? NO_MODEL_WORDS,
      fields: chosen ? await this.fieldsOf(chosen) : [],
      timeoutSeconds: settings.timeoutSeconds,
      words: PAGE_WORDS,
      prompts: this.actions.map((action) => {
        const saved = settings.prompts[action.id];
        const isDefault = saved === void 0 || saved.trim() === "";
        return { actionId: action.id, title: action.title, prompt: isDefault ? action.defaultPrompt : saved, isDefault, options: this.optionRows(action) };
      })
    };
  }
  async set(change) {
    const settings = this.assistant();
    await this.settings.update({ assistant: changed(settings, change) });
  }
  async prepare(actionId, target = MORE) {
    const action = this.actionOf(actionId);
    const profile = this.choice.chosen();
    if (profile === null) return failed(action, this.choice.named()?.unavailable ?? NO_MODEL_WORDS, `model "${this.assistant().model}" is not served here`);
    const listed2 = await this.tasks.listed();
    const tasks = tasksIn(action.scope, target, listed2);
    const keepers = this.keepers(action);
    const briefing = briefingOf(action.briefing, listed2.today, tasks, (task) => keepers.some((keeper) => keeper.keeps(task)));
    if (isEmptyBriefing(briefing)) {
      const keptAll = keepers.length > 0 && !isEmptyBriefing(briefingOf(action.briefing, listed2.today, tasks));
      return keptAll ? failed(action, keepers[0].allKeptWords, "every open task is kept back") : failed(action, action.emptyWords, "no open tasks to send");
    }
    return {
      kind: "question",
      actionId: action.id,
      modelId: profile.id,
      target,
      question: { instructions: this.promptOf(action), input: briefing.input, answerSchema: action.answerSchema },
      refs: briefing.refs
    };
  }
  finish(prepared, reply) {
    return this.finished(prepared, reply, null);
  }
  /**
   * The reply read; `run`, a run's: stopped before the options' part, the run ends as stopped or timed out, nothing marked.
   * Once that part has begun (`run.marking()`), a Stop or the timeout is too late: it runs to the end, the run ends with the answer.
   */
  async finished(prepared, reply, run) {
    const action = this.actionOf(prepared.actionId);
    const profile = this.choice.profileOf(prepared.modelId);
    if (profile === null) return failed(action, NO_MODEL_WORDS, `model "${prepared.modelId}" has no profile`);
    if (!reply.ok) {
      const { kind, detail } = reply.failure;
      return kind === "stopped" ? STOPPED : failed(action, failureWords(profile, kind, this.assistant().timeoutSeconds), detail);
    }
    const listed2 = await this.tasks.listed();
    const tasks = new TaskLookup(listed2);
    const result = action.read(reply.answer, { input: prepared.question.input, refs: prepared.refs }, tasks);
    if (result.kind === "task") {
      if (run?.stop.stopped) return this.finished(prepared, stoppedReply(run.stop.stopped), null);
      run?.marking();
      return this.answered(action, result.taskId, result.note, listed2);
    }
    const answer2 = `answer: ${JSON.stringify(reply.answer)}`;
    if (result.why === "gone") return failed(action, goneWords(profile), `the task named is closed or gone; ${answer2}`);
    return failed(action, failureWords(profile, "badAnswer", this.assistant().timeoutSeconds), `the answer names no task sent; ${answer2}`);
  }
  /**
   * A `task` answer: the action's options do their part on the card it is drawn on, all their writes one step to take back,
   * then it is drawn as the tasks then stand (as it stood, if it is gone by then). An option whose write failed leaves its
   * words under the card and its error in `detail`; the answer stays.
   */
  async answered(action, taskId, note, listed2) {
    const before = new TaskLookup(listed2);
    const drawn = drawnAnswer(before.find(taskId), before);
    const notices = [];
    const errors = [];
    const marked = await this.steps.together(async () => {
      let wrote = false;
      for (const option of action.options ?? []) {
        const value = this.valueOf(action, option);
        if (value === null || !option.afterAnswer) continue;
        wrote = true;
        try {
          const notice = await option.afterAnswer.run(value, { task: drawn.task, listed: listed2 }, this.tasks);
          if (notice !== null) notices.push(notice);
        } catch (error) {
          notices.push(option.afterAnswer.failedWords(value));
          errors.push(`${option.key}: ${String(error)}`);
        }
      }
      return wrote;
    });
    const now = marked ? new TaskLookup(await this.tasks.listed()) : before;
    const chosen = now.find(taskId);
    return {
      kind: "task",
      title: action.title,
      ...chosen ? drawnAnswer(chosen, now) : drawn,
      note,
      notice: notices.length > 0 ? notices.join("\n") : null,
      detail: errors.length > 0 ? errors.join("\n") : null,
      context: action.context ? { taskId, words: action.context } : null
    };
  }
  async addContext(taskId, text) {
    if (contextLine(text) === null) return { ok: true };
    const fail = (detail) => ({ ok: false, words: CONTEXT_WORDS.failed, detail });
    try {
      const task = new TaskLookup(await this.tasks.listed()).find(taskId);
      if (task === null) return fail(`no task "${taskId}": it was removed`);
      if (!task.open) return fail(`the task "${task.title}" is closed`);
      await this.tasks.addContext(task.key, text);
      return { ok: true };
    } catch (error) {
      return fail(String(error));
    }
  }
  /** The action's options that keep tasks from the model now, each with its value set. */
  keepers(action) {
    return (action.options ?? []).flatMap((option) => {
      const value = this.valueOf(action, option);
      if (value === null || !option.keepsBack) return [];
      const { keepsBack } = option;
      return [{ keeps: (task) => keepsBack.keeps(value, task), allKeptWords: keepsBack.allKeptWords(value) }];
    });
  }
  valueOf(action, option) {
    return optionValue(option, this.assistant().options[action.id]?.[option.key], this.settings.get());
  }
  optionRows(action) {
    const settings = this.settings.get();
    return (action.options ?? []).map((option) => ({
      key: option.key,
      label: option.label,
      choices: option.choices(settings),
      value: optionValue(option, settings.assistant.options[action.id]?.[option.key], settings)
    }));
  }
  /** A run: under way from now (the spinner), stopped by the timeout or by Max, ended once, whichever comes first. */
  start(action, target, key) {
    const stop2 = new StopSwitch();
    const timeoutMs = this.assistant().timeoutSeconds * 1e3;
    let grace = null;
    let settle;
    const outcome = new Promise((resolve) => settle = resolve);
    let ended = false;
    let marking = false;
    const end = (result) => {
      if (ended) return;
      ended = true;
      this.timers.clear(timer);
      if (grace !== null) this.timers.clear(grace);
      this.runs.delete(key);
      this.emit();
      settle(result);
    };
    const timer = this.timers.set(() => {
      stop2.stop("timeout");
      grace = this.timers.set(() => {
        if (!marking) end(this.timedOut(action));
      }, TIMEOUT_GRACE_MS);
    }, timeoutMs);
    stop2.onStop((reason) => {
      if (reason === "user" && !marking) end(STOPPED);
    });
    this.runs.set(key, { stop: stop2, outcome });
    this.emit();
    const gate = { stop: stop2, marking: () => marking = true };
    this.work(action, target, gate).then(end, (error) => end(failed(action, this.unknownWords(), `the run failed: ${String(error)}`)));
    return outcome;
  }
  async work(action, target, gate) {
    const { stop: stop2 } = gate;
    const prepared = await this.prepare(action.id, target);
    if (prepared.kind !== "question") return prepared;
    if (stop2.stopped !== null) return this.finish(prepared, stoppedReply(stop2.stopped));
    const profile = this.choice.profileOf(prepared.modelId);
    const loader = this.choice.loader(profile.id);
    if (!loader) return failed(action, profile.unavailable, `no transport for model "${profile.id}" on this host`);
    const transport = await loader();
    if (stop2.stopped !== null) return this.finish(prepared, stoppedReply(stop2.stopped));
    const reply = await transport.ask(prepared.question, this.choice.settingsOf(profile), stop2);
    return this.finished(prepared, stop2.stopped === "timeout" && !reply.ok && reply.failure.kind === "stopped" ? stoppedReply("timeout") : reply, gate);
  }
  timedOut(action) {
    const profile = this.choice.chosen() ?? this.choice.named();
    const words = profile ? failureWords(profile, "timeout", this.assistant().timeoutSeconds) : NO_MODEL_WORDS;
    return failed(action, words, "no reply after the timeout stopped the run");
  }
  unknownWords() {
    const profile = this.choice.chosen() ?? this.choice.named();
    return profile ? failureWords(profile, "unknown", this.assistant().timeoutSeconds) : NO_MODEL_WORDS;
  }
  async fieldsOf(profile) {
    const settings = this.choice.settingsOf(profile);
    const loader = this.choice.loader(profile.id);
    const transport = loader ? await loader().catch(() => null) : null;
    const hintOf = async (field) => transport?.hint ? transport.hint(field.key, settings).catch(() => null) : null;
    return Promise.all(
      profile.fields.map(async (field) => ({
        key: field.key,
        label: field.label,
        kind: field.kind,
        choices: field.choices ?? [],
        value: settings[field.key],
        note: field.note ?? null,
        hint: await hintOf(field)
      }))
    );
  }
  promptOf(action) {
    const saved = this.assistant().prompts[action.id];
    return saved !== void 0 && saved.trim() !== "" ? saved : action.defaultPrompt;
  }
  actionOf(id) {
    const action = this.actions.find((a) => a.id === id);
    if (!action) throw new Error(`no assistant action "${id}"`);
    return action;
  }
  assistant() {
    return this.settings.get().assistant;
  }
  emit() {
    for (const listener of [...this.listeners]) listener();
  }
};
function runKey(actionId, target) {
  return JSON.stringify([actionId, target.place, [...target.taskIds ?? []].sort(), target.projectId ?? null]);
}
function stoppedReply(reason) {
  return reason === "user" ? { ok: false, failure: { kind: "stopped", detail: "stopped by the user" } } : { ok: false, failure: { kind: "timeout", detail: "stopped by the timeout" } };
}
function changed(settings, change) {
  switch (change.kind) {
    case "model":
      return { ...settings, model: change.id };
    case "timeout":
      return { ...settings, timeoutSeconds: sizeOf(change.seconds, ASSISTANT_TIMEOUTS, settings.timeoutSeconds) };
    case "prompt":
      return { ...settings, prompts: withKey(settings.prompts, change.actionId, change.value) };
    case "field":
      return { ...settings, models: { ...settings.models, [change.modelId]: withKey(settings.models[change.modelId] ?? {}, change.key, change.value) } };
    case "option":
      return { ...settings, options: withMap(settings.options, change.actionId, withKey(settings.options[change.actionId] ?? {}, change.key, change.value)) };
  }
}
function withMap(maps, key, map) {
  const { [key]: _old, ...rest } = maps;
  return Object.keys(map).length === 0 ? rest : { ...rest, [key]: map };
}
function withKey(map, key, value) {
  const { [key]: _old, ...rest } = map;
  return value === null || value.trim() === "" ? rest : { ...rest, [key]: value };
}

// core/application/screenPlaces.ts
var LIST_SET = { day: true, soon: true, inbox: true, backlog: true, projects: true };
var ENTRY_LISTS = Object.keys(LIST_SET);
var FUNNEL_PLACES = ["inbox", "soon", "calendar"];
function stepFunnel(from, shift, today) {
  if (from.mode === "calendar" && (shift > 0 || from.date !== today)) return { mode: "calendar", date: addDays(from.date, shift) };
  if (from.mode === "done") return shift > 0 ? { mode: "inbox", date: from.date } : null;
  const at = FUNNEL_PLACES.indexOf(from.mode) + shift;
  return at >= 0 && at < FUNNEL_PLACES.length ? { mode: FUNNEL_PLACES[at], date: from.date } : null;
}
function funnelPlaceShowing(column, spot) {
  const at = spot === "done" ? "inbox" : spot;
  if (SHOWN_LISTS[at].includes(column)) return at;
  const from = FUNNEL_PLACES.indexOf(at);
  const showing = FUNNEL_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
  return showing.reduce((best, other) => Math.abs(FUNNEL_PLACES.indexOf(other) - from) < Math.abs(FUNNEL_PLACES.indexOf(best) - from) ? other : best);
}
var OLD_NUMBERS = { [-1]: "inbox", 0: "inbox", 1: "soon", 2: "calendar" };
function funnelPlaceOf(saved) {
  if (typeof saved === "number") return OLD_NUMBERS[saved] ?? "calendar";
  if (saved === "projects") return "inbox";
  return FUNNEL_PLACES.includes(saved) ? saved : "calendar";
}
var SHOWN_LISTS = { inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] };
var SWIPE_FLICK_SPEED = 0.3;
function swipeLanding(moved2, distance, speed) {
  if (moved2 === 0) return 0;
  const shift = moved2 > 0 ? 1 : -1;
  if (Math.abs(speed) >= SWIPE_FLICK_SPEED) return Math.sign(speed) === shift ? shift : 0;
  return Math.abs(moved2) * 2 >= distance ? shift : 0;
}

// core/application/dayWords.ts
var DAYS_IN_WEEK = 7;
var HOUR_MINUTES3 = 60;
var DAY_HOURS2 = MINUTES_PER_DAY / HOUR_MINUTES3;
var DATE_RE2 = /^\d{4}-\d{2}-\d{2}$/;
var SHIFT_RE = /^([+-])(\d{1,4})$/;
var NAMED = { today: 0, tomorrow: 1, yesterday: -1 };
function daysFrom(from, count) {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => addDays(from, i));
}
function weekOf(today, which) {
  const monday = addDays(today, -weekdayOf(today) + (which === "next" ? DAYS_IN_WEEK : 0));
  return daysFrom(monday, DAYS_IN_WEEK);
}
function dayNamed(text, today) {
  const word = text.trim().toLowerCase();
  if (word in NAMED) return addDays(today, NAMED[word]);
  const shift = SHIFT_RE.exec(word);
  if (shift) return addDays(today, (shift[1] === "-" ? -1 : 1) * Number(shift[2]));
  return DATE_RE2.test(word) && isValidLocalDate(word) ? word : null;
}
function weekdayName(date) {
  return REPEAT_WORDS.weekdays[weekdayOf(date)].name;
}
function daySide(date, today) {
  if (date === today) return "today";
  return date < today ? "past" : "future";
}
function clockOf(boundary, minute) {
  const clock = boundary.startHour * HOUR_MINUTES3 + Math.floor(minute);
  return minutesToHHMM((clock % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}
function hourLabels(boundary) {
  return Array.from({ length: DAY_HOURS2 }, (_, i) => String(boundary.hourAt(i)).padStart(2, "0"));
}

// core/domain/Lists.ts
var GROUPED_LISTS = ["inbox", "backlog", "now", "soon"];

// core/domain/Marks.ts
function marksOf(priority, labels) {
  return { priority, labels: priority === null ? labels : [] };
}
function markChoices(marks) {
  return { priority: marks.labels.length === 0, labels: marks.priority === null };
}
function typedMarks(text, priority, labels, prefixes) {
  const typed2 = priority === null ? priorityOfTitle(text, prefixes) : { text: taskTitle(text), priority };
  return { text: typed2.text, ...marksOf(typed2.priority, labels) };
}

// core/domain/queries.ts
function slottedOnDate(entry, date, boundary) {
  return entry.task.slot !== null && boundary.dayOfSlot(entry.task.slot) === date;
}
function listed(doc) {
  return [...doc.tasks("now"), ...doc.tasks("soon")];
}
function dayList(doc, date, today, boundary = DayBoundary.MIDNIGHT) {
  const shown3 = (e) => date === today ? e.section === "now" || e.task.dueDate === date : e.task.dueDate === date;
  return listed(doc).filter((e) => shown3(e) && !slottedOnDate(e, date, boundary));
}
function slottedOn(doc, date, boundary = DayBoundary.MIDNIGHT) {
  const start2 = (e) => boundary.spanOf(e.task.slot, date).start;
  return listed(doc).filter((e) => slottedOnDate(e, date, boundary)).sort((a, b) => start2(a) - start2(b));
}
function openSlotted(doc) {
  return listed(doc).filter((e) => e.task.slot !== null && isOpen(e.task.status));
}
function soonWithoutDate(doc) {
  return doc.tasks("soon").filter((e) => e.task.dueDate === null && e.task.slot === null);
}
function inboxList(doc) {
  return doc.tasks("inbox");
}
function backlogList(doc) {
  return doc.tasks("backlog");
}
function repeatable(entry) {
  return isOpen(entry.task.status);
}
function columnList(column, today) {
  if (column.kind !== "day") return column.kind;
  const day = dayColumn(column.date, today);
  return day.sections ? day.list : null;
}
function columnGroups(doc, column, today, boundary = DayBoundary.MIDNIGHT) {
  const list = columnList(column, today);
  if (list === null) return [];
  const shown3 = column.kind === "day" ? dayList(doc, column.date, today, boundary) : column.kind === "soon" ? soonWithoutDate(doc) : doc.tasks(list);
  const groups = doc.groups(list);
  const ungrouped = ungroupedIndex(groups);
  const others = shown3.filter((e) => e.section !== list);
  return groups.map((g) => ({ list, index: g.index, name: g.name, entries: [...g.index === ungrouped ? others : [], ...shown3.filter((e) => e.section === list && g.entries.includes(e))] })).filter((g, i) => g.entries.length > 0 || groups[i].heading && g.name !== null && groups[i].entries.length === 0);
}

// core/domain/operations.ts
var HOUR_MINUTES4 = 60;
var MINUTE_MS4 = 6e4;
function newTask(text, patch2 = {}) {
  return { status: "todo", statusChar: STATUS_CHARS.todo, text: taskTitle(text), dueDate: null, slot: null, reminder: DEFAULT_REMINDER, repeat: null, priority: null, labels: [], projects: [], collapsed: false, children: [], ...patch2 };
}
function dayOf(task, boundary) {
  return task.dueDate ?? (task.slot ? boundary.dayOfSlot(task.slot) : null);
}
function isUndated(section) {
  return section === "inbox" || section === "backlog";
}
function listSection(date, today) {
  return date === today ? "now" : "soon";
}
function patch(doc, entry, changes) {
  return doc.replace(entry, { ...entry.task, ...changes });
}
function sameEntryIn(doc, entry) {
  return doc.find(entry.section, entry.index, entry.path);
}
function samePlace2(a, b) {
  return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
}
function leavingItsTask(operation) {
  return (doc, entry, ...rest) => {
    if (entry.path.length === 0) return operation(doc, entry, ...rest);
    const moved2 = doc.moveEntry(entry, entry.section, "end");
    const ungrouped = moved2.groups(entry.section)[ungroupedIndex(moved2.groups(entry.section))].entries;
    return operation(moved2, ungrouped[ungrouped.length - 1], ...rest);
  };
}
function moveInto(doc, entry, section, index, today) {
  if (section !== "now" || entry.task.dueDate === today) return doc.moveEntry(entry, section, index);
  const dated = patch(doc, entry, { dueDate: today });
  return dated.moveEntry(sameEntryIn(dated, entry), section, index);
}
function createInList(doc, date, today, text) {
  return doc.insert(listSection(date, today), "end", newTask(text, { dueDate: date }));
}
function createInSoon(doc, text) {
  return doc.insert("soon", "end", newTask(text));
}
function createInSlot(doc, slot, text, marks, today, boundary) {
  const clamped = boundary.clamp(slot, MIN_SLOT_MINUTES);
  return doc.insert(listSection(boundary.dayOfSlot(clamped), today), "end", newTask(text, { slot: clamped, ...marks }));
}
function createAtTime(doc, date, today, start2, text, boundary = DayBoundary.MIDNIGHT) {
  return createInSlot(doc, { date, start: start2, end: null }, text, marksOf(null, []), today, boundary);
}
function setStatus(doc, entry, status) {
  return patch(doc, entry, { status, statusChar: STATUS_CHARS[status] });
}
function anchoredRepeat(rule, date) {
  return Repeat.of(Repeat.anchored(rule, date));
}
function setRepeat(doc, entry, rule, today, boundary = DayBoundary.MIDNIGHT) {
  return doc.replace(entry, repeated(entry.task, rule, today, boundary));
}
function repeated(task, rule, today, boundary) {
  if (rule === null) return { ...task, repeat: null };
  const day = dayOf(task, boundary);
  if (day !== null) return { ...task, repeat: anchoredRepeat(rule, day) };
  const first = rule.kind === "schedule" ? Repeat.of({ ...rule, every: 1, from: null }).first(today) : null;
  if (first === null) return { ...task, repeat: Repeat.of(rule) };
  return { ...task, repeat: anchoredRepeat(rule, first), dueDate: first };
}
function withRepeat(task, rule, today, boundary) {
  return rule ? repeated(task, rule, today, boundary) : task;
}
function withDraftRepeat(task, draft, today, boundary) {
  return draft.repeat === void 0 ? task : repeated(task, draft.repeat, today, boundary);
}
function stop(doc, entry) {
  return patch(doc, entry, { repeat: null, status: "done", statusChar: STATUS_CHARS.done });
}
function setDueDate(doc, entry, date) {
  return patch(doc, entry, { dueDate: date });
}
function marksOfTask(task) {
  return marksOf(task.priority, task.labels);
}
function setPriority(doc, entry, priority) {
  const marks = marksOfTask(entry.task);
  if (priority !== null && !markChoices(marks).priority) return doc;
  return patch(doc, entry, marksOf(priority, marks.labels));
}
function setLabels(doc, entry, labels) {
  if (labels.length > 0 && !markChoices(marksOfTask(entry.task)).labels) return doc;
  return patch(doc, entry, { labels });
}
function setProjects(doc, entry, projects) {
  if (entry.path.length > 0) return doc;
  return patch(doc, entry, { projects: uniqueNames(projects) });
}
function withProject(projects, name, on) {
  const others = projects.filter((p) => projectKey(p) !== projectKey(name));
  return on ? [...others, ...namesProject(projects, name) ? [projects.find((p) => projectKey(p) === projectKey(name))] : [name]] : others;
}
function setReminder(doc, entry, reminder) {
  return patch(doc, entry, { reminder });
}
function rename(doc, entry, text) {
  return patch(doc, entry, typed(doc, text, entry.task.priority, entry.task.labels));
}
function toggleDone(doc, entry) {
  return setStatus(doc, entry, isOpen(entry.task.status) ? "done" : "todo");
}
function setDescription(doc, entry, markdown) {
  return doc.setDescription(entry, markdown);
}
function addContext(doc, entry, text) {
  const markdown = withContext(descriptionMarkdown(entry), text);
  return markdown === null ? doc : doc.setDescription(entry, markdown);
}
function remove(doc, entry) {
  return doc.removeEntry(entry);
}
function moveBefore(doc, entry, before, date, today) {
  if (before === null) return moveInto(doc, entry, listSection(date, today), "end", today);
  if (samePlace2(before, entry)) return doc;
  return moveInto(doc, entry, before.section, before.index, today);
}
function hasOpenSubtask(entry) {
  return entry.subtasks.some((sub) => isOpen(sub.task.status));
}
function setCollapsed(doc, entry, collapsed) {
  if (collapsed && !hasOpenSubtask(entry)) return doc;
  return patch(doc, entry, { collapsed });
}
function unfoldAbove(doc, entry) {
  const folded2 = entry.path.map((_, depth) => doc.find(entry.section, entry.index, entry.path.slice(0, depth))).filter((above) => above.task.collapsed);
  return doc.replaceAll(folded2.map((above) => [above, { ...above.task, collapsed: false }]));
}
function intoUnfolded(doc, parent, operation) {
  if (!parent.task.collapsed) return operation(doc, (entry) => entry);
  const opened = patch(doc, parent, { collapsed: false });
  return operation(opened, (entry) => sameEntryIn(opened, entry));
}
function nest(doc, entry, parent, before) {
  if (before && samePlace2(before, entry)) return doc;
  return intoUnfolded(doc, parent, (d, same2) => d.nestEntry(same2(entry), same2(parent), before && same2(before)));
}
function subtaskDueDate(placement, inherited, today) {
  if (samePlacement(placement, inherited)) return null;
  if (placement.kind === "now") return today;
  return placement.kind === "date" ? placement.date : null;
}
function createSubtask(doc, parent, draft, today) {
  const dueDate = subtaskDueDate(draft.placement, placementOfEntry(parent, today), today);
  const { text, ...marks } = typed(doc, draft.text, draft.priority, draft.labels ?? []);
  const task = newTask(text, { dueDate, ...marks });
  return intoUnfolded(doc, parent, (d, same2) => d.insertUnder(same2(parent), task));
}
function firstStep(doc, entry, typedText) {
  const { text, ...marks } = typed(doc, typedText, null, []);
  const inserted2 = doc.insertUnder(entry, newTask(text, marks), entry.subtasks[0] ?? null);
  const task = sameEntryIn(inserted2, entry);
  return patch(inserted2, task, { collapsed: true });
}
function placeOnTimeline(doc, entry, slot, today, boundary = DayBoundary.MIDNIGHT) {
  const clamped = boundary.clamp(slot, MIN_SLOT_MINUTES);
  if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
  const slotted2 = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
  return slotted2.moveEntry(sameEntryIn(slotted2, entry), "soon", "end");
}
function clearSlot(doc, entry) {
  return patch(doc, entry, { slot: null });
}
function snoozedSlot(slot, now, minutes) {
  const at = new Date(now.getTime() + minutes * MINUTE_MS4);
  const start2 = at.getHours() * HOUR_MINUTES4 + at.getMinutes();
  return { date: localDateOf(at), start: start2, end: slot.end === null ? null : start2 + (slot.end - slot.start) };
}
function toList(doc, entry, date, today) {
  return date === today ? moveInto(doc, entry, "now", "end", today) : setDueDate(doc, entry, date);
}
function placementOfEntry(entry, today) {
  if (entry.task.dueDate === today) return { kind: "now" };
  if (entry.task.dueDate !== null) return { kind: "date", date: entry.task.dueDate };
  if (entry.section === "inbox" || entry.section === "backlog") return { kind: entry.section };
  return entry.section === "soon" ? { kind: "soon" } : { kind: "now" };
}
function samePlacement(a, b) {
  return a.kind === b.kind && (a.kind !== "date" || b.kind !== "date" || a.date === b.date);
}
function placementTarget(placement, today) {
  switch (placement.kind) {
    case "inbox":
    case "backlog":
      return { section: placement.kind, dueDate: null };
    case "soon":
      return { section: "soon", dueDate: null };
    case "now":
      return { section: "now", dueDate: today };
    case "date":
      return { section: placement.date <= today ? "now" : "soon", dueDate: placement.date };
  }
}
function placeTask(doc, entry, draft, today, slot, boundary = DayBoundary.MIDNIGHT) {
  const { section, dueDate } = placementTarget(draft.placement, today);
  const unsorted = isUndated(section);
  if (entry === null) {
    const { text, ...marks } = typed(doc, draft.text, draft.priority, draft.labels ?? []);
    return doc.insert(section, "end", withDraftRepeat(newTask(text, { dueDate, slot: unsorted ? null : slot ?? null, ...marks, projects: draftProjects(doc, draft, []) ?? [] }), draft, today, boundary));
  }
  if (entry.path.length > 0) return placeSubtask(doc, entry, draft, today, boundary);
  const same2 = samePlacement(placementOfEntry(entry, today), draft.placement);
  const changed3 = { ...entry.task, ...draftMarks(doc, entry.task, draft), ...same2 ? {} : { dueDate }, ...unsorted ? { slot: null } : {}, ...draftProjects(doc, draft, entry.task.projects) !== void 0 && { projects: draftProjects(doc, draft, entry.task.projects) } };
  const edited = doc.replace(entry, withDraftRepeat(changed3, draft, today, boundary));
  if (same2 || entry.section === section) return edited;
  return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}
function sendTo(doc, entry, placement, today) {
  if (entry.path.length > 0 || samePlacement(placementOfEntry(entry, today), placement)) return doc;
  const { section, dueDate } = placementTarget(placement, today);
  const edited = doc.replace(entry, { ...entry.task, dueDate, ...isUndated(section) ? { slot: null } : {} });
  return entry.section === section ? edited : edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}
function placeSubtask(doc, entry, draft, today, boundary) {
  const current = placementOfEntry(entry, today);
  const dueDate = samePlacement(current, draft.placement) ? entry.task.dueDate : subtaskDueDate(draft.placement, current, today);
  return doc.replace(entry, withDraftRepeat({ ...entry.task, ...draftMarks(doc, entry.task, draft), dueDate }, draft, today, boundary));
}
function typed(doc, text, priority, labels) {
  const marked = typedMarks(taskTitle(text), priority, labels, doc.priorityPrefixes());
  return { ...marked, text: taskTitle(marked.text) };
}
function draftMarks(doc, task, draft) {
  return typed(doc, draft.text, draft.priority, draft.labels ?? task.labels);
}
function draftProjects(doc, draft, had) {
  const named = draft.projects !== void 0 ? draft.projects : draft.project === void 0 ? void 0 : draft.project === null ? [] : [draft.project];
  return named === void 0 ? void 0 : uniqueNames(named.filter((name) => namesProject(had, name) || !isFolder(doc, name)));
}
function toEnd(doc, entry, section) {
  const prepared = isUndated(section) ? patch(doc, entry, { dueDate: null, slot: null }) : doc;
  return prepared.moveEntry(sameEntryIn(prepared, entry), section, "end");
}
function toSoon(doc, entry, date, today) {
  const undated = setDueDate(doc, entry, null);
  return date === today ? undated.moveEntry(sameEntryIn(undated, entry), "soon", "end") : undated;
}
function putOff(doc, entry, date, today) {
  const postponed = patch(doc, entry, { dueDate: date, slot: null });
  const section = date <= today ? "now" : "soon";
  return entry.section === section ? postponed : postponed.moveEntry(sameEntryIn(postponed, entry), section, "end");
}
function groupIndex(doc, list, name) {
  const groups = doc.groups(list);
  return name === null ? ungroupedIndex(groups) : groups.findIndex((g) => g.index > 0 && g.name === name);
}
function usablePresets(presets) {
  const trimmed = presets.map((p) => p.trim());
  return trimmed.filter((p, i) => p !== "" && trimmed.indexOf(p) === i);
}
function presetPlace(groups, name, presets) {
  const rank = (g) => g.index > 0 && g.name !== null ? presets.indexOf(g.name) : -1;
  const own = presets.indexOf(name);
  const earlier = groups.filter((g) => rank(g) >= 0 && rank(g) < own);
  if (earlier.length > 0) return earlier[earlier.length - 1].index + 1;
  const later = groups.find((g) => rank(g) > own);
  return later ? later.index : groups.length;
}
function enteringList(list, today, date) {
  if (list === "now") return { dueDate: today, slot: null };
  return { dueDate: list === "soon" && date !== null && date > today ? date : null, slot: null };
}
function moveToGroup(doc, entry, list, group, before, today, date = null) {
  if (before !== null && entry.path.length === 0 && before.section === entry.section && before.index === entry.index) return doc;
  const entered = patch(doc, entry, enteringList(list, today, date));
  return entered.moveEntry(sameEntryIn(entered, entry), list, positionIn(entered, list, group, before));
}
function reorder(doc, entry, group, before) {
  if (before !== null && samePlace2(before, entry)) return doc;
  const list = entry.section;
  if (list === "done") return doc;
  return doc.moveEntry(entry, list, positionIn(doc, list, group, before));
}
function positionIn(doc, list, group, before) {
  if (before !== null && before.section === list) return before.index;
  return group === null ? "end" : { endOf: groupIndex(doc, list, group) };
}
function createInPlace(doc, typedText, priority, place, today, boundary, repeat, labels = [], own) {
  const { text, ...marks } = typed(doc, typedText, priority, labels);
  const projects = uniqueNames(own ?? []);
  switch (place.kind) {
    case "subtask":
      return intoUnfolded(
        doc,
        place.parent,
        (d, same2) => d.insertUnder(same2(place.parent), withRepeat(newTask(text, marks), repeat, today, boundary), place.before && same2(place.before))
      );
    case "slot": {
      const made = createInSlot(doc, place.slot, text, { ...marks, projects }, today, boundary);
      const inserted2 = repeat ? made.insertedSince(doc) : void 0;
      return repeat && inserted2 ? setRepeat(made, inserted2, repeat, today, boundary) : made;
    }
    case "list": {
      const { list, before } = place;
      const dueDate = list === "now" ? place.date ?? today : enteringList(list, today, place.date).dueDate;
      const task = withRepeat(newTask(text, { dueDate, ...marks, projects }), repeat, today, boundary);
      return doc.insert(list, positionIn(doc, list, place.group, before), task);
    }
  }
}
function createGroup(doc, entry, list, name, groups, today, date = null) {
  const trimmed = name.trim();
  if (trimmed === "") return doc;
  if (trimmed === groups.ungrouped) return moveToGroup(doc, entry, list, null, null, today, date);
  if (groupIndex(doc, list, trimmed) >= 0) return moveToGroup(doc, entry, list, trimmed, null, today, date);
  const presets = usablePresets(groups.presets);
  const at = presets.includes(trimmed) ? presetPlace(doc.groups(list), trimmed, presets) : doc.groups(list).length;
  const added = doc.addGroup(list, trimmed, at);
  return moveToGroup(added, sameEntryIn(added, entry), list, trimmed, null, today, date);
}
function createSection(doc, column, group, before, name, groups, today, boundary = DayBoundary.MIDNIGHT) {
  const list = columnList(column, today);
  const trimmed = name.trim();
  if (list === null || trimmed === "" || trimmed === groups.ungrouped || trimmed === group) return doc;
  const shown3 = columnGroups(doc, column, today, boundary).find((g) => g.name === group)?.entries ?? [];
  const at = before === null ? shown3.length : shown3.findIndex((e) => samePlace2(e, before));
  if (at < 0) throw new Error(`Not a task the column shows in its group: ${before.raw}`);
  const below = shown3.slice(at);
  const own = below.filter((e) => e.section === list);
  const index = groupIndex(doc, list, group);
  const twin = groupIndex(doc, list, trimmed) >= 0;
  if (twin && below.length === 0) return doc;
  let split2 = doc.splitGroup(list, index, trimmed, own);
  if (twin) split2 = split2.mergeGroup(list, index + 1, split2.groups(list).findIndex((g) => g.index > 0 && g.index !== index + 1 && g.name === trimmed), "end");
  const date = column.kind === "day" ? column.date : null;
  return below.filter((e) => e.section !== list).reduce((current, entry, i) => {
    const target = current.groups(list)[groupIndex(current, list, trimmed)].entries;
    const first = own.length > 0 ? target[target.length - own.length] : null;
    return moveToGroup(current, current.tasks(entry.section)[entry.index - i], list, trimmed, first, today, date);
  }, split2);
}
function moveGroupTo(doc, list, group, place) {
  const from = groupIndex(doc, list, group);
  const before = place === "end" ? doc.groups(list).length : groupIndex(doc, list, place.before);
  if (before === from) return doc;
  if (before > 0) return doc.moveGroup(list, from, before);
  const moved2 = doc.moveGroup(list, from, 1);
  return doc.groups(list)[0].entries.length === 0 ? moved2 : moved2.moveGroup(list, 0, 2);
}
function renameGroup(doc, list, from, to, ungrouped) {
  const name = to.trim();
  if (name === "" || name === from) return doc;
  if (name === ungrouped) return removeGroup(doc, list, from);
  return doc.renameGroup(list, groupIndex(doc, list, from), name);
}
function removeGroup(doc, list, name) {
  return doc.mergeGroup(list, groupIndex(doc, list, name), ungroupedIndex(doc.groups(list)), "end");
}
var setSlot = leavingItsTask(placeOnTimeline);
var moveToList = leavingItsTask(toList);
var moveToSoon = leavingItsTask(toSoon);
var postpone = leavingItsTask(putOff);
var moveToEnd = leavingItsTask(toEnd);

// core/domain/recurrence.ts
function closedWithRepeat(entry) {
  return (entry.task.status === "done" || entry.task.status === "cancelled") && entry.task.repeat !== null;
}
function recurClosed(doc, today, boundary) {
  if (!doc.hasSection("soon")) return doc;
  for (; ; ) {
    const entry = GROUPED_LISTS.flatMap((s) => flatten(doc.tasks(s))).find(closedWithRepeat);
    if (!entry) return doc;
    const { task } = entry;
    const copy = newTask(task.text, {
      priority: task.priority,
      labels: task.labels,
      projects: entry.projects,
      children: doc.freshChildren(entry),
      dueDate: task.repeat.next(dayOf(task, boundary), today),
      repeat: task.repeat,
      collapsed: task.collapsed
    });
    doc = intoSoon(doc.replace(entry, { ...task, repeat: null }), entry.group, copy);
  }
}
function intoSoon(doc, name, task) {
  if (name === null) return doc.insert("soon", "end", task);
  const groups = doc.groups("soon");
  const index = groups.findIndex((g) => g.index > 0 && g.name === name);
  if (index >= 0) return doc.insert("soon", { endOf: index }, task);
  return doc.addGroup("soon", name, groups.length).insert("soon", { endOf: groups.length }, task);
}

// core/domain/normalize.ts
function untilSettled(doc, pass) {
  for (; ; ) {
    const next = pass(doc);
    if (next === doc) return doc;
    doc = next;
  }
}
function erasePastSlots(doc, today, boundary) {
  return untilSettled(doc, (d) => {
    const past = d.allTasks().filter((e) => isOpen(e.task.status) && e.task.slot !== null && boundary.dayOfSlot(e.task.slot) < today);
    return d.replaceAll(past.map((e) => [e, pastSlotSettled(e.task, e.task.slot, today, boundary)]));
  });
}
function pastSlotSettled(task, slot, today, boundary) {
  const day = boundary.dayOfSlot(slot);
  if (task.repeat !== null) return { ...task, slot: { ...slot, date: addDays(slot.date, daysBetween(day, today)) } };
  return { ...task, slot: null, dueDate: task.dueDate ?? day };
}
function pastDatesToToday(doc, today) {
  return untilSettled(doc, (d) => {
    const past = d.allTasks().filter((e) => isOpen(e.task.status) && e.task.dueDate !== null && e.task.dueDate < today);
    return d.replaceAll(past.map((e) => [e, { ...e.task, dueDate: today }]));
  });
}
function gatherAtStart(doc, target, candidate) {
  if (!doc.hasSection(target)) return doc;
  for (; ; ) {
    const all2 = doc.allTasks();
    let i = all2.length - 1;
    while (i >= 0 && (all2[i].section === target || !candidate(all2[i]))) i--;
    if (i < 0) return doc;
    const entry = all2[i];
    doc = doc.moveEntry(entry, target, "start");
  }
}
function closedToDone(doc) {
  return gatherAtStart(doc, "done", (e) => !isOpen(e.task.status));
}
function datedOutOfUndated(doc) {
  if (!doc.hasSection("soon")) return doc;
  for (; ; ) {
    const entry = [...doc.tasks("inbox"), ...doc.tasks("backlog")].find((e) => isOpen(e.task.status) && (e.task.dueDate !== null || e.task.slot !== null));
    if (!entry) return doc;
    doc = doc.moveEntry(entry, "soon", "end");
  }
}
function dueToNow(doc, today, boundary, presets) {
  const came = (e) => {
    if (e.section !== "soon" || !isOpen(e.task.status)) return false;
    const due = e.task.dueDate !== null && e.task.dueDate <= today;
    const slotted2 = e.task.slot !== null && boundary.dayOfSlot(e.task.slot) <= today;
    return due || slotted2;
  };
  if (!doc.hasSection("now")) return doc;
  for (; ; ) {
    const entry = doc.tasks("soon").find((e) => e.group !== null && came(e));
    if (!entry?.group) return gatherAtStart(doc, "now", came);
    doc = intoGroup(doc, entry, entry.group, presets);
  }
}
function intoGroup(doc, entry, name, presets) {
  let index = doc.groups("now").findIndex((g) => g.index > 0 && g.name === name);
  if (index < 0) {
    const groups = doc.groups("now");
    index = presets.includes(name) ? presetPlace(groups, name, presets) : groups.length;
    doc = doc.addGroup("now", name, index);
  }
  return doc.moveEntry(doc.tasks(entry.section)[entry.index], "now", { endOf: index });
}
function fitsGroup(section, task, today) {
  if (section === "soon") return task.slot === null;
  if (section === "now") return task.slot === null && (task.dueDate === null || task.dueDate <= today);
  return true;
}
function misplacedOutOfGroups(doc, today) {
  for (const section of GROUPED_LISTS) {
    for (; ; ) {
      const entry = doc.tasks(section).find((e) => e.group !== null && !fitsGroup(section, e.task, today));
      if (!entry) break;
      doc = doc.moveEntry(entry, section, "end");
    }
  }
  return doc;
}
function mergeDuplicates(doc) {
  for (const section of GROUPED_LISTS) {
    for (; ; ) {
      const groups = doc.groups(section);
      const twin = groups.find((g, i) => i > 0 && groups.some((o) => o.index > 0 && o.index < i && o.name === g.name));
      if (!twin) break;
      const first = groups.find((o) => o.index > 0 && o.name === twin.name);
      doc = doc.mergeGroup(section, twin.index, first.index, "end");
    }
  }
  return doc;
}
function dropEmptyUngroupedHeading(doc) {
  for (const section of GROUPED_LISTS) {
    for (; ; ) {
      const empty = doc.groups(section).find((g) => g.index > 0 && g.name === null && g.blank);
      if (!empty) break;
      doc = doc.deleteGroup(section, empty.index);
    }
  }
  return doc;
}
function placeUngrouped(doc) {
  for (const section of GROUPED_LISTS) {
    const u = ungroupedIndex(doc.groups(section));
    if (u === 0) continue;
    if (doc.groups(section)[0].entries.length > 0) doc = doc.mergeGroup(section, 0, u, "start");
    if (u === 1 && doc.groups(section)[0].entries.length === 0) doc = doc.mergeGroup(section, 1, 0, "end");
  }
  return doc;
}
function normalizeGroups(doc, today) {
  return placeUngrouped(dropEmptyUngroupedHeading(mergeDuplicates(misplacedOutOfGroups(doc, today))));
}
function unfoldEmpty(doc) {
  const empty = flatten(doc.allTasks()).filter((e) => e.task.collapsed && !hasOpenSubtask(e));
  if (empty.length === 0) return doc;
  return doc.replaceAll(empty.map((e) => [e, { ...e.task, collapsed: false }]));
}
function normalize(doc, today, boundary = DayBoundary.MIDNIGHT, presets = []) {
  const listed2 = dueToNow(datedOutOfUndated(closedToDone(recurClosed(pastDatesToToday(erasePastSlots(doc, today, boundary), today), today, boundary))), today, boundary, presets);
  const result = unfoldEmpty(normalizeGroups(listed2, today)).spacedHeadings();
  if (result === doc) return doc;
  return result.serialize() === doc.serialize() ? doc : result;
}

// core/application/documentText.ts
function markersOf(settings) {
  const priorities = usableLevels(settings.priorities).map((l) => l.prefix);
  return {
    dueDate: settings.dueDateMarker,
    slot: settings.slotMarker,
    alarmSlot: settings.alarmSlotMarker,
    liveSlot: settings.liveSlotMarker,
    silentSlot: settings.silentSlotMarker,
    repeat: settings.repeatMarker,
    collapsed: settings.collapsedMarker,
    priorities,
    labelTag: settings.labelTag,
    labels: usableLabels(settings.labels).map((l) => l.name)
  };
}
function tasksFilePath(settings) {
  return settings.tasksFile.trim() === "" ? null : settings.tasksFile;
}
function boundaryOf(settings) {
  return new DayBoundary(settings.dayStartHour);
}
function sectionNames(settings) {
  const s = settings.sections;
  return [s.inbox, s.now, s.soon, s.backlog, s.done];
}
function parseText(text, settings) {
  const s = settings.sections;
  return TaskDocument.parse(
    text,
    { inbox: s.inbox, backlog: s.backlog, now: s.now, soon: s.soon, done: s.done, ungrouped: settings.groups.ungrouped },
    markersOf(settings)
  );
}
function readingKey(settings) {
  return JSON.stringify([settings.sections, settings.groups.ungrouped, settings.groups.presets, markersOf(settings)]);
}

// core/application/DayServiceImpl.ts
var MINUTE_MS5 = 6e4;
function dayOpening(date, boundary, today, now, hour) {
  return date === today ? { kind: "now", minute: boundary.offsetOf(date, now) } : { kind: "hour", minute: boundary.offsetOfHour(hour) };
}
var DayServiceImpl = class {
  constructor(clock, settings, tasks, ticker) {
    this.clock = clock;
    this.settings = settings;
    this.tasks = tasks;
    this.ticker = ticker;
    this.listeners = /* @__PURE__ */ new Map();
    /** The day the last check saw as today. */
    this.seen = null;
    /** The hour the day started at when last looked. */
    this.hour = 0;
    /** A minute's check came while a listener was not ready: it runs as soon as one catches up. */
    this.missed = false;
    this.stop = null;
  }
  today() {
    return this.boundary().dayOf(this.clock.now());
  }
  boundary() {
    return boundaryOf(this.settings.get());
  }
  relation(date) {
    return dayRelation(date, this.today());
  }
  step(date, days) {
    return addDays(date, days);
  }
  stepFunnel(from, shift) {
    return stepFunnel(from, shift, this.today());
  }
  openAt(date) {
    return dayOpening(date, this.boundary(), this.today(), this.clock.now(), this.settings.get().scrollToHour);
  }
  week(which) {
    return weekOf(this.today(), which);
  }
  days(from, count) {
    return daysFrom(from, count);
  }
  dayNamed(text) {
    return dayNamed(text, this.today());
  }
  weekday(date) {
    return weekdayName(date);
  }
  side(date) {
    return daySide(date, this.today());
  }
  clockAt(minute) {
    return clockOf(this.boundary(), minute);
  }
  hourLabels() {
    return hourLabels(this.boundary());
  }
  offset(from, to) {
    return daysBetween(from, to);
  }
  onDayChange(listener, ready = () => true) {
    if (this.listeners.size === 0) this.watch();
    this.listeners.set(listener, ready);
    return () => {
      if (!this.listeners.delete(listener) || this.listeners.size > 0) return;
      this.stop?.();
      this.stop = null;
    };
  }
  catchUp() {
    if (this.missed) void this.check();
  }
  watch() {
    this.seen = this.today();
    this.hour = this.settings.get().dayStartHour;
    this.missed = false;
    const stopTicks = this.ticker.every(MINUTE_MS5, () => void this.check());
    const stopSettings = this.settings.onChange(() => this.settingsChanged());
    this.stop = () => {
      stopTicks();
      stopSettings();
    };
  }
  /** The day passed: the tasks file is normalized, then the listeners hear it. A listener not ready makes the check wait. */
  async check() {
    if (![...this.listeners.values()].every((ready) => ready())) {
      this.missed = true;
      return;
    }
    this.missed = false;
    const today = this.today();
    if (today === this.seen) return;
    this.seen = today;
    try {
      await this.tasks.normalize();
    } finally {
      this.emit("passed");
    }
  }
  settingsChanged() {
    const hour = this.settings.get().dayStartHour;
    if (hour === this.hour) return;
    this.hour = hour;
    this.seen = this.today();
    this.emit("moved");
  }
  emit(change) {
    for (const listener of [...this.listeners.keys()]) listener(change);
  }
};

// core/domain/RepeatDraft.ts
var KINDS2 = ["schedule", "afterDone"];
var UNITS = ["day", "week", "month"];
function repeatDay(taskDay, today) {
  return taskDay ?? today;
}
function ruleOf({ kind, every, unit, days, dayOfMonth }) {
  const schedule = kind === "schedule";
  return { kind, every, unit, days: schedule && unit === "week" ? days : [], dayOfMonth: schedule && unit === "month" ? dayOfMonth : null, from: null };
}
function writable(state) {
  return Repeat.problemWith(Repeat.anchored(ruleOf(state), state.day)) === null;
}
function detailOf({ kind, unit }) {
  if (kind !== "schedule") return null;
  return unit === "week" ? "weekdays" : unit === "month" ? "monthDay" : null;
}
function draftOf(state) {
  return { ...state, kinds: KINDS2, units: UNITS, detail: detailOf(state), can: { fewer: writable({ ...state, every: state.every - 1 }) }, rule: ruleOf(state) };
}
function repeatDraft(day, rule) {
  return draftOf({
    kind: rule?.kind ?? "schedule",
    every: rule?.every ?? 1,
    unit: rule?.unit ?? "week",
    days: rule && rule.days.length > 0 ? rule.days : [weekdayOf(day)],
    dayOfMonth: rule?.dayOfMonth ?? partsOf(day).day,
    day,
    removable: rule !== null
  });
}
function changed2(draft, change) {
  switch (change.what) {
    case "kind":
      return change.to === draft.kind ? null : { ...draft, kind: change.to };
    case "unit":
      return change.to === draft.unit ? null : { ...draft, unit: change.to };
    case "every":
      return { ...draft, every: draft.every + change.by };
    case "weekday": {
      if (draft.detail !== "weekdays") return null;
      const on = draft.days.includes(change.day);
      return { ...draft, days: on ? draft.days.filter((d) => d !== change.day) : [...draft.days, change.day].sort((a, b) => a - b) };
    }
  }
}
function editRepeat(draft, change) {
  const next = changed2(draft, change);
  return next && writable(next) ? draftOf(next) : null;
}

// core/application/marks.ts
var MOST_CARD_COLORS = 4;
function markColors(priority, labels) {
  const drawn = (color) => usableColor(color) ? [color] : [];
  if (priority) return drawn(priority.color);
  return labels.flatMap((label) => drawn(label.color)).slice(0, MOST_CARD_COLORS);
}
function draftMarksOf(marks, levels, labels) {
  const choices = markChoices(marks);
  const priority = levels.find((l) => l.prefix === marks.priority) ?? null;
  const chosen = labels.filter((l) => marks.labels.includes(l.name));
  return {
    priority,
    labels: chosen,
    can: { setPriority: choices.priority, setLabels: choices.labels },
    tint: markColors(priority, chosen)[0] ?? null,
    tiles: {
      levels: levels.map((mark) => ({ mark, on: mark.prefix === priority?.prefix, enabled: choices.priority })),
      labels: labels.map((mark) => ({ mark, on: chosen.includes(mark), enabled: choices.labels }))
    }
  };
}

// core/application/nesting.ts
function levelRange(cards, index, group) {
  const prev = cards[index - 1] && cards[index - 1].group === group ? cards[index - 1] : void 0;
  const next = cards[index] && cards[index].group === group ? cards[index] : void 0;
  return { min: next?.level ?? 0, max: prev ? prev.level + 1 : 0 };
}
function fitLevel(cards, place) {
  const { min, max } = levelRange(cards, place.index, place.group);
  return { ...place, level: Math.max(min, Math.min(max, place.level)) };
}
function shiftLevel(cards, place, delta) {
  const level = place.level + delta;
  const { min, max } = levelRange(cards, place.index, place.group);
  return level >= min && level <= max ? { ...place, level } : null;
}
function placeOfGap(cards, place) {
  const next = cards[place.index] && cards[place.index].group === place.group ? cards[place.index] : void 0;
  const before = next && next.level === place.level ? next.key : null;
  if (place.level === 0) return { kind: "task", group: place.group, before };
  let parent = place.index - 1;
  while (cards[parent].level !== place.level - 1) parent--;
  return { kind: "subtask", parent: cards[parent].key, before };
}
function gapOfPlace(cards, place) {
  const at = (key) => cards.findIndex((card) => samePlace(card.key, key));
  const before = place.before ? at(place.before) : -1;
  if (before >= 0) return { kind: "gap", index: before, level: cards[before].level, group: cards[before].group };
  const parent = place.kind === "subtask" ? at(place.parent) : -1;
  if (parent >= 0) {
    let end = parent + 1;
    while (end < cards.length && cards[end].level > cards[parent].level) end++;
    return { kind: "gap", index: end, level: cards[parent].level + 1, group: cards[parent].group };
  }
  const group = place.kind === "task" ? place.group : null;
  let last = cards.length - 1;
  while (last >= 0 && cards[last].group !== group) last--;
  return { kind: "gap", index: last >= 0 ? last + 1 : group === null ? 0 : cards.length, level: 0, group };
}
function sameGap(a, b) {
  return a.index === b.index && a.group === b.group;
}
function gapAt(cards, index, level, passed, headers) {
  const above = index > 0 ? cards[index - 1].group : headers ? null : cards[0]?.group ?? null;
  const group = passed.length > 0 ? passed[passed.length - 1] : above;
  return fitLevel(cards, { kind: "gap", index, level: Math.round(level), group });
}
function placeOfDrop(cards, place, home) {
  if (home && sameGap(place, home) && place.level === home.level) return null;
  return placeOfGap(cards, place);
}
function groupPlaceOf(groups, lifted2, slot) {
  if (slot === lifted2 || slot === lifted2 + 1) return null;
  return slot >= groups.length ? "end" : { before: groups[slot] };
}

// core/domain/TaskText.ts
var TOKEN_RE = new RegExp(
  [
    "(?<code>`[^`]*`)",
    "(?<escape>\\\\.)",
    "(?<embed>!\\[\\[[^\\]]*\\]\\]|!\\[[^\\]]*\\]\\([^)]*\\))",
    "\\[\\[(?<wiki>[^\\[\\]|]+?)(?:\\|(?<alias>[^\\[\\]]+?))?\\]\\]",
    "\\[(?<label>[^\\[\\]]+)\\]\\((?<href><[^>]+>|[^()\\s]+)\\)",
    "(?<bare>https?://[^\\s<>]+)"
  ].join("|"),
  "gu"
);
var SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
var TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}'"»]+$/u;
function textParts(text) {
  const parts = [];
  const pushText = (s) => {
    if (s === "") return;
    const last = parts[parts.length - 1];
    if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + s };
    else parts.push({ kind: "text", text: s });
  };
  let at = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const link = linkOf(m.groups);
    if (!link) continue;
    pushText(text.slice(at, m.index));
    parts.push(link.part);
    pushText(link.rest);
    at = m.index + m[0].length;
  }
  pushText(text.slice(at));
  return parts;
}
function plainText(text) {
  return textParts(text).map((p) => p.kind === "text" ? p.text : p.label).join("");
}
function linkOf(g) {
  if (g.wiki !== void 0) {
    const target = g.wiki.trim();
    return { part: { kind: "note", label: g.alias?.trim() || noteLabel(target), target }, rest: "" };
  }
  if (g.label !== void 0 && g.href !== void 0) {
    const href = g.href.startsWith("<") ? g.href.slice(1, -1) : g.href;
    const part2 = SCHEME_RE.test(href) ? { kind: "url", label: g.label, target: href } : { kind: "note", label: g.label, target: decoded(href) };
    return { part: part2, rest: "" };
  }
  if (g.bare !== void 0) {
    const rest = TRAILING_PUNCTUATION_RE.exec(g.bare)?.[0] ?? "";
    const url = g.bare.slice(0, g.bare.length - rest.length);
    return { part: { kind: "url", label: url, target: url }, rest };
  }
  return null;
}
function noteLabel(target) {
  const [note, ...subpath] = target.split("#");
  if (subpath.length === 0) return note;
  return note === "" ? subpath.join(" > ") : [note, ...subpath].join(" > ");
}
function decoded(href) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

// core/domain/NextStep.ts
function nextStep(entry) {
  let step = null;
  for (let at = entry; ; ) {
    const open = at.subtasks.find((sub) => isOpen(sub.task.status));
    if (!open) return step;
    step = at = open;
  }
}

// core/application/taskItems.ts
function progressOf2(entry) {
  if (entry.subtasks.length === 0) return null;
  const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
  return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
}
var NO_LEVELS = { levelOf: () => null, labelsOf: () => [], projectsOf: () => [] };
function itemLevels(levels, labels, projectOf = (name) => ({ name, path: [name], note: null, canOpenNote: false, mark: true, folder: false })) {
  return {
    levelOf: (prefix) => levels.find((l) => l.prefix === prefix) ?? null,
    labelsOf: (names) => labels.filter((l) => names.includes(l.name)),
    projectsOf: (names) => names.map(projectOf)
  };
}
function itemWithId(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    const inner = itemWithId(item.allSubtasks, id);
    if (inner) return inner;
  }
  return null;
}
function ownCard(item) {
  return { text: item.text, title: item.title, over: null, step: null };
}
function cardOf(item, step) {
  return step ? { text: step.text, title: step.title, over: item.title, step } : ownCard(item);
}
function blockOf(item, step) {
  return step ? { text: step.text, title: step.title, step } : { text: item.text, title: item.title, step: null };
}
function toItem(entry, today, levels = NO_LEVELS, parent = null, boundary = DayBoundary.MIDNIGHT, drawn = null) {
  const marks = marksOfTask(entry.task);
  const choices = markChoices(marks);
  const priority = marks.priority === null ? null : levels.levelOf(marks.priority);
  const labels = levels.labelsOf(marks.labels);
  const open = isOpen(entry.task.status);
  const collapsed = entry.task.collapsed && hasOpenSubtask(entry);
  const shown3 = collapsed && open ? nextStep(entry) : null;
  const drawnBelow = shown3 ? { id: shown3.id, on: entry } : drawn;
  const allSubtasks = entry.subtasks.map((sub) => toItem(sub, today, levels, entry, boundary, drawnBelow));
  const description = descriptionMarkdown(entry);
  const step = shown3 && itemWithId(allSubtasks, shown3.id);
  const own = { text: entry.task.text, title: plainText(entry.task.text) };
  const projects = levels.projectsOf(entry.projects);
  return {
    id: entry.id,
    key: keyOf(entry),
    text: entry.task.text,
    title: plainText(entry.task.text),
    status: entry.task.status,
    dueDate: entry.task.dueDate,
    slot: entry.task.slot,
    durationMin: entry.task.slot && entry.task.slot.end !== null ? entry.task.slot.end - entry.task.slot.start : null,
    reminder: entry.task.reminder,
    repeat: entry.task.repeat?.rule ?? null,
    open,
    repeatable: repeatable(entry),
    priority,
    labels,
    colors: markColors(priority, labels),
    group: entry.group,
    project: projects[0] ?? null,
    projects,
    list: entry.section,
    isSubtask: entry.path.length > 0,
    day: dayOfTask(entry.section, entry.task, today, boundary),
    repeatDay: repeatDay(dayOf(entry.task, boundary), today),
    can: {
      postpone: canPostpone(entry.section),
      removeDue: canRemoveDue(entry.task.dueDate, today),
      remind: canRemind(entry.task.slot),
      setPriority: choices.priority,
      setLabels: choices.labels,
      stop: entry.task.repeat !== null && repeatable(entry),
      addDescription: description === null,
      fold: hasOpenSubtask(entry),
      resize: entry.task.slot !== null,
      setProject: entry.path.length === 0,
      firstStep: open
    },
    card: cardOf(own, step),
    block: blockOf(own, step),
    firstStepCard: { text: "", title: "", over: own.title, step: null },
    drawnOn: drawn?.id === entry.id ? { key: keyOf(drawn.on), slot: drawn.on.task.slot } : null,
    subtasks: allSubtasks.filter((sub) => sub.open),
    allSubtasks,
    progress: progressOf2(entry),
    collapsed,
    description,
    parentText: parent?.task.text ?? null,
    parentKey: parent ? keyOf(parent) : null
  };
}

// core/application/fullTree.ts
function unfolded(items) {
  return items.map((item) => ({ ...item, collapsed: false, card: ownCard(item), subtasks: unfolded(item.allSubtasks) }));
}
function rowsOf2(items, level, rows) {
  for (const item of items) {
    const at = rows.length;
    rows.push({ item, level, newSubtask: { index: at + 1, level: level + 1 } });
    rowsOf2(item.subtasks, level + 1, rows);
    rows[at] = { ...rows[at], newSubtask: { index: rows.length, level: level + 1 } };
  }
}
function fullTree(task) {
  const subtasks = unfolded(task.allSubtasks);
  const rows = [];
  rowsOf2(subtasks, 0, rows);
  return { task, subtasks, rows, newSubtask: { index: rows.length, level: 0 }, project: task.project };
}

// core/application/newTaskPlaces.ts
function sameKey(a, b) {
  return a === null || b === null ? a === b : keyId(a) === keyId(b);
}
function samePlacement2(a, b) {
  if (a === void 0 || b === void 0) return a === b;
  return a.kind === b.kind && (a.kind !== "date" || b.kind === "date" && a.date === b.date);
}
function sameNewPlace(a, b) {
  switch (a.kind) {
    case "list":
      return b.kind === "list" && a.list === b.list && a.group === b.group && a.date === b.date && sameKey(a.before, b.before);
    case "day":
      return b.kind === "day" && a.date === b.date && a.group === b.group && sameKey(a.before, b.before);
    case "subtask":
      return b.kind === "subtask" && sameKey(a.parent, b.parent) && sameKey(a.before, b.before);
    case "slot":
      return b.kind === "slot" && sameSlot(a.slot, b.slot);
    case "projects":
      return b.kind === "projects" && a.group === b.group && a.node === b.node && sameKey(a.before, b.before) && samePlacement2(a.placement, b.placement);
  }
}

// core/application/projectsEntry.ts
function projectsEntryLook(view) {
  if (!view) return { cards: [], sections: [], parts: [] };
  const cards = view.sections.flatMap((section) => section.rows.map((row) => ({ key: row.item.key, id: row.item.id, level: row.level, group: section.group })));
  const own = view.newTask;
  const first = own === null ? -1 : Math.max(0, view.sections.findIndex((s) => s.newTask !== null && sameNewTask(s.newTask, own)));
  const plusPart = first < 0 ? -1 : view.sections.findIndex((s, i) => i >= first && s.newTask !== null);
  return {
    cards,
    sections: view.sections.map((section) => section.group),
    parts: view.sections.map((section, i) => ({ group: section.group, newTask: section.newTask, plus: i === plusPart, end: endOf(section) }))
  };
}
function sameNewTask(a, b) {
  const project = a.project === null || b.project === null ? a.project === b.project : projectKey(a.project) === projectKey(b.project);
  return project && sameNewPlace(a.place, b.place);
}
var STAGE_RANK = { inbox: 0, backlog: 1, soon: 2, date: 2, today: 3, done: 4 };
var LIST_RANK = { inbox: 0, backlog: 1, soon: 2, now: 3 };
function endOf(section) {
  const place = section.newTask?.place;
  if (!place || place.kind !== "list") return null;
  const rank = place.date !== void 0 ? STAGE_RANK.soon : LIST_RANK[place.list];
  return section.cards.find((card) => card.stage !== null && STAGE_RANK[card.stage.kind] > rank)?.item.key ?? null;
}
function placementOfNewTask(newTask2) {
  const place = newTask2?.place;
  if (!place || place.kind !== "list") return null;
  return place.date ? { kind: "date", date: place.date } : { kind: place.list };
}
function targetOf(section, placement, today) {
  if (placement) {
    if (placement.kind !== "date") return { list: placement.kind, date: null };
    const { list, date } = dayColumn(placement.date, today);
    return { list, date };
  }
  const place = section.newTask?.place;
  if (!place || place.kind !== "list") throw new StaleTaskError();
  return { list: place.list, date: place.date ?? null };
}
function listOf2(item) {
  return item.list === "done" ? null : item.list;
}
function projectsNewPlace(view, doc, entryOf, place, today) {
  const section = view.sections.find((s) => s.group === place.group);
  if (!section || !section.newTask && !place.placement) throw new StaleTaskError();
  const { list, date } = targetOf(section, place.placement, today);
  const at = place.before === null ? section.cards.length : section.cards.findIndex((card) => samePlace(card.item.key, place.before));
  if (at < 0) throw new StaleTaskError();
  const dated = date === null ? {} : { date };
  const above = section.cards.slice(0, at).filter((card) => listOf2(card.item) === list).pop();
  if (above) {
    const entry = entryOf(above.item.key);
    const next = doc.tasks(list).find((other) => other.index > entry.index && other.group === entry.group);
    return { kind: "list", list, group: entry.group, before: next ? keyOf(next) : null, ...dated };
  }
  const below = section.cards.slice(at).find((card) => listOf2(card.item) === list);
  if (below) {
    const entry = entryOf(below.item.key);
    return { kind: "list", list, group: entry.group, before: keyOf(entry), ...dated };
  }
  return { kind: "list", list, group: null, before: null, ...dated };
}

// core/application/QuickEntry.ts
function zoneIndex(sections, zone) {
  return sections.indexOf(zone.group);
}
function entryAt(drawing, place, section) {
  const { cards, sections } = drawing;
  if (!sections.some((name) => name !== null)) return place.index <= cards.length ? { kind: "in", section: 0, card: place.index, keepsPlate: true } : { kind: "end" };
  const at = zoneIndex(sections, place);
  if (at < 0) return place.group === null ? { kind: "top" } : { kind: "end" };
  const start2 = cards.findIndex((card2) => zoneIndex(sections, card2) >= at);
  const from = start2 < 0 ? cards.length : start2;
  let end = from;
  while (end < cards.length && cards[end].group === place.group) end++;
  const card = place.index >= from && place.index <= end ? place.index : end;
  return { kind: "in", section: at, card, keepsPlate: section };
}
function stackEntry(state, task) {
  if (!state || state.spot.kind !== "stack") return null;
  const { rows, newSubtask } = fullTree(task);
  const renaming = state.renaming;
  if (renaming) {
    if (samePlace(renaming.key, task.key)) return { at: { kind: "title" }, pending: [] };
    const index = rows.findIndex((row) => samePlace(row.item.key, renaming.key));
    return index < 0 ? null : { at: { kind: "row", index, level: rows[index].level }, pending: [] };
  }
  const parent = state.spot.parent;
  const place = samePlace(parent, task.key) ? newSubtask : rows.find((row) => samePlace(row.item.key, parent))?.newSubtask;
  if (!place) return null;
  return { at: { kind: "new", index: place.index, level: place.level }, pending: state.pending.map(({ text }) => ({ text, level: place.level })) };
}
function emptySession() {
  return { field: null, runs: {}, jobs: [], next: 0 };
}
function listSpot(spot) {
  return spot.kind === "list" ? spot : null;
}
function keepsField(column) {
  return column === "projects";
}
var QuickEntry = class {
  constructor(tasks, look, session = emptySession(), emit = () => void 0, queued = () => void 0) {
    this.tasks = tasks;
    this.look = look;
    this.session = session;
    this.emit = emit;
    this.queued = queued;
    /** What the field may do, kept while it only changes its text or marks, which do not change where it may go. Not state: worked out again. */
    this.shifts = null;
  }
  get state() {
    const field = this.session.field;
    if (!field) return null;
    const task = !field.section;
    const typed2 = this.tasks.draftMarks(field.text, field.priority, field.labels);
    const marks = task ? typed2 : { ...typed2, tint: null };
    const shownPlace2 = task ? this.shownPlace(field) : null;
    const run = this.run(field.run);
    const shifts = this.mayShift(field);
    const ctx = {
      task,
      renaming: field.rename?.item ?? null,
      topLevel: this.topLevel(field),
      place: shownPlace2 !== null,
      levels: marks.tiles.levels.length,
      labels: marks.tiles.labels.length,
      indents: task && listSpot(run.spot) !== null,
      ...shifts,
      maySection: this.maySection(field)
    };
    const bar = this.bar(fieldActions(ctx), field, marks);
    const offered2 = new Set(bar.flatMap((group) => group.actions.map((action) => action.id)));
    const place = offered2.has("pickDate") ? shownPlace2 : null;
    return {
      bar,
      description: field.description ?? null,
      spot: run.spot,
      text: field.text,
      priority: field.priority,
      labels: field.labels,
      repeat: field.repeat,
      pending: run.pending.map(({ text, level }) => ({ text, level })),
      renaming: field.rename ? faced(field.rename) : null,
      indents: offered2.has("indent") || offered2.has("outdent"),
      ...shifts,
      section: offered2.has("newSection") ? field.section : null,
      marks,
      markable: offered2.has("level") || offered2.has("label"),
      place,
      places: placeChoices(place),
      repeatable: offered2.has("repeat"),
      repeatDay: repeatDay(place && this.tasks.dayOfPlacement(place), this.look.today()),
      renamed: this.renamed,
      project: offered2.has("project") ? this.projectButton(field.projects ?? []) : null,
      locksPanel: true
    };
  }
  /** The table's bar for the field, each button lit while what it sets is set. */
  bar(groups, field, marks) {
    const lit = {
      newSection: field.section,
      outdent: false,
      indent: false,
      level: marks.priority !== null,
      label: marks.labels.length > 0,
      project: (field.projects ?? []).length > 0,
      repeat: field.repeat !== null,
      description: field.description != null,
      pickDate: false
    };
    return groups.map(({ group, actions }) => ({ group, actions: actions.map(({ id, disabled }) => ({ id, disabled, lit: lit[id] })) }));
  }
  /** The field writes a task of the top level: in a list at its first level, in a slot, or a rename of one. */
  topLevel(field) {
    const { spot } = this.run(field.run);
    if (field.rename) return !field.rename.item.isSubtask;
    if (spot.kind === "stack") return false;
    return spot.kind === "slot" || spot.place.level === 0;
  }
  projectButton(links) {
    return entryProjects(links, this.tasks.projects?.() ?? []);
  }
  /** Every rename entered and not yet written, in the order entered, whether the field is still open or not. */
  get renamed() {
    return this.session.jobs.flatMap((job) => job.kind === "rename" ? [{ id: job.item.id, key: job.item.key, text: job.draft.text, title: plainText(job.draft.text) }] : []);
  }
  /** The renamed task, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
  get renaming() {
    const rename2 = this.session.field?.rename;
    return rename2 ? rename2.face ?? rename2.item.key : null;
  }
  /** What `column`'s list draws for the field: its gap, the texts waiting before it, and whether it is a section's name; null when it stands elsewhere. */
  /**
   * What `column`'s list draws for the field: none when it stands elsewhere. `drawn` is what the list is about to draw
   * (the look's cards and sections when left out); `at` is where among them the field stands.
   */
  listEntry(column, drawn) {
    const drawing = drawn ?? { cards: this.look.cards(column), sections: this.look.sections(column) };
    const state = this.state;
    const list = state && listSpot(state.spot);
    if (!state || !list || list.column !== column) return null;
    const section = state.section === true;
    return { place: list.place, pending: state.pending, section, at: entryAt(drawing, list.place, section) };
  }
  /** Where `task`'s full screen draws the field: none unless it stands in the stack of `task` or one of its subtasks. */
  stackEntry(task) {
    return stackEntry(this.state, task);
  }
  /** Where a task's full screen types under `parent` or renames it: the stack of its subtasks there, whatever list shows it. */
  stackSpot(parent) {
    return { kind: "stack", parent };
  }
  /** A double click on a list's free room: the field after the last card, in the last section, at the top level. */
  openAtEnd(column) {
    this.open(this.endOf(column));
  }
  /**
   * The plus tapped: the end of the part a shown list's plus types in (the Projects list's), else of the day column while
   * it shows, else of Inbox. A shown list that writes by parts with no part taking the plus (Done) opens nothing. Whether
   * a field opened, as `plusOpens` said before the tap.
   */
  openFromPlus() {
    const at = this.plusSpot();
    if (at) this.open(at);
    return at !== null;
  }
  /** A tap on the plus opens a field: false on a screen whose list writes by parts and has none that takes the plus (Done). */
  plusOpens() {
    return this.plusSpot() !== null;
  }
  plusSpot() {
    const shown3 = this.look.shown();
    for (const column of shown3) {
      const part2 = this.parts(column).find((p) => p.plus);
      if (part2) return this.spotIn(column, { kind: "task", group: part2.group, before: null });
    }
    if (shown3.some(keepsField)) return null;
    return this.endOf(shown3.includes("day") ? "day" : "inbox");
  }
  /** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
  openIn(column, group) {
    this.openAt(column, { kind: "task", group, before: null });
  }
  /** The plus let go at `place` of list `column` (the Projects list's `projectsPlace` drop): the field of a new task there. */
  openAt(column, place) {
    this.open(this.spotIn(column, place));
  }
  spotIn(column, asked) {
    const part2 = asked.kind === "task" ? this.parts(column).find((p) => p.group === asked.group && p.newTask !== null) : void 0;
    const place = part2 && asked.kind === "task" ? { ...asked, before: part2.end } : asked;
    const gap = gapOfPlace(this.look.cards(column), place);
    return { kind: "list", column, place: place.kind === "task" ? { ...gap, level: 0 } : gap };
  }
  /** A long tap on the timeline's free room let go: the field of a new task in that slot. */
  openSlot(slot) {
    this.open({ kind: "slot", slot });
  }
  /** The plus came to rest on `column` (null: off the lists) with `result`: the field opens where the drop showed; false where it opens nowhere. */
  openAtDrop(column, result) {
    const place = result && column ? placeOfDrop2(result) : null;
    if (column && place) this.open({ kind: "list", column, place: gapOfPlace(this.look.cards(column), place) });
    else if (result?.kind === "time") this.openSlot(this.tasks.newSlot(this.look.day(), result.start));
    else return false;
    return true;
  }
  /** Where a new subtask of `parent` is typed: last among its subtasks in the list that shows it, else last in its menu's stack. */
  subtaskSpot(parent) {
    const found = this.find(parent);
    const holder = found ? null : this.holder(parent);
    if (holder) {
      const card = this.look.cards(holder.column)[holder.index];
      return { kind: "list", column: holder.column, place: gapOfPlace(this.look.cards(holder.column), { kind: "subtask", parent: card.key, before: null }), unfold: parent };
    }
    if (!found) return { kind: "stack", parent };
    return { kind: "list", column: found.column, place: gapOfPlace(this.look.cards(found.column), { kind: "subtask", parent, before: null }) };
  }
  /**
   * Where `item` is renamed: right before its card in the list that shows it, in its card's section of its project's part
   * where the list is grouped by project; else, opened from a menu's stack, there; else
   * over its card on the timeline; null when it shows nowhere the field can stand.
   */
  renameSpot(item, inStack) {
    const found = this.find(item.key) ?? (inStack ? null : this.holder(item.key));
    if (found) {
      const card = this.look.cards(found.column)[found.index];
      return { kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } };
    }
    if (inStack) return { kind: "stack", parent: item.key };
    const slot = item.slot ?? item.drawnOn?.slot ?? null;
    return slot ? { kind: "slot", slot } : null;
  }
  /**
   * The card a list shows a task folded away in, when it has none of its own: the deepest card of a task it sits under
   * (a folded result's, whose card shows its step).
   */
  holder(key) {
    let best = null;
    for (const column of this.lookOrder()) {
      this.look.cards(column).forEach((card, index) => {
        const k = card.key;
        const holds = k.section === key.section && k.index === key.index && k.path.length < key.path.length && k.path.every((i, n) => key.path[n] === i);
        if (holds && (best === null || k.path.length > best.depth)) best = { column, index, depth: k.path.length };
      });
      if (best) return best;
    }
    return best;
  }
  /** The card the field renaming `item` at `spot` stands in place of when the task has no card of its own there. */
  faceOf(item, spot) {
    if (spot.kind === "list") {
      if (this.find(item.key)) return void 0;
      const card = this.look.cards(spot.column)[spot.place.index];
      return card ? { ...card.key, ...(card.id ?? card.key.id) !== void 0 && { id: card.id ?? card.key.id } } : void 0;
    }
    return spot.kind === "slot" && item.slot === null && item.drawnOn ? item.drawnOn.key : void 0;
  }
  /** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
  open(given, renaming) {
    if (this.session.field) this.save(this.session.field);
    const unfold = given.kind === "list" && !renaming ? given.unfold : void 0;
    const spot = given.kind === "list" ? { kind: "list", column: given.column, place: given.place } : given;
    const face = renaming ? this.faceOf(renaming, spot) : void 0;
    const rename2 = renaming ? { item: renaming, home: this.newRun(spot), moved: false, ...face && { face } } : null;
    const projects = renaming ? renaming.projects.map((p) => p.name) : namesOf(this.partProject(spot));
    const run = this.newRun(spot);
    this.reset({ run, text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, labels: renaming?.labels.map((l) => l.name) ?? [], repeat: renaming?.repeat ?? null, rename: rename2, section: false, projects });
    if (unfold) this.queue(run, { id: this.jobId(), kind: "unfold", run, key: unfold });
  }
  /**
   * The field's project becomes this one alone (its name; null: No project, none at all); the field stays where it is. A
   * folder is not taken (the field keeps its projects), unless the renamed task carries it already.
   */
  setProject(name) {
    const field = this.session.field;
    if (!field || !this.mayTake(field, name)) return;
    this.reset({ ...field, projects: namesOf(name) }, true);
  }
  /**
   * A project of the Project button's page tapped, as on the menu's page: on beside the field's others, or off when the
   * field has it. A folder is not taken, unless the renamed task carries it already.
   */
  toggleProject(name) {
    const field = this.session.field;
    if (!field) return;
    const own = field.projects ?? [];
    const has = own.some((p) => inProject(p, name));
    if (!has && !this.mayTake(field, name)) return;
    this.reset({ ...field, projects: has ? own.filter((p) => !inProject(p, name)) : [...own, name] }, true);
  }
  /**
   * Description on the bar: the line under the title opens for the caret, holding a renamed task's own description, else
   * empty; one open stays as it is. Only where the bar offers it.
   */
  openDescription() {
    const field = this.session.field;
    if (!field || field.description != null || !this.offers("description")) return;
    this.reset({ ...field, description: field.rename?.item.description ?? "" }, true);
  }
  /** The description's line typed: its text, written with the title by Enter or a tap away. */
  typeDescription(text) {
    const field = this.session.field;
    if (field && field.description != null) this.reset({ ...field, description: text }, true);
  }
  /** Whether the bar offers `id` now. */
  offers(id) {
    return this.state?.bar.some((group) => group.actions.some((action) => action.id === id)) ?? false;
  }
  /** A project the field may take: none, any but a folder, or a folder the renamed task carries already. */
  mayTake(field, name) {
    const held = field.rename?.item.projects.some((p) => inProject(p.name, name)) ?? false;
    return held || !isFolderRef(name, this.tasks.projects?.() ?? []);
  }
  type(text) {
    const field = this.session.field;
    if (field) this.reset({ ...field, text }, true);
  }
  /** A level chosen takes the place of a prefix typed: the text keeps no prefix, so the file gets one. Null takes the level off. */
  setPriority(prefix) {
    const field = this.session.field;
    if (!field) return;
    const text = this.tasks.parseTitle(field.text).priority ? this.tasks.withPriority(field.text, null) : field.text;
    this.reset({ ...field, text, priority: prefix }, true);
  }
  /** A level's tile tapped: the level, or none when the task is already written with it. */
  togglePriority(prefix) {
    const state = this.state;
    if (state) this.setPriority(state.marks.priority?.prefix === prefix ? null : prefix);
  }
  setLabels(labels) {
    const field = this.session.field;
    if (field) this.reset({ ...field, labels }, true);
  }
  /** A label's tile tapped: on when the task is not written with it, else off. */
  toggleLabel(name) {
    const state = this.state;
    if (!state) return;
    const chosen = state.marks.labels.map((l) => l.name);
    this.setLabels(chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name]);
  }
  setRepeat(rule) {
    const field = this.session.field;
    if (field) this.reset({ ...field, repeat: rule }, true);
  }
  indent(delta) {
    const place = this.shifted(delta);
    const field = this.session.field;
    const run = field && this.run(field.run);
    const list = run && listSpot(run.spot);
    if (!place || !run || !list) return;
    run.spot = { ...list, place };
    this.shifts = null;
    this.changed();
  }
  /**
   * The field switches between a task and a section's name. A section stands between tasks of the top level: the field
   * goes there, past the subtasks of the task above it.
   */
  toggleSection() {
    const field = this.session.field;
    const list = field && listSpot(this.run(field.run).spot);
    if (!field || !list || !this.maySection(field)) return;
    const section = !field.section;
    const run = section && list.place.level > 0 ? this.newRun({ ...list, place: this.topLevelAfter(list.column, list.place) }) : field.run;
    this.reset({ ...field, run, section });
  }
  enter() {
    const field = this.session.field;
    if (!field) return;
    if (field.rename) this.enterRename(field, field.rename);
    else if (field.section) this.enterSection(field);
    else if (this.blank(field.text)) this.enterBlank();
    else this.enterTask(field);
  }
  /** A tap elsewhere: the text is kept as by Enter, and the field closes. */
  blur() {
    const field = this.session.field;
    if (!field) return;
    this.save(field);
    this.reset(null);
  }
  /** The field's own text goes; what Enter already sent is still written. */
  escape() {
    this.reset(null);
  }
  /**
   * A place chosen in the bar: the field goes to the end of that place's column at once, a renamed task with it. What it
   * answers: the column, and the day the day column must open when the place is another day than it shows; null when
   * the place is the one the field already has, which changes nothing.
   */
  choosePlace(placement) {
    const field = this.session.field;
    if (!field) return null;
    const shown3 = this.shownPlace(field);
    if (shown3 && samePlacement(shown3, placement)) return null;
    const rename2 = field.rename && { ...field.rename, moved: true };
    const list = listSpot(this.run(field.run).spot);
    if (list && keepsField(list.column)) {
      this.reset({ ...field, rename: rename2, placement });
      return { column: list.column, day: null };
    }
    const column = placement.kind === "now" || placement.kind === "date" ? "day" : placement.kind;
    this.reset({ ...field, rename: rename2, run: this.newRun(this.endOf(column)) });
    const day = this.tasks.dayOfPlacement(placement);
    return { column, day: day === null || day === this.look.day() ? null : day };
  }
  /** The field, its text and marks, at the end of `column`; what was entered at the old spot is still written there. */
  moveToEnd(column) {
    const field = this.session.field;
    if (field) this.reset({ ...field, run: this.newRun(this.endOf(column)) });
  }
  /**
   * Where a task written in `column` goes: a list's place, the day column's on the day it shows, or a place of the
   * Projects list, which the service reads off the screen when it writes (`placement`: the one chosen in the bar there).
   */
  placeOf(column, result, placement) {
    if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
    const { group, before } = result;
    switch (column) {
      case "projects": {
        const node = this.look.filter?.()?.node;
        return { kind: "projects", group, before, ...placement && { placement }, ...node !== void 0 && { node } };
      }
      case "day":
        return { kind: "day", date: this.look.day(), group, before };
      default:
        return { kind: "list", list: column, group, before };
    }
  }
  /** A slot of the field. */
  slotPlace(slot) {
    return { kind: "slot", slot };
  }
  job(id) {
    const job = this.session.jobs.find((j) => j.id === id);
    if (!job) throw new Error(`Task Calendar: no entry job ${id}`);
    return job;
  }
  /**
   * The service call job `id` is, read when the lists show every write before it: a task at the level it was entered at,
   * as far as the cards then allow, with the field's project (a subtask's is its parent's: none); a rename by the key the
   * lists give the task then; a section at the top level where the field stood. Null when it is nothing to write. A slot
   * takes no rule.
   */
  call(id) {
    const job = this.job(id);
    switch (job.kind) {
      case "create": {
        const { line } = job;
        const { spot } = this.run(job.run);
        job.landing = null;
        switch (spot.kind) {
          case "slot":
            return { method: "createInPlace", args: withDescription([line.text, line.priority, this.slotPlace(spot.slot), line.repeat, line.labels, projectArg(line.projects)], line) };
          case "stack":
            return { method: "createInPlace", args: withDescription([line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null }, line.repeat, line.labels], line) };
          case "list": {
            const cards = this.look.cards(spot.column);
            const place = fitLevel(cards, { ...spot.place, level: line.level });
            job.landing = spot.column;
            const at = this.placeOf(spot.column, placeOfGap(cards, place), line.placement);
            const filter = this.look.filter?.()?.node ?? null;
            if (at.kind === "subtask") return { method: "createInPlace", args: withDescription([line.text, line.priority, at, line.repeat, line.labels], line) };
            return { method: "createInPlace", args: withDescription(filter !== null && at.kind !== "projects" ? [line.text, line.priority, at, line.repeat, line.labels, projectArg(line.projects), filter] : [line.text, line.priority, at, line.repeat, line.labels, projectArg(line.projects)], line) };
          }
        }
        break;
      }
      case "rename":
        return { method: "edit", args: [this.keyAt(job.home, job.item), job.draft] };
      case "unfold":
        return { method: "unfoldAbove", args: [job.key] };
      case "section": {
        const at = this.placeOf(job.column, placeOfGap(this.look.cards(job.column), { ...job.place, level: 0 }));
        return at.kind === "list" || at.kind === "day" ? { method: "createSection", args: [job.name, at] } : null;
      }
    }
  }
  /**
   * A task job's line is written and the lists are about to draw it (`coming`: the cards each column draws then). It
   * leaves the queue, and the places at or past its card move down, in the very drawing that shows its card: where the
   * lists draw the task the file holds (`created`, the key the write gave), which its rules may have put elsewhere.
   */
  /** `created`: the task the write made, its key, or with its id (`createWithId`), which finds its card whatever wrote since. */
  shown(id, created, coming) {
    const job = this.job(id);
    if (job.kind !== "create") return;
    const held = this.session.field?.run ?? null;
    const was = held === null ? null : this.run(held).spot;
    if (job.landing && created) this.landed(job.landing, created, coming(job.landing));
    this.run(job.run).pending.shift();
    job.shown = true;
    this.shifts = null;
    const now = this.session.field?.run ?? null;
    if (held !== null && (held === job.run || now !== held || this.run(held)?.spot !== was)) this.emit(this.state, true);
  }
  /** A task job ended without its line shown (its write failed): the line stops waiting under the cards. */
  unshown(id) {
    const job = this.job(id);
    if (job.kind !== "create" || job.shown) return;
    this.run(job.run).pending.shift();
    this.shifts = null;
    if (job.run === this.session.field?.run) this.changed();
  }
  /** Job `id` ended, written or not: its spot no longer follows the cards for it. */
  done(id) {
    const job = this.job(id);
    if (job.kind === "unfold") this.unfolded(job);
    this.release(job.kind === "rename" ? job.home : job.run);
    this.session.jobs.splice(this.session.jobs.indexOf(job), 1);
  }
  /**
   * The lists show the task unfolded: the field typing its subtask goes last among its subtasks there. Still folded away
   * (the write failed), the field closes rather than type a subtask of the card it stood under.
   */
  unfolded(job) {
    const run = this.run(job.run);
    if (!run || this.session.field?.run !== job.run) return;
    const at = this.find(job.key);
    if (!at) return this.reset(null);
    run.spot = { kind: "list", column: at.column, place: gapOfPlace(this.look.cards(at.column), { kind: "subtask", parent: job.key, before: null }) };
    this.shifts = null;
    this.changed();
  }
  run(id) {
    return this.session.runs[id];
  }
  newRun(spot) {
    const id = `r${this.session.next++}`;
    this.session.runs[id] = { spot, pending: [], holds: 0 };
    return id;
  }
  hold(id) {
    this.run(id).holds++;
  }
  release(id) {
    const run = this.run(id);
    if (!run) return;
    run.holds--;
    if (run.holds <= 0) delete this.session.runs[id];
  }
  maySection(field) {
    const list = listSpot(this.run(field.run).spot);
    return !field.rename && list !== null && this.look.sectioned(list.column);
  }
  /** The gap of the top level at or after `place` in its section: past the subtasks it stands among. */
  topLevelAfter(column, place) {
    const cards = this.look.cards(column);
    let index = place.index;
    while (index < cards.length && cards[index].group === place.group && cards[index].level > 0) index++;
    return { ...place, index, level: 0 };
  }
  mayShift(field) {
    const list = listSpot(this.run(field.run).spot);
    if (field.rename || field.section || !list) return { canIndent: false, canOutdent: false };
    const cards = this.look.cards(list.column);
    const { spot } = this.run(field.run);
    const kept = this.shifts;
    if (kept?.cards === cards && kept.spot === spot) return { canIndent: kept.indent, canOutdent: kept.outdent };
    const shifts = { cards, spot, indent: this.shiftedRun(field.run, cards, 1) !== null, outdent: this.shiftedRun(field.run, cards, -1) !== null };
    this.shifts = shifts;
    return { canIndent: shifts.indent, canOutdent: shifts.outdent };
  }
  /** The place button: a subtask's field, new or renamed, has none, nor does one off the lists. */
  shownPlace(field) {
    const list = listSpot(this.run(field.run).spot);
    if (!list) return null;
    if (field.rename) return field.rename.item.isSubtask ? null : this.placement(field);
    if (list.place.level > 0) return null;
    return field.placement ?? this.listPlacement(list);
  }
  /** Where a renamed task goes: where it was, until a place is chosen in the bar. */
  placement(field) {
    if (field.placement) return field.placement;
    const item = field.rename?.item ?? null;
    const list = listSpot(this.run(field.run).spot);
    if (list && (field.rename?.moved || !item)) return this.listPlacement(list);
    return item ? this.tasks.placementOf(item) : this.columnPlacement("day");
  }
  /** Where a new task at `spot` goes: its column's place, or what its part writes where the list decides that itself. */
  listPlacement(spot) {
    if (spot.column !== "projects") return this.columnPlacement(spot.column);
    return placementOfNewTask(this.partAt(spot)?.newTask ?? null) ?? { kind: "inbox" };
  }
  columnPlacement(column) {
    return column === "day" ? this.tasks.placementOfDay(this.look.day()) : { kind: column };
  }
  parts(column) {
    return this.look.parts?.(column) ?? [];
  }
  /** The part a list spot stands in, where its list decides what a new task writes. */
  partAt(spot) {
    return this.parts(spot.column).find((part2) => part2.group === spot.place.group) ?? null;
  }
  /** The project a new task's field opened at `spot` starts with: its part's, where the list has parts; elsewhere the filter's; none without one. */
  partProject(spot) {
    const list = listSpot(spot);
    if (list && this.parts(list.column).length > 0) return this.partAt(list)?.newTask?.project ?? null;
    return this.look.filter?.()?.project ?? null;
  }
  /** The lists a task is looked for in: the shown ones first, then every other the entry knows. */
  lookOrder() {
    const shown3 = this.look.shown();
    return [...shown3, ...ENTRY_LISTS.filter((c) => !shown3.includes(c))];
  }
  /** After the last card, in the last section, at the top level; with `project`, of that project's part where the list draws one. */
  endOf(column) {
    const sections = this.look.sections(column);
    const group = sections.length > 0 ? sections[sections.length - 1] : null;
    return { kind: "list", column, place: { kind: "gap", index: this.look.cards(column).length, level: 0, group } };
  }
  find(key) {
    for (const column of this.lookOrder()) {
      const index = this.look.cards(column).findIndex((card) => samePlace(card.key, key));
      if (index >= 0) return { column, index };
    }
    return null;
  }
  /** Saved, then a new line under the task; a blank text cancels the rename. */
  enterRename(field, rename2) {
    const list = listSpot(this.run(field.run).spot);
    if (this.blank(field.text)) this.reset(null);
    else {
      this.saveRename(field, rename2);
      const under = list && !rename2.face && this.under(list, rename2.item);
      this.reset(under ? { run: this.newRun(under), text: "", priority: null, labels: [], repeat: null, rename: null, section: false, projects: namesOf(this.partProject(under)) } : null);
    }
  }
  /** The section goes to the queue and the field closes; a blank name writes nothing. */
  enterSection(field) {
    this.createSection(field);
    this.reset(null);
  }
  /** As in Obsidian: a level shallower, and the end of the entry where it can go no shallower. */
  enterBlank() {
    if (this.shifted(-1)) this.indent(-1);
    else this.reset(null);
  }
  /** The task goes to the queue; the next field opens at once, without a priority, labels or a repeat. A slot takes one task only. */
  enterTask(field) {
    this.create(field);
    const ends = this.run(field.run).spot.kind === "slot";
    this.reset(ends ? null : { ...field, text: "", priority: null, labels: [], repeat: null, description: null });
  }
  /** The field becomes `field` (none: closed); the runs it stands on are held while it does. `sameShifts`: only its text or marks changed. */
  reset(field, sameShifts = false) {
    const old = this.session.field;
    for (const run of runsOf(field)) this.hold(run);
    for (const run of runsOf(old)) this.release(run);
    this.session.field = field;
    if (!sameShifts) this.shifts = null;
    this.changed();
  }
  save(field) {
    if (field.section) return this.createSection(field);
    if (this.blank(field.text)) return;
    if (field.rename) this.saveRename(field, field.rename);
    else this.create(field);
  }
  /** Edits by the key the lists give the task when the job runs: the one read at the open may have gone stale. The task's own rule and labels, the same in the field, are left as the file has them. */
  saveRename(field, { item, home }) {
    const own = item.projects.map((p) => p.name);
    const projects = field.projects === void 0 || sameProjects(own, field.projects) ? {} : { projects: field.projects };
    const description = field.description != null && field.description !== (item.description ?? "") ? field.description : null;
    const draft = { text: field.text, placement: this.placement(field), priority: field.priority, ...!sameNames(field.labels, item.labels.map((l) => l.name)) && { labels: field.labels }, ...!sameRule(field.repeat, item.repeat) && { repeat: field.repeat }, ...projects, ...description !== null && { description } };
    this.queue(home, { id: this.jobId(), kind: "rename", home, item, draft });
  }
  /** `### name` queued where the field stands; always at the top level. */
  createSection(field) {
    const name = field.text.trim();
    const list = listSpot(this.run(field.run).spot);
    if (name === "" || !list) return;
    this.queue(field.run, { id: this.jobId(), kind: "section", run: field.run, name, column: list.column, place: list.place });
  }
  /** The renamed task's key as the lists show it now: the card at its place while that is still it. */
  keyAt(home, item) {
    const run = this.run(home);
    const list = run && listSpot(run.spot);
    if (!list) return item.key;
    const card = this.look.cards(list.column)[list.place.index];
    return card && sameLine(card.key, item.key) ? card.key : item.key;
  }
  /** The field's text queued at its run, waiting under the cards until the lists show it written. */
  create(field) {
    const run = this.run(field.run);
    const line = { text: field.text, priority: field.priority, labels: field.labels, repeat: field.repeat, level: listSpot(run.spot)?.place.level ?? 0, projects: field.projects ?? [], description: typedDescription(field.description), ...field.placement && { placement: field.placement } };
    run.pending.push(line);
    this.queue(field.run, { id: this.jobId(), kind: "create", run: field.run, line });
  }
  /** A job for `run`, which keeps following the cards that land until the job is done. */
  queue(run, job) {
    this.hold(run);
    this.session.jobs.push(job);
    this.queued(job);
  }
  jobId() {
    return `j${this.session.next++}`;
  }
  /**
   * The places at or past the created task's card move down, when `column` is to show it among `cards`. A key gone stale
   * because another write or a sync landed between the create and this read finds no card: the field then stays where it
   * is, as for a task put elsewhere.
   */
  landed(column, created, cards) {
    const key = "key" in created ? created.key : created;
    const id = "key" in created ? created.id : created.id;
    const index = cards.findIndex((card) => {
      const own = card.id ?? card.key.id;
      return id !== void 0 && own !== void 0 ? own === id : samePlace(card.key, key) && sameLine(card.key, key);
    });
    if (index < 0) return;
    for (const run of Object.values(this.session.runs)) {
      const list = listSpot(run.spot);
      if (!list || list.column !== column || list.place.index < index) continue;
      run.spot = { ...list, place: { ...list.place, index: list.place.index + 1 } };
    }
  }
  /** Right under a renamed task at its level, or its first subtask when it shows some: nothing may stand between a task and them. */
  under(spot, item) {
    const { place } = spot;
    const shown3 = item.subtasks.length > 0 && !item.collapsed;
    return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (shown3 ? 1 : 0) } };
  }
  /** The field's place a level deeper or shallower; null when the cards around forbid it, or the field does not move (a rename, a slot, a stack). */
  shifted(delta) {
    const field = this.session.field;
    const list = field && listSpot(this.run(field.run).spot);
    if (!field || field.rename || !list) return null;
    return this.shiftedRun(field.run, this.look.cards(list.column), delta);
  }
  /** The run's place a level deeper or shallower, bound by `cards` with the texts entered there standing in before it. */
  shiftedRun(id, cards, delta) {
    const run = this.run(id);
    const list = listSpot(run.spot);
    if (!list) return null;
    const { place } = list;
    const unwritten = run.pending.map((line) => ({ level: line.level, group: place.group }));
    const shown3 = [...cards.slice(0, place.index), ...unwritten, ...cards.slice(place.index)];
    const shifted = shiftLevel(shown3, { ...place, index: place.index + unwritten.length }, delta);
    return shifted && { ...place, level: shifted.level };
  }
  blank(text) {
    return this.tasks.isBlank(text);
  }
  changed() {
    this.emit(this.state);
  }
};
function placeOfDrop2(result) {
  switch (result.kind) {
    case "list":
      return { kind: "task", group: null, before: result.before };
    case "group":
      return { kind: "task", group: result.group, before: result.before };
    case "nest":
      return { kind: "subtask", parent: result.parent, before: result.before };
    case "place":
      return result.place ?? { kind: "task", group: null, before: null };
    default:
      return null;
  }
}
function entryProject(link, known) {
  return entryProjects(namesOf(link), known);
}
function entryProjects(links, known) {
  const refs = links.flatMap((link) => refOf(link, known) ?? []);
  return { page: projectPage([refs], known.map((project) => ({ project, depth: project.path.length - 1 }))), lit: links.length > 0 };
}
function namesOf(link) {
  return link === null ? [] : [link];
}
function projectArg(projects) {
  if (!projects || projects.length === 0) return null;
  return projects.length === 1 ? projects[0] : projects;
}
function withDescription(args, line) {
  if (!line.description) return args;
  return [args[0], args[1], args[2], args[3], args[4], args[5] ?? null, args[6] ?? null, line.description];
}
function typedDescription(text) {
  return text != null && text.trim() !== "" ? text : null;
}
function sameProjects(a, b) {
  return a.length === b.length && a.every((name, i) => inProject(name, b[i]));
}
function isFolderRef(name, known) {
  return name !== null && known.some((ref) => ref.folder && projectKey(ref.name) === projectKey(name));
}
function refOf(link, known) {
  if (link === null) return null;
  const name = projectName(link);
  return known.find((ref) => projectKey(ref.name) === projectKey(name)) ?? { name, path: [name], note: null, canOpenNote: false, mark: true, folder: false };
}
function faced(rename2) {
  const { item, face } = rename2;
  return face ? { ...item, key: face, id: face.id ?? item.id } : item;
}
function runsOf(field) {
  if (!field) return [];
  return field.rename ? [field.run, field.rename.home] : [field.run];
}
function sameNames(a, b) {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

// core/application/stackedRows.ts
function stackedRows(wanted, room, least2) {
  if (wanted.length === 0) return [];
  const asked = wanted.map((height) => Math.max(height, least2));
  if (asked.reduce((sum, height) => sum + height, 0) <= room) return asked;
  const heights = [...asked];
  let left = Math.max(room, least2 * asked.length);
  const open = asked.map((_, i) => i).sort((a, b) => asked[a] - asked[b]);
  while (open.length > 0) {
    const share = left / open.length;
    const first = open[0];
    if (asked[first] > share) {
      for (const i of open) heights[i] = share;
      return heights;
    }
    heights[first] = asked[first];
    left -= asked[first];
    open.shift();
  }
  return heights;
}
function stackedLists(lists, room, fade) {
  const wanted = lists.map((list) => list.wanted);
  if (wanted.reduce((sum, height) => sum + height, 0) <= room) return wanted;
  const least2 = lists.map((list) => Math.min(list.wanted, (list.stops[0] ?? list.wanted) + fade));
  const heights = stackedRows(wanted, room, 0).map((height, i) => Math.max(least2[i], snapped(lists[i], height, fade)));
  let left = room - heights.reduce((sum, height) => sum + height, 0);
  for (; ; ) {
    const steps = lists.map((list, i) => grown(list, heights[i], fade) - heights[i]);
    const next = steps.reduce((best, step, i) => step > 0 && step <= left && (best < 0 || step < steps[best]) ? i : best, -1);
    if (next < 0) return heights;
    heights[next] += steps[next];
    left -= steps[next];
  }
}
function snapped(list, height, fade) {
  if (height >= list.wanted) return list.wanted;
  return list.stops.map((stop2) => stop2 + fade).filter((end) => end <= height && end < list.wanted).pop() ?? 0;
}
function grown(list, height, fade) {
  const end = list.stops.map((stop2) => stop2 + fade).find((at) => at > height) ?? list.wanted;
  return Math.min(end, list.wanted);
}

// core/application/listWidth.ts
var LIST_WIDTHS = { min: 110, max: 280 };
function listWidths(share, viewWidth, dividerWidth) {
  const columns = viewWidth - dividerWidth;
  const max = Math.max(LIST_WIDTHS.max, columns - LIST_WIDTHS.min);
  return { width: Math.min(max, Math.max(LIST_WIDTHS.min, share * columns)), min: LIST_WIDTHS.min, max, center: columns / 2 };
}
function listShareOf(width, viewWidth, dividerWidth) {
  return width / (viewWidth - dividerWidth);
}
var DIVIDER_SNAP = { distance: 8, slowSpeed: 0.08 };
function dividerAt(wanted, widths, speed) {
  const reachable = widths.center >= widths.min && widths.center <= widths.max;
  const snapped2 = reachable && speed < DIVIDER_SNAP.slowSpeed && Math.abs(wanted - widths.center) <= DIVIDER_SNAP.distance;
  const width = snapped2 ? widths.center : Math.round(wanted);
  return { width: Math.min(widths.max, Math.max(widths.min, width)), snapped: snapped2 };
}
function allColumnsWidths(share, viewWidth, dividerWidth) {
  const room = viewWidth - 3 * dividerWidth;
  const max = Math.max(LIST_WIDTHS.min, (room - LIST_WIDTHS.min) / 3);
  const width = Math.min(max, Math.max(LIST_WIDTHS.min, share * room / (1 + 2 * share)));
  return { width, min: LIST_WIDTHS.min, max, center: room / 4 };
}
function allColumnsShare(width, viewWidth, dividerWidth) {
  const timeline = viewWidth - 3 * dividerWidth - 3 * width;
  return width + timeline > 0 ? width / (width + timeline) : 0.5;
}
function allColumnsDividerAt(width, dividerWidth) {
  return 3 * width + 2 * dividerWidth;
}
function allColumnsWidthAt(at, dividerWidth) {
  return (at - 2 * dividerWidth) / 3;
}

// core/application/projectsLift.ts
function originOf(item) {
  if (item.list === "done") return null;
  if (item.slot !== null) return "timeline";
  if (item.list === "now" || item.list === "soon" && item.dueDate !== null) return "day";
  return item.list;
}
function liftedOf(item) {
  return { id: item.id, list: item.list, origin: originOf(item) };
}
function dropOf(item, from) {
  return { key: item.key, from, lifted: liftedOf(item) };
}

// core/application/taskPlaces.ts
function placeOfScreen(screen, today) {
  if (screen.kind === "list") return { kind: screen.list };
  return { kind: screen.date === today ? "today" : "day", date: screen.date };
}
function placeOfTask(section, task, open, today, boundary) {
  if (!open) return { kind: "done" };
  return placeOfScreen(taskScreen(section, dayOfTask(section, task, today, boundary)), today);
}
function funnelRank(place) {
  const ranks = { inbox: "0", backlog: "1", soon: "2", today: "3", day: "4", done: "5" };
  return "date" in place ? `${ranks[place.kind]}${place.date}` : ranks[place.kind];
}

// core/application/projectsScreen.ts
var PROJECTS_WORDS = {
  all: "All",
  none: NO_PROJECT,
  done: "Done",
  today: "Today",
  byProject: "By project",
  byStage: "By stage",
  noTasks: "No tasks",
  rename: "Rename",
  note: "Note",
  attach: "Attach note…",
  detach: "Detach",
  folder: "Folder",
  folderReason: "Has tasks of its own",
  deleteProject: "Delete project",
  deleteMessage: "Its tasks stay; they just lose this project.",
  deleteConfirm: "Delete",
  deleteCancel: "Cancel"
};
var PROJECT_PREFIX = "project:";
function projectNodeOf(name) {
  return `${PROJECT_PREFIX}${name}`;
}
function projectOfNode(node) {
  return node.startsWith(PROJECT_PREFIX) ? node.slice(PROJECT_PREFIX.length) : null;
}
function sameNode(a, b) {
  const x = projectOfNode(a);
  const y = projectOfNode(b);
  return x !== null && y !== null ? projectKey(x) === projectKey(y) : a === b;
}
function tasksOf(doc) {
  return doc.allTasks();
}
function counts(entry) {
  return isOpen(entry.task.status) ? entry.section !== "done" : true;
}
function projectStatuses(tree, doc) {
  const tasks = tasksOf(doc).filter(counts);
  const statuses = /* @__PURE__ */ new Map();
  const visit = (node) => {
    const children = node.children.map(visit);
    const own = tasks.filter((entry) => namesProject(entry.task.projects, node.name));
    const total = own.length + children.reduce((sum, child) => sum + child.tasks, 0);
    const status = own.some((e) => isOpen(e.task.status)) || children.some((c) => c.status === "active") ? "active" : total === 0 || children.some((c) => c.status !== "done") ? "waiting" : "done";
    statuses.set(projectKey(node.name), status);
    return { status, tasks: total };
  };
  tree.roots.forEach(visit);
  return statuses;
}
function subprojectsOn(state) {
  return state.subprojects !== false;
}
function selectedNode(state, tree) {
  return chosenNode(state, tree) ?? "all";
}
function chosenNode(state, tree) {
  return filterNode(state.selected, tree);
}
function filterNode(node, tree) {
  return node === "all" ? null : nodeIn(node, tree);
}
function nodeIn(node, tree) {
  if (node === null || node === void 0) return null;
  const name = projectOfNode(node);
  if (name === null) return node === "all" || node === "none" || node === "done" ? node : null;
  const found = tree.find(name);
  return found ? projectNodeOf(found.node.name) : null;
}
function isFolded(state, name) {
  return (state.folded ?? []).some((node) => sameNode(node, projectNodeOf(name)));
}
function projectsView(input) {
  const { tree, state } = input;
  const statuses = input.doc ? projectStatuses(tree, input.doc) : /* @__PURE__ */ new Map();
  const statusOf3 = (name2) => statuses.get(projectKey(name2)) ?? "waiting";
  const fixed = input.node === void 0 ? null : nodeIn(input.node, tree);
  const selected2 = fixed ?? selectedNode(state, tree);
  const rows = treeRows(tree, state, selected2, statusOf3, (node) => input.doc !== null && nodeReorders(node, statusOf3), hasLooseOpen(input.doc));
  const parts = input.doc ? sectionsOf(input, input.doc, selected2, statusOf3) : [];
  const name = projectOfNode(selected2);
  const placed = name === null ? null : tree.find(name);
  return {
    rows,
    selected: selected2,
    title: placed ? placed.node.name : selected2 === "none" ? PROJECTS_WORDS.none : selected2 === "done" ? PROJECTS_WORDS.done : PROJECTS_WORDS.all,
    menu: placed ? projectMenu(refOfPlaced(placed, false), input.doc !== null && hasOwnTasks(input.doc, placed.node.name)) : null,
    sections: parts,
    newTask: selected2 === "done" || placed !== null && (placed.node.folder || statusOf3(placed.node.name) === "done") ? null : inInbox(placed?.node.name ?? null),
    emptyLabel: PROJECTS_WORDS.noTasks,
    missing: input.doc === null,
    reorders: input.doc !== null && nodeReorders(selected2, statusOf3)
  };
}
function panelRows(tree, doc, state) {
  const statuses = doc ? projectStatuses(tree, doc) : /* @__PURE__ */ new Map();
  const statusOf3 = (name) => statuses.get(projectKey(name)) ?? "waiting";
  return treeRows(tree, state, selectedNode(state, tree), statusOf3, (node) => doc !== null && nodeReorders(node, statusOf3), hasLooseOpen(doc));
}
function hasLooseOpen(doc) {
  return doc !== null && tasksOf(doc).some((entry) => entry.task.projects.length === 0 && stageOf(entry) !== "done");
}
function nodeHeader(node, tree, doc) {
  const name = projectOfNode(node);
  const placed = name === null ? null : tree.find(name);
  if (!placed) return { title: node === "none" ? PROJECTS_WORDS.none : node === "done" ? PROJECTS_WORDS.done : PROJECTS_WORDS.all, menu: null, project: null, closed: node === "done" };
  const done = doc !== null && projectStatuses(tree, doc).get(projectKey(placed.node.name)) === "done";
  return {
    title: placed.node.name,
    menu: projectMenu(refOfPlaced(placed, false), doc !== null && hasOwnTasks(doc, placed.node.name)),
    project: placed.node.folder || done ? null : placed.node.name,
    closed: done
  };
}
function cleared(state) {
  if (state.selected === void 0) return state;
  const { selected: _gone, ...rest } = state;
  return rest;
}
function nodeReorders(node, statusOf3) {
  const name = projectOfNode(node);
  return node !== "done" && !(name !== null && statusOf3(name) === "done");
}
function projectMenu(project, ownTasks) {
  const locked = !project.folder && ownTasks;
  return {
    project,
    renameLabel: PROJECTS_WORDS.rename,
    noteLabel: PROJECTS_WORDS.note,
    note: project.note === null ? null : { link: project.note, name: projectName(project.note.split("|")[0].split("#")[0]) },
    attachLabel: PROJECTS_WORDS.attach,
    detachLabel: PROJECTS_WORDS.detach,
    folder: { label: PROJECTS_WORDS.folder, on: project.folder, disabled: locked, reason: locked ? PROJECTS_WORDS.folderReason : null },
    delete: {
      label: PROJECTS_WORDS.deleteProject,
      title: `Delete “${project.name}”?`,
      message: PROJECTS_WORDS.deleteMessage,
      confirm: PROJECTS_WORDS.deleteConfirm,
      cancel: PROJECTS_WORDS.deleteCancel,
      destructive: true
    }
  };
}
function inInbox(project) {
  return { place: { kind: "list", list: "inbox", group: null, before: null }, project };
}
function treeRows(tree, state, selected2, statusOf3, reorders, looseOpen) {
  const row = (fields) => ({ ...fields, opensOnHover: fields.acceptsTask && !fields.selected && reorders(fields.node) });
  const rows = [row(fixedRow("all", PROJECTS_WORDS.all, selected2, false, false))];
  const walk = (nodes, path, depth, done) => {
    for (const node of nodes) {
      if (statusOf3(node.name) === "done" !== done) continue;
      const branch = node.children.filter((child) => statusOf3(child.name) === "done" === done);
      const folded2 = branch.length > 0 && isFolded(state, node.name);
      const own = [...path, node.name];
      const status = statusOf3(node.name);
      rows.push(row({
        node: projectNodeOf(node.name),
        kind: "project",
        title: node.name,
        depth,
        tile: depth === 0,
        waiting: status === "waiting",
        muted: status !== "active",
        status,
        selected: sameNode(selected2, projectNodeOf(node.name)),
        hasBranch: branch.length > 0,
        folded: folded2,
        project: refOfPlaced({ node, path: own }, false),
        acceptsTask: !node.folder,
        canLift: !done,
        unfoldsOnHover: folded2
      }));
      if (!folded2) walk(node.children, own, depth + 1, done);
    }
  };
  walk(tree.roots, [], 0, false);
  rows.push(row({ ...fixedRow("none", PROJECTS_WORDS.none, selected2, false, true), muted: !looseOpen }));
  const doneTops = doneRoots(tree, statusOf3);
  const open = state.doneOpen === true;
  rows.push(row({ ...fixedRow("done", PROJECTS_WORDS.done, selected2, doneTops.length > 0, false), folded: doneTops.length > 0 && !open }));
  if (open) for (const top of doneTops) walkDone(top, rows, state, selected2, statusOf3, 1, row);
  return rows;
}
function doneRoots(tree, statusOf3) {
  return tree.all().filter((placed) => {
    if (statusOf3(placed.node.name) !== "done") return false;
    const parent = placed.path.length > 1 ? placed.path[placed.path.length - 2] : null;
    return parent === null || statusOf3(parent) !== "done";
  });
}
function walkDone(placed, rows, state, selected2, statusOf3, depth, row) {
  const { node, path } = placed;
  const folded2 = node.children.length > 0 && isFolded(state, node.name);
  rows.push(row({
    node: projectNodeOf(node.name),
    kind: "project",
    title: node.name,
    depth,
    tile: false,
    waiting: false,
    muted: true,
    status: statusOf3(node.name),
    selected: sameNode(selected2, projectNodeOf(node.name)),
    hasBranch: node.children.length > 0,
    folded: folded2,
    project: refOfPlaced(placed, false),
    acceptsTask: !node.folder,
    canLift: false,
    unfoldsOnHover: folded2
  }));
  if (!folded2) for (const child of node.children) walkDone({ node: child, path: [...path, child.name] }, rows, state, selected2, statusOf3, depth + 1, row);
}
function fixedRow(node, title, selected2, hasBranch, acceptsTask) {
  return { node, kind: node, title, depth: 0, tile: true, waiting: false, muted: node !== "all", status: null, selected: selected2 === node, hasBranch, folded: false, project: null, acceptsTask, canLift: false, unfoldsOnHover: false };
}
var STAGE_ORDER = ["inbox", "backlog", "soon", "today", "done"];
function stageOf(entry) {
  if (!isOpen(entry.task.status) || entry.section === "done") return "done";
  return entry.section === "now" ? "today" : entry.section;
}
function stageMark(entry, today, boundary) {
  const place = placeOfTask(entry.section, entry.task, stageOf(entry) !== "done", today, boundary);
  if (place.kind === "day") return { kind: "date", date: place.date, label: dueLabel(place.date) };
  return { kind: place.kind };
}
function menuFromOf(entry) {
  if (entry.section === "now") return "day";
  return entry.section;
}
function tasksNaming(doc, name, closed) {
  return tasksOf(doc).filter((entry) => namesProject(entry.task.projects, name) && (closed ? stageOf(entry) === "done" : stageOf(entry) !== "done"));
}
function byStage(entries) {
  const rank = (entry) => STAGE_ORDER.indexOf(stageOf(entry));
  return entries.map((entry, i) => ({ entry, i })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.i - b.i).map(({ entry }) => entry);
}
function cardOf2(input, entry, from) {
  const item = input.item(entry);
  return {
    item,
    stage: stageMark(entry, input.today, input.boundary),
    from,
    drop: dropOf(item, from),
    menuFrom: menuFromOf(entry),
    canDrop: item.open
  };
}
function sectionsOf(input, doc, selected2, statusOf3) {
  const name = projectOfNode(selected2);
  const placed = name === null ? null : input.tree.find(name);
  if (placed) return projectSections(input, doc, placed, statusOf3);
  if (selected2 === "done") return doneSections(input, doc, statusOf3);
  if (selected2 === "none") {
    const loose = tasksOf(doc).filter((entry) => entry.task.projects.length === 0 && stageOf(entry) !== "done");
    return shown2([part("none", null, [], 0, byStage(loose).map((e) => cardOf2(input, e, null)), inInbox(null))], true);
  }
  return allSections(input, doc, statusOf3);
}
function allSections(input, doc, statusOf3) {
  const open = tasksOf(doc).filter((entry) => stageOf(entry) !== "done");
  const tops = input.tree.roots.filter((node) => statusOf3(node.name) !== "done").map((node) => input.tree.find(node.name));
  const parts = tops.map((top) => {
    const branch = input.tree.all().filter((p) => p.path.length >= 1 && projectKey(p.path[0]) === projectKey(top.node.name) && statusOf3(p.node.name) !== "done").map((p) => p.node.name);
    const cards = byStage(open.filter((entry) => branch.some((name) => namesProject(entry.task.projects, name)))).map((entry) => {
      const by = entry.task.projects.find((p) => namesProject(branch, p));
      return cardOf2(input, entry, by === void 0 ? top.node.name : input.tree.find(by)?.node.name ?? by);
    });
    return projectPart(`project:${top.node.name}`, top, top.path, 0, cards, inInbox(top.node.name));
  });
  const loose = byStage(open.filter((entry) => entry.task.projects.length === 0)).map((e) => cardOf2(input, e, null));
  return shown2([...parts, part("none", PROJECTS_WORDS.none, [], 0, loose, inInbox(null))], true);
}
function projectHistory(input, node) {
  const name = projectOfNode(node);
  const placed = name === null ? null : input.tree.find(name);
  if (!placed || !input.doc) return [];
  const statuses = projectStatuses(input.tree, input.doc);
  const statusOf3 = (project) => statuses.get(projectKey(project)) ?? "waiting";
  if (statusOf3(placed.node.name) === "done") return [];
  return projectSections(input, input.doc, placed, statusOf3, true);
}
function projectSections(input, doc, placed, statusOf3, history = false) {
  const closed = history || statusOf3(placed.node.name) === "done";
  const top = placed.path.length;
  const whole = subprojectsOn(input.state) || placed.node.folder;
  const branch = whole ? input.tree.all().filter((p) => p.path.length > top && p.path.slice(0, top).every((n, i) => projectKey(n) === projectKey(placed.path[i])) && (closed || statusOf3(p.node.name) !== "done")) : [];
  const write = (project) => closed ? null : inInbox(project);
  const own = projectPart(OWN, { ...placed, title: null }, [], 0, byStage(tasksNaming(doc, placed.node.name, closed)).map((e) => cardOf2(input, e, placed.node.name)), write(placed.node.name));
  const subs = branch.map((p) => projectPart(`project:${p.node.name}`, p, p.path.slice(top), p.path.length - top, byStage(tasksNaming(doc, p.node.name, closed)).map((e) => cardOf2(input, e, p.node.name)), write(p.node.name)));
  return shown2([own, ...subs], !closed);
}
function doneSections(input, doc, statusOf3) {
  const done = input.tree.all().filter((p) => statusOf3(p.node.name) === "done");
  return shown2(done.map((p) => part(`project:${p.node.name}`, p.node.name, p.path, p.path.length, tasksNaming(doc, p.node.name, true).map((e) => cardOf2(input, e, p.node.name)), null)), false);
}
var OWN = "own";
function part(key, title, path, depth, cards, newTask2, takes2 = true) {
  const drawn = cards.map((card) => ({ id: `${key}/${card.item.id}`, ...card }));
  const rows = drawn.flatMap((card) => [{ id: card.id, item: card.item, level: 0, card, drop: card.drop }, ...subtaskRows(key, card.item, 1, card.from)]);
  const header = title !== null;
  return { key, group: header ? key : null, title, header, opens: header, takes: takes2, empty: drawn.length === 0, plate: false, path, depth, cards: drawn, rows, newTask: newTask2 };
}
function projectPart(key, placed, path, depth, cards, newTask2) {
  const { folder, name } = placed.node;
  if (folder && cards.length === 0) return null;
  return part(key, placed.title === null ? null : name, path, depth, cards, folder ? null : newTask2, !folder);
}
function subtaskRows(key, item, level, from) {
  if (item.collapsed) return [];
  return item.subtasks.flatMap((sub) => [{ id: `${key}/${sub.id}`, item: sub, level, card: null, drop: dropOf(sub, from) }, ...subtaskRows(key, sub, level + 1, from)]);
}
function shown2(sections, open) {
  const parts = sections.filter((s) => s !== null);
  const kept = open ? parts : parts.filter((s) => !s.empty);
  const untitledAbove = (i) => kept.slice(0, i).some((s) => !s.header && s.takes);
  return kept.map((s, i) => ({ ...s, plate: s.empty && (s.header || kept.length === 1), opens: s.header && !untitledAbove(i) }));
}
function tapped(state, tree, node) {
  if (node === "all") return cleared(state);
  const selected2 = chosenNode(state, tree);
  if (selected2 === null || !sameNode(selected2, node)) return { ...state, selected: node };
  if (node === "done") return { ...state, doneOpen: !(state.doneOpen ?? false) };
  const name = projectOfNode(node);
  if (name === null || !tree.find(name)?.node.children.length) return state;
  return withFold(state, name, !isFolded(state, name));
}
function picked(state, tree, node, wide) {
  const next = tapped(state, tree, node);
  const chose = next.selected !== state.selected || node === "all";
  return !wide && chose && next.panelOpen ? { ...next, panelOpen: false } : next;
}
function unfolded2(state, node) {
  if (node === "done") return state.doneOpen ? state : { ...state, doneOpen: true };
  const name = projectOfNode(node);
  return name === null || !isFolded(state, name) ? state : withFold(state, name, false);
}
function hovered(state, tree, doc, rows, node) {
  const row = rows.find((r) => sameNode(r.node, node));
  if (!row) return state;
  const open = row.unfoldsOnHover ? unfolded2(state, row.node) : state;
  return row.opensOnHover ? selected(open, tree, doc, row.node) : open;
}
function selected(state, tree, doc, node) {
  if (node === "all") return cleared(state);
  const name = projectOfNode(node);
  const found = name === null ? null : tree.find(name);
  if (name !== null && !found) return state;
  let next = { ...state, selected: found ? projectNodeOf(found.node.name) : node };
  if (!found) return next;
  for (const above of found.path.slice(0, -1)) next = withFold(next, above, false);
  if (doc && projectStatuses(tree, doc).get(projectKey(found.node.name)) === "done") next = { ...next, doneOpen: true };
  return next;
}
function withFold(state, name, folded2) {
  const others = (state.folded ?? []).filter((node) => !sameNode(node, projectNodeOf(name)));
  return { ...state, folded: folded2 ? [...others, projectNodeOf(name)] : others };
}
function renamedIn(state, from, to) {
  const carry = (node) => sameNode(node, projectNodeOf(from)) ? projectNodeOf(to) : node;
  return { ...state, ...state.selected !== void 0 && { selected: carry(state.selected) }, ...state.folded && { folded: state.folded.map(carry) } };
}
function liveRows(rows, lifted2) {
  const none2 = rows.findIndex((row) => row.kind === "none");
  const end = none2 < 0 ? rows.length : none2;
  const kept = [];
  let skipping = null;
  for (let i = 0; i < end; i++) {
    const row = rows[i];
    if (row.kind !== "project") continue;
    if (skipping !== null && row.depth > skipping) continue;
    skipping = null;
    if (lifted2 && sameNode(row.node, lifted2)) {
      skipping = row.depth;
      continue;
    }
    kept.push({ row, index: i });
  }
  return { rows: kept.map((k) => k.row), at: (gap) => kept.filter((k) => k.index < Math.min(gap, end)).length };
}
function projectsLevels(rows, gap, lifted2) {
  const live = liveRows(rows, lifted2);
  const i = live.at(gap);
  const above = live.rows[i - 1];
  const below = live.rows[i];
  return { min: below ? below.depth : 0, max: above ? above.depth + 1 : 0 };
}
function projectsGap(rows, gap, depth, lifted2) {
  const live = liveRows(rows, lifted2);
  const i = live.at(gap);
  const { min, max } = projectsLevels(rows, gap, lifted2);
  const level = Math.max(min, Math.min(max, Math.round(depth)));
  let parent = null;
  for (let k = i - 1; k >= 0 && level > 0; k--) {
    if (live.rows[k].depth === level - 1) {
      parent = live.rows[k].title;
      break;
    }
  }
  const below = live.rows[i];
  const place = { parent, before: below && below.depth === level ? below.title : null };
  return { place, depth: level };
}
var PROJECTS_HOVER_MS = 600;
var PROJECTS_INDENT = 12;
function projectsDrop(rows, gap, shift, lifted2) {
  const own = lifted2 ? rows.find((row) => sameNode(row.node, lifted2))?.depth : void 0;
  const live = liveRows(rows, lifted2);
  const above = live.rows[live.at(gap) - 1];
  const base = own ?? above?.depth ?? 0;
  return projectsGap(rows, gap, base + Math.round(shift / PROJECTS_INDENT), lifted2);
}

// core/application/viewModes.ts
var VIEW_WORDS = {
  twoColumns: "Two columns",
  columns: "Columns",
  allColumns: "All columns",
  rows: "Rows",
  byProject: "By project"
};
var SUBPROJECTS_WORD = "Subprojects";
var ICONS = { twoColumns: "columns-2", allColumns: "columns-4", rows: "rows-3", byProject: "folder-tree" };
var ROW_LISTS = ["inbox", "backlog", "soon", "day"];
function offered(ask) {
  if (ask.note) return ["rows", "byProject"];
  return ["twoColumns", ...ask.wide ? ["allColumns"] : [], "rows", "byProject"];
}
function defaultMode(ask) {
  return ask.note ? "rows" : "twoColumns";
}
function keptMode(state, ask) {
  return ask.note ? state.noteView : state.view;
}
function viewContext(node, mode, note, subprojects = true) {
  const base = note ? ["note", mode] : ["screen", node, mode];
  return JSON.stringify(subprojects ? base : [...base, "own"]);
}
function viewChoice(state, ask) {
  const modes = offered(ask);
  const kept = keptMode(state, ask);
  const chosen = kept !== void 0 && modes.includes(kept) ? kept : defaultMode(ask);
  const mode = ask.closed && ask.node !== null ? "byProject" : chosen;
  const label = (m) => m === "twoColumns" && !ask.wide ? VIEW_WORDS.columns : VIEW_WORDS[m];
  const options = modes.map((m) => ({ mode: m, label: label(m), icon: ICONS[m], checked: m === chosen }));
  const plate = ask.node !== null || mode === "rows" ? PROJECTS_WORDS.noTasks : null;
  const plates = { inbox: plate, backlog: plate, soon: plate, day: plate };
  const ribbon = mode === "twoColumns" && !ask.note;
  const subprojects = ask.branches ? { label: SUBPROJECTS_WORD, checked: subprojectsOn(state) } : null;
  return {
    mode,
    chosen,
    modes: options,
    icon: ICONS[chosen],
    wheel: mode === "twoColumns",
    ribbon,
    source: mode === "byProject" ? "projectsScreen" : "screen",
    rows: mode === "rows" ? ROW_LISTS : [],
    emptyLabel: PROJECTS_WORDS.noTasks,
    plates,
    layout: viewLayout(mode, ask.note, ask.title),
    context: viewContext(ask.node, mode, ask.note, subprojects?.checked ?? true),
    subprojects
  };
}
function firstViewOf(state, wide, note, title, branches) {
  const node = note ? "note" : state.selected === void 0 || state.selected === "all" ? null : state.selected;
  return viewChoice(state, { node, closed: node === "done", wide, note, title, branches: !note && branches });
}
function toggledSubprojects(state) {
  return { ...state, subprojects: !subprojectsOn(state) };
}
function withMode(state, mode) {
  const { filteredView: _old, ...rest } = state;
  return { ...rest, view: mode };
}
function viewEntryLists(mode, spot) {
  if (mode === "byProject") return ["projects"];
  if (mode === "twoColumns") return SHOWN_LISTS[spot === "done" ? "inbox" : spot];
  return ROW_LISTS;
}

// core/application/viewLayout.ts
function viewLayout(mode, note, title) {
  const of = (lists) => lists.map((list) => ({ list, title: title(list) }));
  const timeline = note ? [] : [{ id: "timeline", lists: [], width: "rest" }];
  const lead = note ? "rest" : "list";
  const still = { mode, swipe: "none", divider: !note };
  if (mode === "twoColumns") {
    return {
      mode,
      swipe: "pages",
      divider: true,
      stack: null,
      columns: [
        { id: "inbox", lists: of(["inbox", "backlog"]), width: "half" },
        { id: "soon", lists: of(["soon"]), width: "half" },
        { id: "day", lists: of(["day"]), width: "list" },
        ...timeline
      ]
    };
  }
  if (mode === "allColumns") {
    return {
      ...still,
      stack: null,
      columns: [
        { id: "inbox", lists: of(["inbox", "backlog"]), width: "list" },
        { id: "soon", lists: of(["soon"]), width: "list" },
        { id: "day", lists: of(["day"]), width: "list" },
        ...timeline
      ]
    };
  }
  if (mode === "rows") return { ...still, stack: { lists: ROW_LISTS, scrolls: !note }, columns: [{ id: "rows", lists: of(ROW_LISTS), width: lead }, ...timeline] };
  return { ...still, stack: null, columns: [{ id: "projects", lists: [{ list: "projects", title: null }], width: lead }, ...timeline] };
}
function layoutWidths(layout, share, viewWidth, dividerWidth) {
  if (layout.swipe === "pages") return null;
  if (!layout.divider) return { widths: layout.columns.map(() => viewWidth / layout.columns.length), divider: null };
  if (layout.mode === "allColumns") {
    const all2 = allColumnsWidths(share, viewWidth, dividerWidth);
    const at = (width) => allColumnsDividerAt(width, dividerWidth);
    return {
      widths: [all2.width, all2.width, all2.width, viewWidth - 3 * dividerWidth - 3 * all2.width],
      divider: { width: at(all2.width), min: at(all2.min), max: at(all2.max), center: at(all2.center) }
    };
  }
  const list = listWidths(share, viewWidth, dividerWidth);
  return { widths: [list.width, viewWidth - dividerWidth - list.width], divider: list };
}
function layoutShareAt(layout, at, viewWidth, dividerWidth) {
  if (layout.swipe === "pages" || !layout.divider) return null;
  if (layout.mode === "allColumns") return allColumnsShare(allColumnsWidthAt(at, dividerWidth), viewWidth, dividerWidth);
  return listShareOf(at, viewWidth, dividerWidth);
}

// core/application/projectsCarry.ts
function panelReason(state) {
  if (state.panelOpen === true) return "button";
  if (state.carry?.revealed === true) return "carry";
  if (state.naming === true) return "naming";
  return null;
}
function carryStarted(state, start2, wide, tree) {
  const carry = { keys: start2.keys, ...start2.cards && { cards: start2.cards }, ...start2.plus && { plus: true }, under: chosenNode(state, tree), wide };
  return { ...state, carry };
}
function sameNode2(a, b) {
  const x = projectOfNode(a);
  const y = projectOfNode(b);
  return x !== null && y !== null ? projectKey(x) === projectKey(y) : a === b;
}
function least(a, b) {
  return a === null ? b : b === null ? a : Math.min(a, b);
}
function carriedAt(state, at, now, tree, doc) {
  const carry = state.carry;
  if (!carry) return { state, wait: null };
  let next = state;
  let wait = null;
  let edgeSince;
  let revealed = carry.revealed === true;
  const carries2 = carry.keys.length > 0 || carry.plus === true;
  if (at.edge && !carry.wide && carries2 && panelReason(state) === null) {
    const since = carry.edgeSince ?? now;
    if (now - since >= PROJECTS_HOVER_MS) revealed = true;
    else {
      edgeSince = since;
      wait = PROJECTS_HOVER_MS - (now - since);
    }
  }
  next = { ...next, carry: { ...withoutTimes(carry), ...revealed && { revealed: true }, ...edgeSince !== void 0 && { edgeSince } } };
  const shows = panelReason(next) !== null;
  if (at.node === null || !shows) return { state: next, wait };
  const rows = panelRows(tree, doc, next);
  const row = rows.find((r) => sameNode2(r.node, at.node));
  const acts = row !== void 0 && (row.unfoldsOnHover || carry.plus !== true && row.opensOnHover);
  const over = carry.over && sameNode2(carry.over.node, at.node) ? carry.over : { node: at.node, since: now, done: false };
  if (!over.done && acts) {
    if (now - over.since >= PROJECTS_HOVER_MS) {
      const moved2 = carry.plus === true ? unfolded2(next, row.node) : hovered(next, tree, doc, rows, row.node);
      return { state: { ...moved2, carry: { ...moved2.carry, over: { ...over, done: true } } }, wait };
    }
    wait = least(wait, PROJECTS_HOVER_MS - (now - over.since));
  }
  return { state: { ...next, carry: { ...next.carry, over } }, wait };
}
function withoutTimes(carry) {
  const { edgeSince: _edge, over: _over, revealed: _revealed, ...rest } = carry;
  return rest;
}
function carryEnded(state, how, tree, doc) {
  const carry = state.carry;
  const { carry: _gone, ...rest } = state;
  let next = how === "naming" ? { ...rest, naming: true } : rest;
  if (!carry || how !== "nowhere") return next;
  const now = chosenNode(next, tree);
  if (carry.under === null) return now === null ? next : cleared(next);
  if (now !== null && sameNode2(now, carry.under)) return next;
  next = selected(next, tree, doc, carry.under);
  return next;
}
function gestureGone(state) {
  if (state.carry === void 0 && state.naming === void 0) return state;
  const { carry, naming: _naming, selected: now, ...rest } = state;
  const under = carry ? carry.under : now ?? null;
  return under === null ? rest : { ...rest, selected: under };
}
function endsSelection(end) {
  return end === "dropped";
}
function nameEnded(state) {
  if (state.naming !== true) return state;
  const { naming: _gone, ...rest } = state;
  return rest;
}

// core/application/wholeCard.ts
function wholeWidth(card, room) {
  if (card.textWidth <= card.titleWidth - card.fade) return null;
  const missing = Math.ceil(card.textWidth - card.titleWidth);
  const widest = room.width - 2 * room.margin;
  const width = Math.max(card.width, Math.min(card.width + missing, widest));
  return { width, cut: width < card.width + missing };
}
function grownStart(start2, size, grown2, room, margin) {
  const end = Math.max(start2 + size, room - margin);
  return Math.max(Math.min(start2, margin), Math.min(start2, end - grown2));
}

// core/application/SectionNameEntry.ts
function sectionNameEnd(ended, event, text) {
  if (ended) return { ended: true };
  return { ended: true, end: { name: event === "enter" ? text : null } };
}

// core/application/RepeatPage.ts
function repeatPageEnd(own, held) {
  if (held === null) return null;
  if (held.rule === null) return own === null ? null : held;
  return sameRule(held.rule, own) ? null : held;
}

// core/application/DescriptionDraft.ts
function descriptionOpen(description) {
  return { state: { file: description, typed: false }, text: description ?? DESCRIPTION_TEMPLATE };
}
function descriptionTyped(state) {
  return { ...state, typed: true };
}
function descriptionSave(state) {
  return { state: { ...state, typed: false }, write: state.typed };
}
function descriptionRead(state, description, editor) {
  const elsewhere = description !== state.file;
  if (!elsewhere || editor.focused || editor.pending) return { state: { ...state, file: description }, replace: null };
  return { state: { file: description, typed: false }, replace: description ?? DESCRIPTION_TEMPLATE };
}

// core/application/cardDue.ts
function cardDue(item, day) {
  const date = item.dueDate !== null && item.dueDate !== day ? item.dueDate : null;
  const repeats = item.repeat !== null;
  return date === null && !repeats ? null : { date, repeats };
}

// core/application/paints.ts
var PRESET_INK = {
  red: { dark: "#FF453A", light: "#FF3B30" },
  orange: { dark: "#FF9F0A", light: "#FF9500" },
  yellow: { dark: "#FFD60A", light: "#FFCC00" },
  green: { dark: "#30D158", light: "#34C759" },
  teal: { dark: "#40C8E0", light: "#30B0C7" },
  blue: { dark: "#0A84FF", light: "#007AFF" }
};
var THEMES = {
  dark: { card: [28, 28, 30], share: 0.26, pole: [255, 255, 255] },
  light: { card: [242, 242, 247], share: 0.16, pole: [0, 0, 0] }
};
var GREY = [142, 142, 147];
var META_GREY_SHARE = 0.5;
var SEARCH_STEPS = 24;
var rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var hexOf = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
var mix = (a, b, share) => a.map((v, i) => v + (b[i] - v) * share);
var linear = (v) => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
var luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
function contrast(a, b) {
  const [high, low] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
function inkOf(color, theme) {
  return isPresetColor(color) ? PRESET_INK[color][theme] : color;
}
function shadesOf(color, theme) {
  const { card, share, pole } = THEMES[theme];
  const ink = rgbOf(inkOf(color, theme));
  const fill = hexOf(mix(card, ink, share));
  const target = contrast(hexOf(GREY), hexOf(card));
  const half = mix(ink, GREY, META_GREY_SHARE);
  let [low, high] = [0, 1];
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (low + high) / 2;
    if (contrast(hexOf(mix(half, pole, mid)), fill) < target) low = mid;
    else high = mid;
  }
  return { ink: hexOf(ink), fill, meta: hexOf(mix(half, pole, high)) };
}
var EVENT_BG_ALPHA = 0.22;
var WORK_BG_ALPHA = 0.24;
var TEXT_MIX = 0.5;
var WHITE = 255;
var LIGHT_BRIGHT_LUMINANCE = 0.33;
var LIGHT_BG_ALPHA = { deep: 0.13, bright: 0.16 };
var LIGHT_TEXT_SCALE = { deep: 0.72, bright: 0.6 };
function channels(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
var toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
var gammaLinear = (v) => Math.pow(v / WHITE, 2.2);
var gammaLuminance = ([r, g, b]) => 0.2126 * gammaLinear(r) + 0.7152 * gammaLinear(g) + 0.0722 * gammaLinear(b);
var SOURCE_COLORS = { google: "#4285F4", iphone: "#0A84FF", work: "#0A84FF" };
function eventHex(event) {
  return event.color ?? SOURCE_COLORS[event.source];
}
function bgAlphaFor(source) {
  return source === "work" ? WORK_BG_ALPHA : EVENT_BG_ALPHA;
}
function eventColors(hex, bgAlpha = EVENT_BG_ALPHA, theme = "dark") {
  const rgb = channels(hex);
  const [r, g, b] = rgb;
  if (theme === "light") {
    const kind = gammaLuminance(rgb) < LIGHT_BRIGHT_LUMINANCE ? "deep" : "bright";
    return { bg: `rgba(${r}, ${g}, ${b}, ${LIGHT_BG_ALPHA[kind]})`, bar: toHex(rgb), text: toHex(rgb.map((v) => v * LIGHT_TEXT_SCALE[kind])) };
  }
  return {
    bg: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
    bar: toHex(rgb),
    text: toHex(rgb.map((v) => v + (WHITE - v) * TEXT_MIX))
  };
}
var PAST_SHARES = {
  dark: { lift: 0.015, ink: 0.125 },
  light: { lift: 0.012, ink: 0.1 }
};
function pastEventPaint(ground, text, theme) {
  const [from, to] = [channels(ground), channels(text)];
  const towards = (share) => toHex(from.map((v, i) => v + (to[i] - v) * share));
  const { lift, ink } = PAST_SHARES[theme];
  return { bg: towards(lift), bar: towards(ink), text: towards(ink) };
}

// core/application/eventLevels.ts
function eventLevels(spans) {
  const order = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  const levels = new Array(spans.length);
  const placed = [];
  for (const { span, index } of order) {
    const under = placed.filter((p) => p.start <= span.start && span.start < p.end).pop();
    const level = under ? under.level + 1 : 0;
    levels[index] = { level, layer: placed.length };
    placed.push({ ...span, level });
  }
  return levels;
}

// core/application/timelineZoom.ts
var DEFAULT_ZOOM_HOUR = 56;
function parseZoomLevels(text) {
  const levels = [];
  for (const part2 of text.split(",")) {
    const m = /^\s*(\d+)\s*(?::\s*\d+\s*)?$/.exec(part2);
    if (!m) return null;
    const hourPx = Number(m[1]);
    if (hourPx <= 0) return null;
    levels.push({ hourPx });
  }
  return levels.length > 0 ? levels : null;
}
function formatZoomLevels(levels) {
  return levels.map((l) => String(l.hourPx)).join(", ");
}
function levelsFor(wholeDayPx, levels) {
  const closer = [...levels].sort((a, b) => a.hourPx - b.hourPx).slice(1).filter((level) => level.hourPx > wholeDayPx);
  return [{ hourPx: wholeDayPx }, ...closer];
}
var MINUTES_PER_HOUR = 60;
function gridAt(hourPx, measures) {
  const px = (minutes) => minutes / MINUTES_PER_HOUR * hourPx;
  const labels = measures.divisions.find((minutes) => px(minutes) >= measures.labelGap) ?? MINUTES_PER_HOUR;
  const ticks = px(measures.tickMinutes) >= measures.tickGap;
  return { labels, lines: ticks ? measures.tickMinutes : labels };
}
function gridMarks(grid, dayHours) {
  const marks = [];
  for (let minutes = grid.lines; minutes < dayHours * MINUTES_PER_HOUR; minutes += grid.lines) {
    const minute = minutes % MINUTES_PER_HOUR;
    if (minute === 0) continue;
    marks.push({ minute: minutes, label: minute % grid.labels === 0 ? `:${String(minute).padStart(2, "0")}` : null });
  }
  return marks;
}
function wholeDayOr(wholeDayPx, levels) {
  return wholeDayPx ?? Math.min(...levels.map((level) => level.hourPx));
}
function zoomAfterPinch(hourPx, wholeDayPx, levels) {
  return hourPx <= levelsFor(wholeDayOr(wholeDayPx, levels), levels)[0].hourPx ? "wholeDay" : hourPx;
}
function zoomShown(saved, wholeDayPx, levels) {
  const ends = levelsFor(wholeDayOr(wholeDayPx, levels), levels);
  const [min, max] = [ends[0].hourPx, ends[ends.length - 1].hourPx];
  if (saved === "wholeDay") return min;
  const hourPx = typeof saved === "number" && Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_ZOOM_HOUR;
  return Math.min(max, Math.max(min, hourPx));
}
function labelHidesNearNow(y, nowY, lift, pillHeight) {
  return nowY !== null && Math.abs(y - nowY) < lift + pillHeight / 2;
}

// core/application/listDrop.ts
function levelAt(x, list, indent) {
  return indent > 0 ? (x - (list.left + list.width / 2)) / indent : 0;
}
function carriedMiddle(y, grabPx, cardHeight) {
  return y - grabPx + cardHeight / 2;
}
function gapUnder(header) {
  return { kind: "gap", index: 0, level: 0, group: header };
}
function headerOfPlace(place) {
  return place.group;
}
function orderOf(heads, group) {
  return heads.findIndex((h) => sameGap(gapUnder(h.group), gapUnder(group)));
}
function noSectionBelow(heads) {
  return heads.some((head, i) => i > 0 && head.group === null);
}
function opensList(head, i, heads) {
  return i === 0 && (head.opens === true || noSectionBelow(heads));
}
function placeAt(cards, y, level, shift, room, heads = [], held = null, hysteresis = 0) {
  const at = (finger) => rawPlaceAt(cards, finger, level, shift, room, heads);
  const place = at(y);
  if (!held || hysteresis <= 0 || sameGap(place, held)) return place;
  if (!sameGap(at(y - hysteresis), held) && !sameGap(at(y + hysteresis), held)) return place;
  return fitLevel(cards, { ...held, level: Math.round(level) });
}
function rawPlaceAt(cards, y, level, shift, gap, heads) {
  const top = (i) => cards[i].top + (gap && i >= gap.index ? shift : 0);
  const headAfterGap = (h) => gap !== null && (h.firstCard > gap.index || h.firstCard === gap.index && orderOf(heads, h.group) > orderOf(heads, headerOfPlace(gap)));
  const headEdge = (h, i) => h.top + (headAfterGap(h) ? shift : 0) + (i === 0 && h.group !== null ? h.height : h.height / 2);
  const index = cards.filter((c, i) => y > top(i) + c.height / 2).length;
  const passed = heads.filter((head, i) => head.firstCard === index && (opensList(head, i, heads) || y > headEdge(head, i))).map((head) => head.group);
  return gapAt(cards, index, level, passed, heads.length > 0);
}
function branchOf(levels, index) {
  const level = levels[index];
  if (level <= 0) return null;
  const goesOn = (l) => levels.slice(index + 1).find((next) => next <= l) === l;
  return { last: !goesOn(level), through: Array.from({ length: level - 1 }, (_, k) => goesOn(k + 1)) };
}
function gapBranch(cards, gap) {
  const levels = cards.map((card) => card.level);
  levels.splice(gap.index, 0, gap.level);
  return branchOf(levels, gap.index);
}

// core/application/timelineStack.ts
var MINUTES_PER_HOUR2 = 60;
var STACK_SLACK = 0.5;
function overlayLeft(level, insets) {
  return level === 0 ? insets.itemInset : level * insets.overlayInset;
}
function eventLeft(level, insets) {
  return overlayLeft(level.level, insets);
}
function stackTasks(tasks, events, hourPx, card, insets) {
  const head = card.height;
  const y = (minutes) => minutes / MINUTES_PER_HOUR2 * hourPx;
  const eventsUnder = (top, bottom) => events.filter((e) => top < y(e.end) && bottom > y(e.start));
  const order = tasks.map((task, index) => ({ task, index })).sort((a, b) => a.task.start - b.task.start || a.index - b.index);
  const boxes = new Array(tasks.length);
  const bodies = [];
  let previous = null;
  let headBottom = -Infinity;
  for (const { task, index } of order) {
    const natural = y(task.start) + insets.itemInset;
    const top = Math.max(natural, headBottom + card.gap);
    const height = task.end === null ? head : Math.max(head, y(task.end) - insets.itemInset - top);
    headBottom = top + head;
    const parent = bodies.filter((b) => top < b.bottom && top + head > b.top).pop();
    const under = eventsUnder(top, top + height);
    const overlay = !!parent || under.length > 0;
    const eventLeft2 = under.length ? overlayLeft(Math.max(...under.map((e) => e.level)) + 1, insets) : insets.itemInset;
    const left = Math.max(parent ? parent.left + insets.overlayInset : insets.itemInset, eventLeft2);
    if (height > head) bodies.push({ top: top + head, bottom: top + height, left });
    const stacked = top - natural > STACK_SLACK;
    if (stacked && previous) previous.stacked = true;
    const hiddenDuration = task.end !== null && y(task.end - task.start) - insets.itemGap < head;
    previous = boxes[index] = { top, height, left, overlay, stacked, hiddenDuration };
  }
  return boxes;
}
function durationParts(minutes) {
  if (minutes < MINUTES_PER_HOUR2) return [String(minutes), "MIN"];
  const hours = Math.floor(minutes / MINUTES_PER_HOUR2);
  const rest = minutes % MINUTES_PER_HOUR2;
  return [rest ? `${hours}:${pad(rest)}` : String(hours), "H"];
}
function timeParts(minutes) {
  return [String(Math.floor(minutes / MINUTES_PER_HOUR2)), pad(minutes % MINUTES_PER_HOUR2)];
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function stackCorner(box, slotStart, span) {
  if (box.stacked) return timeParts(slotStart);
  if (box.hiddenDuration && span.end !== null) return durationParts(span.end - span.start);
  return null;
}

// core/application/drops.ts
function readDrop(to, sections) {
  if (to.kind !== "place") return to;
  return listDrop(to.column, to.place, to.place ? sections(to.column) : null);
}
function listDrop(column, place, sections) {
  if (!place) return { kind: "list", column, before: null };
  if (place.kind === "subtask") return { kind: "nest", parent: place.parent, before: place.before };
  if (sections) return { kind: "group", list: sections.list, date: sections.date, group: place.group, before: place.before };
  return { kind: "list", column, before: place.before };
}
function acceptsDrop(target, origins) {
  switch (target) {
    case "timeline":
      return origins.length <= 1;
    case "day":
      return true;
    case "soon":
      return origins.every((from) => from !== "timeline");
    case "inbox":
    case "backlog":
      return origins.every((from) => from === "inbox" || from === "backlog" || from === "soon" || from === "new");
  }
}
function dropTarget(to, parentOrigin) {
  switch (to.kind) {
    case "time":
      return "timeline";
    case "clearSlot":
      return "day";
    case "list":
    case "place":
      return to.column;
    case "group":
    case "title":
      return to.list === "now" || to.date !== null ? "day" : to.list;
    case "nest":
      return parentOrigin(to.parent);
  }
}
function takesDrop(origins, to, parentOrigin) {
  const target = dropTarget(to, parentOrigin);
  return target !== null && acceptsDrop(target, origins);
}
function placesInGap(column, from, grouped) {
  return from === "new" || from === column || grouped;
}
function dropMove(from, to, day) {
  switch (to.kind) {
    case "time":
      return { kind: "toTime", from, start: to.start, day };
    case "clearSlot":
      return { kind: "clearSlot" };
    case "group":
      return { kind: "moveToGroup", list: to.list, group: to.group, before: to.before, date: to.date ?? void 0 };
    case "title":
      return { kind: "moveToGroup", list: to.list, group: null, before: null, date: to.date ?? void 0 };
    case "nest":
      return { kind: "nest", parent: to.parent, before: to.before };
    case "list":
      if (from === "timeline") return { kind: "clearSlot", place: { before: to.before, date: day } };
      if (to.column === "day") return from === "day" ? { kind: "moveBefore", before: to.before, date: day } : { kind: "moveToList", date: day };
      if (to.before) return { kind: "moveBefore", before: to.before, date: day };
      return from === "day" ? { kind: "moveToSoon", date: day } : { kind: "moveToEnd", section: to.column };
  }
}
function dropMoves(tasks, to, day) {
  if (tasks.length === 1) return { kind: "one", key: tasks[0].key, move: dropMove(tasks[0].from, to, day) };
  const steps = tasks.flatMap(({ key, from }) => {
    const move = dropMove(from, to, day);
    return move.kind === "toTime" || move.kind === "clearSlot" ? [] : [{ key, change: move }];
  });
  return { kind: "many", steps };
}

// core/application/projectsDrop.ts
var COLUMN_OF = { now: "day", soon: "soon", inbox: "inbox", backlog: "backlog" };
function listOf3(item) {
  return item.list === "done" ? null : item.list;
}
function carriedOf(item) {
  return { id: item.id, list: item.list, origin: originOf(item), shown: true };
}
function shownItem(view, key) {
  for (const section of view.sections) for (const row of section.rows) if (samePlace(row.item.key, key)) return row.item;
  return null;
}
function carriedIn(view, card) {
  const item = shownItem(view, card.key);
  if (item) return carriedOf(item);
  if (!card.lifted) throw new StaleTaskError();
  return { ...card.lifted, shown: false };
}
function carriedInFile(view, entry, card) {
  const item = shownItem(view, card.key);
  if (item) return carriedOf(item);
  if (!card.lifted) throw new StaleTaskError();
  return { id: entry.id, list: entry.section, origin: originOf({ list: entry.section, slot: entry.task.slot, dueDate: entry.task.dueDate }), shown: false };
}
function planOf(view, carried, place) {
  const section = view.sections.find((s) => s.group === place.group);
  if (!section) throw new StaleTaskError();
  const at = place.before === null ? section.cards.length : section.cards.findIndex((card) => samePlace(card.item.key, place.before));
  if (at < 0) throw new StaleTaskError();
  const kept = (card) => !carried.some((item) => item.id === card.item.id);
  const above = section.cards.slice(0, at).filter(kept).pop();
  const below = section.cards.slice(at).find(kept);
  const anchors = [...above ? [{ kind: "after", item: above.item }] : [], ...below ? [{ kind: "before", item: below.item }] : []];
  const anchor = anchors.find((a) => enters(carried, targetList(a))) ?? anchors[0] ?? { kind: "empty", list: null };
  return { anchor, project: partProject(view, section) };
}
function enters(carried, target) {
  if (target === null) return true;
  const moving = carried.filter((item) => listOf3(item) !== target).map((item) => item.origin);
  return moving.length === 0 || moving.every((origin) => origin !== null) && acceptsDrop(COLUMN_OF[target], moving);
}
function targetList(anchor) {
  return anchor.kind === "empty" ? anchor.list : listOf3(anchor.item);
}
function projectsTakes(view, cards, place) {
  if (!view.reorders) return false;
  if (place.kind === "subtask") return nestsUnder(view, place.parent);
  return takes(view, cards.map((card) => carriedIn(view, card)), place);
}
function projectsPlusTakes(view, place) {
  if (place.kind === "subtask") return view.reorders && nestsUnder(view, place.parent);
  return view.sections.find((s) => s.group === place.group)?.newTask != null;
}
function projectsPlusPlace(view, place) {
  if (!projectsPlusTakes(view, place)) return null;
  if (place.kind === "subtask") return place;
  const section = view.sections.find((s) => s.group === place.group);
  return { kind: "task", group: place.group, before: endOf(section) };
}
function takes(view, carried, place) {
  if (!(view.sections.find((s) => s.group === place.group)?.takes ?? true)) return false;
  return enters(carried, targetList(planOf(view, carried, place).anchor));
}
function nestsUnder(view, key) {
  for (const section of view.sections) {
    const at = section.rows.findIndex((row) => samePlace(row.item.key, key));
    if (at < 0) continue;
    const top = section.rows.slice(0, at + 1).reverse().find((row) => row.level === 0);
    return section.takes && !(top?.item.projects.some((p) => p.folder) ?? false);
  }
  return false;
}
function projectsDropSteps(view, doc, entryOf, cards, place, today) {
  if (!view.reorders) throw new StaleTaskError();
  if (place.kind === "subtask") {
    if (!nestsUnder(view, place.parent)) return [];
    return cards.map((card) => ({ key: card.key, change: { kind: "nest", parent: place.parent, before: place.before } }));
  }
  const carried = cards.map((card) => carriedInFile(view, entryOf(card.key), card));
  if (!takes(view, carried, place)) return [];
  const plan = planOf(view, carried, place);
  const { anchor } = plan;
  const target = targetList(anchor);
  const dropped = new Set(cards.map((card) => entryOf(card.key).id));
  const spot = target === null ? null : spotOf(doc, anchor, target, entryOf, dropped);
  return cards.flatMap((card, i) => {
    const item = carried[i];
    const moves = [];
    if (spot !== null && target !== null) {
      if (listOf3(item) === target) moves.push({ key: card.key, change: { kind: "reorder", group: spot.group, before: spot.before } });
      else {
        const move = dropMove(item.origin, { kind: "group", list: target, date: null, group: spot.group, before: spot.before }, today);
        if (move.kind === "toTime" || move.kind === "clearSlot") throw new StaleTaskError();
        moves.push({ key: card.key, change: move });
      }
    }
    const project = projectFor(view, plan, item);
    if (project !== void 0 && !sameProject(card.from, project)) moves.push({ key: card.key, change: { kind: "swapProject", from: card.from, to: project } });
    return moves;
  });
}
function spotOf(doc, anchor, list, entryOf, dropped) {
  if (anchor.kind === "empty") return { group: null, before: null };
  const entry = entryOf(anchor.item.key);
  if (anchor.kind === "before") return { group: entry.group, before: keyOf(entry) };
  const next = doc.tasks(list).find((other) => other.index > entry.index && other.group === entry.group && !dropped.has(other.id));
  return { group: entry.group, before: next ? keyOf(next) : null };
}
function projectFor(_view, plan, _item) {
  return plan.project;
}
function partProject(view, section) {
  return section.group === null ? projectOfNode(view.selected) : projectOfNode(section.key);
}
function sameProject(a, b) {
  return a === null || b === null ? a === b : projectKey(a) === projectKey(b);
}
function projectsLandingOf(view, id, group) {
  const parts = [...view.sections.filter((s) => group !== void 0 && s.group === group), ...view.sections.filter((s) => group === void 0 || s.group !== group)];
  for (const section of parts) {
    const index = section.cards.findIndex((card) => card.item.id === id);
    if (index >= 0) {
      const card = section.cards[index];
      return { kind: "card", id, item: card.item, card: card.id, section: section.key, index };
    }
  }
  for (const section of parts) {
    const rowAt = section.rows.findIndex((row2) => row2.level > 0 && row2.item.id === id);
    if (rowAt < 0) continue;
    const row = section.rows[rowAt];
    const parent = section.rows.slice(0, rowAt).reverse().find((r) => r.level === row.level - 1);
    return { kind: "subtask", id, item: row.item, parent: parent.item.id, index: parent.item.subtasks.findIndex((sub) => sub.id === id) };
  }
  return { kind: "away", id, item: null };
}

// core/application/undoNotice.ts
function undoNotice(step, outcome) {
  if (outcome !== "conflict") return null;
  return step === "undo" ? "Can’t undo: the tasks file changed" : "Can’t redo: the tasks file changed";
}

// core/application/contracts.ts
var StaleTaskError = class extends Error {
  constructor() {
    super("stale task");
    this.code = "staleTask";
    this.name = "StaleTaskError";
  }
};
var TasksFileMissingError = class extends Error {
  constructor(path) {
    super(`tasks file missing: ${path}`);
    this.path = path;
    this.code = "tasksFileMissing";
    this.name = "TasksFileMissingError";
  }
};

// core/application/agent/agentWire.ts
var AgentError = class extends Error {
  constructor(code, message, candidates) {
    super(message);
    this.code = code;
    this.candidates = candidates;
    this.name = "AgentError";
  }
};
var HOUR = 60;
var DAY_HOURS3 = 24;
var pad22 = (n) => String(n).padStart(2, "0");
function clockTime(minutes) {
  return `${pad22(Math.floor(minutes / HOUR) % DAY_HOURS3)}:${pad22(minutes % HOUR)}`;
}
function localMoment(at) {
  return `${at.getFullYear()}-${pad22(at.getMonth() + 1)}-${pad22(at.getDate())}T${pad22(at.getHours())}:${pad22(at.getMinutes())}`;
}
function mapNull(value, map) {
  return value === null || value === void 0 ? void 0 : map(value);
}
function defined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== void 0 && v !== null));
}
function present(value) {
  const empty = (v) => v === void 0 || v === null || v === false || v === "" || Array.isArray(v) && v.length === 0;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => !empty(v)));
}
var REF_RE = /^t(?:[0-9a-f]{8}|[0-9a-f]{16})$/;
function keyText2(key) {
  return JSON.stringify([key.section, key.index, key.path, key.raw]);
}
function fnv1a(text, basis) {
  let hash = basis >>> 0;
  for (const byte of utf8(text)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
var BASIS = 2166136261;
var SECOND_BASIS = 84696351;
function shortRef(key) {
  return `t${fnv1a(keyText2(key), BASIS)}`;
}
function longRef(key) {
  return `t${fnv1a(keyText2(key), BASIS)}${fnv1a(keyText2(key), SECOND_BASIS)}`;
}
function isRef(text) {
  return REF_RE.test(text);
}
var RefBook = class {
  constructor(keys) {
    this.byKey = /* @__PURE__ */ new Map();
    this.byRef = /* @__PURE__ */ new Map();
    const counts2 = /* @__PURE__ */ new Map();
    for (const key of keys) counts2.set(shortRef(key), (counts2.get(shortRef(key)) ?? 0) + 1);
    for (const key of keys) {
      const ref = counts2.get(shortRef(key)) > 1 ? longRef(key) : shortRef(key);
      this.byKey.set(keyText2(key), ref);
      this.byRef.set(ref, key);
    }
  }
  /** The task's ref; a key of no task of the file gets its short one. */
  refOf(key) {
    return this.byKey.get(keyText2(key)) ?? shortRef(key);
  }
  /** The key a ref names in this file; null for none. */
  keyOf(ref) {
    return this.byRef.get(ref) ?? null;
  }
};
function utf8(text) {
  return [...unescape(encodeURIComponent(text))].map((ch) => ch.charCodeAt(0));
}

// core/application/agent/AgentReads.ts
var STATUS = { todo: "open", inProgress: "inProgress", done: "done", cancelled: "wontDo" };
var REMINDER = { live: "lockScreen", notification: "notification", alarm: "alarm", none: "none" };
var SEARCH_LIST = { inbox: "inbox", backlog: "backlog", soon: "soon", now: "today", done: "done" };
var DAYS_IN_WEEK2 = 7;
var MOST_DAYS = 62;
var PENDING_NOTE = "This line is not in the file yet: Obsidian writes it when it opens the file today (the day's tidy). Read again after that before editing.";
var PAST_NOTE = "A past day keeps no tasks: what wasn't done moved to today, and the file keeps no date of completion. Its meetings stay.";
var ASSISTANT_LABEL_MEANING = {
  label: "Best task puts this label on the one task it picked as worth doing now, and takes it off every other task.",
  skip: "A task with this label is one Max can't take now (waiting on someone, no access, not the season): Best task never sends it, nor anything under it."
};
var AgentReads = class {
  constructor(s) {
    this.s = s;
    /** The refs of the file's tasks, made once the file is read (`needFile`). */
    this.book = new RefBook([]);
  }
  /** Today as Max sees it at Now–calendar. */
  async today(filter = {}) {
    await this.needFile();
    return this.dayOf(this.s.days.today(), await this.nodeOf(filter));
  }
  /** The day the words name: `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+N`, `-N`. */
  async day(words, filter = {}) {
    await this.needFile();
    return this.dayOf(this.dayNamed(words), await this.nodeOf(filter));
  }
  /** This week or the next, Monday to Sunday; or N days (7 by default) from a day, today when none is named. */
  async week(ask = {}, filter = {}) {
    await this.needFile();
    const node = await this.nodeOf(filter);
    const whole = ask.which === "this" || ask.which === "next";
    if (whole && ask.count !== void 0) throw new AgentError("badArgument", "--days goes with a day, not with this or next: a week is Monday to Sunday");
    const count = ask.count ?? DAYS_IN_WEEK2;
    if (!Number.isInteger(count) || count < 1 || count > MOST_DAYS) throw new AgentError("badArgument", `--days takes a whole number from 1 to ${MOST_DAYS}`);
    const dates = whole ? this.s.days.week(ask.which) : this.s.days.days(ask.which === void 0 ? this.s.days.today() : this.dayNamed(ask.which), count);
    const days = [];
    for (const date of dates) days.push(await this.dayOf(date, node));
    return { days };
  }
  soon(filter = {}) {
    return this.list("soon", filter);
  }
  inbox(filter = {}) {
    return this.list("inbox", filter);
  }
  backlog(filter = {}) {
    return this.list("backlog", filter);
  }
  /** Every open task once, flat, in the funnel's order. */
  async all(filter = {}) {
    await this.needFile();
    const open = await this.s.tasks.openTasks(await this.nodeOf(filter));
    return { tasks: open.map(({ item, place }) => this.wire(item, place)) };
  }
  /** The whole tree: every project with its path, folder or not, its status and note, done projects last, nothing folded away. */
  async projects() {
    await this.needFile();
    const view = await this.s.tasks.projectsScreen("all");
    const none2 = view.rows.find((row) => row.kind === "none");
    return {
      projects: view.rows.flatMap((row) => mapNull(row.project, (project) => [present({ name: project.name, path: project.path, depth: project.path.length - 1, folder: project.folder, status: row.status, note: project.note })]) ?? []),
      noProject: { openTasks: none2 !== void 0 && !none2.muted }
    };
  }
  /** The project By project: its own tasks, then a part per subproject; with `done`, its closed tasks too. */
  async project(name, done = false) {
    await this.needFile();
    const node = await this.projectNode(name);
    const view = await this.s.tasks.projectsScreen(node);
    const row = view.rows.find((r) => r.node === view.selected);
    const history = done ? await this.s.tasks.projectHistory(node) : [];
    const parts = [...await this.parts(view.sections, false), ...await this.parts(history, true)];
    return { project: { name: view.title, folder: row?.project?.folder ?? false, status: row?.status ?? "waiting" }, parts };
  }
  /** The plugin's search, Done included, best first, each found task with where Max sees it. */
  async search(query) {
    await this.needFile();
    const groups = await this.s.tasks.search(query);
    const found = [];
    for (const group of groups) found.push({ list: SEARCH_LIST[group.list], tasks: await this.placed(group.hits.map((hit) => hit.item)) });
    return { query, groups: found };
  }
  /** One task whole: every subtask at every depth, closed ones too, and where it is stored. */
  async task(ref) {
    await this.needFile();
    const text = ref.trim();
    if (!isRef(text)) throw new AgentError("unknownTask", "not a task's ref: take one from an answer of the program");
    const key = this.book.keyOf(text);
    const item = key === null ? null : await this.s.tasks.find(key, "");
    if (item === null) throw new AgentError("staleTask", "the task is no longer where the ref says: the file or the day changed, read again");
    const place = await this.s.tasks.placeOf(item);
    const whole = { ...this.wire(item, place), subtasks: this.subtask(item, item.card.step, true, "date" in place ? place.date : void 0).subtasks };
    return { task: present(whole), stored: await this.stored(item) };
  }
  /** Where the task is on disk now: its line before the tidy the reads make in memory. */
  async stored(item) {
    const disk = await this.s.storedTasks();
    const line = disk === null ? null : this.s.tasks.storedLine(item, disk);
    if (line !== null) return { section: this.s.tasks.listName(line.section), line: line.raw };
    return { section: this.s.tasks.listName(item.key.section), line: item.key.raw, pending: true, note: PENDING_NOTE };
  }
  /** The commands, the words, and Max's priority levels and labels in their order. */
  async help() {
    const page = await this.s.assistant.page();
    const assistantLabels = page.prompts.flatMap(
      (prompt) => prompt.options.flatMap((row) => {
        const means = ASSISTANT_LABEL_MEANING[row.key];
        const chosen = row.choices.find((choice) => choice.value !== null && choice.value === row.value);
        return means === void 0 ? [] : [{ action: prompt.title, option: row.label, label: chosen === void 0 ? null : chosen.title, means }];
      })
    );
    return {
      program: "obsidian-task-calendar: Max's tasks as the Task Calendar screen shows them, read only. Every answer is one JSON object; a failure is { error: { code, message, candidates? } } with exit code 1.",
      commands: HELP_COMMANDS,
      options: HELP_OPTIONS,
      places: HELP_PLACES,
      statuses: HELP_STATUSES,
      priorities: this.s.tasks.priorityLevels().map((level, i) => ({ name: level.prefix, rank: i + 1 })),
      labels: this.s.tasks.labelLevels().map((label) => labelTitle(label.name)),
      assistantLabels,
      notes: HELP_NOTES
    };
  }
  /** The day's answer: its list and timeline (none for a past day), its meetings and the calendars' sources. */
  async dayOf(date, node) {
    const side = this.s.days.side(date);
    const relation = this.s.days.relation(date);
    const events = await this.eventsOf(date);
    const head = {
      date,
      weekday: this.s.days.weekday(date),
      relation: relation === "other" ? side : relation,
      dayStart: clockTime(this.s.days.boundary().startHour * 60),
      now: side === "today" ? localMoment(this.s.clock.now()) : void 0
    };
    const meetings2 = { events: this.events(events), calendars: this.calendars(events) };
    const past = side === "past" ? { past: true, note: PAST_NOTE } : {};
    const screen = await this.s.tasks.screen(date, node);
    const list = this.s.tasks.columnView(screen, "day");
    return defined({ ...head, ...past, list: { sections: await this.sections(list.groups) }, timeline: await this.placed(screen.day.slotted, date), ...meetings2 });
  }
  async list(list, filter) {
    await this.needFile();
    const screen = await this.s.tasks.screen(this.s.days.today(), await this.nodeOf(filter));
    return { list, sections: await this.sections(this.s.tasks.columnView(screen, list).groups) };
  }
  async sections(groups) {
    const sections = [];
    for (const group of groups) sections.push({ name: group.name, tasks: await this.placed(group.items) });
    return sections;
  }
  async parts(sections, done) {
    const parts = [];
    for (const section of sections) {
      const kind = done ? "done" : section.header ? "subproject" : "own";
      parts.push(defined({ kind, title: section.title, path: section.path, tasks: await this.placed(section.cards.map((card) => card.item)) }));
    }
    return parts;
  }
  /** Tasks with where Max sees each (`placeOf`); `ridesOn`, the day whose timeline they are drawn on. */
  async placed(items, ridesOn) {
    const tasks = [];
    for (const item of items) tasks.push(this.wire(item, await this.s.tasks.placeOf(item), ridesOn));
    return tasks;
  }
  /** A task in the program's words, at its place. */
  wire(item, place, ridesOn) {
    const date = "date" in place ? place.date : null;
    const step = item.card.step;
    const { ref, title, status, ...own } = this.subtask(item, step, false, ridesOn ?? date ?? void 0, true);
    return present({
      ref,
      title,
      status,
      place: place.kind,
      date,
      due: cardDue(item, date)?.date,
      ...own,
      projects: item.projects.map((project) => project.name),
      nextStep: mapNull(step, (s) => ({ ref: this.book.refOf(s.key), title: s.title, path: pathTo(item.subtasks, s.id) }))
    });
  }
  /**
   * A task's own fields, a subtask's all of them: `step`, the open subtask its card shows; `all`, closed subtasks too;
   * `top`, a task, whose section it names (a subtask stands in its task's).
   */
  subtask(item, step, all2, ridesOn, top = false) {
    const levels = this.s.tasks.priorityLevels();
    const subs = all2 ? item.allSubtasks : item.subtasks;
    return present({
      ref: this.book.refOf(item.key),
      title: item.title,
      status: STATUS[item.status],
      time: mapNull(
        item.slot,
        (slot) => defined({
          start: clockTime(slot.start),
          end: mapNull(slot.end, clockTime),
          startsAt: `${slot.date}T${clockTime(slot.start)}`,
          durationMin: item.durationMin,
          passed: this.s.tasks.ridesNow(item, ridesOn ?? slot.date)
        })
      ),
      reminder: mapNull(item.slot, () => REMINDER[item.reminder]),
      section: top ? item.group : null,
      priority: mapNull(item.priority, (level) => ({ name: level.prefix, rank: rankOf(levels, level) })),
      labels: item.labels.map((label) => labelTitle(label.name)),
      repeat: mapNull(item.repeat, repeatSentence),
      description: item.description,
      progress: item.progress,
      collapsed: item.collapsed,
      subtasks: subs.map((sub) => present({ ...this.subtask(sub, step, all2, ridesOn), next: mapNull(step, (s) => s.id === sub.id) }))
    });
  }
  events(day) {
    const timed = (e) => ({
      title: e.title,
      start: clockTime(e.start.getHours() * 60 + e.start.getMinutes()),
      end: clockTime(e.end.getHours() * 60 + e.end.getMinutes()),
      startsAt: localMoment(e.start),
      endsAt: localMoment(e.end),
      calendar: e.calendar,
      passed: this.s.calendars.isPast(e)
    });
    return { allDay: day.allDay.map((e) => ({ title: e.title, calendar: e.calendar })), timed: day.timed.map(timed) };
  }
  calendars(day) {
    return { alert: day.alert, sources: day.statuses.map((s) => ({ source: s.source, tone: s.tone, words: s.words.sub, ...s.words.time === "" ? {} : { updated: s.words.time } })) };
  }
  /** The day's meetings: in a fresh run nothing is cached, so the files are read now; Google is never asked. */
  async eventsOf(date) {
    const ask = this.s.calendars.events(date, "open");
    return ask.fresh ? ask.fresh() : ask.cached ?? NO_DAY_EVENTS;
  }
  dayNamed(words) {
    const date = this.s.days.dayNamed(words);
    if (date === null) throw new AgentError("badArgument", `not a day: ${JSON.stringify(words)}; give YYYY-MM-DD, today, tomorrow, yesterday, +N or -N`);
    return date;
  }
  async nodeOf(filter) {
    if (filter.project !== void 0 && filter.noProject) throw new AgentError("badArgument", "--project and --no-project together");
    if (filter.noProject) return "none";
    return filter.project === void 0 ? null : this.projectNode(filter.project);
  }
  async projectNode(name) {
    const match = await this.s.tasks.projectNodeNamed(name);
    if (match.node === null) throw new AgentError("unknownProject", `no project named ${JSON.stringify(name)}`, match.candidates);
    return match.node;
  }
  /** The tasks file is there: without it, every command says so (an empty file is no error). */
  async needFile() {
    const screen = await this.s.tasks.screen(this.s.days.today());
    if (screen.missing) throw new AgentError("tasksFileMissing", `no tasks file at ${JSON.stringify(this.s.screenSettings.get().tasksFile)} in the vault`);
    const open = (await this.s.tasks.openTasks()).map((t) => t.item);
    this.book = new RefBook(everyTask([...open, ...screen.done]).map((item) => item.key));
  }
};
function everyTask(items) {
  return items.flatMap((item) => [item, ...everyTask(item.allSubtasks)]);
}
function rankOf(levels, level) {
  return levels.findIndex((l) => l.prefix === level.prefix) + 1;
}
function pathTo(subtasks, id) {
  for (const sub of subtasks) {
    if (sub.id === id) return [sub.title];
    const below = pathTo(sub.subtasks, id);
    if (below.length > 0) return [sub.title, ...below];
  }
  return [];
}
var HELP_COMMANDS = [
  { command: "today", answers: "the day as Max sees it at Now–calendar: the day's list in its sections, the timeline, the day's meetings" },
  { command: "day <date>", answers: "the same for one day; <date>: YYYY-MM-DD, today, tomorrow, yesterday, +N, -N" },
  { command: "week [this | next | <date>] [--days N]", answers: "day for each day: this / next = Monday to Sunday of this / next week (no --days); a date = N days from it (7 by default); nothing = 7 days from today" },
  { command: "soon", answers: "the Soon column in its sections" },
  { command: "inbox", answers: "Inbox in its sections" },
  { command: "backlog", answers: "Backlog in its sections" },
  { command: "all", answers: "every open task exactly once, flat, in funnel order: Inbox, Backlog, Soon, today, then later days by date" },
  { command: "projects", answers: "the whole tree: every project with its path, folder or not, status, attached note" },
  { command: "project <name> [--no-subprojects] [--done]", answers: "the project By project, exactly as the Projects screen orders it: its own tasks, then a part per subproject; in a part Inbox, Backlog, Soon (dated ones among them), Now, file order inside; each task with its place; --done: also its history, the closed tasks" },
  { command: "search <text>", answers: "the plugin's search, Done included, best first" },
  { command: "task <ref>", answers: "one task whole: description, every subtask at every depth (closed ones too), where it is stored" },
  { command: "help", answers: "this" }
];
var HELP_OPTIONS = [
  { option: "--vault <path>", means: "the vault, ~/Obsidian by default; the tasks file and calendars are found from the plugin's settings there" },
  { option: "--project <name>", means: "on today, day, week, soon, inbox, backlog, all: the screen's project filter, subprojects included; an unknown name is unknownProject with the closest names" },
  { option: "--no-subprojects", means: "with --project or project: the project's own tasks alone" },
  { option: "--no-project", means: "the panel's No project: the tasks without a project" },
  { option: "--pretty", means: "indented JSON" }
];
var HELP_PLACES = [
  { place: "inbox", means: "Inbox" },
  { place: "backlog", means: "Backlog" },
  { place: "soon", means: "the Soon column: tasks without a date" },
  { place: "today", means: "today's list or timeline (the screen's header says Today)" },
  { place: "day", means: "a later day, given in date: Max sees the task only in that day's column, never in Soon; say «на четверг», not «в Soon»" },
  { place: "done", means: "Done" }
];
var HELP_STATUSES = [
  { status: "open", means: "to do" },
  { status: "inProgress", means: "in progress" },
  { status: "done", means: "done" },
  { status: "wontDo", means: "given up (Won't do)" }
];
var HELP_NOTES = [
  "date is the day the task stands on: its slot's day, else today for Now, else its due date; due is its due date, only when it differs. A date is a plan, not a deadline: nothing is overdue.",
  "A task with a due date and a slot on another day shows on both days, as the screen shows it: in the due day's list and on the slot day's timeline (date is the slot's day in both), so week lists it twice.",
  "time.startsAt is the full moment: a day runs from dayStart to dayStart next morning, so a slot after midnight belongs to the night before. time.passed: the task rides the now line (an open task of today whose start has passed).",
  "A folded task (collapsed) shows its nextStep on its card and its timeline block, the task's own title small above it; Done closes the step. subtasks lists the open subtasks, the step marked next.",
  "A ref names a task for task <ref>; refs go stale when the file or the day changes: read again.",
  "Never parse the tasks file to read: ask the program. Writing is by docs/plugin/agents.md's recipes; task <ref>'s stored is for that only."
];

// core/application/ScreenSettingsImpl.ts
function screenSettingsOf(settings) {
  return {
    longPressMs: settings.longPressMs,
    scrollToHour: settings.scrollToHour,
    tasksFile: settings.tasksFile,
    sections: settings.sections,
    ungrouped: settings.groups.ungrouped,
    priorities: settings.priorities,
    labels: settings.labels,
    labelPaint: settings.labelPaint,
    cardHeight: settings.cardHeight,
    cardGap: settings.cardGap,
    zoomLevels: settings.zoomLevels
  };
}
var ScreenSettingsImpl = class {
  constructor(store) {
    this.store = store;
    this.source = null;
    this.shown = null;
  }
  get() {
    const settings = this.store.get();
    if (settings !== this.source || !this.shown) {
      this.source = settings;
      this.shown = screenSettingsOf(settings);
    }
    return this.shown;
  }
  onChange(listener) {
    return this.store.onChange(listener);
  }
};

// core/application/firstStepTyping.ts
var FIELD_BLOCK = { text: "", title: "", step: null };
function typing(item) {
  return { ...item, collapsed: true, card: item.firstStepCard, block: FIELD_BLOCK };
}
function typedIn(items, id) {
  let changed3 = false;
  const next = items.map((item) => {
    const drawn = typedItem(item, id);
    if (drawn !== item) changed3 = true;
    return drawn;
  });
  return changed3 ? next : items;
}
function typedItem(item, id) {
  if (keyId(item.key) === id) return typing(item);
  const subtasks = typedIn(item.subtasks, id);
  const allSubtasks = typedIn(item.allSubtasks, id);
  return subtasks === item.subtasks && allSubtasks === item.allSubtasks ? item : { ...item, subtasks, allSubtasks };
}
function firstStepScreen(view, key) {
  const id = keyId(key);
  const list = typedIn(view.day.list, id);
  const slotted2 = typedIn(view.day.slotted, id);
  const soon = typedIn(view.soon, id);
  const inbox = typedIn(view.inbox, id);
  const backlog = typedIn(view.backlog, id);
  const same2 = list === view.day.list && slotted2 === view.day.slotted && soon === view.soon && inbox === view.inbox && backlog === view.backlog;
  return same2 ? view : { ...view, day: { ...view.day, list, slotted: slotted2 }, soon, inbox, backlog };
}
function typedRows(rows, id) {
  const out = [];
  let under = null;
  for (const row of rows) {
    if (under !== null && row.level > under) continue;
    under = null;
    if (keyId(row.item.key) !== id) {
      out.push(row);
      continue;
    }
    under = row.level;
    out.push({ ...row, item: typing(row.item), card: row.card && { ...row.card, item: typing(row.card.item) } });
  }
  return out.length === rows.length && out.every((row, i) => row === rows[i]) ? rows : out;
}
function typedSection(section, id) {
  const rows = typedRows(section.rows, id);
  if (rows === section.rows) return section;
  return { ...section, rows, cards: section.cards.map((card) => keyId(card.item.key) === id ? { ...card, item: typing(card.item) } : card) };
}
function firstStepProjects(view, key) {
  const id = keyId(key);
  const sections = view.sections.map((section) => typedSection(section, id));
  return sections.every((section, i) => section === view.sections[i]) ? view : { ...view, sections };
}

// core/application/ports.ts
var systemClock = { now: () => /* @__PURE__ */ new Date() };
var NO_PROJECTS = { list: () => [], onChange: () => () => void 0 };
function memoryProjectsScreen(start2 = {}) {
  let state = start2;
  return { get: () => state, set: (next) => state = next };
}

// core/application/readingSettings.ts
function readsAnew(before, after) {
  return before.tasksFile !== after.tasksFile || readingKey(before) !== readingKey(after) || !sameLevels(before.priorities, after.priorities) || !sameLabels(before.labels, after.labels);
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function shownChange(before, after) {
  const change = {
    tasks: readsAnew(before, after),
    drawn: before.tasksFile !== after.tasksFile || !same(before.sections, after.sections) || before.groups.ungrouped !== after.groups.ungrouped || !same(before.groups.presets, after.groups.presets) || !sameLevels(before.priorities, after.priorities) || !sameLabels(before.labels, after.labels) || before.labelPaint !== after.labelPaint,
    cards: before.cardHeight !== after.cardHeight || before.cardGap !== after.cardGap,
    timeline: before.dayStartHour !== after.dayStartHour || before.scrollToHour !== after.scrollToHour || !same(before.zoomLevels, after.zoomLevels),
    gestures: before.longPressMs !== after.longPressMs,
    calendars: !same(before.hiddenCalendars, after.hiddenCalendars) || before.workCalendarFile !== after.workCalendarFile || before.staleAfterMinutes !== after.staleAfterMinutes
  };
  return Object.values(change).some(Boolean) ? change : null;
}

// core/domain/EntryTags.ts
var MARK = 57344;
var FIRST = 57345;
var EntryTags = class _EntryTags {
  constructor(asRead) {
    this.asRead = asRead;
  }
  /** Tags `entries` in their order: the n-th is found again as `find(doc, n)`. */
  static tag(doc, entries) {
    const asRead = entries.map((entry) => doc.find(entry.section, entry.index, entry.path));
    const tagged = doc.replaceAll(asRead.map((same2, n) => [same2, { ...same2.task, text: same2.task.text + markOf(n) }]));
    return { doc: tagged, tags: new _EntryTags(asRead) };
  }
  /** `text` with the n-th mark: written in place of a tagged task's text, it keeps the task tagged. */
  static marked(text, n) {
    return text + markOf(n);
  }
  /** The n-th tagged task where it stands now; null once it is gone. */
  find(doc, n) {
    const mark = markOf(n);
    const search = (entries) => {
      for (const entry of entries) {
        if (entry.task.text.endsWith(mark)) return entry;
        const inside = search(entry.subtasks);
        if (inside) return inside;
      }
      return null;
    };
    return search(doc.allTasks());
  }
  /** Takes every mark off: a task the operations left as it was gets its line back as it was read, wherever it now stands. */
  untag(doc) {
    const changes = [];
    this.asRead.forEach((asRead, n) => {
      const entry = this.find(doc, n);
      if (entry) changes.push([entry, { ...entry.task, text: entry.task.text.slice(0, -markOf(n).length) }, asRead]);
    });
    return doc.replaceAll(changes);
  }
};
function markOf(n) {
  return String.fromCharCode(MARK, FIRST + n);
}

// core/application/TaskRules.ts
var MOVES = /* @__PURE__ */ new Set(["place", "postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest", "reorder"]);
function refsOf(change) {
  if (change.kind === "moveBefore" || change.kind === "moveToGroup" || change.kind === "reorder") return [change.before];
  if (change.kind === "nest") return [change.parent, change.before];
  return [];
}
function freshChange(change, fresh) {
  if (change.kind === "moveBefore" || change.kind === "moveToGroup" || change.kind === "reorder") return { ...change, before: fresh(change.before) };
  if (change.kind === "nest") return { ...change, parent: fresh(change.parent), before: fresh(change.before) };
  return change;
}
function sameKey2(a, b) {
  return samePlace(a, b) && sameLine(a, b);
}
function columnOfPlace(place, today) {
  if (place.kind === "day") return { kind: "day", date: place.date };
  if (place.list === "now") return { kind: "day", date: place.date ?? today };
  if (place.list === "soon" && place.date !== void 0 && place.date > today) return { kind: "day", date: place.date };
  return { kind: place.list };
}
function blankName(name) {
  return name.trim() === "";
}
var TaskRules = class {
  /**
   * `keysById`: the ids in the keys the UI hands back are those of this identity, kept since they were given (the
   * service's; the door's when the host hands its ids back), so a key's task is found by its id. Otherwise an id means
   * nothing here and a key names its task by place and line alone.
   */
  constructor(settings, clock, identity = null, keysById = identity !== null, legacy = { list: () => [], ready: () => true }) {
    this.settings = settings;
    this.clock = clock;
    this.identity = identity;
    this.keysById = keysById;
    this.legacy = legacy;
  }
  moment() {
    const settings = this.settings.get();
    const boundary = boundaryOf(settings);
    return { settings, boundary, today: boundary.dayOf(this.clock.now()), reading: JSON.stringify([readingKey(settings), settings.dayStartHour, this.legacy.ready()]) };
  }
  today() {
    return this.moment().today;
  }
  priorityLevels() {
    return usableLevels(this.settings.get().priorities);
  }
  /** A title of nothing but a priority is blank too. */
  isBlank(text) {
    return isBlankTitle(text, this.priorityLevels().map((l) => l.prefix));
  }
  read(text, at = this.moment()) {
    const { settings } = at;
    const parsed = parseText(text, settings);
    const whole = parsed.ensureSections(sectionNames(settings));
    const doc = this.tidied(whole, at);
    const changed3 = whole === parsed ? doc !== whole : this.tidied(parsed, at) !== parsed;
    return { doc: this.identified(text, doc, () => doc), changed: changed3 };
  }
  /** The text after `operation` on the document read and normalized; the result is normalized again. */
  change(text, operation, at = this.moment()) {
    const doc = this.tidied(parseText(text, at.settings).ensureSections(sectionNames(at.settings)), at);
    return this.written(this.identified(text, doc, () => doc), operation, at);
  }
  /**
   * The text after `operation` on the file as it is, before today's normalizing: for a task that normalizing would change,
   * such as yesterday's slot, which the next day erases. The result is normalized as usual.
   */
  changeAsRead(text, operation, at = this.moment()) {
    return this.written(this.asRead(text, at), operation, at);
  }
  /** The document as the file has it, with every section, not normalized. */
  asRead(text, at = this.moment()) {
    const whole = parseText(text, at.settings).ensureSections(sectionNames(at.settings));
    return this.identified(text, whole, () => this.tidied(whole, at));
  }
  /** The text as the file has it, unnormalized and without the sections it lacks: where a line stands in it. */
  parse(text) {
    const at = this.moment();
    const parsed = parseText(text, at.settings);
    return this.identified(text, parsed, () => this.tidied(parsed.ensureSections(sectionNames(at.settings)), at));
  }
  /** Who the tasks and headings of `text` are, by its lines: every id of its tidied reading the rules keep. */
  idsOf(text) {
    return this.idsFor(text)?.known ?? /* @__PURE__ */ new Map();
  }
  /** `doc`, read from `text` with each line tagged by its line, tagged by who its lines are; `reading`, the text tidied for today. */
  identified(text, doc, reading) {
    const ids = this.identity?.of(text, reading);
    return ids ? doc.retagged(ids) : doc;
  }
  idsFor(text) {
    return this.identity?.of(text, () => this.tidied(parseText(text, this.settings.get()).ensureSections(sectionNames(this.settings.get())), this.moment()));
  }
  /**
   * A document as today's tidying leaves it: the one move to projects first while the file awaits it and the host's notes
   * are complete, so it is written as soon as the file is read once they are (a tidy, no step of undo) and every action
   * runs on a moved file.
   */
  tidied(doc, at) {
    const notes = this.legacy.list();
    const mark = at.settings.resultMark;
    const moved2 = this.legacy.ready() && awaitsMove(doc, notes, mark) ? withTasksInTree(movedToProjects(doc, notes, mark)) : doc;
    return normalize(moved2, at.today, at.boundary, usablePresets(at.settings.groups.presets));
  }
  /** The document after `operation` on `doc`, already read and normalized at `at`, normalized again. */
  changeOf(doc, operation, at = this.moment()) {
    return this.written(doc, operation, at);
  }
  /** What `changeOf` writes, without it being written: a trial, which the tasks' identity does not take as a write. */
  trial(doc, operation, at = this.moment()) {
    return this.written(doc, operation, at, false);
  }
  emptyFile() {
    return TaskDocument.empty(sectionNames(this.settings.get()));
  }
  /**
   * The task a key names in `doc`: by its id wherever writes since moved it, when the key has one the rules keep; else at
   * its place with its line. Throws StaleTaskError when it is gone, or no longer the task it was.
   */
  entryOf(doc, key) {
    const entry = this.found(doc, key);
    if (!entry) throw new StaleTaskError();
    return entry;
  }
  /** The task a key names in `doc`, as `entryOf` finds it; null when it is gone, or no longer the task it was. */
  found(doc, key) {
    const byId = this.named(doc, key);
    return (byId === void 0 ? this.atPlace(doc, key) : byId) ?? null;
  }
  /**
   * The task a key names by its id, when the rules find keys by id: the task with that id wherever writes took it, when its
   * line is the key's or one this identity's own writes rewrote the key's into. Else the key is stale (its line changed
   * elsewhere: a fresh key comes with the redraw) or another reading's, whose ids mean nothing here, and is found at its
   * place with its line. Null when it is not found that way either; undefined when keys are found by place.
   */
  named(doc, key) {
    if (!this.keysById || key.id === void 0) return void 0;
    const entry = doc.byId(key.id);
    if (entry && (entry.raw === key.raw || this.identity?.held(key.id, key.raw))) return entry;
    return this.atPlace(doc, key) ?? null;
  }
  /** The key of the task a key names, as `doc` has it now: what keys handed in earlier are compared by. */
  freshKey(doc, key) {
    return keyOf(this.entryOf(doc, key));
  }
  atPlace(doc, key) {
    const entry = doc.find(key.section, key.index, key.path);
    return entry?.raw === key.raw ? entry : void 0;
  }
  /** A section the UI names must still be in the file, as a task must. */
  groupOf(doc, list, group) {
    const index = groupIndex(doc, list, group);
    if (index < 0) throw new StaleTaskError();
    return index;
  }
  /** Section `name` of the task's list, null outside any; a task of Soon keeps its due date. A task of Done goes nowhere. */
  sectionChange(entry, typed2) {
    const list = entry.section;
    const name = typed2 === null ? null : typed2.trim();
    if (list === "done" || name === "" || entry.group === name) return null;
    const date = (list === "soon" ? entry.task.dueDate : null) ?? void 0;
    return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
  }
  createInList(date, text) {
    if (this.isBlank(text)) return null;
    return (doc, today) => createInList(doc, date, today, text);
  }
  createInSoon(text) {
    if (this.isBlank(text)) return null;
    return (doc) => createInSoon(doc, text);
  }
  createAtTime(date, start2, text) {
    if (this.isBlank(text)) return null;
    return (doc, today, _settings, boundary) => createAtTime(doc, date, today, start2, text, boundary);
  }
  /** `project`, the task's own whatever the place's (one name, or several), which then only places it; a subtask takes none. */
  createInPlace(text, priority, place, repeat, labels = [], project) {
    if (this.isBlank(text)) return null;
    return this.placeNew(text, priority, place, repeat, labels, project);
  }
  /** A new task where `place` says, whatever its title: `createInPlace` without its check for a blank one. */
  placeNew(text, priority, place, repeat, labels = [], project) {
    return (doc, today, _settings, boundary) => {
      const named = project === void 0 ? void 0 : project === null ? [] : typeof project === "string" ? [project] : project;
      const own = named?.filter((name) => !isFolder(doc, name));
      return createInPlace(doc, text, priority, this.resolve(doc, place, today), today, boundary, repeat, labels, own);
    };
  }
  /** `operation`, then the task it made gets `description` (none: nothing more): one write. */
  withDescription(operation, description) {
    if (!operation || !description || description.trim() === "") return operation;
    return (doc, today, settings, boundary) => {
      const after = operation(doc, today, settings, boundary);
      const made = after.insertedSince(doc);
      return made ? setDescription(after, made, description) : after;
    };
  }
  create(draft, slot) {
    if (this.isBlank(draft.text)) return null;
    return (doc, today, _settings, boundary) => placeTask(doc, null, draft, today, slot, boundary);
  }
  createSubtask(parent, draft) {
    if (this.isBlank(draft.text)) return null;
    return (doc, today) => createSubtask(doc, this.entryOf(doc, parent), draft, today);
  }
  /** First step: `text` the task's first subtask, the task folded; null for a blank text. */
  firstStep(key, text) {
    if (this.isBlank(text)) return null;
    return (doc) => firstStep(doc, this.entryOf(doc, key), text);
  }
  /** The task sheet's edit, and where the task stands after it (null before it ran); null for a blank title, a priority alone too. */
  edit(key, draft) {
    if (this.isBlank(draft.text)) return null;
    let place = null;
    const operation = (doc, today, _settings, boundary) => {
      const { doc: tagged, tags } = EntryTags.tag(doc, [this.entryOf(doc, key)]);
      const entry = tags.find(tagged, 0);
      const placed = placeTask(tagged, entry, { ...draft, text: EntryTags.marked(taskTitle(draft.text), 0) }, today, void 0, boundary);
      const written = tags.find(placed, 0);
      const edited = written && draft.description !== void 0 ? setDescription(placed, written, draft.description) : placed;
      const moved2 = tags.find(edited, 0);
      place = moved2 && { section: moved2.section, index: moved2.index, path: moved2.path, raw: "" };
      return tags.untag(edited);
    };
    return { operation, place: () => place };
  }
  /** Whether `edit` writes anything on the snapshot `s`: not for a blank title, nor for the task as it stands and where. */
  editChanges(s, key, draft) {
    const edit = this.edit(key, draft);
    return edit !== null && edit.operation(s.doc, s.today, this.settings.get(), s.boundary).serialize() !== s.doc.serialize();
  }
  setStatus(key, status) {
    return (doc) => setStatus(doc, this.entryOf(doc, key), status);
  }
  setDueDate(key, date) {
    return (doc) => setDueDate(doc, this.entryOf(doc, key), date);
  }
  setPriority(key, priority) {
    return (doc) => setPriority(doc, this.entryOf(doc, key), priority);
  }
  /** Each step's labels on its task; `places` gives, after the operation ran, where each task then is (null for one gone). */
  setLabelsAll(steps) {
    let places = [];
    const operation = (doc) => {
      const { doc: tagged, tags } = EntryTags.tag(doc, steps.map((step) => this.entryOf(doc, step.key)));
      let current = tagged;
      steps.forEach((step, n) => {
        const entry = tags.find(current, n);
        if (entry) current = setLabels(current, entry, step.labels);
      });
      places = steps.map((_, n) => {
        const entry = tags.find(current, n);
        return entry ? { section: entry.section, index: entry.index, path: entry.path, raw: "" } : null;
      });
      return tags.untag(current);
    };
    return { operation, places: () => places };
  }
  /** Each task's projects become `project` alone (null: none); a subtask's line is left alone; a folder: nothing. */
  setProject(keys, project) {
    if (keys.length === 0) return null;
    return (doc) => isFolder(doc, project) ? doc : this.rewrite(doc, this.holders(doc, keys), () => project === null ? [] : [project]);
  }
  /** `name` put last on every task that lacks it (a folder: nothing), or taken off them all when all have it; a subtask's key names its top task. */
  toggleProject(keys, name) {
    if (keys.length === 0) return null;
    return (doc) => {
      const holders = this.holders(doc, keys);
      const on = !holders.every((entry) => namesProject(entry.task.projects, name));
      if (on && isFolder(doc, name)) return doc;
      return this.rewrite(doc, holders, (projects) => withProject(projects, name, on));
    };
  }
  /** «New project…»: the project made at the tree's top when it lacks it, and put on every task (`keys` may be none) unless it is a folder. */
  newProject(name, keys) {
    const clean = this.cleanName(name);
    if (clean === null) return null;
    return (doc) => {
      const holders = this.holders(doc, keys);
      const named = addProject(doc, clean, { parent: null, before: null });
      const found = named.projectTree().find(clean).node.name;
      if (isFolder(named, found)) return named;
      const moved2 = holders.map((entry) => named.byId(entry.id));
      return this.rewrite(named, moved2, (projects) => withProject(projects, found, true));
    };
  }
  /** Cards let go on the tree: each one's `from` gives way to `to` (null: taken off), the others kept; a task's cards in turn; a folder: nothing. */
  dropOnProject(cards, to) {
    if (cards.length === 0) return null;
    return (doc) => {
      if (isFolder(doc, to)) return doc;
      const changed3 = /* @__PURE__ */ new Map();
      for (const card of cards) {
        const entry = projectHolder(doc, this.entryOf(doc, card.key));
        const projects = changed3.get(entry.id)?.projects ?? entry.task.projects;
        changed3.set(entry.id, { entry, projects: swappedProjects(projects, card.from, to) });
      }
      return doc.replaceAll([...changed3.values()].map(({ entry, projects }) => [entry, { ...entry.task, projects: uniqueNames(projects) }]));
    };
  }
  /** A project made at `place` of the tree; null for a name of nothing. */
  createProject(name, place) {
    const clean = this.cleanName(name);
    if (clean === null) return null;
    return (doc) => addProject(doc, clean, place);
  }
  moveProject(name, place) {
    return (doc) => moveProject(doc, name, place);
  }
  /** A project's name as typed, cleaned by the settings' field marks (`cleanProjectName`); null for a name of nothing. */
  cleanName(typed2) {
    return cleanProjectName(typed2, fieldStops(markersOf(this.settings.get())));
  }
  /** Null for a name of nothing. */
  renameProject(from, to) {
    const clean = this.cleanName(to);
    if (clean === null || clean === from) return null;
    return (doc) => renameProject(doc, from, clean);
  }
  deleteProject(name) {
    return (doc) => deleteProject(doc, name);
  }
  /** The project made a folder, or a project again (`setProjectFolder`). */
  setProjectFolder(name, folder) {
    return (doc) => setProjectFolder(doc, name, folder);
  }
  setProjectNote(name, link) {
    const note = link === null ? null : link.replace(/^\[\[|\]\]$/g, "").trim() || null;
    return (doc) => setProjectNote(doc, name, note);
  }
  rewrite(doc, holders, change) {
    return doc.replaceAll(holders.map((entry) => [entry, { ...entry.task, projects: uniqueNames(change(entry.task.projects)) }]));
  }
  /** The top tasks the keys name, each once. */
  holders(doc, keys) {
    const seen = /* @__PURE__ */ new Set();
    return keys.map((key) => projectHolder(doc, this.entryOf(doc, key))).filter((entry) => !seen.has(entry.id) && (seen.add(entry.id), true));
  }
  setReminder(key, reminder) {
    return (doc) => setReminder(doc, this.entryOf(doc, key), reminder);
  }
  /** The task's slot moved to `minutes` from now, keeping its length. */
  snooze(key, minutes) {
    const now = this.clock.now();
    return (doc, today, _settings, boundary) => {
      const entry = this.entryOf(doc, key);
      return setSlot(doc, entry, snoozedSlot(entry.task.slot, now, minutes), today, boundary);
    };
  }
  setCollapsed(key, collapsed) {
    return (doc) => setCollapsed(doc, this.entryOf(doc, key), collapsed);
  }
  toggleCollapsed(key) {
    return (doc) => {
      const entry = this.entryOf(doc, key);
      return setCollapsed(doc, entry, !entry.task.collapsed);
    };
  }
  unfoldAbove(key) {
    return (doc) => unfoldAbove(doc, this.entryOf(doc, key));
  }
  setRepeat(key, rule) {
    return (doc, today, _settings, boundary) => setRepeat(doc, this.entryOf(doc, key), rule, today, boundary);
  }
  stop(key) {
    return (doc) => stop(doc, this.entryOf(doc, key));
  }
  /** The title as typed (`ops.rename`); null for a blank one, a priority alone too. */
  rename(key, text) {
    if (this.isBlank(text)) return null;
    return (doc) => rename(doc, this.entryOf(doc, key), text);
  }
  /** Whether `rename` writes anything on `doc`: not for a blank text, nor for the task's own title and marks. */
  renameChanges(doc, key, text) {
    return !this.isBlank(text) && rename(doc, this.entryOf(doc, key), text) !== doc;
  }
  /** The circle of a task: done when it is open in the file, else open again. */
  toggleDone(key) {
    return (doc) => toggleDone(doc, this.entryOf(doc, key));
  }
  setDescription(key, markdown) {
    return (doc) => setDescription(doc, this.entryOf(doc, key), markdown);
  }
  /** A context line added at the end of an open task's description (`ops.addContext`); a closed task refuses it. */
  addContext(key, text) {
    return (doc) => {
      const entry = this.entryOf(doc, key);
      if (!isOpen(entry.task.status)) throw new Error("the task is closed");
      return addContext(doc, entry, text);
    };
  }
  remove(key) {
    return (doc) => remove(doc, this.entryOf(doc, key));
  }
  moveBefore(key, before, date) {
    return (doc, today) => moveBefore(doc, this.entryOf(doc, key), before ? this.entryOf(doc, before) : null, date, today);
  }
  nest(key, parent, before) {
    return (doc) => nest(doc, this.entryOf(doc, key), this.entryOf(doc, parent), before ? this.entryOf(doc, before) : null);
  }
  setSlot(key, slot) {
    return (doc, today, _settings, boundary) => setSlot(doc, this.entryOf(doc, key), slot, today, boundary);
  }
  clearSlot(key, place) {
    return (doc, today) => {
      const entry = this.entryOf(doc, key);
      const before = place?.before ? this.entryOf(doc, place.before) : null;
      const cleared2 = clearSlot(doc, entry);
      return place ? moveBefore(cleared2, cleared2.tasks(entry.section)[entry.index], before && cleared2.tasks(before.section)[before.index], place.date, today) : cleared2;
    };
  }
  moveToList(key, date) {
    return (doc, today) => moveToList(doc, this.entryOf(doc, key), date, today);
  }
  moveToSoon(key, date) {
    return (doc, today) => moveToSoon(doc, this.entryOf(doc, key), date, today);
  }
  postpone(key, date) {
    return (doc, today) => postpone(doc, this.entryOf(doc, key), date, today);
  }
  moveToEnd(key, section) {
    return (doc) => moveToEnd(doc, this.entryOf(doc, key), section);
  }
  moveToGroup(key, list, group, before, date) {
    return (doc, today) => {
      this.groupOf(doc, list, group);
      return moveToGroup(doc, this.entryOf(doc, key), list, group, before ? this.entryOf(doc, before) : null, today, date ?? null);
    };
  }
  createGroup(key, list, name, date) {
    if (blankName(name)) return null;
    return (doc, today, settings) => createGroup(doc, this.entryOf(doc, key), list, name, settings.groups, today, date ?? null);
  }
  moveGroup(list, group, place) {
    return (doc) => {
      this.groupOf(doc, list, group);
      if (place !== "end") this.groupOf(doc, list, place.before);
      return moveGroupTo(doc, list, group, place);
    };
  }
  /** Null for a blank name or the section's own: nothing to write. */
  /** Null for a blank name or the section's own: nothing to write. */
  renameGroup(list, group, name) {
    if (blankName(name) || name.trim() === group) return null;
    return (doc, _today, settings) => {
      this.groupOf(doc, list, group);
      return renameGroup(doc, list, group, name, settings.groups.ungrouped);
    };
  }
  removeGroup(list, group) {
    return (doc) => {
      this.groupOf(doc, list, group);
      return removeGroup(doc, list, group);
    };
  }
  /**
   * A new section `name` at `place`, and the list it goes in; null when the name can't make one there.
   */
  createSection(name, place) {
    const group = name.trim();
    const today = this.today();
    const column = columnOfPlace(place, today);
    const list = columnList(column, today);
    if (list === null || group === "" || group === this.settings.get().groups.ungrouped || group === place.group) return null;
    const operation = (doc, today2, settings, boundary) => {
      this.groupOf(doc, list, place.group);
      const before = place.before ? this.entryOf(doc, place.before) : null;
      const shown3 = columnGroups(doc, column, today2, boundary).find((g) => g.name === place.group)?.entries ?? [];
      if (before && !shown3.some((e) => e.section === before.section && e.index === before.index && e.path.length === 0)) throw new StaleTaskError();
      return createSection(doc, column, place.group, before, group, settings.groups, today2, boundary);
    };
    return { operation, list, group };
  }
  /** The steps in the file's order, each on its task wherever the earlier ones took it; a move under a task moved too goes along with it. */
  applyAll(steps) {
    if (steps.length === 0) return null;
    return (doc, today, settings, boundary) => {
      const fresh = (key) => key === null ? null : this.freshKey(doc, key);
      const now = steps.map((step) => ({ key: fresh(step.key), change: freshChange(step.change, fresh) }));
      const named = [];
      const tagOf = (key) => {
        const at = named.findIndex((k) => sameKey2(k, key));
        return at >= 0 ? at : named.push(key) - 1;
      };
      const lineOf = (key) => doc.lineOf(this.entryOf(doc, key));
      const plan = now.filter((step) => !(MOVES.has(step.change.kind) && now.some((other) => MOVES.has(other.change.kind) && isUnder(step.key, other.key)))).sort((a, b) => lineOf(a.key) - lineOf(b.key)).map((step) => ({ change: step.change, own: tagOf(step.key), refs: refsOf(step.change).map((ref) => ref === null ? null : tagOf(ref)) }));
      const { doc: tagged, tags } = EntryTags.tag(doc, named.map((key) => this.entryOf(doc, key)));
      let current = tagged;
      for (const { change, own, refs } of plan) {
        const entry = tags.find(current, own);
        if (!entry) continue;
        const [first, second] = refs.map((ref) => ref === null ? null : tags.find(current, ref));
        current = this.step(current, entry, change, first ?? null, second ?? null, today, settings, boundary);
      }
      return tags.untag(current);
    };
  }
  /** One step of `applyAll`; `first` and `second` are the tasks its change names, in the order `refsOf` gives them. */
  step(doc, entry, change, first, second, today, settings, boundary) {
    switch (change.kind) {
      case "status":
        return setStatus(doc, entry, change.status);
      case "priority":
        return setPriority(doc, entry, change.priority);
      case "labels":
        return setLabels(doc, entry, change.labels);
      case "project":
        return isFolder(doc, change.project) ? doc : setProjects(doc, entry, change.project === null ? [] : [change.project]);
      case "reorder":
        return reorder(doc, entry, change.group, first);
      case "swapProject": {
        if (isFolder(doc, change.to)) return doc;
        const holder = projectHolder(doc, entry);
        return doc.replace(holder, { ...holder.task, projects: swappedProjects(holder.task.projects, change.from, change.to) });
      }
      case "dueDate":
        return setDueDate(doc, entry, change.date);
      case "postpone":
        return postpone(doc, entry, change.date, today);
      case "remove":
        return remove(doc, entry);
      case "stop":
        return stop(doc, entry);
      case "moveBefore":
        return moveBefore(doc, entry, first, change.date, today);
      case "moveToList":
        return moveToList(doc, entry, change.date, today);
      case "moveToSoon":
        return moveToSoon(doc, entry, change.date, today);
      case "moveToEnd":
        return moveToEnd(doc, entry, change.section);
      case "moveToGroup":
        this.groupOf(doc, change.list, change.group);
        return moveToGroup(doc, entry, change.list, change.group, first, today, change.date ?? null);
      case "createGroup":
        return blankName(change.name) ? doc : createGroup(doc, entry, change.list, change.name, settings.groups, today, change.date ?? null);
      case "nest":
        return first ? nest(doc, entry, first, second) : doc;
      case "place":
        return sendTo(doc, entry, change.placement, today);
      case "repeat":
        return setRepeat(doc, entry, change.rule, today, boundary);
    }
  }
  resolve(doc, place, today) {
    const before = (key) => key ? this.entryOf(doc, key) : null;
    switch (place.kind) {
      case "list":
        this.groupOf(doc, place.list, place.group);
        return { kind: "list", list: place.list, group: place.group, before: before(place.before), date: place.date ?? null };
      case "day": {
        const { list, date } = dayColumn(place.date, today);
        this.groupOf(doc, list, place.group);
        return { kind: "list", list, group: place.group, before: before(place.before), date };
      }
      case "subtask":
        return { kind: "subtask", parent: this.entryOf(doc, place.parent), before: before(place.before) };
      case "slot":
        return place;
      case "projects":
        throw new StaleTaskError();
    }
  }
  /**
   * A written document with its projects in its tree: when the file as read still awaited the move to projects (old
   * fields, the result mark, or no `## Projects`), the move first, whatever the write did; then every project a task names.
   * While the host's notes are not complete, a file that awaits the move is written without either: the move comes
   * once they are.
   */
  projected(before, after, settings) {
    const notes = this.legacy.list();
    const mark = settings.resultMark;
    if (!this.legacy.ready()) return awaitsMove(after, notes, mark) ? after : withTasksInTree(after);
    const moved2 = awaitsMove(before, notes, mark) ? movedToProjects(after, notes, mark) : after;
    return withTasksInTree(moved2);
  }
  written(doc, operation, at, writes = true) {
    const { settings, today, boundary } = at;
    const changed3 = operation(doc, today, settings, boundary);
    const projected = changed3 === doc ? changed3 : this.projected(doc, changed3, settings);
    const after = normalize(projected, today, boundary, usablePresets(settings.groups.presets));
    const text = after.serialize();
    if (writes) this.identity?.wrote(text, after);
    return { text, before: doc, after };
  }
};

// core/domain/search.ts
var SNIPPET_LEAD = 24;
var ELLIPSIS = "…";
var SPACE_RE = /\s/;
var PUNCTUATION_RE = /[ -⁯⸀-⹿\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/;
var WORD_CHAR_RE = /[\p{L}\p{N}]/u;
var ACCENTS_RE = /[̀-ͯ]/g;
function foldedChar(char) {
  const lower = char.toLowerCase();
  const bare = lower.normalize("NFD").replace(ACCENTS_RE, "");
  if (bare.length === 1) return bare;
  return lower.length === 1 ? lower : char;
}
function lettersApart(a, b) {
  const x = [...folded(a.trim())];
  const y = [...folded(b.trim())];
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next.push(Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)));
    row = next;
  }
  return row[y.length];
}
function folded(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) out += foldedChar(text.charAt(i));
  return out;
}
function insideWord(text, at) {
  if (at === 0) return false;
  const char = text.charAt(at);
  const before = text.charAt(at - 1);
  if (!WORD_CHAR_RE.test(char) || !WORD_CHAR_RE.test(before)) return false;
  const startsCapital = char !== char.toLowerCase() && before === before.toLowerCase();
  return !startsCapital;
}
var FuzzyQuery = class _FuzzyQuery {
  constructor(length, words, letters2) {
    this.length = length;
    this.words = words;
    this.letters = letters2;
  }
  /** Null for a query of spaces: it finds nothing. */
  static of(query) {
    const text = folded(query.trim());
    if (text === "") return null;
    const words = [];
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (!SPACE_RE.test(char) && !PUNCTUATION_RE.test(char)) continue;
      if (from !== i) words.push(text.slice(from, i));
      if (!SPACE_RE.test(char)) words.push(char);
      from = i + 1;
    }
    if (from !== text.length) words.push(text.slice(from));
    const letters2 = [...text].filter((char) => !SPACE_RE.test(char));
    return new _FuzzyQuery(text.length, words, letters2);
  }
  /** The words in their order, failing that the letters in theirs. */
  match(text) {
    const lower = folded(text);
    return this.matchPieces(this.words, text, lower, false) ?? this.matchPieces(this.letters, text, lower, true);
  }
  /** The words in their order only: letters scattered over a long text would find nearly anything. */
  matchWords(text) {
    return this.matchPieces(this.words, text, folded(text), false);
  }
  matchPieces(pieces, text, lower, letters2) {
    if (pieces.length === 0) return null;
    const found = [];
    let at = 0;
    let broken = 0;
    for (const piece of pieces) {
      const start2 = lower.indexOf(piece, at);
      if (start2 < 0) return null;
      const joined = letters2 && start2 === at;
      if (!joined && insideWord(text, start2)) broken++;
      const last = found[found.length - 1];
      if (last && last.end === start2) last.end = start2 + piece.length;
      else found.push({ start: start2, end: start2 + piece.length });
      at = start2 + piece.length;
    }
    return { score: this.score(found, broken, text.length), found };
  }
  /** Fewer pieces, fewer of them inside words, tighter, earlier and in a shorter text score higher. */
  score(found, broken, textLength) {
    const span = found[found.length - 1].end - found[0].start;
    return -(found.length - 1) - broken / 10 - (span + 1 - this.length) / 100 - found[0].start / 1e3 - textLength / 1e4;
  }
};
function matchParts(text, found) {
  const parts = [];
  let at = 0;
  for (const piece of found) {
    if (piece.start > at) parts.push({ text: text.slice(at, piece.start), match: false });
    parts.push({ text: text.slice(piece.start, piece.end), match: true });
    at = piece.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}
var EMBED_RE = /!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g;
var BLOCK_MARK_RE = /^\s*(?:>\s?)*\s*(?:#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?/;
var LITERAL_RE = /`([^`]*)`|\\(.)/gu;
var EMPHASIS_RE = /(\*\*|~~|==|\*|(?<![\p{L}\p{N}])__|(?<![\p{L}\p{N}])_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
function withoutEmphasis(text) {
  let out = text;
  for (let before = ""; before !== out; ) {
    before = out;
    out = out.replace(EMPHASIS_RE, "$2");
  }
  return out;
}
function plainInline(text) {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(LITERAL_RE)) {
    out += plainText(withoutEmphasis(text.slice(at, m.index)));
    out += m[1] ?? m[2];
    at = m.index + m[0].length;
  }
  return out + plainText(withoutEmphasis(text.slice(at)));
}
function plainDescription(markdown) {
  return plainInline(
    markdown.split("\n").map((line) => line.replace(BLOCK_MARK_RE, "")).join(" ").replace(EMBED_RE, "")
  ).replace(/\s+/g, " ").trim();
}
function snippetParts(text, found) {
  const first = found[0].start;
  if (first <= SNIPPET_LEAD) return matchParts(text, found);
  const tail = text.slice(first - SNIPPET_LEAD, first);
  const space = tail.indexOf(" ");
  const lead = space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail;
  const cut = first - lead.length;
  const shifted = found.map((piece) => ({ start: piece.start - cut + 1, end: piece.end - cut + 1 }));
  return matchParts(ELLIPSIS + text.slice(cut), shifted);
}

// core/application/TimelineSpans.ts
function droppedSpan(start2, durationMin) {
  return clampSlot(start2, durationMin === null ? null : start2 + durationMin);
}
var TimelineSpans = class {
  constructor(boundary, now) {
    this.boundary = boundary;
    this.now = now;
  }
  /** On today, an open task whose start has passed rides the now line, its duration kept; the file keeps its time. */
  shown(task, day) {
    const own = this.boundary.spanOf(task.slot, day);
    const now = this.nowOn(day);
    if (now === null || !task.open || own.start >= now) return own;
    return { start: now, end: own.end === null ? null : now + own.end - own.start };
  }
  /** On today, an open task whose start has passed: its card rides the now line, off its own start (`shown`). */
  ridesNow(task, day) {
    return this.shown(task, day).start !== this.boundary.spanOf(task.slot, day).start;
  }
  /**
   * The card while a dot is held at `minute`: the end no earlier than the start nor past the day; the start no earlier
   * than the day nor past the end, and on a task without a duration no later than its start, which becomes the end.
   */
  stretched(task, day, edge, minute) {
    const shown3 = this.shown(task, day);
    if (edge === "end") return { start: shown3.start, end: Math.min(MINUTES_PER_DAY, Math.max(shown3.start, minute)) };
    const end = shown3.end ?? shown3.start;
    return { start: Math.max(0, Math.min(minute, end)), end };
  }
  /**
   * The slot a dot let go at `minute` writes, null when nothing changes. A span no longer than `minDurationMin` loses
   * its duration and stands at its start; a task without one whose start dot was pulled keeps its start. The bottom dot
   * changes only how long the task lasts, so a card riding the now line ends where the finger let go while the file keeps
   * its own start; the top dot is a new start and writes it.
   */
  resized(task, day, edge, minute, minDurationMin) {
    const shown3 = this.shown(task, day);
    const held = this.stretched(task, day, edge, minute);
    const keepsDuration = held.end - held.start > minDurationMin;
    const unmoved = edge === "start" && shown3.end === null;
    const next = keepsDuration ? held : { start: unmoved ? shown3.start : held.start, end: null };
    if (next.start === shown3.start && next.end === shown3.end) return null;
    if (edge === "start") return this.boundary.slotAt(day, next.start, next.end);
    const start2 = this.boundary.spanOf(task.slot, day).start;
    return this.boundary.slotAt(day, start2, next.end === null ? null : start2 + next.end - next.start);
  }
  /** Minutes from the start of `day` to now; null on another day than today. */
  nowOn(day) {
    return this.boundary.dayOf(this.now) === day ? this.boundary.offsetOf(day, this.now) : null;
  }
};

// core/application/projectFilter.ts
function filterTest(node, tree, doc, subprojects) {
  if (node === "all") return () => true;
  if (node === "none") return (entry) => entry.task.projects.length === 0;
  const names = node === "done" ? doneNames(tree, doc) : shownNames(node, tree, doc, subprojects);
  return (entry) => names.some((name) => namesProject(entry.task.projects, name));
}
function hasSubprojects(node, tree, doc) {
  const name = node === null || node === void 0 ? null : projectOfNode(node);
  const found = name === null ? null : tree.find(name);
  if (found === null || found.node.children.length === 0) return false;
  if (doc === null) return true;
  const statuses = projectStatuses(tree, doc);
  const done = (project) => statuses.get(projectKey(project)) === "done";
  return done(found.node.name) || found.node.children.some((child) => !done(child.name));
}
function shownNames(node, tree, doc, subprojects) {
  if (subprojects || !hasSubprojects(node, tree, doc)) return branchNames(node, tree);
  const found = tree.find(projectOfNode(node) ?? "");
  return found ? [found.node.name] : [];
}
function branchNames(node, tree) {
  const found = tree.find(projectOfNode(node) ?? "");
  if (!found) return [];
  return tree.all().filter((p) => p.path.length >= found.path.length && p.path.slice(0, found.path.length).every((n, i) => projectKey(n) === projectKey(found.path[i]))).map((p) => p.node.name);
}
function doneNames(tree, doc) {
  const statuses = projectStatuses(tree, doc);
  return tree.all().filter((p) => statuses.get(projectKey(p.node.name)) === "done").map((p) => p.node.name);
}
function afterShown(doc, list, group, shows, carried = /* @__PURE__ */ new Set()) {
  const tasks = doc.tasks(list).filter((entry) => entry.group === group);
  let last = -1;
  tasks.forEach((entry, i) => {
    if (!carried.has(entry.id) && shows(entry)) last = i;
  });
  const next = last < 0 ? void 0 : tasks.slice(last + 1).find((entry) => !carried.has(entry.id));
  return next ? keyOf(next) : null;
}
function shownUnder(entry, node, tree, doc, subprojects) {
  const projects = entry.task.projects;
  const name = node === null ? null : projectOfNode(node);
  const branch = name === null ? [] : shownNames(projectNodeOf(name), tree, doc, subprojects);
  const own = branch.length > 0 ? projects.find((p) => namesProject(branch, p)) : void 0;
  const first = own ?? projects[0];
  return first === void 0 ? null : tree.find(first)?.node.name ?? first;
}
function noteProject(path, tree) {
  const file = path.replace(/\.md$/i, "").toLowerCase();
  const found = tree.all().find(({ node }) => {
    if (node.note === null) return false;
    const link = node.note.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "").toLowerCase();
    return link !== "" && (file === link || file.endsWith(`/${link}`));
  });
  return found ? found.node.name : null;
}

// core/application/TaskReads.ts
var NO_PROJECT_SOURCE = { tree: () => ProjectTree.EMPTY, screen: () => ({}) };
function sectionsOf2(doc, list) {
  return doc.groups(list).filter((g) => g.heading || g.entries.length > 0).map((g) => ({ id: g.name === null || g.id === null ? NO_SECTION_ID : g.id, name: g.name, empty: g.name !== null && g.entries.length === 0 }));
}
var OPEN_ORDER = ["inbox", "backlog", "now", "soon"];
var MOST_CANDIDATES = 5;
var MOST_TYPOS = 2;
var TYPO_SHARE = 4;
var SEARCH_ORDER = ["inbox", "backlog", "soon", "now", "done"];
function byQuality(a, b) {
  if (a.title === null !== (b.title === null)) return a.title ? -1 : 1;
  return (b.title ?? b.description).score - (a.title ?? a.description).score;
}
function slotted(item) {
  if (!item.slot) throw new Error("Task Calendar: the task has no slot on the timeline");
  return { slot: item.slot, open: item.open };
}
var TaskReads = class {
  constructor(rules, settings, clock, source = NO_PROJECT_SOURCE) {
    this.rules = rules;
    this.settings = settings;
    this.clock = clock;
    this.source = source;
    /** A funnel list's column title: its name; the day's list draws the day's own. */
    this.columnTitle = (list) => list === "day" ? null : this.listName(list);
  }
  /** The projects of the tree read last, in its order: the Project page and the quick entry's Project button. */
  projects() {
    return new ProjectIndex(this.source.tree()).known();
  }
  /** The Projects screen as this device shows it, or `node`'s by project; without a file, the tree's fixed rows alone. */
  projectsScreenRead(node) {
    return { reads: true, tidies: true, missing: () => this.projectsScreen(null, node), answer: (s) => this.projectsScreen(s, node) };
  }
  projectsScreen(s, node) {
    const tree = s ? projectTreeOf(s.doc) : ProjectTree.EMPTY;
    const levels = this.itemLevels(new ProjectIndex(tree), false);
    const today = s?.today ?? this.today();
    const boundary = s?.boundary ?? this.rules.moment().boundary;
    return projectsView({
      doc: s?.doc ?? null,
      tree,
      today,
      boundary,
      state: this.source.screen(),
      item: (entry) => toItem(entry, today, levels, null, boundary),
      listName: (list) => this.listName(list),
      ...node !== void 0 && { node }
    });
  }
  /** The funnel's view as this device shows it; without a file, no filter and the panel's fixed rows. */
  funnelViewRead(wide) {
    return { reads: true, tidies: true, missing: () => this.funnelView(null, wide), answer: (s) => this.funnelView(s, wide) };
  }
  funnelView(s, wide) {
    const state = this.source.screen();
    const tree = s ? projectTreeOf(s.doc) : ProjectTree.EMPTY;
    const node = chosenNode(state, tree);
    const filter = node === null ? null : this.filterOf(node, tree, s?.doc ?? null, true);
    const closed = node !== null && nodeHeader(node, tree, s?.doc ?? null).closed;
    const view = viewChoice(state, { node, closed, wide, note: false, title: this.columnTitle, branches: hasSubprojects(node, tree, s?.doc ?? null) });
    const reason = panelReason(state);
    return {
      filter,
      view,
      panel: { rows: panelRows(tree, s?.doc ?? null, state), open: reason !== null, reason, docked: wide, dimCloses: reason === "button" && !wide, missing: s === null },
      plus: plusOf(view.mode, reason !== null),
      topRow: node !== null || view.mode !== "twoColumns",
      searchPaths: filter !== null,
      place: funnelPlaceOf(state.place)
    };
  }
  /**
   * The main screen's view under `node` (null: no filter), whatever node the device chose, or with `note` a project
   * note's block's: a screen drawn in its own context reads its view in it. Without a file, the unfiltered view.
   */
  viewInRead(node, wide, note = false) {
    const view = (s, at) => {
      const tree = s ? projectTreeOf(s.doc) : ProjectTree.EMPTY;
      const closed = at !== null && nodeHeader(at, tree, s?.doc ?? null).closed;
      return viewChoice(this.source.screen(), { node: at, closed, wide, note, title: this.columnTitle, branches: hasSubprojects(at, tree, s?.doc ?? null) });
    };
    return { reads: true, tidies: true, missing: () => view(null, null), answer: (s) => view(s, node) };
  }
  /** The block at the end of the note at `path`: null for a note no project has, and without a file. */
  projectNoteViewRead(path, wide) {
    return { reads: true, tidies: true, missing: () => null, answer: (s) => this.projectNoteView(s, path, wide) };
  }
  projectNoteView(s, path, wide) {
    const tree = projectTreeOf(s.doc);
    const name = noteProject(path, tree);
    if (name === null) return null;
    const node = projectNodeOf(name);
    const closed = nodeHeader(node, tree, s.doc).closed;
    const view = viewChoice(this.source.screen(), { node, closed, wide, note: true, title: this.columnTitle, branches: hasSubprojects(node, tree, s.doc) });
    return { filter: this.filterOf(node, tree, s.doc, false), view, panel: null, plus: plusOf(view.mode, false), topRow: false, searchPaths: true, place: funnelPlaceOf(this.source.screen().place) };
  }
  /** The view before the first read: the device's state alone (`firstViewOf`). */
  firstView(wide, note) {
    const state = this.source.screen();
    return firstViewOf(state, wide, note, this.columnTitle, hasSubprojects(state.selected, this.source.tree(), null));
  }
  /** The device's Subprojects setting (`subprojectsOn`): what every filtered read and write goes by. */
  subprojects() {
    return subprojectsOn(this.source.screen());
  }
  /** Whether `filter` hides `item`'s task from the screen: a subtask goes by its top task. */
  filterHidesRead(item, filter) {
    return { reads: filter !== null, tidies: true, missing: () => false, answer: (s) => s ? this.filterHides(s, item, filter) : false };
  }
  filterHides({ doc }, item, filter) {
    const tree = projectTreeOf(doc);
    const node = filterNode(filter, tree);
    const entry = this.rules.named(doc, item.key) ?? doc.find(item.key.section, item.key.index, item.key.path);
    if (node === null || !entry) return false;
    const top = entry.path.length === 0 ? entry : doc.find(entry.section, entry.index, []);
    return top !== void 0 && !filterTest(node, tree, doc, this.subprojects())(top);
  }
  filterOf(node, tree, doc, clearable) {
    const { title, menu, project } = nodeHeader(node, tree, doc);
    return { node, title, menu, clearable, project, emptyLabel: PROJECTS_WORDS.noTasks };
  }
  priorityLevels() {
    return this.rules.priorityLevels();
  }
  labelLevels() {
    return usableLabels(this.settings.get().labels);
  }
  parseTitle(text) {
    const levels = this.priorityLevels();
    const parsed = priorityOfTitle(text, levels.map((l) => l.prefix));
    return { text: parsed.text, priority: levels.find((l) => l.prefix === parsed.priority) ?? null };
  }
  draftMarks(text, priority, labels) {
    const levels = this.priorityLevels();
    return draftMarksOf(typedMarks(text, priority, labels, levels.map((l) => l.prefix)), levels, this.labelLevels());
  }
  isBlank(text) {
    return this.rules.isBlank(text);
  }
  withPriority(text, prefix) {
    return withPriority(text, prefix, this.priorityLevels().map((l) => l.prefix));
  }
  /** The screen of `date`, under `filter`: the file tidied for today first; without a file, the empty screen. */
  screenRead(date, filter) {
    return { reads: true, tidies: true, missing: () => this.missingScreen(date), answer: (s) => this.screen(s, date, filter) };
  }
  /** The screen of `date`, only the tasks `filter` lets through (`TaskService.screen`). */
  screen(s, date, filter) {
    const { doc, today, boundary } = s;
    const { shows, item } = this.filtered(s, filter);
    const shown3 = (entries) => entries.filter(shows).map(item);
    const day = { date, list: shown3(dayList(doc, date, today, boundary)), slotted: shown3(slottedOn(doc, date, boundary)) };
    const sections = this.listSections(s);
    const view = { soon: shown3(soonWithoutDate(doc)), inbox: shown3(inboxList(doc)), backlog: shown3(backlogList(doc)) };
    return {
      day,
      ...view,
      done: shown3(doc.tasks("done")),
      sections,
      offer: this.offerOf(s, date, sections),
      missing: false,
      calendars: true,
      projectTree: new ProjectIndex(projectTreeOf(doc)).known(),
      titleDrops: this.titleDrops(date)
    };
  }
  /** What a drop on each column's title means: into its list; a day without sections, its end. */
  titleDrops(date) {
    const title = (list, day2) => ({ kind: "title", list, date: day2 });
    const day = this.columnSections("day", date);
    return {
      day: day ? title(day.list, day.date) : { kind: "list", column: "day", before: null },
      soon: title("soon", null),
      inbox: title("inbox", null),
      backlog: title("backlog", null)
    };
  }
  /** The screen without a tasks file: nothing in any list, and no calendars beside nothing. */
  missingScreen(date) {
    const none2 = { inbox: [], backlog: [], soon: [], now: [] };
    return {
      day: { date, list: [], slotted: [] },
      soon: [],
      inbox: [],
      backlog: [],
      done: [],
      sections: none2,
      offer: { lists: none2, ungrouped: this.settings.get().groups.ungrouped },
      missing: true,
      calendars: false,
      projectTree: [],
      titleDrops: this.titleDrops(date)
    };
  }
  /** The day's list and timeline, only the tasks `filter` lets through: `screen(s, date, filter).day`. */
  dayView(s, date, filter) {
    return this.screen(s, date, filter).day;
  }
  /** Every task of each list, each with its subtasks, Today's and Soon's columns as `screen` draws them on today, and today, the file tidied first: what the assistant reads. No file: everything empty. */
  listedRead() {
    const lists = (of) => Object.fromEntries(SEARCH_ORDER.map((key) => [key, of(key)]));
    return {
      reads: true,
      tidies: true,
      missing: () => ({ today: this.today(), lists: lists(() => []), columns: { today: [], soon: [] } }),
      answer: (s) => {
        const item = this.itemOf(s.today, s.doc);
        const screen = this.screen(s, s.today);
        const columns = { today: [...screen.day.list, ...screen.day.slotted], soon: screen.soon };
        return { today: s.today, lists: lists((key) => s.doc.tasks(key).map(item)), columns };
      }
    };
  }
  soonWithoutDateView({ doc, today }) {
    return soonWithoutDate(doc).map(this.itemOf(today, doc));
  }
  inboxView({ doc, today }) {
    return inboxList(doc).map(this.itemOf(today, doc));
  }
  backlogView({ doc, today }) {
    return backlogList(doc).map(this.itemOf(today, doc));
  }
  doneView({ doc, today }) {
    return doc.tasks("done").map(this.itemOf(today, doc));
  }
  sectionOffer(s, date) {
    return this.screen(s, date).offer;
  }
  /** The sections the menus offer on the screen. */
  offerOf({ doc, today, boundary }, date, sections) {
    const { presets, ungrouped } = this.settings.get().groups;
    const shown3 = [...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)];
    const names = (list) => offeredNames(shownSections(shown3.filter((entry) => entry.section === list).map((entry) => entry.group), sections[list]), presets, ungrouped);
    return { lists: { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") }, ungrouped };
  }
  listSections({ doc }) {
    return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf2(doc, list)]));
  }
  /** A query that finds nothing reads no file. */
  searchRead(query) {
    return { reads: FuzzyQuery.of(query) !== null, answer: (s) => this.search(s, query) };
  }
  /** Every task the query finds, each with its project's path. */
  search(s, query) {
    const fuzzy = FuzzyQuery.of(query);
    if (!fuzzy || !s) return [];
    const { doc, today } = s;
    const item = this.itemOf(today, doc);
    const ranked = [];
    const visit = (entry) => {
      const titleText = plainText(entry.task.text);
      const title = fuzzy.match(titleText);
      const markdown = descriptionMarkdown(entry);
      const descriptionText = markdown === null ? "" : plainDescription(markdown);
      const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
      const found = item(entry);
      const named = entry.path.length > 0 ? [] : found.projects.map((p) => ({ text: p.name, match: fuzzy.matchWords(p.name) }));
      const hitProject = named.find((p) => p.match !== null) ?? null;
      const projectText = hitProject?.text ?? "";
      const project = hitProject?.match ?? null;
      if (title || description || project) {
        const hit = {
          item: { ...found, card: ownCard(found) },
          title: title ? matchParts(titleText, title.found) : [],
          project: project ? matchParts(projectText, project.found) : null,
          projectPath: found.project?.path ?? null,
          description: description ? snippetParts(descriptionText, description.found) : null
        };
        ranked.push({ hit, title, description: description ?? project });
      }
      for (const sub of entry.subtasks) if (isOpen(sub.task.status)) visit(sub);
    };
    const groups = [];
    for (const list of SEARCH_ORDER) {
      ranked.length = 0;
      for (const entry of doc.tasks(list)) visit(entry);
      if (ranked.length > 0) groups.push({ list, hits: ranked.sort(byQuality).map((r) => r.hit) });
    }
    return groups;
  }
  screenOf({ doc, today, boundary }, item) {
    const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : void 0;
    return top ? taskScreen(top.section, dayOfTask(top.section, top.task, today, boundary)) : taskScreen(item.list, item.day);
  }
  findIn(items, key) {
    for (const item of items) {
      if (key.id !== void 0 && item.id !== void 0 ? item.id === key.id : samePlace(item.key, key)) return item;
      const inner = this.findIn(item.subtasks, key);
      if (inner) return inner;
    }
    return null;
  }
  find({ doc, today }, key, text) {
    const named = this.rules.named(doc, key);
    if (named !== void 0) return named ? this.itemAt(doc, named, today) : null;
    const atPlace = doc.find(key.section, key.index, key.path);
    const alike = flatten(doc.allTasks()).filter((entry2) => entry2.raw === key.raw);
    const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : void 0;
    return entry ? this.itemAt(doc, entry, today) : null;
  }
  /** The tasks the keys name as the file has them, in their order; throws StaleTaskError when one is gone. */
  itemsAt({ doc, today, boundary }, keys) {
    const levels = this.itemLevels(new ProjectIndex(projectTreeOf(doc)));
    return keys.map((key) => {
      const entry = this.rules.entryOf(doc, key);
      const parent = key.path.length > 0 ? doc.find(key.section, key.index, key.path.slice(0, -1)) ?? null : null;
      return toItem(entry, today, levels, parent, boundary);
    });
  }
  /** The task at `place` in `doc` as the UI sees it, with the task it sits under; null when none stands there. */
  itemAt(doc, place, today) {
    const entry = doc.find(place.section, place.index, place.path);
    if (!entry) return null;
    const parent = place.path.length > 0 ? doc.find(place.section, place.index, place.path.slice(0, -1)) ?? null : null;
    return toItem(entry, today, this.itemLevels(new ProjectIndex(projectTreeOf(doc))), parent, this.rules.moment().boundary);
  }
  /** The task's line in the file once tidied for today, from 0. */
  lineOfRead(key) {
    return { reads: true, tidies: true, answer: (s) => this.lineOf(s.text, key) };
  }
  /** Where the task stands in `text` as it is, untidied: the line its id has there (`TaskService.storedLine`). */
  storedLine(item, text) {
    const doc = this.rules.parse(text);
    const entry = flatten(doc.allTasks()).find((e) => e.id === item.id);
    return entry ? { section: entry.section, line: doc.lineOf(entry), raw: entry.raw } : null;
  }
  /** The task's line in the file as it stands, unnormalized, from 0. */
  lineOf(text, key) {
    const doc = this.rules.parse(text);
    return doc.lineOf(this.rules.entryOf(doc, key));
  }
  placementOf(item) {
    if (item.dueDate === this.today()) return { kind: "now" };
    if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
    if (item.key.section === "inbox" || item.key.section === "backlog") return { kind: item.key.section };
    return item.key.section === "soon" ? { kind: "soon" } : { kind: "now" };
  }
  dayColumn(date) {
    return dayColumn(date, this.today());
  }
  columnSections(column, date) {
    if (column !== "day") return { list: column, date: null };
    const { list, date: day, sections } = this.dayColumn(date);
    return sections ? { list, date: day } : null;
  }
  placementOfDay(date) {
    return placementOfDay(date, this.today());
  }
  /** The list `column` of `screen` draws: its tasks as the screen read them, in the sections it shows on the screen's day. */
  columnView(screen, column) {
    const sections = this.columnSections(column, screen.day.date);
    const items = column === "day" ? screen.day.list : screen[column];
    return { sections, ...listView(items, sections !== null, sections ? screen.sections[sections.list] : []) };
  }
  /** Where Max sees the task, a subtask's its task's (`placeOfTask`), as the screens and By project's stage mark say it. */
  placeOf({ doc, today, boundary }, item) {
    const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : void 0;
    if (top) return placeOfTask(top.section, top.task, isOpen(top.task.status), today, boundary);
    return placeOfTask(item.list, item, item.open, today, boundary);
  }
  /** A block of `day`'s timeline rides the now line. */
  ridesNow(item, day) {
    return this.timeline().ridesNow(slotted(item), day);
  }
  /**
   * The node of the project `name` names; none with the closest names: those the search's match finds, best first, then
   * those a typo or two apart (`lettersApart`), nearest first.
   */
  projectNodeNamed({ doc }, name) {
    const tree = projectTreeOf(doc);
    const found = tree.find(name);
    if (found) return { node: projectNodeOf(found.node.name), candidates: [] };
    const query = FuzzyQuery.of(name);
    const names = tree.all().map((p) => p.node.name);
    const matched = query === null ? [] : names.map((n) => ({ name: n, match: query.match(n) })).filter((s) => s.match !== null);
    const fuzzy = matched.sort((a, b) => b.match.score - a.match.score).map((s) => s.name);
    const typos = names.map((n) => ({ name: n, apart: lettersApart(name, n) })).filter((t) => t.apart <= Math.max(MOST_TYPOS, Math.floor(name.length / TYPO_SHARE)) && !fuzzy.includes(t.name)).sort((a, b) => a.apart - b.apart).map((t) => t.name);
    return { node: null, candidates: [...fuzzy, ...typos].slice(0, MOST_CANDIDATES) };
  }
  /** Every open task once, under `filter`, in the funnel's order, each with its place. */
  openTasksRead(filter) {
    return { reads: true, tidies: true, missing: () => [], answer: (s) => this.openTasks(s, filter) };
  }
  openTasks(s, filter) {
    const { doc, today, boundary } = s;
    const { shows, item } = this.filtered(s, filter);
    const open = OPEN_ORDER.flatMap((list) => doc.tasks(list)).filter((entry) => isOpen(entry.task.status) && shows(entry));
    const placed = open.map((entry) => ({ item: item(entry), place: placeOfTask(entry.section, entry.task, true, today, boundary) }));
    return placed.map((p, i) => ({ p, i, rank: funnelRank(p.place) })).sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.i - b.i).map(({ p }) => p);
  }
  /** A live project's closed tasks By project; none for a done project or a name the tree lacks. */
  projectHistoryRead(node) {
    return { reads: true, tidies: true, missing: () => [], answer: (s) => this.projectHistory(s, node) };
  }
  projectHistory(s, node) {
    const { doc, today, boundary } = s;
    const tree = projectTreeOf(doc);
    const levels = this.itemLevels(new ProjectIndex(tree), false);
    return projectHistory({ doc, tree, today, boundary, state: this.source.screen(), item: (entry) => toItem(entry, today, levels, null, boundary), listName: (list) => this.listName(list), node }, node);
  }
  listName(list) {
    return this.settings.get().sections[list];
  }
  placementTitle(placement) {
    return placement.kind === "date" ? dayMonth(placement.date) : this.listName(placement.kind);
  }
  dayOfPlacement(placement) {
    return dayOfPlacement(placement, this.today());
  }
  menu(item, from, screen) {
    const offer = menuOffer([from], screen, (column, date) => this.columnSections(column, date));
    return oneTaskMenu(item, screen.today, this.priorityLevels(), this.labelLevels(), offer, from, this.projectChoices(screen), this.placementOf(item));
  }
  bulkMenu(picked2, screen) {
    const offer = menuOffer(picked2.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
    return bulkMenuOf(picked2.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, this.projectChoices(screen), picked2.map((p) => p.from), picked2.map((p) => this.placementOf(p.item)));
  }
  carried(lifted2, picked2) {
    return carriedWith(lifted2, picked2);
  }
  fullTree(item) {
    return fullTree(item);
  }
  shownSpan(item, day) {
    return this.timeline().shown(slotted(item), day);
  }
  dropSpan(item, from, start2) {
    return droppedSpan(start2, from === "timeline" ? item?.durationMin ?? null : null);
  }
  newSlot(day, start2) {
    return this.rules.moment().boundary.slotAt(day, droppedSpan(start2, null).start, null);
  }
  stretch(item, day, edge, minute) {
    return this.timeline().stretched(slotted(item), day, edge, minute);
  }
  resizedSlot(item, day, edge, minute, minDurationMin) {
    return this.timeline().resized(slotted(item), day, edge, minute, minDurationMin);
  }
  /** Whether `to` takes the tasks carried from `origins` (`takesDrop`); a place under a task reads that task. */
  takesRead(origins, to) {
    return { reads: to.kind === "nest", missing: () => false, answer: (s) => this.takes(s, origins, to) };
  }
  takes(s, origins, to) {
    return takesDrop(origins, to, (parent) => s ? this.originAt(s.doc, parent) : null);
  }
  /** Whether `column` on `day` opens a gap for every task carried from `origins` (`placesInGap`). */
  opensGaps(origins, column, day) {
    const grouped = this.columnSections(column, day) !== null;
    return origins.every((from) => placesInGap(column, from, grouped));
  }
  /** Every task of the file, its subtasks at every depth, as `screen` under `filter` draws it, by its id. */
  itemsRead(filter) {
    return { reads: true, missing: () => /* @__PURE__ */ new Map(), answer: (s) => this.itemsById(s, filter) };
  }
  itemsById(s, filter) {
    const { item } = this.filtered(s, filter);
    const byId = /* @__PURE__ */ new Map();
    const visit = (found) => {
      byId.set(found.id, found);
      found.allSubtasks.forEach(visit);
    };
    for (const list of SEARCH_ORDER) s.doc.tasks(list).forEach((entry) => visit(item(entry)));
    return byId;
  }
  originAt(doc, key) {
    const entry = this.rules.found(doc, key);
    return entry ? originOf({ list: entry.section, slot: entry.task.slot, dueDate: entry.task.dueDate }) : null;
  }
  /** The timeline's rules by the clock and the day's boundary now. */
  timeline() {
    return new TimelineSpans(this.rules.moment().boundary, this.clock.now());
  }
  /**
   * What a read under `filter` shows (`TaskService.screen`'s filter): which tasks the node lets through, a subtask with its
   * task, and how each is drawn, without the folder mark under a project.
   */
  filtered({ doc, today }, filter) {
    const tree = projectTreeOf(doc);
    const node = filterNode(filter, tree);
    const shows = node === null ? () => true : filterTest(node, tree, doc, this.subprojects());
    return { shows, item: this.itemOf(today, doc, node === null || projectOfNode(node) === null) };
  }
  /** The item of a task of `doc`, its subtasks below it, its projects as `doc`'s tree has them; `mark`, the card shows the folder mark. */
  itemOf(today, doc, mark = true) {
    const levels = this.itemLevels(new ProjectIndex(projectTreeOf(doc)), mark);
    const { boundary } = this.rules.moment();
    return (entry) => toItem(entry, today, levels, null, boundary);
  }
  itemLevels(index, mark = true) {
    const settings = this.settings.get();
    return itemLevels(usableLevels(settings.priorities), usableLabels(settings.labels), (name) => index.refOf(name, mark));
  }
  /** The projects the Project page offers, each with its depth: the screen's when it gives them, else the tree read last. */
  projectChoices(screen) {
    const known = screen?.projects ?? new ProjectIndex(this.source.tree()).known();
    return known.map((project) => ({ project, depth: project.path.length - 1 }));
  }
  today() {
    return this.rules.today();
  }
};
function plusOf(mode, panel) {
  if (mode !== "byProject") return { tap: "newTask", list: "funnel", tree: panel };
  return { tap: "inPlace", list: panel ? null : "projects", tree: panel };
}

// core/application/landing.ts
function landingOf(screen, id, day, timeline) {
  const span = (item) => timeline.shown({ slot: item.slot, open: item.open }, day);
  const block = screen.day.slotted.find((item) => item.id === id);
  if (block) {
    const shown3 = span(block);
    return { kind: "timeline", id, item: block, span: shown3, ridesNow: timeline.ridesNow({ slot: block.slot, open: block.open }, day), slotted: screen.day.slotted.map((item) => ({ id: item.id, span: span(item) })) };
  }
  const columns = [["day", screen.day.list], ["soon", screen.soon], ["inbox", screen.inbox], ["backlog", screen.backlog], ["done", screen.done]];
  for (const [column, items] of columns) {
    const card = items.find((item) => item.id === id);
    if (card) return { kind: "list", id, item: card, column, group: card.group, index: items.filter((item) => item.group === card.group).indexOf(card) };
    for (const top of items) {
      const under = subtaskOf(top, id);
      if (under) return under;
    }
  }
  return { kind: "away", id, item: null };
}
function subtaskOf(parent, id) {
  const index = parent.subtasks.findIndex((sub) => sub.id === id);
  if (index >= 0) return { kind: "subtask", id, item: parent.subtasks[index], parent: parent.id, index };
  for (const sub of parent.subtasks) {
    const deeper = subtaskOf(sub, id);
    if (deeper) return deeper;
  }
  return null;
}

// core/application/TaskWrites.ts
function namedIn(change, clean) {
  return clean === null || !change ? null : change.after.projectTree().find(clean)?.node.name ?? null;
}
var nothing = (operation) => ({ operation, answer: () => void 0 });
var TaskWrites = class {
  constructor(rules, reads) {
    this.rules = rules;
    this.reads = reads;
  }
  createInList(date, text) {
    return nothing(this.rules.createInList(date, text));
  }
  createInSoon(text) {
    return nothing(this.rules.createInSoon(text));
  }
  createAtTime(date, start2, text) {
    return nothing(this.rules.createAtTime(date, start2, text));
  }
  createInPlace(text, priority, place, repeat, labels = [], project, filter, description) {
    const write = this.createWithId(text, priority, place, repeat, labels, project, filter, description);
    return { operation: write.operation, answer: (change) => write.answer(change)?.key ?? null };
  }
  createWithId(text, priority, place, repeat, labels = [], project, filter, description) {
    return {
      operation: this.rules.withDescription(
        place.kind === "projects" ? this.createInProjects(text, priority, place, repeat, labels, project) : filter !== null && filter !== void 0 && !this.rules.isBlank(text) ? (doc, today, settings, boundary) => this.rules.placeNew(text, priority, shownPlace(doc, place, filter, today, this.reads.subprojects()), repeat, labels, project)(doc, today, settings, boundary) : this.rules.createInPlace(text, priority, place, repeat, labels, project),
        description
      ),
      answer: (change) => {
        const created = change?.after.insertedSince(change.before);
        return created ? { key: keyOf(created), id: created.id } : null;
      }
    };
  }
  /** A task typed in the Projects list: its place read off the screen as the file then stands (`projectsNewPlace`). */
  createInProjects(text, priority, place, repeat, labels, project) {
    if (this.rules.isBlank(text)) return null;
    return (doc, today, settings, boundary) => {
      const view = this.reads.projectsScreen({ text: "", doc, today, boundary }, place.node);
      const at = projectsNewPlace(view, doc, (key) => this.rules.entryOf(doc, key), place, today);
      return this.rules.placeNew(text, priority, at, repeat, labels, project)(doc, today, settings, boundary);
    };
  }
  create(draft, slot) {
    return nothing(this.rules.create(draft, slot));
  }
  createSubtask(parent, draft) {
    return nothing(this.rules.createSubtask(parent, draft));
  }
  firstStep(key, text) {
    return nothing(this.rules.firstStep(key, text));
  }
  edit(s, key, draft) {
    const edit = this.rules.edit(key, draft);
    if (!edit || !this.rules.editChanges(s, key, draft)) return { operation: null, answer: () => null };
    return {
      operation: edit.operation,
      answer: (change) => {
        const place = edit.place();
        if (!change || !place || change.before.serialize() === change.after.serialize()) return null;
        return this.reads.itemAt(change.after, place, this.rules.today());
      }
    };
  }
  setStatus(key, status) {
    return nothing(this.rules.setStatus(key, status));
  }
  toggleDone(key) {
    return nothing(this.rules.toggleDone(key));
  }
  setDueDate(key, date) {
    return nothing(this.rules.setDueDate(key, date));
  }
  setPriority(key, priority) {
    return nothing(this.rules.setPriority(key, priority));
  }
  setLabels(key, labels) {
    const all2 = this.setLabelsAll([{ key, labels }]);
    return { operation: all2.operation, answer: (change) => all2.answer(change)[0] ?? null };
  }
  setLabelsAll(steps) {
    if (steps.length === 0) return { operation: null, answer: () => [] };
    const labelled = this.rules.setLabelsAll(steps);
    return {
      operation: labelled.operation,
      answer: (change) => {
        if (!change) return steps.map(() => null);
        const today = this.rules.today();
        return labelled.places().map((place) => place ? this.reads.itemAt(change.after, place, today) : null);
      }
    };
  }
  setProject(keys, project) {
    return nothing(this.rules.setProject(keys, project));
  }
  /** Each task as it then stands, found by its id, in the order given; null for one gone. */
  toggleProject(keys, name) {
    return {
      operation: this.rules.toggleProject(keys, name),
      answer: (change) => {
        if (!change) return keys.map(() => null);
        const today = this.rules.today();
        return keys.map((key) => {
          const entry = change.after.byId(this.rules.entryOf(change.before, key).id);
          return entry ? this.reads.itemAt(change.after, entry, today) : null;
        });
      }
    };
  }
  /**
   * «New project…»: the project as the tree has it after the write (the one of that name it had), or null for a name of
   * nothing and for a folder's name, which no task may be given: an answer is always a project to pick.
   */
  newProject(name, keys) {
    const operation = this.rules.newProject(name, keys);
    return {
      operation,
      answer: (change) => {
        const made = operation === null ? null : namedIn(change, this.rules.cleanName(name));
        return made === null || isFolder(change.after, made) ? null : made;
      }
    };
  }
  dropOnProject(cards, to) {
    return nothing(this.rules.dropOnProject(cards, to));
  }
  /** Funnel cards let go on the tree: each shown under the project `filter` shows it by (`shownUnder`), then as `dropOnProject`. */
  dropTasksOnProject(keys, to, filter) {
    if (keys.length === 0) return nothing(null);
    return nothing((doc, today, settings, boundary) => {
      const tree = projectTreeOf(doc);
      const node = filterNode(filter, tree);
      const cards = keys.map((key) => ({ key, from: shownUnder(this.rules.entryOf(doc, key), node, tree, doc, this.reads.subprojects()) }));
      const operation = this.rules.dropOnProject(cards, to);
      return operation ? operation(doc, today, settings, boundary) : doc;
    });
  }
  /** The project made, as the tree has it; null when nothing was written. */
  createProject(name, place) {
    const operation = this.rules.createProject(name, place);
    return { operation, answer: (change) => operation === null || !change || change.after.serialize() === change.before.serialize() ? null : namedIn(change, this.rules.cleanName(name)) };
  }
  moveProject(name, place) {
    return nothing(this.rules.moveProject(name, place));
  }
  /** Whether the rename wrote. */
  renameProject(from, to) {
    const operation = this.rules.renameProject(from, to);
    return { operation, answer: (change) => change !== null && change.after.serialize() !== change.before.serialize() };
  }
  deleteProject(name) {
    return nothing(this.rules.deleteProject(name));
  }
  /** Whether the project's folder mark changed. */
  setProjectFolder(name, folder) {
    const operation = this.rules.setProjectFolder(name, folder);
    return { operation, answer: (change) => change !== null && change.after.serialize() !== change.before.serialize() };
  }
  setProjectNote(name, link) {
    return nothing(this.rules.setProjectNote(name, link));
  }
  setReminder(key, reminder) {
    return nothing(this.rules.setReminder(key, reminder));
  }
  /** No task picked reads and writes nothing. */
  togglePriority(keys, prefix) {
    return { reads: keys.length > 0, answer: (s) => s ? this.togglePriorityOf(s, keys, prefix) : nothing(null) };
  }
  togglePriorityOf(s, keys, prefix) {
    const priority = toggledPriority(this.reads.itemsAt(s, keys), prefix);
    if (keys.length === 1) return this.setPriority(keys[0], priority);
    return this.applyAll(keys.map((key) => ({ key, change: { kind: "priority", priority } })));
  }
  /** No task picked reads and writes nothing. */
  toggleLabel(keys, name) {
    return {
      reads: keys.length > 0,
      answer: (s) => {
        if (!s) return { operation: null, answer: () => [] };
        const labels = toggledLabels(this.reads.itemsAt(s, keys), name);
        return this.setLabelsAll(keys.map((key, i) => ({ key, labels: labels[i] })));
      }
    };
  }
  removeDue(s, keys) {
    const steps = this.reads.itemsAt(s, keys).flatMap((item) => item.can.removeDue ? [{ key: item.key, change: { kind: "dueDate", date: null } }] : []);
    if (steps.length === 0) return nothing(null);
    if (keys.length === 1) return this.setDueDate(steps[0].key, null);
    return this.applyAll(steps);
  }
  pickStatus(keys, id) {
    const status = tileStatus(id);
    if (keys.length === 1) return status === null ? this.stop(keys[0]) : this.setStatus(keys[0], status);
    return this.applyAll(keys.map((key) => ({ key, change: status === null ? { kind: "stop" } : { kind: "status", status } })));
  }
  postponeAll(s, keys, date) {
    const steps = this.reads.itemsAt(s, keys).flatMap((item) => item.can.postpone ? [{ key: item.key, change: { kind: "postpone", date } }] : []);
    if (steps.length === 0) return nothing(null);
    if (keys.length === 1) return this.postpone(steps[0].key, date);
    return this.applyAll(steps);
  }
  sendTo(s, keys, placement) {
    const steps = this.reads.itemsAt(s, keys).flatMap((item) => item.can.postpone && !item.isSubtask ? [{ key: item.key, change: { kind: "place", placement } }] : []);
    return steps.length === 0 ? nothing(null) : this.applyAll(steps);
  }
  setRepeatAll(s, keys, rule) {
    const steps = this.reads.itemsAt(s, keys).flatMap((item) => item.repeatable ? [{ key: item.key, change: { kind: "repeat", rule } }] : []);
    if (steps.length === 0) return nothing(null);
    if (keys.length === 1) return this.setRepeat(steps[0].key, rule);
    return this.applyAll(steps);
  }
  removeAll(keys) {
    if (keys.length === 1) return this.remove(keys[0]);
    return this.applyAll(keys.map((key) => ({ key, change: { kind: "remove" } })));
  }
  setCollapsed(key, collapsed) {
    return nothing(this.rules.setCollapsed(key, collapsed));
  }
  toggleCollapsed(key) {
    return nothing(this.rules.toggleCollapsed(key));
  }
  unfoldAbove(key) {
    return nothing(this.rules.unfoldAbove(key));
  }
  /** What showing a found task writes first: a subtask's tasks show their subtasks; a task, nothing. */
  revealUnfold(item) {
    return nothing(item.isSubtask ? this.rules.unfoldAbove(item.key) : null);
  }
  setRepeat(key, rule) {
    return nothing(this.rules.setRepeat(key, rule));
  }
  stop(key) {
    return nothing(this.rules.stop(key));
  }
  rename(s, key, text) {
    if (!this.rules.renameChanges(s.doc, key, text)) return { operation: null, answer: () => null };
    return { operation: this.rules.rename(key, text), answer: (change) => change && this.reads.itemAt(change.after, key, s.today) };
  }
  setDescription(key, markdown) {
    return nothing(this.rules.setDescription(key, markdown));
  }
  addContext(key, text) {
    return nothing(this.rules.addContext(key, text));
  }
  remove(key) {
    return nothing(this.rules.remove(key));
  }
  moveBefore(key, before, date) {
    return nothing(this.rules.moveBefore(key, before, date));
  }
  nest(key, parent, before) {
    return nothing(this.rules.nest(key, parent, before));
  }
  setSlot(key, slot) {
    return nothing(this.rules.setSlot(key, slot));
  }
  /** A drop on the timeline of `day` at `start`: the task's own duration from the file when it came from the timeline. */
  toTime(s, key, from, start2, day) {
    const { slot } = this.rules.entryOf(s.doc, key).task;
    const span = droppedSpan(start2, from === "timeline" && slot && slot.end !== null ? slot.end - slot.start : null);
    return this.setSlot(key, s.boundary.slotAt(day, span.start, span.end));
  }
  resize(s, key, day, edge, minute, minDurationMin) {
    const { slot, status } = this.rules.entryOf(s.doc, key).task;
    const next = slot && this.reads.timeline().resized({ slot, open: isOpen(status) }, day, edge, minute, minDurationMin);
    if (!next) return { operation: null, answer: () => false };
    return { operation: this.rules.setSlot(key, next), answer: () => true };
  }
  clearSlot(key, place) {
    return nothing(this.rules.clearSlot(key, place));
  }
  moveToList(key, date) {
    return nothing(this.rules.moveToList(key, date));
  }
  moveToSoon(key, date) {
    return nothing(this.rules.moveToSoon(key, date));
  }
  postpone(key, date) {
    return nothing(this.rules.postpone(key, date));
  }
  moveToEnd(key, section) {
    return nothing(this.rules.moveToEnd(key, section));
  }
  moveToGroup(key, list, group, before, date) {
    return nothing(this.rules.moveToGroup(key, list, group, before, date));
  }
  createGroup(key, list, name, date) {
    return nothing(this.rules.createGroup(key, list, name, date));
  }
  toSection(s, keys, name) {
    const steps = keys.flatMap((key2) => {
      const change2 = this.rules.sectionChange(this.rules.entryOf(s.doc, key2), name);
      return change2 ? [{ key: key2, change: change2 }] : [];
    });
    if (steps.length === 0) return nothing(null);
    if (keys.length !== 1) return this.applyAll(steps);
    const { key, change } = steps[0];
    if (change.kind === "moveToGroup") return this.moveToGroup(key, change.list, change.group, change.before, change.date);
    if (change.kind === "createGroup") return this.createGroup(key, change.list, change.name, change.date);
    return nothing(null);
  }
  moveGroup(list, group, place) {
    return nothing(this.rules.moveGroup(list, group, place));
  }
  /** Reads first only when there is a name to write: a blank one or the section's own answers false at once. */
  renameGroup(list, group, name) {
    const operation = this.rules.renameGroup(list, group, name);
    return {
      reads: operation !== null,
      answer: (s) => {
        if (!operation || !s || operation(s.doc, s.today, this.rules.moment().settings, s.boundary) === s.doc) return { operation: null, answer: () => false };
        return { operation, answer: () => true };
      }
    };
  }
  removeGroup(list, group) {
    return nothing(this.rules.removeGroup(list, group));
  }
  createSection(name, place) {
    const made = this.rules.createSection(name, place);
    return {
      operation: made?.operation ?? null,
      answer: (change) => {
        if (!made || !change || change.after.serialize() === change.before.serialize()) return null;
        return { list: made.list, group: made.group };
      }
    };
  }
  applyAll(steps) {
    return nothing(this.rules.applyAll(steps));
  }
  /**
   * What a drop means: the moves, and whether one of them sets a time and so reads the task's duration first. It answers
   * the tasks' keys as the file now has them, in their order; one not found again is left out.
   */
  drop(tasks, to, day, filter, carry) {
    const read = readDrop(to, (column) => this.reads.columnSections(column, day));
    const filtered = filter !== null && filter !== void 0 && read.kind === "group" && read.before === null;
    return {
      reads: filtered || read.kind === "title" || tasks.length === 1 && read.kind === "time",
      answer: (s) => {
        const moves = dropMoves(tasks, filtered && s ? this.shownDrop(s, read, filter, tasks) : read, day);
        return this.landed(tasks, this.opened(moves.kind === "one" ? this.moveOne(s, moves.key, moves.move) : this.applyAll(moves.steps), tasks, filter, carry));
      }
    };
  }
  /**
   * Where `drop` would leave the tasks, writing nothing: its operation tried over the file as read, and the screen of
   * `day` read over the result by the same code as the screen.
   */
  landing(tasks, to, day, filter, carry) {
    const preview = this.dropPreview(tasks, to, day, filter, carry);
    return { reads: true, answer: (s) => preview.answer(s).landings };
  }
  /** `landing`, with the whole screen the drop leaves and the text it is read from. */
  dropPreview(tasks, to, day, filter, carry) {
    const drop = this.drop(tasks, to, day, filter, carry);
    return {
      reads: true,
      answer: (s) => {
        const ids = tasks.map((task) => this.rules.entryOf(s.doc, task.key).id);
        const write = drop.answer(s);
        const after = write.operation ? this.rules.trial(s.doc, write.operation).after : s.doc;
        const text = after.serialize();
        const screen = this.reads.screen({ text, doc: after, today: s.today, boundary: s.boundary }, day, filter);
        const timeline = this.reads.timeline();
        return { landings: ids.map((id) => landingOf(screen, id, day, timeline)), screen, tasks: text };
      }
    };
  }
  /** A drop in the Projects list: the funnel's moves the screen as read gives it (`projectsDropSteps`), one write. */
  dropInProjects(cards, place, node) {
    return {
      reads: true,
      answer: (s) => {
        const steps = projectsDropSteps(this.reads.projectsScreen(s, node), s.doc, (key) => this.rules.entryOf(s.doc, key), cards, place, s.today);
        return this.landed(cards, this.applyAll(steps));
      }
    };
  }
  /** `dropInProjects` tried over the file as read: where each card lands on the Projects screen it leaves. */
  projectsDropPreview(cards, place, node) {
    const drop = this.dropInProjects(cards, place, node);
    return {
      reads: true,
      answer: (s) => {
        const ids = cards.map((card) => this.rules.entryOf(s.doc, card.key).id);
        const write = drop.answer(s);
        const after = write.operation ? this.rules.trial(s.doc, write.operation).after : s.doc;
        const text = after.serialize();
        const view = this.reads.projectsScreen({ text, doc: after, today: s.today, boundary: s.boundary }, node);
        return { landings: ids.map((id) => projectsLandingOf(view, id, place.kind === "task" ? place.group : void 0)), view, tasks: text };
      }
    };
  }
  /** A drop at a section's end of a filtered list: right after the last task of the section the filter shows (`afterShown`). */
  shownDrop(s, read, filter, tasks) {
    const tree = projectTreeOf(s.doc);
    const node = filterNode(filter, tree);
    if (node === null) return read;
    const carried = new Set(tasks.map((task) => this.rules.entryOf(s.doc, task.key).id));
    return { ...read, before: afterShown(s.doc, read.list, read.group, filterTest(node, tree, s.doc, this.reads.subprojects()), carried) };
  }
  /**
   * A carry let go in a list under a filter it opened on its way (`carryAt` over a row, so the filter differs from the
   * lift's, `carry.under`): the move, then, in the same write, each task gives the project it was shown by under the
   * lift's filter (`shownUnder`; none with no filter or No project: the project is added) to the opened one, as
   * `dropOnProject` does; the opened No project takes that project off. Done opened, or the lift's filter, change none.
   */
  opened(write, tasks, filter, carry) {
    const move = write.operation;
    if (!carry || !move || filter === null || filter === void 0) return write;
    const operation = (doc, today, settings, boundary) => {
      const tree = projectTreeOf(doc);
      const under = filterNode(carry.under, tree);
      const now = filterNode(filter, tree);
      const after = move(doc, today, settings, boundary);
      if (now === null || now === under || now === "done") return after;
      const entries = tasks.map((task) => this.rules.entryOf(doc, task.key));
      const cards = entries.flatMap((entry) => {
        const moved2 = after.byId(entry.id);
        return moved2 ? [{ key: keyOf(moved2), from: under === null || under === "none" ? null : shownUnder(entry, under, tree, doc, this.reads.subprojects()) }] : [];
      });
      const relabel = this.rules.dropOnProject(cards, now === "none" ? null : projectOfNode(now));
      return relabel ? relabel(after, today, settings, boundary) : after;
    };
    return { operation, answer: write.answer };
  }
  /** The dropped tasks where `write` left them. */
  landed(tasks, write) {
    return {
      operation: write.operation,
      answer: (change) => {
        if (!change) return tasks.map((task) => task.key);
        const moved2 = tasks.map((task) => this.rules.entryOf(change.before, task.key));
        return change.after.movedSince(change.before, moved2).flatMap((entry) => entry ? [keyOf(entry)] : []);
      }
    };
  }
  moveOne(s, key, move) {
    switch (move.kind) {
      case "toTime":
        return this.toTime(s, key, move.from, move.start, move.day);
      case "clearSlot":
        return this.clearSlot(key, move.place);
      case "moveToGroup":
        return this.moveToGroup(key, move.list, move.group, move.before, move.date);
      case "nest":
        return this.nest(key, move.parent, move.before);
      case "moveBefore":
        return this.moveBefore(key, move.before, move.date);
      case "moveToList":
        return this.moveToList(key, move.date);
      case "moveToSoon":
        return this.moveToSoon(key, move.date);
      case "moveToEnd":
        return this.moveToEnd(key, move.section);
    }
  }
};
function shownPlace(doc, place, filter, today, subprojects) {
  if (place.kind !== "list" && place.kind !== "day" || place.before !== null) return place;
  const tree = projectTreeOf(doc);
  const node = filterNode(filter, tree);
  if (node === null) return place;
  const list = place.kind === "list" ? place.list : dayColumn(place.date, today).list;
  return { ...place, before: afterShown(doc, list, place.group, filterTest(node, tree, doc, subprojects)) };
}

// core/application/TaskIdentity.ts
var HELD = 8;
var NO_TASK_IDS = { next: 0, lines: [] };
var TaskIdentity = class {
  constructor(state = NO_TASK_IDS) {
    this.last = null;
    /** The ids an undo step gave the lines of its text, by line, until that text is read. */
    this.pending = null;
    this.current = state;
  }
  get state() {
    return this.current;
  }
  /**
   * What `text`'s reading is retagged by (`TaskDocument.retagged`): `read` gives it parsed and tidied, each line tagged by
   * its line. Kept, with the ids of the reading's lines, until another text is read.
   */
  of(text, read) {
    if (this.last?.text === text) return this.last.ids;
    const doc = read();
    const outline = doc.outline();
    const next = this.current.next;
    const own = this.pending?.text === text;
    const known = own ? this.given(outline, this.pending.ids) : sameOutline(this.current.lines, outline) ? this.inOrder(outline) : this.matched(outline);
    this.pending = null;
    const fresh = outline.some((o) => !known.has(o.tag));
    for (const o of outline) if (!known.has(o.tag)) known.set(o.tag, `t${next + o.tag}`);
    const settled = !fresh && sameOutline(this.current.lines, outline) && outline.every((o, i) => known.get(o.tag) === this.current.lines[i].id);
    if (!settled) this.settle(next + doc.nextTag(), outline.map((o) => ({ raw: o.raw, task: o.task, id: known.get(o.tag) })), own);
    const ids = { known, next };
    this.last = { text, ids };
    return ids;
  }
  /** A write left `text`, the document `after`: its tasks and headings are who its lines' tags say. */
  wrote(text, after) {
    const tags = after.outlineTags();
    this.settle(after.nextTag(), after.outline().map((o) => ({ raw: o.raw, task: o.task, id: tags.get(o.line) })), true);
    this.pending = null;
    this.last = { text, ids: { known: new Map([...tags].map(([line, tag]) => [line, tag])), next: this.current.next } };
  }
  /**
   * An undo step made `after` of `before`: a line it gave back is who it was, a line it left is who it was. Known once
   * `after` is read (`of`).
   */
  carried(before, after, step) {
    const was = this.last?.text === before ? this.last.ids.known : this.pending?.text === before ? this.pending.ids : /* @__PURE__ */ new Map();
    const given = new Set(step.ids.values());
    const ids = /* @__PURE__ */ new Map();
    step.origins.forEach((origin, line) => {
      const own = step.ids.get(line) ?? (origin === null ? void 0 : was.get(origin));
      if (own !== void 0 && (step.ids.has(line) || !given.has(own))) ids.set(line, own);
    });
    this.pending = { text: after, ids };
    this.last = null;
  }
  /** Whether `raw` is a line the task `id` has, or had before this identity's own writes rewrote it into the line it has. */
  held(id, raw) {
    return this.current.lines.some((line) => line.id === id && line.raw === raw) || (this.current.held?.[id]?.includes(raw) ?? false);
  }
  /**
   * The state for `lines`. `own`: this identity's write or undo step made them, so a task whose line changed holds the
   * line it had (a key read before still names it); otherwise the text was changed elsewhere, and a task whose line
   * changed there holds nothing: a key read before is stale, the task keeping its id.
   */
  settle(next, lines, own) {
    const was = new Map(this.current.lines.filter((line) => line.task).map((line) => [line.id, line.raw]));
    const held = {};
    for (const line of lines) {
      if (!line.task) continue;
      const before = was.get(line.id);
      const changed3 = before !== void 0 && before !== line.raw;
      if (changed3 && !own) continue;
      const kept = this.current.held?.[line.id] ?? [];
      const all2 = changed3 ? [before, ...kept.filter((raw) => raw !== before)] : kept;
      if (all2.length > 0) held[line.id] = all2.slice(0, HELD);
    }
    this.current = { next, lines, ...Object.keys(held).length > 0 && { held } };
  }
  /** The ids of the reading's lines that an undo step gave its text's lines. */
  given(outline, ids) {
    const known = /* @__PURE__ */ new Map();
    for (const o of outline) {
      const id = ids.get(o.tag);
      if (id !== void 0) known.set(o.tag, id);
    }
    return known;
  }
  inOrder(outline) {
    return new Map(outline.map((o, i) => [o.tag, this.current.lines[i].id]));
  }
  /** The ids of the reading the state is for, carried to this reading's lines by place and line. */
  /** The ids of the reading the state is for, carried to this reading's lines by place and line. */
  matched(outline) {
    const old = this.current.lines;
    const pairs = matchLines(
      old.map((l) => l.raw),
      outline.map((o) => o.raw),
      (b, a) => old[b].task === outline[a].task
    );
    const known = /* @__PURE__ */ new Map();
    for (const [b, a] of pairs) if (old[b].task === outline[a].task) known.set(outline[a].tag, old[b].id);
    return known;
  }
};
function sameOutline(lines, outline) {
  return lines.length === outline.length && lines.every((line, i) => line.raw === outline[i].raw && line.task === outline[i].task);
}

// core/application/snapGrid.ts
var MINUTES_PER_HOUR3 = 60;
var SNAP_STEPS = [5, 15, 30, 60];
function snapStep(hourPx, tolerance) {
  return SNAP_STEPS.find((minutes) => minutes / MINUTES_PER_HOUR3 * hourPx >= tolerance) ?? SNAP_STEPS[SNAP_STEPS.length - 1];
}
function snapMinute(minute, hourPx, tolerance) {
  const step = snapStep(hourPx, tolerance);
  return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minute / step) * step));
}

// core/application/SnapshotReader.ts
var SnapshotReader = class _SnapshotReader {
  constructor(reads, writes, answer2, filter, carry) {
    this.reads = reads;
    this.writes = writes;
    this.answer = answer2;
    this.filter = filter;
    this.carry = carry;
    this.screens = /* @__PURE__ */ new Map();
    this.items = null;
  }
  screen(date) {
    const kept = this.screens.get(date);
    if (kept) return kept;
    const screen = this.answer(this.reads.screenRead(date, this.filter));
    this.screens.set(date, screen);
    return screen;
  }
  view(wide, notePath) {
    if (notePath === null) return this.answer(this.reads.viewInRead(this.filter, wide));
    return this.answer(this.reads.projectNoteViewRead(notePath, wide))?.view ?? this.answer(this.reads.viewInRead(this.filter, wide, true));
  }
  columnView(column, date) {
    return this.reads.columnView(this.screen(date), column);
  }
  item(id) {
    this.items ??= this.answer(this.reads.itemsRead(this.filter));
    return this.items.get(id) ?? null;
  }
  dropPreview(tasks, to, day) {
    return this.answer(this.writes.dropPreview(tasks, to, day, this.filter, this.carry()));
  }
  takes(origins, to) {
    return this.answer(this.reads.takesRead(origins, to));
  }
  menu(id, from, day) {
    const item = this.item(id);
    if (!item) return null;
    const screen = this.screen(day);
    return this.reads.menu(item, from, { today: this.reads.today(), day, offer: screen.offer, projects: screen.projectTree });
  }
  stretch(id, day, edge, minute) {
    const item = this.slotted(id);
    return item && this.reads.stretch(item, day, edge, minute);
  }
  resizedSlot(id, day, edge, minute, minDurationMin) {
    const item = this.slotted(id);
    return item && this.reads.resizedSlot(item, day, edge, minute, minDurationMin);
  }
  within(filter) {
    return filter === this.filter ? this : new _SnapshotReader(this.reads, this.writes, this.answer, filter, this.carry);
  }
  slotted(id) {
    const item = this.item(id);
    return item?.slot ? item : null;
  }
};

// core/application/TaskServiceImpl.ts
var TaskServiceImpl = class {
  constructor(store, settings, clock, history = null, legacyProjects = NO_PROJECTS, projectsScreenStore = memoryProjectsScreen(), identity = new TaskIdentity()) {
    this.store = store;
    this.settings = settings;
    this.history = history;
    this.legacyProjects = legacyProjects;
    this.projectsScreenStore = projectsScreenStore;
    this.listeners = /* @__PURE__ */ new Set();
    this.unsubscribeStore = null;
    this.unsubscribeSettings = null;
    this.unsubscribeProjects = null;
    this.normalized = null;
    this.rules = new TaskRules(settings, clock, identity, true, { list: () => legacyProjects.list(), ready: () => legacyProjects.ready?.() ?? true });
    this.reads = new TaskReads(this.rules, settings, clock, { tree: () => this.lastTree(), screen: () => projectsScreenStore.get() });
    this.writes = new TaskWrites(this.rules, this.reads);
    this.dropGesture();
  }
  /** A carry or a name left in the device's state by a screen gone mid-gesture: dropped as the screen loads (`gestureGone`). */
  dropGesture() {
    const state = this.projectsScreenStore.get();
    const loaded = gestureGone(state);
    if (loaded !== state) this.projectsScreenStore.set(loaded);
  }
  priorityLevels() {
    return this.reads.priorityLevels();
  }
  labelLevels() {
    return this.reads.labelLevels();
  }
  parseTitle(text) {
    return this.reads.parseTitle(text);
  }
  draftMarks(text, priority, labels) {
    return this.reads.draftMarks(text, priority, labels);
  }
  isBlank(text) {
    return this.reads.isBlank(text);
  }
  withPriority(text, prefix) {
    return this.reads.withPriority(text, prefix);
  }
  /** Every task of each list, each with its subtasks, and today: what the assistant reads (`AssistantTasks`). */
  listed() {
    return this.ask(this.reads.listedRead());
  }
  screen(date, filter) {
    return this.ask(this.reads.screenRead(date, filter));
  }
  setProject(keys, project) {
    return this.run(this.writes.setProject(keys, project));
  }
  toggleProject(keys, name) {
    return this.run(this.writes.toggleProject(keys, name));
  }
  projects() {
    return this.reads.projects();
  }
  async newProject(name, keys) {
    return this.refOf(await this.run(this.writes.newProject(name, keys)));
  }
  projectsScreen(node) {
    return this.ask(this.reads.projectsScreenRead(node));
  }
  funnelView(wide) {
    return this.ask(this.reads.funnelViewRead(wide));
  }
  projectNoteView(path, wide) {
    return this.ask(this.reads.projectNoteViewRead(path, wide));
  }
  async pickProjectNode(node, wide) {
    const s = await this.snapshotOrNull();
    this.keepScreen(picked(this.projectsScreenStore.get(), s ? projectTreeOf(s.doc) : ProjectTree.EMPTY, node, wide));
  }
  firstView(wide, note) {
    if (!note) this.dropGesture();
    return this.reads.firstView(wide, note);
  }
  filterHides(item, filter) {
    return this.ask(this.reads.filterHidesRead(item, filter));
  }
  async startCarry(start2, wide) {
    const s = await this.snapshotOrNull();
    this.keepScreen(carryStarted(this.projectsScreenStore.get(), start2, wide, s ? projectTreeOf(s.doc) : ProjectTree.EMPTY));
  }
  async carryAt(at, nowMs) {
    const s = await this.snapshotOrNull();
    const { state, wait } = carriedAt(this.projectsScreenStore.get(), at, nowMs, s ? projectTreeOf(s.doc) : ProjectTree.EMPTY, s?.doc ?? null);
    this.keepScreen(state);
    return { wait };
  }
  async carryOnNode(node) {
    const carry = this.projectsScreenStore.get().carry;
    if (carry?.cards && carry.cards.length > 0) await this.dropOnProject(carry.cards, node);
    else if (carry && carry.keys.length > 0) await this.dropTasksOnProject(carry.keys, node, carry.under);
    await this.endCarry("dropped");
  }
  async endCarry(how) {
    const s = await this.snapshotOrNull();
    this.keepScreen(carryEnded(this.projectsScreenStore.get(), how, s ? projectTreeOf(s.doc) : ProjectTree.EMPTY, s?.doc ?? null));
  }
  async endProjectName() {
    this.keepScreen(nameEnded(this.projectsScreenStore.get()));
  }
  async setFunnelPlace(place) {
    const state = this.projectsScreenStore.get();
    const at = funnelPlaceOf(place);
    if (state.place !== at) this.keepScreen({ ...state, place: at });
  }
  firstPlace() {
    this.dropGesture();
    return funnelPlaceOf(this.projectsScreenStore.get().place);
  }
  async clearProjectFilter() {
    this.keepScreen(cleared(this.projectsScreenStore.get()));
  }
  async setProjectsPanel(open) {
    const state = this.projectsScreenStore.get();
    if (state.panelOpen === true !== open) this.keepScreen({ ...state, panelOpen: open });
  }
  async setViewMode(mode) {
    this.keepScreen(withMode(this.projectsScreenStore.get(), mode));
  }
  async setNoteViewMode(mode) {
    this.keepScreen({ ...this.projectsScreenStore.get(), noteView: mode });
  }
  async toggleSubprojects() {
    this.keepScreen(toggledSubprojects(this.projectsScreenStore.get()));
  }
  dropTasksOnProject(keys, to, filter) {
    const target = to === "none" ? null : projectOfNode(to);
    if (target === null && to !== "none") return Promise.resolve();
    return this.run(this.writes.dropTasksOnProject(keys, target, filter));
  }
  async selectProjectNode(node) {
    const s = await this.snapshotOrNull();
    this.keepScreen(selected(this.projectsScreenStore.get(), s ? projectTreeOf(s.doc) : ProjectTree.EMPTY, s?.doc ?? null, node));
  }
  async createProject(name, place) {
    const made = await this.run(this.writes.createProject(name, place));
    if (made !== null) await this.selectProjectNode(`project:${made}`);
    return this.refOf(made);
  }
  moveProject(name, place) {
    return this.run(this.writes.moveProject(name, place));
  }
  async renameProject(from, to) {
    const renamed = await this.run(this.writes.renameProject(from, to));
    if (renamed) this.keepScreen(renamedIn(this.projectsScreenStore.get(), from, this.rules.cleanName(to)));
    return renamed;
  }
  deleteProject(name) {
    return this.run(this.writes.deleteProject(name));
  }
  setProjectFolder(name, folder) {
    return this.run(this.writes.setProjectFolder(name, folder));
  }
  setProjectNote(name, link) {
    return this.run(this.writes.setProjectNote(name, link));
  }
  dropOnProject(cards, to) {
    const target = to === "none" ? null : projectOfNode(to);
    if (target === null && to !== "none") return Promise.resolve();
    return this.run(this.writes.dropOnProject(cards, target));
  }
  async dropInProjects(cards, place, node) {
    return this.run(await this.ask(this.writes.dropInProjects(cards, place, node)));
  }
  projectsDropPreview(cards, place, node) {
    return this.ask(this.writes.projectsDropPreview(cards, place, node));
  }
  isBlankProjectName(name) {
    return this.rules.cleanName(name) === null;
  }
  /** The device's Projects screen changed: the screens draw again. */
  keepScreen(state) {
    if (state === this.projectsScreenStore.get()) return;
    this.projectsScreenStore.set(state);
    this.emit();
  }
  /** The tree of the file read last, the tasks' own projects in it. */
  lastTree() {
    return this.normalized ? projectTreeOf(this.normalized.doc) : ProjectTree.EMPTY;
  }
  refOf(name) {
    return name === null ? null : new ProjectIndex(this.lastTree()).refOf(name, true);
  }
  async dayView(date, filter) {
    return this.reads.dayView(await this.snapshot(), date, filter);
  }
  async soonWithoutDateView() {
    return this.reads.soonWithoutDateView(await this.snapshot());
  }
  async inboxView() {
    return this.reads.inboxView(await this.snapshot());
  }
  async backlogView() {
    return this.reads.backlogView(await this.snapshot());
  }
  async sectionOffer(date) {
    return this.reads.sectionOffer(await this.snapshot(), date);
  }
  async listSections() {
    return this.reads.listSections(await this.snapshot());
  }
  async doneView() {
    return this.reads.doneView(await this.snapshot());
  }
  search(query) {
    return this.ask(this.reads.searchRead(query));
  }
  async screenOf(item) {
    return this.reads.screenOf(await this.snapshot(), item);
  }
  async reveal(item) {
    await this.run(this.writes.revealUnfold(item));
    return this.screenOf(item);
  }
  findIn(items, key) {
    return this.reads.findIn(items, key);
  }
  createInList(date, text) {
    return this.run(this.writes.createInList(date, text));
  }
  createInSoon(text) {
    return this.run(this.writes.createInSoon(text));
  }
  createAtTime(date, start2, text) {
    return this.run(this.writes.createAtTime(date, start2, text));
  }
  createInPlace(text, priority, place, repeat, labels = [], project, filter, description) {
    return this.run(this.writes.createInPlace(text, priority, place, repeat, labels, project, filter, description));
  }
  createWithId(text, priority, place, repeat, labels = [], project, filter, description) {
    return this.run(this.writes.createWithId(text, priority, place, repeat, labels, project, filter, description));
  }
  create(draft, slot) {
    return this.run(this.writes.create(draft, slot));
  }
  createSubtask(parent, draft) {
    return this.run(this.writes.createSubtask(parent, draft));
  }
  firstStep(key, text) {
    return this.run(this.writes.firstStep(key, text));
  }
  firstStepScreen(view, key) {
    return firstStepScreen(view, key);
  }
  firstStepProjects(view, key) {
    return firstStepProjects(view, key);
  }
  async edit(key, draft) {
    return this.run(this.writes.edit(await this.snapshot(), key, draft));
  }
  placementOf(item) {
    return this.reads.placementOf(item);
  }
  dayColumn(date) {
    return this.reads.dayColumn(date);
  }
  columnSections(column, date) {
    return this.reads.columnSections(column, date);
  }
  placementOfDay(date) {
    return this.reads.placementOfDay(date);
  }
  columnView(screen, column) {
    return this.reads.columnView(screen, column);
  }
  async placeOf(item) {
    return this.reads.placeOf(await this.snapshot(), item);
  }
  storedLine(item, text) {
    return this.reads.storedLine(item, text);
  }
  ridesNow(item, day) {
    return this.reads.ridesNow(item, day);
  }
  async projectNodeNamed(name) {
    const s = await this.snapshotOrNull();
    return s ? this.reads.projectNodeNamed(s, name) : { node: null, candidates: [] };
  }
  openTasks(filter) {
    return this.ask(this.reads.openTasksRead(filter));
  }
  projectHistory(node) {
    return this.ask(this.reads.projectHistoryRead(node));
  }
  listName(list) {
    return this.reads.listName(list);
  }
  placementTitle(placement) {
    return this.reads.placementTitle(placement);
  }
  dayOfPlacement(placement) {
    return this.reads.dayOfPlacement(placement);
  }
  setStatus(key, status) {
    return this.run(this.writes.setStatus(key, status));
  }
  setDueDate(key, date) {
    return this.run(this.writes.setDueDate(key, date));
  }
  setPriority(key, priority) {
    return this.run(this.writes.setPriority(key, priority));
  }
  setLabels(key, labels) {
    return this.run(this.writes.setLabels(key, labels));
  }
  setLabelsAll(steps) {
    return this.run(this.writes.setLabelsAll(steps));
  }
  async togglePriority(keys, prefix) {
    return this.run(await this.ask(this.writes.togglePriority(keys, prefix)));
  }
  async toggleLabel(keys, name) {
    return this.run(await this.ask(this.writes.toggleLabel(keys, name)));
  }
  async removeDue(keys) {
    return this.run(this.writes.removeDue(await this.snapshot(), keys));
  }
  menu(item, from, screen) {
    return this.reads.menu(item, from, screen);
  }
  bulkMenu(picked2, screen) {
    return this.reads.bulkMenu(picked2, screen);
  }
  pickStatus(keys, id) {
    return this.run(this.writes.pickStatus(keys, id));
  }
  async sendTo(keys, placement) {
    return this.run(this.writes.sendTo(await this.snapshot(), keys, placement));
  }
  async setRepeatAll(keys, rule) {
    return this.run(this.writes.setRepeatAll(await this.snapshot(), keys, rule));
  }
  async postponeAll(keys, date) {
    return this.run(this.writes.postponeAll(await this.snapshot(), keys, date));
  }
  removeAll(keys) {
    return this.run(this.writes.removeAll(keys));
  }
  carried(lifted2, picked2) {
    return this.reads.carried(lifted2, picked2);
  }
  setReminder(key, reminder) {
    return this.run(this.writes.setReminder(key, reminder));
  }
  setCollapsed(key, collapsed) {
    return this.run(this.writes.setCollapsed(key, collapsed));
  }
  toggleCollapsed(key) {
    return this.run(this.writes.toggleCollapsed(key));
  }
  unfoldAbove(key) {
    return this.run(this.writes.unfoldAbove(key));
  }
  setRepeat(key, rule) {
    return this.run(this.writes.setRepeat(key, rule));
  }
  stop(key) {
    return this.run(this.writes.stop(key));
  }
  toggleDone(key) {
    return this.run(this.writes.toggleDone(key));
  }
  async rename(key, text) {
    return this.run(this.writes.rename(await this.snapshot(), key, text));
  }
  fullTree(item) {
    return this.reads.fullTree(item);
  }
  setDescription(key, markdown) {
    return this.run(this.writes.setDescription(key, markdown));
  }
  /** A context line at the end of the task's description, one step to take back (`AssistantTasks`). */
  addContext(key, text) {
    return this.run(this.writes.addContext(key, text));
  }
  remove(key) {
    return this.run(this.writes.remove(key));
  }
  async find(key, text) {
    return this.reads.find(await this.snapshot(), key, text);
  }
  lineOf(key) {
    return this.ask(this.reads.lineOfRead(key));
  }
  moveBefore(key, before, date) {
    return this.run(this.writes.moveBefore(key, before, date));
  }
  nest(key, parent, before) {
    return this.run(this.writes.nest(key, parent, before));
  }
  setSlot(key, slot) {
    return this.run(this.writes.setSlot(key, slot));
  }
  shownSpan(item, day) {
    return this.reads.shownSpan(item, day);
  }
  dropSpan(item, from, start2) {
    return this.reads.dropSpan(item, from, start2);
  }
  snap(minute, hourPx, tolerancePx) {
    return snapMinute(minute, hourPx, tolerancePx);
  }
  newSlot(day, start2) {
    return this.reads.newSlot(day, start2);
  }
  stretch(item, day, edge, minute) {
    return this.reads.stretch(item, day, edge, minute);
  }
  async resize(key, day, edge, minute, minDurationMin) {
    return this.run(this.writes.resize(await this.snapshot(), key, day, edge, minute, minDurationMin));
  }
  clearSlot(key, place) {
    return this.run(this.writes.clearSlot(key, place));
  }
  moveToList(key, date) {
    return this.run(this.writes.moveToList(key, date));
  }
  moveToSoon(key, date) {
    return this.run(this.writes.moveToSoon(key, date));
  }
  postpone(key, date) {
    return this.run(this.writes.postpone(key, date));
  }
  moveToEnd(key, section) {
    return this.run(this.writes.moveToEnd(key, section));
  }
  moveToGroup(key, list, group, before, date) {
    return this.run(this.writes.moveToGroup(key, list, group, before, date));
  }
  createGroup(key, list, name, date) {
    return this.run(this.writes.createGroup(key, list, name, date));
  }
  async toSection(keys, name) {
    return this.run(this.writes.toSection(await this.snapshot(), keys, name));
  }
  moveGroup(list, group, place) {
    return this.run(this.writes.moveGroup(list, group, place));
  }
  async renameGroup(list, group, name) {
    return this.run(await this.ask(this.writes.renameGroup(list, group, name)));
  }
  removeGroup(list, group) {
    return this.run(this.writes.removeGroup(list, group));
  }
  createSection(name, place) {
    return this.run(this.writes.createSection(name, place));
  }
  applyAll(steps) {
    return this.run(this.writes.applyAll(steps));
  }
  async drop(tasks, to, day, filter) {
    return this.run(await this.ask(this.writes.drop(tasks, to, day, filter, this.projectsScreenStore.get().carry)));
  }
  landing(tasks, to, day, filter) {
    return this.ask(this.writes.landing(tasks, to, day, filter, this.projectsScreenStore.get().carry));
  }
  dropPreview(tasks, to, day, filter) {
    return this.ask(this.writes.dropPreview(tasks, to, day, filter, this.projectsScreenStore.get().carry));
  }
  takes(origins, to) {
    return this.ask(this.reads.takesRead(origins, to));
  }
  opensGaps(origins, column, day) {
    return this.reads.opensGaps(origins, column, day);
  }
  resizedSlot(item, day, edge, minute, minDurationMin) {
    return this.reads.resizedSlot(item, day, edge, minute, minDurationMin);
  }
  async reader(filter) {
    await this.normalize();
    const s = await this.snapshotOrNull();
    return new SnapshotReader(this.reads, this.writes, (read) => this.answerOver(s, read), filter ?? null, () => this.projectsScreenStore.get().carry);
  }
  async normalize() {
    const text = await this.store.read();
    if (text === null) return;
    if (!this.normalizedOf(text, this.rules.moment()).changed) return;
    await this.mutate((d) => d, false);
  }
  async createFile() {
    await this.store.create(this.rules.emptyFile());
  }
  onChange(listener) {
    this.listeners.add(listener);
    this.unsubscribeStore ??= this.store.onChange(() => this.emit());
    this.unsubscribeSettings ??= this.watchReading();
    this.unsubscribeProjects ??= this.legacyProjects.onChange(() => this.emit());
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.unsubscribeStore?.();
        this.unsubscribeStore = null;
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.unsubscribeProjects?.();
        this.unsubscribeProjects = null;
      }
    };
  }
  onShownChange(listener) {
    let seen = this.settings.get();
    return this.settings.onChange(() => {
      const now = this.settings.get();
      const change = shownChange(seen, now);
      seen = now;
      if (change) listener(change);
    });
  }
  /** Settings that change how the file reads change what it says: the listeners read it anew. */
  watchReading() {
    let seen = this.settings.get();
    return this.settings.onChange(() => {
      const now = this.settings.get();
      const anew = readsAnew(seen, now);
      seen = now;
      if (anew) this.emit();
    });
  }
  /** A read as it asks: the file tidied first, read, or missing. */
  async ask(read) {
    if (read.tidies) await this.normalize();
    if (!read.reads) return read.answer(null);
    return this.answerOver(await this.snapshotOrNull(), read);
  }
  /** A read over the file as `s` read it: missing without a file, or failing. */
  answerOver(s, read) {
    if (!read.reads) return read.answer(null);
    if (s) return read.answer(s);
    if (read.missing) return read.missing();
    throw new TasksFileMissingError(this.settings.get().tasksFile);
  }
  /** A write as one action: its operation written once, then its answer over the document before and after. */
  async run(write) {
    return write.answer(await this.mutate(write.operation));
  }
  /**
   * One action's change of the file; it is a step to take back unless `record` is false (the file tidied, not changed by an
   * action). Gives the document as normalized before and after the write; null when it changed nothing.
   */
  async mutate(operation, record = true) {
    if (!operation) return null;
    const at = this.rules.moment();
    let failure = null;
    let change = null;
    await this.store.write((text) => {
      try {
        const ids2 = this.rules.idsOf(text);
        const written2 = this.rules.change(text, operation, at);
        change = { before: text, written: written2, ids: ids2 };
        return written2.text;
      } catch (e) {
        failure = e;
        return text;
      }
    });
    if (failure !== null) throw failure;
    if (!change) return null;
    const { before, written, ids } = change;
    this.normalized = { text: written.text, today: at.today, reading: at.reading, doc: written.after, changed: false };
    if (record) this.history?.record(before, written.text, { before: ids, after: this.rules.idsOf(written.text) });
    return { before: written.before, after: written.after };
  }
  async snapshot() {
    const s = await this.snapshotOrNull();
    if (!s) throw new TasksFileMissingError(this.settings.get().tasksFile);
    return s;
  }
  async snapshotOrNull() {
    const at = this.rules.moment();
    const text = await this.store.read();
    if (text === null) return null;
    return { text, doc: this.normalizedOf(text, at).doc, today: at.today, boundary: at.boundary };
  }
  /** The text parsed and normalized, kept until the text, the day or the settings it is read by change. */
  normalizedOf(text, at) {
    const last = this.normalized;
    if (last && last.text === text && last.today === at.today && last.reading === at.reading) return last;
    const { doc, changed: changed3 } = this.rules.read(text, at);
    this.normalized = { text, today: at.today, reading: at.reading, doc, changed: changed3 };
    return this.normalized;
  }
  emit() {
    for (const listener of this.listeners) listener();
  }
};

// core/application/UndoSteps.ts
var DEPTH = 100;
var UndoSteps = class _UndoSteps {
  constructor(state = { done: [], undone: [] }) {
    this.done = state.done.map((h) => TextPatch.of(h));
    this.undone = state.undone.map((h) => TextPatch.of(h));
  }
  get state() {
    return { done: this.done.map((p) => p.hunks), undone: this.undone.map((p) => p.hunks) };
  }
  /** A change just made: a new step, and nothing left to do again. False when it changed no line. */
  record(before, after, ids) {
    const patch2 = TextPatch.between(before, after, ids);
    if (patch2.empty) return false;
    this.done.push(patch2);
    if (this.done.length > DEPTH) this.done.shift();
    this.undone.length = 0;
    return true;
  }
  canUndo() {
    return this.done.length > 0;
  }
  canRedo() {
    return this.undone.length > 0;
  }
  /** The next step that way, taken off; null when there is none. */
  take(way) {
    return (way === "undo" ? this.done : this.undone).pop() ?? null;
  }
  /** `text` with the step taken back or done again; null when its lines were edited since. */
  static make(way, patch2, text) {
    return way === "undo" ? patch2.reverted(text) : patch2.applied(text);
  }
  /** A step made: it can be made the other way now. A step that could not be made is dropped. */
  made(way, patch2) {
    (way === "undo" ? this.undone : this.done).push(patch2);
  }
  /** A whole step over `text`, at once: the outcome and the text it leaves; for a step made, how its lines were carried. */
  step(way, text) {
    const patch2 = this.take(way);
    if (!patch2) return { outcome: "nothing", text };
    const next = _UndoSteps.make(way, patch2, text);
    if (next === null) return { outcome: "conflict", text };
    this.made(way, patch2);
    return { outcome: "done", text: next.text, carried: { origins: next.origins, ids: next.ids } };
  }
};

// core/application/UndoHistory.ts
var UndoHistory = class {
  /** `identity`, the tasks' identity the task service keeps: a step gives each task it brings back the id it had. */
  constructor(store, identity = null) {
    this.store = store;
    this.identity = identity;
    this.steps = new UndoSteps();
    this.listeners = /* @__PURE__ */ new Set();
    /** While `together` runs: the writes joined so far, from the first one's before to the last one's after. */
    this.joined = null;
  }
  /** A change the plugin just made: a new step, and nothing left to do again. `ids`, who the tasks were on each side. */
  record(before, after, ids) {
    if (this.joined) {
      const run = this.joined.run;
      if (run && run.after === before) this.joined.run = { ...run, after, afterIds: ids?.after };
      else {
        this.close();
        this.joined.run = { before, beforeIds: ids?.before, after, afterIds: ids?.after };
      }
      return;
    }
    if (this.steps.record(before, after, ids)) this.emit();
  }
  /**
   * The changes `work` makes, one step to take back: an action made of several writes (Best task's label moved). Only
   * writes that follow each other join: a change from outside in between (by hand, Sync) closes the step so far, and the
   * next write starts another, so the outside change is never taken back with them.
   */
  async together(work) {
    if (this.joined) return work();
    this.joined = { run: null };
    try {
      return await work();
    } finally {
      this.close();
      this.joined = null;
    }
  }
  /** The writes joined so far, made one step. */
  close() {
    const run = this.joined?.run;
    if (!this.joined || !run) return;
    this.joined.run = null;
    const ids = run.beforeIds && run.afterIds ? { before: run.beforeIds, after: run.afterIds } : void 0;
    if (this.steps.record(run.before, run.after, ids)) this.emit();
  }
  undo() {
    return this.step("undo");
  }
  redo() {
    return this.step("redo");
  }
  canUndo() {
    return this.steps.canUndo();
  }
  canRedo() {
    return this.steps.canRedo();
  }
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** A step whose lines were edited since can't be made: it is dropped, and the file stays as it is. */
  async step(way) {
    if (!(way === "undo" ? this.steps.canUndo() : this.steps.canRedo())) return "nothing";
    let outcome = "nothing";
    await this.store.write((text) => {
      const made = this.steps.step(way, text);
      outcome = made.outcome;
      if (made.carried) this.identity?.carried(text, made.text, made.carried);
      return made.text;
    });
    this.emit();
    return outcome;
  }
  emit() {
    for (const listener of this.listeners) listener();
  }
};

// core/application/composeCore.ts
function composeCore(ports) {
  const identity = new TaskIdentity();
  const undo = new UndoHistory(ports.tasksFile, identity);
  const tasks = new TaskServiceImpl(ports.tasksFile, ports.settings, ports.clock, undo, ports.projects, ports.projectsScreen, identity);
  const files = CALENDAR_SOURCES.map((source) => ports.calendarFiles[source]);
  const days = new DayServiceImpl(ports.clock, ports.settings, tasks, ports.ticker);
  const calendars = new CalendarServiceImpl(files, ports.feeds, ports.clock, ports.settings, ports.timers, ports.work, { canMigrate: ports.isPhone });
  const assistant = new AssistantServiceImpl({ tasks, steps: undo, settings: ports.settings, timers: ports.timers, models: ports.models });
  const agent = new AgentReads({ tasks, days, calendars, assistant, screenSettings: new ScreenSettingsImpl(ports.settings), clock: ports.clock, storedTasks: ports.storedTasks ?? (() => ports.tasksFile.read()) });
  return { tasks, days, undo, calendars, assistant, agent };
}

// core/application/captureTitle.ts
function captureTitle({ typed: typed2, recording, tag }) {
  const parts = [typed2.trim()].filter((p) => p !== "");
  if (recording !== null) {
    parts.push(`[[${recording}]]`);
    const name = tag.trim().replace(/^#+/, "");
    if (name !== "") parts.push(`#${name}`);
  }
  return parts.join(" ");
}

// core/application/notes.ts
var MD = ".md";
function nameOf(path) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.toLowerCase().endsWith(MD) ? file.slice(0, -MD.length) : file;
}
function withoutMd(path) {
  return path.toLowerCase().endsWith(MD) ? path.slice(0, -MD.length) : path;
}
function linkedNotes(notes) {
  const named = /* @__PURE__ */ new Map();
  for (const { path } of notes) named.set(projectKey(nameOf(path)), (named.get(projectKey(nameOf(path))) ?? 0) + 1);
  return notes.map(({ path }) => {
    const name = nameOf(path);
    return { name, path, link: named.get(projectKey(name)) === 1 ? name : withoutMd(path) };
  });
}
var OPEN = "[[";
var CLOSE = "]]";
function linkQuery(text, caret) {
  const before = text.slice(0, caret);
  const from = before.lastIndexOf(OPEN);
  if (from < 0) return null;
  const query = before.slice(from + OPEN.length);
  if (/[\]\[\n|]/.test(query)) return null;
  return { query, from, to: text.startsWith(CLOSE, caret) ? caret + CLOSE.length : caret };
}
var NOTE_SUGGESTIONS = 20;
function noteSuggestions(query, notes, limit = NOTE_SUGGESTIONS) {
  const typed2 = query.trim().toLowerCase();
  const words = typed2.split(/\s+/).filter((word) => word !== "");
  const rank = (note) => {
    const name = note.name.toLowerCase();
    const path = note.path.toLowerCase();
    if (typed2 === "") return 0;
    if (name === typed2) return 0;
    if (name.startsWith(typed2)) return 1;
    if (name.includes(typed2)) return 2;
    if (path.includes(typed2)) return 3;
    return words.every((word) => path.includes(word)) ? 4 : null;
  };
  const ranked = linkedNotes(notes).flatMap((note) => {
    const r = rank(note);
    return r === null ? [] : [{ note: { name: note.name, path: note.path, link: note.link }, rank: r }];
  });
  ranked.sort((a, b) => a.rank - b.rank || (typed2 === "" ? 0 : a.note.name.length - b.note.name.length) || compare(a.note.name, b.note.name) || compare(a.note.path, b.note.path));
  return ranked.slice(0, limit).map(({ note }) => note);
}
function compare(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}
function withNoteLink(text, at, link) {
  const written = `${OPEN}${link}${CLOSE}`;
  return { text: text.slice(0, at.from) + written + text.slice(at.to), caret: at.from + written.length };
}
function noteOfLink(target, notes) {
  const bare = target.split("#")[0].split("|")[0].trim().replace(/^\//, "");
  if (bare === "") return null;
  const wanted = projectKey(withoutMd(bare));
  const linked = linkedNotes(notes);
  const found = linked.find((note) => projectKey(withoutMd(note.path)) === wanted) ?? linked.find((note) => projectKey(withoutMd(note.path)).endsWith(`/${wanted}`)) ?? linked.find((note) => projectKey(note.name) === wanted);
  return found ? { name: found.name, path: found.path, link: found.link } : null;
}

// core/application/SettingsServiceImpl.ts
function countOf(text) {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}
var SECTION_ORDER = ["inbox", "now", "soon", "backlog", "done"];
var MARKER_ORDER = ["dueDateMarker", "slotMarker", "alarmSlotMarker", "liveSlotMarker", "silentSlotMarker", "repeatMarker", "collapsedMarker"];
var DAY_START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
var DAY_START_CHOICES = DAY_START_HOURS.map((hour) => ({ hour, label: minutesToHHMM(hour * 60) }));
var SettingsServiceImpl = class {
  constructor(store) {
    this.store = store;
  }
  form() {
    const s = this.settings;
    return {
      tasksFile: s.tasksFile,
      sections: s.sections,
      sectionOrder: SECTION_ORDER,
      markerOrder: MARKER_ORDER,
      markers: {
        dueDateMarker: s.dueDateMarker,
        slotMarker: s.slotMarker,
        alarmSlotMarker: s.alarmSlotMarker,
        liveSlotMarker: s.liveSlotMarker,
        silentSlotMarker: s.silentSlotMarker,
        repeatMarker: s.repeatMarker,
        collapsedMarker: s.collapsedMarker
      },
      priorities: s.priorities,
      labelTag: s.labelTag,
      labels: s.labels,
      levelSwatches: PRIORITY_COLORS,
      labelSwatches: LABEL_SWATCHES,
      labelPaint: s.labelPaint,
      labelPaints: LABEL_PAINTS,
      cardHeight: s.cardHeight,
      cardGap: s.cardGap,
      cardHeights: CARD_HEIGHTS,
      cardGaps: CARD_GAPS,
      zoomLevels: formatZoomLevels(s.zoomLevels),
      presets: s.groups.presets,
      ungrouped: s.groups.ungrouped,
      longPressMs: s.longPressMs,
      dayStartHour: s.dayStartHour,
      scrollToHour: s.scrollToHour,
      staleAfterMinutes: s.staleAfterMinutes,
      googleClientId: s.google.clientId,
      refreshSeconds: s.google.refreshSeconds,
      workCalendarFile: s.workCalendarFile,
      dayStartHours: DAY_START_HOURS,
      dayStartChoices: DAY_START_CHOICES,
      googleClientReady: s.google.clientId !== "",
      googleLoggedIn: googleLoggedIn(s)
    };
  }
  setTasksFile(tasksFile) {
    return this.store.update({ tasksFile });
  }
  setSection(key, name) {
    return this.store.update({ sections: { ...this.settings.sections, [key]: name } });
  }
  setMarker(marker, text) {
    return this.store.update({ [marker]: text });
  }
  async setCount(field, text) {
    const n = countOf(text);
    if (n === null) return;
    await this.store.update(field === "refreshSeconds" ? this.google({ refreshSeconds: n }) : { [field]: n });
  }
  setDayStartHour(dayStartHour) {
    return this.store.update({ dayStartHour });
  }
  renameLevel(index, prefix) {
    return this.patchLevel(index, { prefix: prefix.trim() });
  }
  recolourLevel(index, color) {
    return this.patchLevel(index, { color });
  }
  removeLevel(index) {
    return this.saveLevels(this.settings.priorities.filter((_, i) => i !== index));
  }
  addLevel() {
    const levels = this.settings.priorities;
    let n = levels.length + 1;
    while (levels.some((l) => l.prefix === `p${n}`)) n++;
    const color = PRIORITY_COLORS.find((c) => !levels.some((l) => l.color === c)) ?? PRIORITY_COLORS[0];
    return this.saveLevels([...levels, { prefix: `p${n}`, color }]);
  }
  moveLevel(from, to) {
    return this.saveLevels(moved(this.settings.priorities, from, to));
  }
  async setLabelTag(tag) {
    const labelTag = tag.trim();
    if (usableLabelTag(labelTag)) await this.store.update({ labelTag });
  }
  async setLabelPaint(paint) {
    const labelPaint = LABEL_PAINTS.find((offered2) => offered2 === paint);
    if (labelPaint) await this.store.update({ labelPaint });
  }
  async setCardHeight(px) {
    const cardHeight = withinBounds(px, CARD_HEIGHTS);
    if (cardHeight !== null) await this.store.update({ cardHeight });
  }
  async setCardGap(px) {
    const cardGap = withinBounds(px, CARD_GAPS);
    if (cardGap !== null) await this.store.update({ cardGap });
  }
  async setZoomLevels(text) {
    const zoomLevels = parseZoomLevels(text);
    if (zoomLevels) await this.store.update({ zoomLevels });
  }
  renameLabel(index, title) {
    return this.patchLabel(index, { name: labelNameOf(title) });
  }
  recolourLabel(index, color) {
    return this.patchLabel(index, { color });
  }
  removeLabel(index) {
    return this.saveLabels(this.settings.labels.filter((_, i) => i !== index));
  }
  addLabel() {
    const labels = this.settings.labels;
    let n = labels.length + 1;
    while (labels.some((l) => l.name === `Label_${n}`)) n++;
    const color = PRIORITY_COLORS.find((c) => !labels.some((l) => l.color === c)) ?? PRIORITY_COLORS[0];
    return this.saveLabels([...labels, { name: `Label_${n}`, color }]);
  }
  moveLabel(from, to) {
    return this.saveLabels(moved(this.settings.labels, from, to));
  }
  colourOf(text, shades) {
    const hex = hexColor(text);
    if (!hex) return null;
    return PRIORITY_COLORS.find((preset) => shades[preset].toUpperCase() === hex) ?? hex;
  }
  typedColour(of, index, text, shades) {
    const color = this.colourOf(text, shades);
    const own = (of === "level" ? this.settings.priorities : this.settings.labels)[index]?.color;
    return color === own ? null : color;
  }
  renamePreset(index, name) {
    return this.savePresets(this.presets.map((preset, i) => i === index ? name.trim() : preset));
  }
  removePreset(index) {
    return this.savePresets(this.presets.filter((_, i) => i !== index));
  }
  addPreset() {
    return this.savePresets([...this.presets, ""]);
  }
  movePreset(from, to) {
    return this.savePresets(moved(this.presets, from, to));
  }
  setUngrouped(name) {
    return this.store.update(this.groups({ ungrouped: name.trim() || DEFAULT_SETTINGS.groups.ungrouped }));
  }
  setGoogleClientId(clientId) {
    return this.store.update(this.google({ clientId }));
  }
  bindClientSecret(field) {
    field.setValue(this.settings.google.clientSecret);
    field.onChange((clientSecret) => void this.store.update(this.google({ clientSecret })));
  }
  setWorkCalendarFile(workCalendarFile) {
    return this.store.update({ workCalendarFile });
  }
  get settings() {
    return this.store.get();
  }
  get presets() {
    return this.settings.groups.presets;
  }
  patchLevel(index, patch2) {
    return this.saveLevels(this.settings.priorities.map((level, i) => i === index ? { ...level, ...patch2 } : level));
  }
  saveLevels(priorities) {
    return this.store.update({ priorities });
  }
  patchLabel(index, patch2) {
    return this.saveLabels(this.settings.labels.map((label, i) => i === index ? { ...label, ...patch2 } : label));
  }
  saveLabels(labels) {
    return this.store.update({ labels });
  }
  savePresets(presets) {
    return this.store.update(this.groups({ presets }));
  }
  groups(patch2) {
    return { groups: { ...this.settings.groups, ...patch2 } };
  }
  google(patch2) {
    return { google: { ...this.settings.google, ...patch2 } };
  }
};
function moved(list, from, to) {
  const items = [...list];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return items;
}
function withinBounds(value, bounds) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const whole = Math.round(value);
  return whole >= bounds.min && whole <= bounds.max ? whole : null;
}

// core/application/TaskReminders.ts
var HOUR_MINUTES5 = 60;
function clockOf2(date, minutes) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 0, minutes);
}
var TaskReminders = class {
  constructor(rules, clock) {
    this.rules = rules;
    this.clock = clock;
  }
  /** The open tasks on a time that remind, until their day ends, by start. */
  ringing(text) {
    const at = this.rules.moment();
    const now = this.clock.now();
    return openSlotted(this.rules.read(text, at).doc).filter((e) => e.task.reminder !== "none").map((e) => this.reminder(e, e.task.slot, at)).filter((r) => r.dayEnd > now).sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  /**
   * The text after `action` on the reminding task whose line is `line`, the first of two alike; null when no such task is
   * left. A reminder still shown after its day ended names a slot that today's normalizing has already erased: it is
   * found in the file as it is.
   */
  act(text, line, action) {
    const at = this.rules.moment();
    const { doc } = this.rules.read(text, at);
    const found = this.find(doc, line);
    if (found) return this.rules.changeOf(doc, action(found), at).text;
    const asRead = this.find(this.rules.asRead(text, at), line);
    return asRead ? this.rules.changeAsRead(text, action(asRead), at).text : null;
  }
  find(doc, line) {
    const entry = openSlotted(doc).find((e) => e.raw === line);
    return entry ? keyOf(entry) : null;
  }
  reminder(entry, slot, at) {
    const nextDay = addDays(at.boundary.dayOfSlot(slot), 1);
    return {
      key: keyOf(entry),
      title: plainText(entry.task.text),
      startMinute: slot.start,
      endMinute: slot.end,
      kind: entry.task.reminder === "none" ? "notification" : entry.task.reminder,
      date: slot.date,
      start: clockOf2(slot.date, slot.start),
      dayEnd: clockOf2(nextDay, at.boundary.startHour * HOUR_MINUTES5)
    };
  }
};

// core/application/PhoneCalls.ts
var DoorError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function settingsOf(json2) {
  return settingsFrom(json2.trim() === "" ? null : JSON.parse(json2));
}
var KEPT = (call) => call.snapshot();
var TASKS = {
  priorityLevels: (c) => c.reads.priorityLevels(),
  labelLevels: (c) => c.reads.labelLevels(),
  parseTitle: (c, [text]) => c.reads.parseTitle(text),
  isBlank: (c, [text]) => c.reads.isBlank(text),
  withPriority: (c, [text, prefix]) => c.reads.withPriority(text, prefix ?? null),
  draftMarks: (c, [text, priority, labels]) => c.reads.draftMarks(text, priority ?? null, labels ?? []),
  screen: (c, [date, filter]) => c.ask(c.reads.screenRead(date, filter)),
  dayView: (c, [date, filter]) => c.reads.dayView(KEPT(c), date, filter),
  soonWithoutDateView: (c) => c.reads.soonWithoutDateView(KEPT(c)),
  inboxView: (c) => c.reads.inboxView(KEPT(c)),
  backlogView: (c) => c.reads.backlogView(KEPT(c)),
  doneView: (c) => c.reads.doneView(KEPT(c)),
  search: (c, [query]) => c.ask(c.reads.searchRead(query)),
  screenOf: (c, [item]) => c.reads.screenOf(KEPT(c), item),
  reveal: (c, [item]) => {
    c.run(c.writes.revealUnfold(item));
    return c.reads.screenOf(KEPT(c), item);
  },
  findIn: (c, [items, key]) => c.reads.findIn(items, key),
  listSections: (c) => c.reads.listSections(KEPT(c)),
  sectionOffer: (c, [date]) => c.reads.sectionOffer(KEPT(c), date),
  createInList: (c, [date, text]) => c.run(c.writes.createInList(date, text)),
  createInSoon: (c, [text]) => c.run(c.writes.createInSoon(text)),
  createAtTime: (c, [date, start2, text]) => c.run(c.writes.createAtTime(date, start2, text)),
  createInPlace: (c, [text, priority, place, repeat, labels, project, filter, description]) => c.run(c.writes.createInPlace(text, priority ?? null, place, repeat ?? null, labels ?? [], project, filter, description)),
  createWithId: (c, [text, priority, place, repeat, labels, project, filter, description]) => c.run(c.writes.createWithId(text, priority ?? null, place, repeat ?? null, labels ?? [], project, filter, description)),
  create: (c, [draft, slot]) => c.run(c.writes.create(draft, slot ?? void 0)),
  createSubtask: (c, [parent, draft]) => c.run(c.writes.createSubtask(parent, draft)),
  firstStep: (c, [key, text]) => c.run(c.writes.firstStep(key, text)),
  firstStepScreen: (_c, [view, key]) => firstStepScreen(view, key),
  firstStepProjects: (_c, [view, key]) => firstStepProjects(view, key),
  edit: (c, [key, draft]) => c.run(c.writes.edit(KEPT(c), key, draft)),
  placementOf: (c, [item]) => c.reads.placementOf(item),
  dayColumn: (c, [date]) => c.reads.dayColumn(date),
  columnSections: (c, [column, date]) => c.reads.columnSections(column, date),
  placementOfDay: (c, [date]) => c.reads.placementOfDay(date),
  columnView: (c, [screen, column]) => c.reads.columnView(screen, column),
  placeOf: (c, [item]) => c.reads.placeOf(KEPT(c), item),
  ridesNow: (c, [item, day]) => c.reads.ridesNow(item, day),
  storedLine: (c, [item, text]) => c.reads.storedLine(item, text),
  projectNodeNamed: (c, [name]) => c.hasTasks() ? c.reads.projectNodeNamed(KEPT(c), name) : { node: null, candidates: [] },
  openTasks: (c, [filter]) => c.ask(c.reads.openTasksRead(filter)),
  projectHistory: (c, [node]) => c.ask(c.reads.projectHistoryRead(node)),
  listName: (c, [list]) => c.reads.listName(list),
  placementTitle: (c, [placement]) => c.reads.placementTitle(placement),
  dayOfPlacement: (c, [placement]) => c.reads.dayOfPlacement(placement),
  setStatus: (c, [key, status]) => c.run(c.writes.setStatus(key, status)),
  toggleDone: (c, [key]) => c.run(c.writes.toggleDone(key)),
  setDueDate: (c, [key, date]) => c.run(c.writes.setDueDate(key, date ?? null)),
  setPriority: (c, [key, priority]) => c.run(c.writes.setPriority(key, priority ?? null)),
  setLabels: (c, [key, labels]) => c.run(c.writes.setLabels(key, labels)),
  setLabelsAll: (c, [steps]) => c.run(c.writes.setLabelsAll(steps)),
  setProject: (c, [keys, project]) => c.run(c.writes.setProject(keys, project ?? null)),
  projects: (c) => c.reads.projects(),
  toggleProject: (c, [keys, name]) => c.run(c.writes.toggleProject(keys, name)),
  newProject: (c, [name, keys]) => {
    const made = c.run(c.writes.newProject(name, keys ?? []));
    return made === null ? null : new ProjectIndex(c.tree()).refOf(made);
  },
  projectsScreen: (c, [node]) => c.ask(c.reads.projectsScreenRead(node ?? void 0)),
  funnelView: (c, [wide]) => c.ask(c.reads.funnelViewRead(wide === true)),
  projectNoteView: (c, [path, wide]) => c.ask(c.reads.projectNoteViewRead(path, wide === true)),
  pickProjectNode: (c, [node, wide]) => c.keepProjectsScreen(picked(c.projectsScreen, c.tree(), node, wide === true)),
  firstView: (c, [wide, note]) => {
    if (note !== true) c.keepProjectsScreen(gestureGone(c.projectsScreen));
    return c.reads.firstView(wide === true, note === true);
  },
  filterHides: (c, [item, filter]) => c.ask(c.reads.filterHidesRead(item, filter ?? null)),
  startCarry: (c, [start2, wide]) => c.keepProjectsScreen(carryStarted(c.projectsScreen, start2, wide === true, c.tree())),
  carryAt: (c, [at, nowMs]) => {
    const doc = c.hasTasks() ? c.snapshot().doc : null;
    const { state, wait } = carriedAt(c.projectsScreen, at, nowMs, c.tree(), doc);
    c.keepProjectsScreen(state);
    return { wait };
  },
  carryOnNode: (c, [node]) => {
    const carry = c.projectsScreen.carry;
    const target = node === "none" ? null : projectOfNode(node);
    if (target !== null || node === "none") {
      if (carry?.cards && carry.cards.length > 0) c.run(c.writes.dropOnProject(carry.cards, target));
      else if (carry && carry.keys.length > 0) c.run(c.writes.dropTasksOnProject(carry.keys, target, carry.under));
    }
    c.keepProjectsScreen(carryEnded(c.projectsScreen, "dropped", c.tree(), c.hasTasks() ? c.snapshot().doc : null));
    return null;
  },
  endCarry: (c, [how]) => c.keepProjectsScreen(carryEnded(c.projectsScreen, how, c.tree(), c.hasTasks() ? c.snapshot().doc : null)),
  endProjectName: (c) => c.keepProjectsScreen(nameEnded(c.projectsScreen)),
  setFunnelPlace: (c, [place]) => {
    const at = funnelPlaceOf(place);
    if (c.projectsScreen.place !== at) c.keepProjectsScreen({ ...c.projectsScreen, place: at });
  },
  firstPlace: (c) => {
    c.keepProjectsScreen(gestureGone(c.projectsScreen));
    return funnelPlaceOf(c.projectsScreen.place);
  },
  clearProjectFilter: (c) => c.keepProjectsScreen(cleared(c.projectsScreen)),
  setProjectsPanel: (c, [open]) => {
    if (c.projectsScreen.panelOpen === true !== (open === true)) c.keepProjectsScreen({ ...c.projectsScreen, panelOpen: open === true });
  },
  setViewMode: (c, [mode]) => c.keepProjectsScreen(withMode(c.projectsScreen, mode)),
  setNoteViewMode: (c, [mode]) => c.keepProjectsScreen({ ...c.projectsScreen, noteView: mode }),
  toggleSubprojects: (c) => c.keepProjectsScreen(toggledSubprojects(c.projectsScreen)),
  dropTasksOnProject: (c, [keys, to, filter]) => {
    const target = to === "none" ? null : projectOfNode(to);
    if (target === null && to !== "none") return null;
    return c.run(c.writes.dropTasksOnProject(keys, target, filter ?? null));
  },
  selectProjectNode: (c, [node]) => c.keepProjectsScreen(selected(c.projectsScreen, c.tree(), c.hasTasks() ? c.snapshot().doc : null, node)),
  createProject: (c, [name, place]) => {
    const made = c.run(c.writes.createProject(name, place));
    if (made === null) return null;
    c.keepProjectsScreen(selected(c.projectsScreen, c.tree(), c.snapshot().doc, projectNodeOf(made)));
    return new ProjectIndex(c.tree()).refOf(made);
  },
  moveProject: (c, [name, place]) => c.run(c.writes.moveProject(name, place)),
  renameProject: (c, [from, to]) => {
    const renamed = c.run(c.writes.renameProject(from, to));
    if (renamed) c.keepProjectsScreen(renamedIn(c.projectsScreen, from, c.rules.cleanName(to)));
    return renamed;
  },
  dropInProjects: (c, [cards, place, node]) => c.run(c.ask(c.writes.dropInProjects(cards, place, node ?? void 0))),
  projectsDropPreview: (c, [cards, place, node]) => c.ask(c.writes.projectsDropPreview(cards, place, node ?? void 0)),
  deleteProject: (c, [name]) => c.run(c.writes.deleteProject(name)),
  setProjectFolder: (c, [name, folder]) => c.run(c.writes.setProjectFolder(name, folder === true)),
  setProjectNote: (c, [name, link]) => c.run(c.writes.setProjectNote(name, link ?? null)),
  dropOnProject: (c, [cards, to]) => {
    const target = to === "none" ? null : projectOfNode(to);
    if (target === null && to !== "none") return null;
    return c.run(c.writes.dropOnProject(cards, target));
  },
  isBlankProjectName: (c, [name]) => c.rules.cleanName(name) === null,
  setReminder: (c, [key, reminder]) => c.run(c.writes.setReminder(key, reminder)),
  togglePriority: (c, [keys, prefix]) => c.run(c.ask(c.writes.togglePriority(keys, prefix))),
  toggleLabel: (c, [keys, name]) => c.run(c.ask(c.writes.toggleLabel(keys, name))),
  removeDue: (c, [keys]) => c.run(c.writes.removeDue(KEPT(c), keys)),
  menu: (c, [item, from, screen]) => c.reads.menu(item, from, screen),
  bulkMenu: (c, [picked2, screen]) => c.reads.bulkMenu(picked2, screen),
  pickStatus: (c, [keys, id]) => c.run(c.writes.pickStatus(keys, id)),
  postponeAll: (c, [keys, date]) => c.run(c.writes.postponeAll(KEPT(c), keys, date)),
  sendTo: (c, [keys, placement]) => c.run(c.writes.sendTo(KEPT(c), keys, placement)),
  setRepeatAll: (c, [keys, rule]) => c.run(c.writes.setRepeatAll(KEPT(c), keys, rule ?? null)),
  removeAll: (c, [keys]) => c.run(c.writes.removeAll(keys)),
  carried: (c, [lifted2, picked2]) => c.reads.carried(lifted2, picked2),
  setCollapsed: (c, [key, collapsed]) => c.run(c.writes.setCollapsed(key, collapsed)),
  toggleCollapsed: (c, [key]) => c.run(c.writes.toggleCollapsed(key)),
  unfoldAbove: (c, [key]) => c.run(c.writes.unfoldAbove(key)),
  setRepeat: (c, [key, rule]) => c.run(c.writes.setRepeat(key, rule ?? null)),
  stop: (c, [key]) => c.run(c.writes.stop(key)),
  rename: (c, [key, text]) => c.run(c.writes.rename(KEPT(c), key, text)),
  fullTree: (c, [item]) => c.reads.fullTree(item),
  setDescription: (c, [key, markdown]) => c.run(c.writes.setDescription(key, markdown)),
  remove: (c, [key]) => c.run(c.writes.remove(key)),
  lineOf: (c, [key]) => c.ask(c.reads.lineOfRead(key)),
  find: (c, [key, text]) => c.reads.find(KEPT(c), key, text),
  moveBefore: (c, [key, before, date]) => c.run(c.writes.moveBefore(key, before ?? null, date)),
  nest: (c, [key, parent, before]) => c.run(c.writes.nest(key, parent, before ?? null)),
  setSlot: (c, [key, slot]) => c.run(c.writes.setSlot(key, slot)),
  shownSpan: (c, [item, day]) => c.reads.shownSpan(item, day),
  dropSpan: (c, [item, from, start2]) => c.reads.dropSpan(item ?? null, from, start2),
  newSlot: (c, [day, start2]) => c.reads.newSlot(day, start2),
  snap: (_c, [minute, hourPx, tolerancePx]) => snapMinute(minute, hourPx, tolerancePx),
  stretch: (c, [item, day, edge, minute]) => c.reads.stretch(item, day, edge, minute),
  resize: (c, [key, day, edge, minute, min]) => c.run(c.writes.resize(KEPT(c), key, day, edge, minute, min)),
  clearSlot: (c, [key, place]) => c.run(c.writes.clearSlot(key, place ?? void 0)),
  moveToList: (c, [key, date]) => c.run(c.writes.moveToList(key, date)),
  moveToSoon: (c, [key, date]) => c.run(c.writes.moveToSoon(key, date)),
  postpone: (c, [key, date]) => c.run(c.writes.postpone(key, date)),
  moveToEnd: (c, [key, section]) => c.run(c.writes.moveToEnd(key, section)),
  moveToGroup: (c, [key, list, group, before, date]) => c.run(c.writes.moveToGroup(key, list, group ?? null, before ?? null, date ?? void 0)),
  createGroup: (c, [key, list, name, date]) => c.run(c.writes.createGroup(key, list, name, date ?? void 0)),
  toSection: (c, [keys, name]) => c.run(c.writes.toSection(KEPT(c), keys, name ?? null)),
  moveGroup: (c, [list, group, place]) => c.run(c.writes.moveGroup(list, group ?? null, place)),
  renameGroup: (c, [list, group, name]) => c.run(c.ask(c.writes.renameGroup(list, group, name))),
  removeGroup: (c, [list, group]) => c.run(c.writes.removeGroup(list, group)),
  createSection: (c, [name, place]) => c.run(c.writes.createSection(name, place)),
  applyAll: (c, [steps]) => c.run(c.writes.applyAll(steps)),
  drop: (c, [tasks, to, day, filter]) => c.run(c.ask(c.writes.drop(tasks, to, day, filter, c.projectsScreen.carry))),
  landing: (c, [tasks, to, day, filter]) => c.ask(c.writes.landing(tasks, to, day, filter, c.projectsScreen.carry)),
  dropPreview: (c, [tasks, to, day, filter]) => c.ask(c.writes.dropPreview(tasks, to, day, filter, c.projectsScreen.carry)),
  takes: (c, [origins, to]) => c.ask(c.reads.takesRead(origins, to)),
  opensGaps: (c, [origins, column, day]) => c.reads.opensGaps(origins, column, day),
  resizedSlot: (c, [item, day, edge, minute, min]) => c.reads.resizedSlot(item, day, edge, minute, min),
  normalize: (c) => c.normalize(),
  createFile: (c) => {
    if (c.hasTasks()) throw new DoorError("failed", "the tasks file is there already");
    c.effects.tasks = c.rules.emptyFile();
  }
};
var KEPT_TASKS = {
  /** `pickProjectNode` on a wide screen. */
  tapProjectNode: (c, [node]) => c.keepProjectsScreen(tapped(c.projectsScreen, c.tree(), node)),
  /** A folded branch opened without choosing its node. */
  unfoldProjectNode: (c, [node]) => c.keepProjectsScreen(unfolded2(c.projectsScreen, node)),
  /** A held card's pause over a row, as `carryAt` acts on it. */
  hoverProjectNode: (c, [node]) => {
    const doc = c.hasTasks() ? c.snapshot().doc : null;
    c.keepProjectsScreen(hovered(c.projectsScreen, c.tree(), doc, panelRows(c.tree(), doc, c.projectsScreen), node));
  },
  /** By stage went: nothing to keep. */
  setProjectsMode: () => null
};
var KEPT_TASK_NAMES = Object.keys(KEPT_TASKS);
var oldSpot = (place) => place === "projects" ? "inbox" : place;
var KEPT_RULES = {
  placeShowing: (column, place) => column === "projects" ? oldSpot(place) : funnelPlaceShowing(column, oldSpot(place)),
  shownLists: (place) => SHOWN_LISTS[place] ?? [],
  shownEntryLists: (place) => place === "projects" ? ["projects"] : SHOWN_LISTS[place] ?? []
};
function boundaryOf2(c) {
  return c.rules.moment().boundary;
}
var DAYS = {
  today: (c) => c.rules.today(),
  relation: (c, [date]) => dayRelation(date, c.rules.today()),
  step: (_c, [date, days]) => addDays(date, days),
  stepFunnel: (c, [from, shift]) => stepFunnel(from, shift, c.rules.today()),
  openAt: (c, [date]) => dayOpening(date, boundaryOf2(c), c.rules.today(), c.now, c.settings.scrollToHour),
  week: (c, [which]) => weekOf(c.rules.today(), which === "next" ? "next" : "this"),
  days: (_c, [from, count]) => daysFrom(from, count),
  dayNamed: (c, [text]) => dayNamed(String(text), c.rules.today()),
  weekday: (_c, [date]) => weekdayName(date),
  side: (c, [date]) => daySide(date, c.rules.today()),
  clockAt: (c, [minute]) => clockOf(boundaryOf2(c), minute),
  hourLabels: (c) => hourLabels(boundaryOf2(c)),
  offset: (_c, [from, to]) => daysBetween(from, to),
  /** Where a day begins: the hour it starts at. The `boundary.*` calls place by it. */
  boundary: (c) => ({ startHour: boundaryOf2(c).startHour })
};
var BOUNDARY = {
  startHour: (c) => boundaryOf2(c).startHour,
  dayOf: (c, [ms]) => boundaryOf2(c).dayOf(new Date(ms)),
  dayOfSlot: (c, [slot]) => boundaryOf2(c).dayOfSlot(slot),
  offsetOf: (c, [day, ms]) => boundaryOf2(c).offsetOf(day, new Date(ms)),
  clipToDay: (c, [day, startMs, endMs]) => boundaryOf2(c).clipToDay(day, new Date(startMs), new Date(endMs)),
  spanOf: (c, [slot, day]) => boundaryOf2(c).spanOf(slot, day),
  slotAt: (c, [day, start2, end]) => boundaryOf2(c).slotAt(day, start2, end ?? null),
  hourAt: (c, [index]) => boundaryOf2(c).hourAt(index),
  offsetOfHour: (c, [hour]) => boundaryOf2(c).offsetOfHour(hour),
  clamp: (c, [slot, step]) => boundaryOf2(c).clamp(slot, step)
};
function wireEvent(e, calendar) {
  const { start: start2, end, ...rest } = e;
  return { ...rest, startMs: start2.getTime(), endMs: end.getTime(), past: calendar.isPast(e) };
}
function wireDay(day, calendar) {
  const wire = (events) => events.map((e) => wireEvent(e, calendar));
  return {
    events: wire(day.events),
    allDay: wire(day.allDay),
    timed: wire(day.timed),
    statuses: day.statuses.map(({ updatedAt, ...rest }) => ({ ...rest, updatedAtMs: updatedAt === null ? null : updatedAt.getTime() })),
    stale: day.stale,
    alert: day.alert,
    words: day.words
  };
}
var FETCHED_BY_DEFAULT = ["google"];
function readingOf(c) {
  const files = /* @__PURE__ */ new Map();
  const problems = /* @__PURE__ */ new Map();
  for (const source of CALENDAR_SOURCES) {
    const text = c.context.calendars?.[source] ?? null;
    if (text === null) {
      problems.set(source, { kind: "fileMissing" });
      continue;
    }
    try {
      files.set(source, readCalendarFile(text, source));
    } catch (e) {
      problems.set(source, e instanceof SourceProblemError ? e.problem : { kind: "failed", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  const fetched = c.context.fetched ?? FETCHED_BY_DEFAULT;
  return { sources: CALENDAR_SOURCES, files, problem: (s) => problems.get(s) ?? null, fed: (s) => fetched.includes(s) };
}
function calendarDay(c) {
  const reading = readingOf(c);
  const day = new CalendarDay(reading, c.settings, c.now);
  const carried = day.carryOver(true);
  if (!carried) return day;
  c.saveSettings(carried);
  return new CalendarDay(reading, c.settings, c.now);
}
var CALENDARS = {
  events: (c, [date]) => {
    const day = calendarDay(c);
    return wireDay(day.events(date), day);
  },
  isPast: (c, [event]) => new CalendarDay(readingOf(c), c.settings, c.now).isPast({ end: new Date(event.endMs) }),
  known: (c) => calendarDay(c).known(),
  setShown: (c, [account, title, shown3]) => {
    c.saveSettings(calendarDay(c).shownChange(account, title, shown3));
  },
  files: (c) => calendarFiles(c),
  sources: (c) => CALENDAR_SOURCES.map((source) => ({ source, path: calendarPath(source, c.settings) })),
  meetings: (c, [fromMs, toMs]) => meetings(c, fromMs, toMs)
};
function calendarFiles(c) {
  return CALENDAR_SOURCES.map((source) => calendarPath(source, c.settings));
}
function meetings(c, fromMs, toMs) {
  return calendarDay(c).timedBetween(new Date(fromMs), new Date(toMs)).map((e) => ({ title: e.title, startMs: e.start.getTime(), endMs: e.end.getTime() }));
}
var SETTINGS_METHODS = [
  "form",
  "setTasksFile",
  "setSection",
  "setMarker",
  "setCount",
  "setDayStartHour",
  "renameLevel",
  "recolourLevel",
  "removeLevel",
  "addLevel",
  "moveLevel",
  "setLabelTag",
  "setLabelPaint",
  "setCardHeight",
  "setCardGap",
  "setZoomLevels",
  "renameLabel",
  "recolourLabel",
  "removeLabel",
  "addLabel",
  "moveLabel",
  "colourOf",
  "typedColour",
  "renamePreset",
  "removePreset",
  "addPreset",
  "movePreset",
  "setUngrouped",
  "setGoogleClientId",
  "setWorkCalendarFile"
];
var SETTINGS = Object.fromEntries(
  SETTINGS_METHODS.map((name) => [
    name,
    (c, args) => {
      const answer2 = new SettingsServiceImpl(c.store)[name](...args);
      return answer2 instanceof Promise ? null : answer2;
    }
  ])
);
var SCREEN_SETTINGS = {
  get: (c) => screenSettingsOf(c.settings)
};
function reminderTime(start2, end) {
  return end === null ? minutesToHHMM(start2) : `${minutesToHHMM(start2)}–${minutesToHHMM(end % MINUTES_PER_DAY)}`;
}
function onReminder(c, id, action) {
  if (!c.write((text) => new TaskReminders(c.rules, c.clock).act(text, id, action))) throw new DoorError("staleTask", `no reminding task ${id}`);
}
var REMINDERS = {
  list: (c) => new TaskReminders(c.rules, c.clock).ringing(c.tasks()).map(
    ({ key, startMinute, endMinute, start: start2, dayEnd, title, kind, date }) => ({
      id: key.raw,
      title,
      body: reminderTime(startMinute, endMinute),
      kind,
      date,
      startMs: start2.getTime(),
      dayEndMs: dayEnd.getTime()
    })
  ),
  complete: (c, [id]) => onReminder(c, id, (key) => c.rules.setStatus(key, "done")),
  /** The task stays on its time; it no longer reminds. */
  silence: (c, [id]) => onReminder(c, id, (key) => c.rules.setReminder(key, "none")),
  snooze: (c, [id, minutes]) => onReminder(c, id, (key) => c.rules.snooze(key, minutes))
};
var CAPTURE_LISTS = ["inbox", "now", "soon", "backlog"];
var CAPTURE = {
  add: (c, [list, typed2, recording, tag, project]) => {
    const title = captureTitle({ typed: typed2, recording: recording ?? null, tag: tag ?? "" });
    if (title === "") throw new DoorError("blank", "the task has no title");
    c.write((text) => c.rules.change(text, c.rules.placeNew(title, null, { kind: "list", list, group: null, before: null }, null, [], project ?? null)).text);
  },
  /** The New Task sheet's Project row for the project chosen (null: none; at the start, the view's `ScreenView.project`): the quick entry's Project button, its page and whether it is lit. */
  project: (c, [chosen]) => {
    const known = c.reads.projects();
    const name = chosen ?? null;
    return entryProject(isFolderRef(name, known) ? null : name, known);
  },
  lists: (c) => CAPTURE_LISTS.map((list) => ({ list, name: c.settings.sections[list] }))
};
var HISTORY = {
  undo: (c) => c.undo("undo"),
  redo: (c) => c.undo("redo"),
  canUndo: (c) => new UndoSteps(c.context.history).canUndo(),
  canRedo: (c) => new UndoSteps(c.context.history).canRedo()
};
var RULES = {
  nextProgress,
  sameSlot,
  sameRule: (a, b) => sameRule(a ?? null, b ?? null),
  repeatParts,
  editRepeat,
  repeatDraft: (day, rule) => repeatDraft(day, rule ?? null),
  samePlacement,
  keyId,
  sameLine,
  samePlace,
  sameTaskTree,
  fitLevel,
  gapOfPlace,
  levelRange,
  placeOfGap,
  shiftLevel,
  gapAt,
  groupPlaceOf,
  placeOfDrop: (cards, place, home) => placeOfDrop(cards, place, home ?? null),
  sameGap,
  listView: (items, sections, listSections) => listView(items, sections, listSections ?? []),
  sectionChoice,
  cardDue: (item, day) => cardDue(item, day ?? null),
  textParts,
  oneLine,
  sameLevels,
  labelTitle,
  sameLabels,
  isPresetColor,
  usableColor,
  usableLabelColor,
  acceptsDrop,
  placesInGap,
  noteTags,
  projectNotes: (notes, tag) => projectNotesOfTexts(notes, tag),
  projectsTakes: (view, cards, place) => projectsTakes(view, cards, place),
  projectsPlusTakes: (view, place) => projectsPlusTakes(view, place),
  projectsPlusPlace: (view, place) => projectsPlusPlace(view, place),
  projectsGap: (rows, gap, depth, lifted2) => projectsGap(rows, gap, depth, lifted2 ?? null),
  projectsLevels: (rows, gap, lifted2) => projectsLevels(rows, gap, lifted2 ?? null),
  projectsDrop: (rows, gap, shift, lifted2) => projectsDrop(rows, gap, shift, lifted2 ?? null),
  projectNodeOf,
  shadesOf,
  inkOf,
  contrast,
  eventHex,
  bgAlphaFor,
  eventColors: (hex, bgAlpha, theme) => eventColors(hex, bgAlpha ?? EVENT_BG_ALPHA, theme ?? "dark"),
  dayTitle,
  dueLabel,
  dayMonth,
  eventLevels,
  stackTasks,
  overlayLeft,
  eventLeft,
  stackCorner,
  timeParts,
  durationParts,
  pastEventPaint,
  parseZoomLevels,
  formatZoomLevels,
  levelsFor,
  gridAt,
  gridMarks,
  zoomAfterPinch: (hourPx, wholeDayPx, levels) => zoomAfterPinch(hourPx, wholeDayPx ?? null, levels),
  zoomShown: (saved, wholeDayPx, levels) => zoomShown(saved, wholeDayPx ?? null, levels),
  labelHidesNearNow: (y, nowY, lift, pillHeight) => labelHidesNearNow(y, nowY ?? null, lift, pillHeight),
  levelAt,
  carriedMiddle,
  placeAt: (cards, y, level, shift, room, heads, held, hysteresis) => placeAt(cards, y, level, shift, room ?? null, heads ?? [], held ?? null, hysteresis ?? 0),
  branchOf,
  gapBranch,
  swipeLanding,
  funnelPlaceShowing,
  funnelPlaceOf,
  endsSelection,
  stackedRows,
  stackedLists,
  sameNewPlace,
  viewEntryLists,
  viewContext: (node, mode, note, subprojects) => viewContext(node ?? null, mode, note === true, subprojects !== false),
  viewLayout: (mode, note, titles) => viewLayout(mode, note === true, (list) => titles?.[list] ?? null),
  layoutWidths,
  layoutShareAt,
  projectsEntryLook,
  wholeWidth,
  grownStart,
  listWidths,
  listShareOf,
  dividerAt,
  allColumnsWidths,
  allColumnsShare,
  allColumnsDividerAt,
  allColumnsWidthAt,
  repeatValue,
  repeatSentence,
  onTheDay,
  canPick,
  listCardMenuFrom,
  originOf,
  shownChange: (before, after) => shownChange(settingsOf(before), settingsOf(after)),
  undoNotice
};
var CONSTANTS = { PROJECTS_HOVER_MS, PROJECTS_INDENT, REMINDER_KINDS, MINUTES_PER_DAY, DESCRIPTION_TEMPLATE, PRIORITY_COLORS, CLEAR_COLOR, EVENT_BG_ALPHA, LISTS: GROUPED_LISTS, DEFAULT_ZOOM_LEVELS, DEFAULT_ZOOM_HOUR, SHOWN_LISTS, FUNNEL_PLACES, ROW_LISTS, VIEW_WORDS, SWIPE_FLICK_SPEED, CARD_HEIGHTS, CARD_GAPS, DEFAULT_CARD_SIZE, LIST_WIDTHS, REPEAT_WORDS, DIVIDER_SNAP, MOST_CARD_COLORS, NO_DAY_EVENTS };
var TIMELINE = {
  zoomLevels: (c) => zoomLevelsOf(c.context.settings?.trim() ? JSON.parse(c.context.settings) : null)
};
function lookOf(c, look) {
  return {
    cards: (column) => look.cards[column] ?? [],
    sections: (column) => look.sections?.[column] ?? [],
    sectioned: (column) => look.sectioned?.[column] ?? false,
    day: () => look.day,
    today: () => c.rules.today(),
    shown: () => look.shown,
    parts: (column) => look.parts?.[column] ?? [],
    filter: () => look.filter ?? null
  };
}
var ENTRY_METHODS = [
  "listEntry",
  "openAtEnd",
  "openFromPlus",
  "plusOpens",
  "openIn",
  "openSlot",
  "openAtDrop",
  "openAt",
  "subtaskSpot",
  "renameSpot",
  "stackSpot",
  "stackEntry",
  "open",
  "type",
  "setPriority",
  "togglePriority",
  "setLabels",
  "toggleLabel",
  "setRepeat",
  "setProject",
  "toggleProject",
  "openDescription",
  "typeDescription",
  "indent",
  "toggleSection",
  "enter",
  "blur",
  "escape",
  "choosePlace",
  "moveToEnd",
  "placeOf",
  "call",
  "unshown",
  "done",
  "job"
];
function entryCall(name) {
  return (c, [session, look, ...args]) => {
    const changes = [];
    const jobs = [];
    const kept = session ?? emptySession();
    const entry = new QuickEntry(c.reads, lookOf(c, look), kept, (state, drawnNext) => changes.push({ state, drawnNext: drawnNext === true }), (job) => jobs.push(job));
    let value;
    if (name === "state") value = entry.state;
    else if (name === "renaming") value = entry.renaming;
    else if (name === "shown") {
      const [id, created, coming] = args;
      entry.shown(id, created ?? null, (column) => coming?.[column] ?? []);
    } else value = entry[name](...args);
    return { session: entry.session, state: entry.state, changes, jobs, value: value === void 0 ? null : value, renamed: entry.renamed };
  };
}
var ENTRY = Object.fromEntries([...ENTRY_METHODS, "state", "renaming", "shown"].map((name) => [name, entryCall(name)]));
var SECTION_NAME = {
  end: (_c, [ended, event, text]) => sectionNameEnd(ended === true, event, text ?? "")
};
var REPEAT_PAGE = {
  end: (_c, [own, held]) => repeatPageEnd(own ?? null, held ?? null)
};
var DESCRIPTION = {
  open: (_c, [description]) => descriptionOpen(description ?? null),
  typed: (_c, [state]) => descriptionTyped(state),
  save: (_c, [state]) => descriptionSave(state),
  read: (_c, [state, description, editor]) => descriptionRead(state, description ?? null, editor)
};
var NOTES = {
  linkQuery: (_c, [text, caret]) => linkQuery(text, caret),
  suggest: (_c, [query, notes, limit]) => noteSuggestions(query, notes, limit ?? void 0),
  insert: (_c, [text, at, link]) => withNoteLink(text, at, link),
  open: (_c, [target, notes]) => noteOfLink(target, notes)
};
var PROJECTS = {
  noteUrl: (_c, [link, vault]) => noteUrl(link, vault)
};
function noteUrl(link, vault) {
  const file = link.split("|")[0].split("#")[0].trim();
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}
var SPACES = {
  tasks: { ...TASKS, ...KEPT_TASKS },
  days: { ...DAYS, stepScreen: (c, [from, shift]) => {
    const at = from;
    return stepFunnel({ mode: at.mode === "projects" ? "done" : at.mode, date: at.date }, shift, c.rules.today());
  } },
  boundary: BOUNDARY,
  calendars: CALENDARS,
  history: HISTORY,
  settings: SETTINGS,
  screenSettings: SCREEN_SETTINGS,
  entry: ENTRY,
  sectionName: SECTION_NAME,
  repeatPage: REPEAT_PAGE,
  description: DESCRIPTION,
  reminders: REMINDERS,
  capture: CAPTURE,
  timeline: TIMELINE,
  notes: NOTES,
  projects: PROJECTS,
  rules: { ...Object.fromEntries(Object.entries({ ...RULES, ...KEPT_RULES }).map(([name, fn]) => [name, (_c, args) => fn(...args)])), constants: () => CONSTANTS }
};

// core/application/PhoneDoor.ts
var SETTINGS_FILE = ".obsidian/plugins/task-calendar/data.json";

// agent/main.ts
var UsageError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var FILTERED = /* @__PURE__ */ new Set(["today", "day", "week", "soon", "inbox", "backlog", "all"]);
var CODES = /* @__PURE__ */ new Set(["tasksFileMissing", "unknownCommand", "badArgument", "unknownProject", "staleTask", "unknownTask"]);
async function runProgram(argv, agentFor2) {
  let pretty = argv.includes("--pretty");
  try {
    const parsed = parse(argv);
    pretty = parsed.pretty;
    const agent = await agentFor2({ vault: parsed.vault, subprojects: !parsed.noSubprojects });
    return { text: json(await answer(agent, parsed), pretty), code: 0 };
  } catch (e) {
    return { text: json(errorOf(e), pretty), code: 1 };
  }
}
function answer(agent, p) {
  const filter = { ...p.project !== void 0 && { project: p.project }, ...p.noProject && { noProject: true } };
  switch (p.command) {
    case "today":
      return none(p) ?? agent.today(filter);
    case "day":
      return agent.day(one2(p, "a day: YYYY-MM-DD, today, tomorrow, yesterday, +N or -N"), filter);
    case "week":
      if (p.words.length > 1) throw new UsageError("badArgument", "week takes this, next or a day");
      return agent.week({ ...p.words[0] !== void 0 && { which: p.words[0] }, ...p.days !== void 0 && { count: p.days } }, filter);
    case "soon":
      return none(p) ?? agent.soon(filter);
    case "inbox":
      return none(p) ?? agent.inbox(filter);
    case "backlog":
      return none(p) ?? agent.backlog(filter);
    case "all":
      return none(p) ?? agent.all(filter);
    case "projects":
      return none(p) ?? agent.projects();
    case "project":
      return agent.project(all(p, "a project's name"), p.done);
    case "search":
      return agent.search(all(p, "the text to search"));
    case "task":
      return agent.task(one2(p, "a task's ref"));
    case "help":
      return agent.help();
    default:
      throw new UsageError("unknownCommand", `no command ${JSON.stringify(p.command)}; run help`);
  }
}
function none(p) {
  if (p.words.length > 0) throw new UsageError("badArgument", `${p.command} takes no words: ${p.words.join(" ")}`);
  return null;
}
function one2(p, what) {
  if (p.words.length !== 1) throw new UsageError("badArgument", `${p.command} takes ${what}`);
  return p.words[0];
}
function all(p, what) {
  if (p.words.length === 0) throw new UsageError("badArgument", `${p.command} takes ${what}`);
  return p.words.join(" ");
}
function parse(argv) {
  const words = [];
  const flags = /* @__PURE__ */ new Set();
  const values = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) words.push(arg);
    else if (["--vault", "--project", "--days"].includes(arg)) {
      const value = argv[++i];
      if (value === void 0) throw new UsageError("badArgument", `${arg} takes a value`);
      values.set(arg, value);
    } else if (["--pretty", "--no-subprojects", "--no-project", "--done"].includes(arg)) flags.add(arg);
    else throw new UsageError("badArgument", `no option ${arg}; run help`);
  }
  const command = words.shift() ?? "help";
  const days = values.get("--days");
  const parsed = {
    command,
    words,
    vault: values.get("--vault") ?? null,
    ...values.has("--project") && { project: values.get("--project") },
    noProject: flags.has("--no-project"),
    noSubprojects: flags.has("--no-subprojects"),
    pretty: flags.has("--pretty"),
    ...days !== void 0 && { days: /^\d+$/.test(days) ? Number(days) : Number.NaN },
    done: flags.has("--done")
  };
  if ((parsed.project !== void 0 || parsed.noProject) && !FILTERED.has(command)) throw new UsageError("badArgument", `${command} takes no project filter`);
  if (parsed.noSubprojects && parsed.project === void 0 && command !== "project") throw new UsageError("badArgument", "--no-subprojects goes with --project or project");
  if (days !== void 0 && command !== "week") throw new UsageError("badArgument", "--days goes with week");
  if (parsed.done && command !== "project") throw new UsageError("badArgument", "--done goes with project");
  return parsed;
}
function errorOf(e) {
  const code = e.code;
  const message = e instanceof Error ? e.message : String(e);
  const candidates = e.candidates;
  if (typeof code === "string" && CODES.has(code)) return { error: { code, message, ...candidates !== void 0 && { candidates } } };
  return { error: { code: "failed", message } };
}
function json(value, pretty) {
  return JSON.stringify(value, null, pretty ? 2 : void 0);
}

// agent/nodePorts.ts
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
var ReadOnlyError = class extends Error {
  constructor(what) {
    super(`obsidian-task-calendar reads only: ${what}`);
    this.name = "ReadOnlyError";
  }
};
async function textOf(path) {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
var ReadOnlyTaskFile = class {
  constructor(path) {
    this.path = path;
    this.text = null;
    this.disk = null;
  }
  read() {
    return this.text ??= this.stored();
  }
  /** The file as the disk has it, whatever the tidy made of it in memory. */
  stored() {
    return this.disk ??= this.path === null ? Promise.resolve(null) : textOf(this.path);
  }
  async write(fn) {
    const text = await this.read();
    if (text === null) throw new TasksFileMissingError(this.path ?? "");
    this.text = Promise.resolve(fn(text));
  }
  async create() {
    throw new ReadOnlyError("the tasks file is never created");
  }
  onChange() {
    return () => void 0;
  }
};
async function settingsAt(path) {
  const text = await textOf(path);
  const settings = text === null ? DEFAULT_SETTINGS : settingsFrom(JSON.parse(text));
  return {
    get: () => settings,
    update: async () => {
      throw new ReadOnlyError("the settings are never written");
    },
    onChange: () => () => void 0
  };
}
function calendarFileAt(vault, source, settings) {
  return {
    name: source,
    read: async () => {
      const path = join(vault, calendarPath(source, settings.get()));
      const exists = await stat(path).catch(() => null);
      if (!exists) throw new SourceProblemError({ kind: "fileMissing" }, "file missing");
      return readCalendarFile(await readFile(path, "utf8"), source);
    },
    onChange: () => () => void 0
  };
}
var NO_TICKS = { every: () => () => void 0 };
function nodeTimers() {
  const running = /* @__PURE__ */ new Map();
  let next = 1;
  return {
    set: (fn, ms) => {
      const id = next++;
      const timer = setTimeout(() => {
        running.delete(id);
        fn();
      }, ms);
      timer.unref();
      running.set(id, timer);
      return id;
    },
    clear: (id) => {
      clearTimeout(running.get(id));
      running.delete(id);
    }
  };
}
var NO_NOTES = { list: () => [], ready: () => false, onChange: () => () => void 0 };
function runProjectsScreen(subprojects) {
  let state = { subprojects, doneOpen: true, folded: [] };
  return { get: () => state, set: (next) => state = next };
}

// agent/compose.ts
var DEFAULT_VAULT = join2(homedir(), "Obsidian");
function vaultOf(program) {
  if (!program || !existsSync(program)) return DEFAULT_VAULT;
  for (let dir = dirname(realpathSync(program)); dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join2(dir, ".obsidian"))) return dir;
  }
  return DEFAULT_VAULT;
}
async function composeAgent(host) {
  const settings = await settingsAt(join2(host.vault, SETTINGS_FILE));
  const tasksPath = tasksFilePath(settings.get());
  const tasksFile = new ReadOnlyTaskFile(tasksPath === null ? null : join2(host.vault, tasksPath));
  const core = composeCore({
    tasksFile,
    storedTasks: () => tasksFile.stored(),
    settings,
    clock: host.clock ?? systemClock,
    ticker: NO_TICKS,
    timers: nodeTimers(),
    calendarFiles: { google: calendarFileAt(host.vault, "google", settings), iphone: calendarFileAt(host.vault, "iphone", settings), work: calendarFileAt(host.vault, "work", settings) },
    feeds: [],
    work: { export: () => void 0 },
    isPhone: () => false,
    projects: NO_NOTES,
    projectsScreen: runProjectsScreen(host.subprojects)
  });
  return core.agent;
}
function agentFor(clock, vault = DEFAULT_VAULT) {
  return (options) => composeAgent({ vault: options.vault ?? vault, subprojects: options.subprojects, ...clock && { clock } });
}
async function start(argv = process.argv.slice(2)) {
  const { text, code } = await runProgram(argv, agentFor(void 0, vaultOf(process.argv[1])));
  process.stdout.write(`${text}
`);
  process.exitCode = code;
}

// agent/obsidian-task-calendar.ts
await start();
