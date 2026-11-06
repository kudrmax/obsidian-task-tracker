// Task Calendar: built from src/phone by `node phone/build.mjs`. Do not edit.
"use strict";
(() => {
  // src/domain/LocalDate.ts
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
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return formatUtc(d) === s;
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
  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
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

  // src/domain/Label.ts
  function usableLabelName(name) {
    return /^[^\s#]+$/.test(name);
  }
  function usableLabels(labels) {
    return labels.filter((label, i) => usableLabelName(label.name) && labels.findIndex((l) => l.name === label.name) === i);
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

  // src/domain/Priority.ts
  function usablePrefix(prefix) {
    return /^\S+$/.test(prefix);
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
  function isBlankTitle(text, prefixes) {
    return priorityOfText(text, prefixes).text.trim() === "";
  }

  // src/settings.ts
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
    labelTag: "label",
    labels: [],
    groups: { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" }
  };
  function settingsFrom(saved) {
    const s = saved ?? {};
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      sections: { ...DEFAULT_SETTINGS.sections, ...s.sections ?? {} },
      google: { ...DEFAULT_SETTINGS.google, ...s.google ?? {} },
      groups: { ...DEFAULT_SETTINGS.groups, ...s.groups ?? {} }
    };
  }

  // src/application/calendarFile.ts
  var GOOGLE_CALENDAR_FILE = "calendar/google.json";
  var IPHONE_CALENDAR_FILE = "calendar/iphone.json";
  var CALENDAR_SOURCES = ["google", "iphone", "work"];
  function calendarPath(source, settings) {
    if (source === "google") return GOOGLE_CALENDAR_FILE;
    if (source === "iphone") return IPHONE_CALENDAR_FILE;
    return settings.workCalendarFile;
  }
  var DEFAULT_COLOR = { google: "#4285F4", iphone: "#0A84FF", work: "#0A84FF" };
  var dateOrNull = (text) => text ? new Date(text) : null;
  function readCalendarFile(text, source) {
    const content = JSON.parse(text);
    const events = (content.events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      start: new Date(e.start),
      end: new Date(e.end),
      allDay: e.allDay,
      calendar: e.calendar,
      color: e.color ?? DEFAULT_COLOR[source],
      source,
      account: e.account ?? null,
      calendarId: e.calendarId ?? null
    }));
    const listed2 = content.calendars ?? eventCalendars(content.events ?? []);
    return {
      events,
      calendars: listed2.map((c) => ({ title: c.calendar, account: c.account ?? null, calendarId: c.calendarId ?? null, color: c.color ?? null, ...c.sourceId ? { sourceId: c.sourceId } : {} })),
      exportedAt: new Date(content.exportedAt),
      device: content.device ?? null,
      from: dateOrNull(content.from),
      to: dateOrNull(content.to),
      validUntil: dateOrNull(content.validUntil)
    };
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

  // src/domain/DayBoundary.ts
  var HOUR_MINUTES2 = 60;
  var DAY_HOURS = MINUTES_PER_DAY / HOUR_MINUTES2;
  var MIN_SLOT_MINUTES = 5;
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
    clipToDay(day, start, end) {
      return { start: Math.max(0, this.offsetOf(day, start)), end: Math.min(MINUTES_PER_DAY, this.offsetOf(day, end)) };
    }
    /** Minutes from the start of `day` to the start and the end of `slot`. */
    spanOf(slot, day) {
      const start = this.offsetOfClock(day, slot.date, slot.start);
      return { start, end: slot.end === null ? null : start + slot.end - slot.start };
    }
    /** The slot that takes the minutes from `start` to `end` past the start of `day`, at the clock's date and time. */
    slotAt(day, start, end) {
      const clock = this.startMinute + start;
      const nextDay = clock >= MINUTES_PER_DAY;
      const slotStart = nextDay ? clock - MINUTES_PER_DAY : clock;
      return { date: nextDay ? addDays(day, 1) : day, start: slotStart, end: end === null ? null : slotStart + end - start };
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
      let { start, end } = span;
      if (start < 0) {
        end -= start;
        start = 0;
      }
      end = Math.min(Math.max(end, stepMinutes), MINUTES_PER_DAY);
      start = Math.max(0, Math.min(start, end - stepMinutes));
      return this.slotAt(day, start, end);
    }
    dayOfClock(date, minutes) {
      return minutes < this.startMinute ? addDays(date, -1) : date;
    }
    offsetOfClock(day, date, minutes) {
      return daysBetween(day, date) * MINUTES_PER_DAY + minutes - this.startMinute;
    }
  };

  // src/application/calendarDays.ts
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
    touches(e, start, end) {
      const overlaps = e.start < end && e.end > start;
      const startsInside = e.start >= start && e.start < end;
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
      return { events: chosen.events.filter((e) => span.shows(e)), stale: chosen.stale };
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

  // src/application/calendarChoice.ts
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
        (a, b) => Number(b.google) - Number(a.google) || byAccount(a.key.account, b.key.account) || a.key.title.localeCompare(b.key.title)
      );
    }
    day(start, end) {
      const events = [];
      let stale = false;
      for (const calendar of this.known()) {
        if (this.hidden.has(keyText(calendar.key))) continue;
        const source = this.sourceFor(calendar, start);
        if (source === null) continue;
        const file = this.files.get(source);
        if (!this.fresh(file)) stale = true;
        const text = keyText(calendar.key);
        events.push(...file.events.filter((e) => keyText(this.keyOf(source, calendarOf(e))) === text && e.start < end && e.end > start));
      }
      return { events: events.sort((a, b) => a.start.getTime() - b.start.getTime()), stale };
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
    return a.localeCompare(b);
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

  // src/application/calendarMigration.ts
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

  // src/application/shownCalendars.ts
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

  // src/domain/Days.ts
  function dayColumn(day, today) {
    if (day === today) return { list: "now", date: null, sections: true };
    return day > today ? { list: "soon", date: day, sections: true } : { list: "now", date: day, sections: false };
  }

  // src/domain/Task.ts
  function isOpen(status) {
    return status === "todo" || status === "inProgress";
  }
  var DEFAULT_REMINDER = "live";
  var STATUS_CHARS = {
    todo: " ",
    inProgress: "/",
    done: "x",
    cancelled: "-"
  };

  // src/domain/description.ts
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

  // src/domain/Repeat.ts
  var WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var RULE_RE = /^every(?: (\d+))? (day|week|month)(s)?(?: (when done)| on (.+?))?(?: from (\d{4}-\d{2}-\d{2}))?$/;
  var ORDINAL_RE = /^the (\d{1,2})(?:st|nd|rd|th)$/;
  function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
    return `${n}${suffix}`;
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
    static parse(text) {
      const m = RULE_RE.exec(text.trim());
      if (!m) return null;
      const [, count, unit, plural, whenDone, on, from] = m;
      const every = count === void 0 ? 1 : Number(count);
      if (every < 1 || count !== void 0 && every === 1) return null;
      if (from !== void 0 && (every === 1 || !isValidLocalDate(from))) return null;
      if (plural !== void 0 !== every > 1) return null;
      const rule = { every, unit, days: [], dayOfMonth: null, from: from ?? null };
      if (whenDone !== void 0) {
        return from === void 0 ? new _Repeat({ ...rule, kind: "afterDone" }) : null;
      }
      if (every > 1 && from === void 0) return null;
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
      const { kind, every, unit, days, dayOfMonth, from } = this.rule;
      const head = every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
      if (kind === "afterDone") return `${head} when done`;
      const on = unit === "week" ? ` on ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}` : unit === "month" ? ` on the ${ordinal(dayOfMonth ?? 1)}` : "";
      return `${head}${on}${from ? ` from ${from}` : ""}`;
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
      const { kind, every } = this.rule;
      return kind === "schedule" && every > 1 ? new _Repeat({ ...this.rule, from: date }) : this;
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

  // src/domain/TaskLine.ts
  var LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
  var DATE = "(\\d{4}-\\d{2}-\\d{2})";
  var TIME = "(\\d{2}:\\d{2})";
  function statusOf(char) {
    for (const status of Object.keys(STATUS_CHARS)) {
      if (STATUS_CHARS[status] === char) return status;
    }
    return "todo";
  }
  function escapeRegExp2(s) {
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
      const alternatives = [...this.kinds.keys()].map(escapeRegExp2).join("|");
      this.slotRe = new RegExp(`(?:^|\\s+)(${alternatives})\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
      this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp2(markers.dueDate)}\\s+${DATE}$`);
      this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp2(markers.repeat)}\\s+(.+?)$`) : null;
      this.collapsedRe = markers.collapsed ? new RegExp(`(?:^|\\s+)${escapeRegExp2(markers.collapsed)}$`) : null;
    }
    slice(body) {
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
          const parsed = Repeat.parse(repeatMatch[1]);
          if (!parsed) break;
          repeat = parsed;
          text = text.slice(0, repeatMatch.index);
          continue;
        }
        break;
      }
      return { text: text.trim(), dueDate, slot, reminder, repeat, collapsed };
    }
    slotOf(m) {
      const date = m[2];
      const start = parseHHMM(m[3]);
      if (!isValidLocalDate(date) || start === null || start >= MINUTES_PER_DAY) return null;
      if (m[4] === void 0) return { date, start, end: null };
      const end = parseHHMM(m[4]);
      if (end === null || start === end) return null;
      return { date, start, end: end < start ? end + MINUTES_PER_DAY : end };
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
  function parseTaskLine(line, markers) {
    const m = LINE_RE.exec(line);
    if (!m) return null;
    const statusChar = m[3];
    const tagged = labelsOfText(m[4], markers.labelTag ?? "", markers.labels ?? []);
    const fields = fieldSlicerFor(markers).slice(tagged.text);
    return {
      indent: m[1],
      bullet: m[2],
      task: { status: statusOf(statusChar), statusChar, ...fields, ...priorityOfText(fields.text, markers.priorities ?? []), labels: tagged.labels, children: [] }
    };
  }
  function formatTaskLine(parsed, markers) {
    const { indent, bullet, task } = parsed;
    let line = `${indent}${bullet} [${task.statusChar}] ${task.priority ? `${task.priority} ` : ""}${task.text}`;
    if (task.labels.length > 0 && markers.labelTag) line += labelTags(markers.labelTag, task.labels);
    if (task.collapsed && markers.collapsed) line += ` ${markers.collapsed}`;
    if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
    if (task.slot) {
      const { date, start, end } = task.slot;
      line += ` ${markerOf(task.reminder, markers)} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > MINUTES_PER_DAY ? end - MINUTES_PER_DAY : end)}`}`;
    }
    if (task.repeat && markers.repeat) line += ` ${markers.repeat} ${task.repeat.format()}`;
    return line;
  }

  // src/domain/TaskDocument.ts
  function ungroupedIndex(groups) {
    for (let i = groups.length - 1; i > 0; i--) if (groups[i].name === null) return i;
    return 0;
  }
  var SECTION_KEYS = ["inbox", "backlog", "now", "soon", "done"];
  var LIST_END_RE = /^#{1,2}(\s|$)/;
  var GROUP_HEADING_RE = /^###\s+(.*?)\s*$/;
  var SECTION_HEADING_RE = /^##\s+(.*?)\s*$/;
  var INDENT_RE2 = /^[ \t]*/;
  var DEFAULT_INDENT_UNIT = "	";
  function indentWidth(line) {
    return INDENT_RE2.exec(line)[0].length;
  }
  function sameTask(a, b) {
    return a.status === b.status && a.statusChar === b.statusChar && a.text === b.text && a.dueDate === b.dueDate && a.priority === b.priority && a.labels.length === b.labels.length && a.labels.every((label, i) => label === b.labels[i]) && (a.repeat?.format() ?? null) === (b.repeat?.format() ?? null) && a.slot?.date === b.slot?.date && a.slot?.start === b.slot?.start && a.slot?.end === b.slot?.end && a.reminder === b.reminder && a.collapsed === b.collapsed && sameLines(a.children, b.children);
  }
  function insertedLines(before, after) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0;
    while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
    const a = before.slice(start, before.length - end);
    const b = after.slice(start, after.length - end);
    const width = b.length + 1;
    const common = new Int32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        common[i * width + j] = a[i] === b[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
      }
    }
    const inserted = /* @__PURE__ */ new Set();
    for (let i = 0, j = 0; j < b.length; ) {
      if (i < a.length && a[i] === b[j] && common[i * width + j] === common[(i + 1) * width + j + 1] + 1) {
        i++;
        j++;
      } else if (i < a.length && common[(i + 1) * width + j] === common[i * width + j]) i++;
      else inserted.add(start + j++);
    }
    for (const line of [...inserted].sort((x, y) => x - y)) {
      let at = line;
      while (at > 0 && !inserted.has(at - 1) && after[at - 1] === after[at]) {
        inserted.delete(at);
        inserted.add(--at);
      }
    }
    return inserted;
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
  function reindented(lines, from, to) {
    if (from === to) return [...lines];
    return lines.map((line) => line.startsWith(from) ? to + line.slice(from.length) : line);
  }
  var TaskDocument = class _TaskDocument {
    constructor(lines, eol, trailingEol, names, markers) {
      this.lines = lines;
      this.eol = eol;
      this.trailingEol = trailingEol;
      this.names = names;
      this.markers = markers;
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
    static parse(text, sections, markers) {
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const trailingEol = text.endsWith(eol);
      const body = trailingEol ? text.slice(0, -eol.length) : text;
      const lines = body === "" && text === "" ? [] : body.split(eol);
      return new _TaskDocument(lines, eol, trailingEol, sections, markers);
    }
    static empty(all) {
      return _TaskDocument.parse("", { inbox: "", now: "", soon: "", done: "" }, { dueDate: "", slot: "" }).ensureSections(all).serialize();
    }
    /** The prefixes of the priority levels the file is read with. */
    priorityPrefixes() {
      return this.markers.priorities ?? [];
    }
    serialize() {
      return this.lines.join(this.eol) + (this.trailingEol ? this.eol : "");
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
    /**
     * The task a change inserted into `before`, wherever the rules then moved it: the task line an ordered diff of the
     * two documents finds only here. The headings keep a twin in another section apart; of identical lines side by side
     * it gives the first.
     */
    insertedSince(before) {
      const inserted = insertedLines(before.lines, this.lines);
      return flatten(this.allTasks()).find((entry) => inserted.has(this.lineOf(entry)));
    }
    insert(section, position, task) {
      const line = this.insertionLine(section, position);
      return this.withLines(this.splice(line, 0, this.linesOf("", "-", task)));
    }
    replace(entry, task) {
      const span = this.spanOf(entry);
      if (sameTask(entry.task, task)) return this;
      return this.withLines(this.splice(span.line, span.lineCount, this.linesOf(entry.indent, entry.bullet, task)));
    }
    /**
     * Each entry of this document becomes its task, as `replace` one after another would, in one rewrite. Only the task's
     * own line changes unless its description and subtasks do; those rewritten lines may not hold another change.
     */
    replaceAll(changes) {
      const edits = [];
      for (const [entry, task] of changes) {
        const span = this.spanOf(entry);
        if (sameTask(entry.task, task)) continue;
        const own = sameLines(entry.task.children, task.children);
        edits.push(
          own ? { line: span.line, count: 1, lines: [formatTaskLine({ indent: entry.indent, bullet: entry.bullet, task }, this.markers)] } : { line: span.line, count: span.lineCount, lines: this.linesOf(entry.indent, entry.bullet, task) }
        );
      }
      if (edits.length === 0) return this;
      edits.sort((a, b) => b.line - a.line);
      const lines = [...this.lines];
      let below = lines.length;
      for (const edit of edits) {
        if (edit.line + edit.count > below) throw new Error(`Changes overlap at line ${edit.line + 1}`);
        lines.splice(edit.line, edit.count, ...edit.lines);
        below = edit.line;
      }
      return this.withLines(lines);
    }
    /** The last task taken out of a section takes the section away, unless something but blank lines is left under it. */
    removeEntry(entry) {
      const span = this.spanOf(entry);
      return this.leftBy(entry, this.withLines(this.splice(span.line, span.lineCount, [])));
    }
    /** A subtask moved here leaves its task and becomes a task of `section`. The section it leaves empty goes, as with `removeEntry`. */
    moveEntry(entry, section, position) {
      const span = this.spanOf(entry);
      const moved = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, "");
      const without = this.withLines(this.splice(span.line, span.lineCount, []));
      const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
      return this.leftBy(entry, without.withLines(without.splice(target, 0, moved)));
    }
    /** An empty `### name` before group `before`; `before` equal to the number of groups puts it last. */
    addGroup(section, name, before) {
      if (before < 1) throw new Error("No group goes above the tasks outside any section");
      return this.withLines(this.splice(this.groupStartLine(section, before), 0, [`### ${name}`]));
    }
    /**
     * The `moved` tasks of group `index`, with their subtasks and in their order, go under a new `### name` right after the
     * group's last line that stays; the rest of the group stays as it is, even when nothing is left in it. Nothing to move is `addGroup` after the group.
     */
    splitGroup(section, index, name, moved) {
      if (moved.length === 0) return this.addGroup(section, name, index + 1);
      const block = this.blockOf(section, index);
      const spans = moved.map((entry) => this.spanOf(entry));
      const inMoved = (line) => spans.some((span) => line >= span.line && line < span.line + span.lineCount);
      let at = block.end;
      while (at > block.start && (this.lines[at - 1].trim() === "" || inMoved(at - 1))) at--;
      if (at === block.start) at = Math.min(...spans.map((span) => span.line));
      const lines = moved.flatMap((entry, i) => reindented(this.lines.slice(spans[i].line, spans[i].line + spans[i].lineCount), entry.indent, ""));
      const kept = this.lines.filter((_, line) => !inMoved(line));
      kept.splice(at - spans.filter((span) => span.line < at).reduce((sum, span) => sum + span.lineCount, 0), 0, `### ${name}`, ...lines);
      return this.withLines(kept);
    }
    /** Group `from` goes before group `before`. The top block moved down gets the heading of the tasks outside any section. */
    moveGroup(section, from, before) {
      if (before < 1) throw new Error("No group goes above the tasks outside any section");
      if (before === from || before === from + 1) return this;
      const block = this.blockOf(section, from);
      const content = this.contentOf(block);
      const core = this.lines.slice(block.headingLine ?? content.first, content.last);
      if (block.headingLine === null) core.unshift(`### ${this.ungroupedName()}`);
      const cut = this.cutOf(section, from);
      const apart2 = Array(cut.to - cut.from - (content.last - (block.headingLine ?? content.first))).fill("");
      const last = before === this.blockLists.get(section).length;
      const moved = last ? [...apart2, ...core] : [...core, ...apart2];
      return this.withLines(this.cutAndInsert(cut, this.groupStartLine(section, before), moved));
    }
    renameGroup(section, index, name) {
      const line = this.blockOf(section, index).headingLine;
      if (line === null) throw new Error("The tasks outside any section have no heading");
      return this.withLines(this.splice(line, 1, [`### ${name}`]));
    }
    /** What group `from` holds goes to the start or the end of the tasks of group `into`; the heading of `from` goes. */
    mergeGroup(section, from, into, at) {
      if (from === into) throw new Error("A group merges into another one");
      const content = this.contentOf(this.blockOf(section, from));
      const moved = this.lines.slice(content.first, content.last);
      return this.withLines(this.cutAndInsert(this.cutOf(section, from), this.groupInsertionLine(section, into, at), moved));
    }
    /** A group with nothing but blank lines goes, its blank lines with it unless they part the list from the next one. */
    deleteGroup(section, index) {
      const group = this.groups(section)[index];
      const block = this.blockOf(section, index);
      if (!group?.blank || block.headingLine === null) throw new Error("Only an empty section is deleted");
      const cut = this.cutOf(section, index);
      return this.withLines(this.splice(cut.from, cut.to - cut.from, []));
    }
    /** Puts the entry with its subtasks among `parent`'s subtasks, right before `before` (one of them) or last. */
    nestEntry(entry, parent, before) {
      if (contains(entry, parent)) throw new Error(`A task cannot go under itself: ${entry.raw}`);
      const span = this.spanOf(entry);
      const target = before ? this.spanOf(before).line : this.endOf(parent);
      const moved = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, this.childIndent(parent));
      const without = this.splice(span.line, span.lineCount, []);
      without.splice(target > span.line ? target - span.lineCount : target, 0, ...moved);
      return this.leftBy(entry, this.withLines(without));
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
      return this.withLines(this.splice(line, 0, this.linesOf(this.childIndent(parent), parent.bullet, task)));
    }
    ensureSections(all) {
      const present = new Set(this.headingNames());
      const missing = all.filter((name) => !present.has(name));
      if (missing.length === 0) return this;
      const lines = [...this.lines];
      for (const name of missing) {
        if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
        lines.push(`## ${name}`);
      }
      return new _TaskDocument(lines, this.eol, true, this.names, this.markers);
    }
    /** Under each list's heading one blank line, then what is under it; a heading with nothing below it stays as it is. */
    spacedHeadings() {
      const headings = [...this.sections.values()].map((s) => s.headingLine).sort((a, b) => b - a);
      let lines = null;
      for (const heading of headings) {
        const current = lines ?? this.lines;
        let filled = heading + 1;
        while (filled < current.length && current[filled].trim() === "") filled++;
        if (filled === current.length || filled === heading + 2 && current[heading + 1] === "") continue;
        lines ??= [...this.lines];
        lines.splice(heading + 1, filled - heading - 1, "");
      }
      return lines ? this.withLines(lines) : this;
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
    withLines(lines) {
      return new _TaskDocument(lines, this.eol, this.trailingEol, this.names, this.markers);
    }
    splice(start, deleteCount, insert) {
      const lines = [...this.lines];
      lines.splice(start, deleteCount, ...insert);
      return lines;
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
      const start = block.headingLine ?? content.first;
      if (index < this.blockLists.get(section).length - 1) return { from: start, to: block.end };
      let from = start;
      const top = this.sections.get(section).firstLine;
      while (from > top && this.lines[from - 1].trim() === "") from--;
      return { from, to: Math.max(start, content.last) };
    }
    /** Removes the cut and puts `moved` in at `target`, a line of the document before the cut. */
    cutAndInsert(cut, target, moved) {
      const size = cut.to - cut.from;
      const lines = this.splice(cut.from, size, []);
      lines.splice(target >= cut.to ? target - size : Math.min(target, cut.from), 0, ...moved);
      return lines;
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
        if (LIST_END_RE.test(this.lines[i])) return i;
      }
      return this.lines.length;
    }
    findBlocks(section) {
      const blocks = [];
      let name = null;
      let headingLine = null;
      let start = section.firstLine;
      for (let i = section.firstLine; i <= section.endLine; i++) {
        const m = i < section.endLine ? GROUP_HEADING_RE.exec(this.lines[i]) : null;
        if (!m && i < section.endLine) continue;
        blocks.push({ name, headingLine, start, end: i });
        if (!m) break;
        name = m[1] === this.names.ungrouped ? null : m[1];
        headingLine = i;
        start = i + 1;
      }
      return blocks;
    }
    /** A block's tasks, numbered on from the tasks of the blocks above it in `entries`. */
    readGroup(key, block, index, entries, spans) {
      const blank2 = this.lines.slice(block.start, block.end).every((line) => line.trim() === "");
      const own = this.readLevel(key, block.start, block.end, null, block.name, entries.length, spans);
      entries.push(...own);
      return { index, name: block.name, heading: block.headingLine !== null, entries: own, blank: blank2 };
    }
    /** The task lines from `from` to `end` that no task line above them in that range holds, each with its own subtasks. */
    readLevel(section, from, end, parent, group, firstIndex, spans) {
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
        const subtasks = this.readLevel(section, i + 1, i + 1 + children.length, place, group, 0, spans);
        const entry = { section, ...place, raw, indent: parsed.indent, bullet: parsed.bullet, task: { ...parsed.task, children }, group, subtasks };
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

  // src/domain/queries.ts
  function slottedOnDate(entry, date, boundary) {
    return entry.task.slot !== null && boundary.dayOfSlot(entry.task.slot) === date;
  }
  function listed(doc) {
    return [...doc.tasks("now"), ...doc.tasks("soon")];
  }
  function dayList(doc, date, today, boundary = DayBoundary.MIDNIGHT) {
    const shown = (e) => date === today ? e.section === "now" || e.task.dueDate === date : e.task.dueDate === date;
    return listed(doc).filter((e) => shown(e) && !slottedOnDate(e, date, boundary));
  }
  function openSlotted(doc) {
    return listed(doc).filter((e) => e.task.slot !== null && isOpen(e.task.status));
  }
  function soonWithoutDate(doc) {
    return doc.tasks("soon").filter((e) => e.task.dueDate === null && e.task.slot === null);
  }
  function columnList(column, today) {
    if (column.kind !== "day") return column.kind;
    const day = dayColumn(column.date, today);
    return day.sections ? day.list : null;
  }
  function columnGroups(doc, column, today, boundary = DayBoundary.MIDNIGHT) {
    const list = columnList(column, today);
    if (list === null) return [];
    const shown = column.kind === "day" ? dayList(doc, column.date, today, boundary) : column.kind === "soon" ? soonWithoutDate(doc) : doc.tasks(list);
    const groups = doc.groups(list);
    const ungrouped = ungroupedIndex(groups);
    const others = shown.filter((e) => e.section !== list);
    return groups.map((g) => ({ list, index: g.index, name: g.name, entries: [...g.index === ungrouped ? others : [], ...shown.filter((e) => e.section === list && g.entries.includes(e))] })).filter((g, i) => g.entries.length > 0 || groups[i].heading && g.name !== null && groups[i].entries.length === 0);
  }

  // src/domain/TaskText.ts
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
      const part = SCHEME_RE.test(href) ? { kind: "url", label: g.label, target: href } : { kind: "note", label: g.label, target: decoded(href) };
      return { part, rest: "" };
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

  // src/application/TaskReminders.ts
  var HOUR_MINUTES3 = 60;
  function clockOf(date, minutes) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 0, minutes);
  }
  function keyOf(entry) {
    return { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw };
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
    act(text, line, action2) {
      const at = this.rules.moment();
      const found = this.find(this.rules.read(text, at).doc, line);
      if (found) return this.rules.change(text, action2(found), at).text;
      const asRead = this.find(this.rules.asRead(text, at), line);
      return asRead ? this.rules.changeAsRead(text, action2(asRead), at).text : null;
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
        start: clockOf(slot.date, slot.start),
        dayEnd: clockOf(nextDay, at.boundary.startHour * HOUR_MINUTES3)
      };
    }
  };

  // src/domain/Marks.ts
  function marksOf(priority, labels) {
    return { priority, labels: priority === null ? labels : [] };
  }
  function markChoices(marks) {
    return { priority: marks.labels.length === 0, labels: marks.priority === null };
  }
  function typedMarks(text, priority, labels, prefixes) {
    const typed2 = priority === null ? priorityOfText(text, prefixes) : { text, priority };
    return { text: typed2.text, ...marksOf(typed2.priority, labels) };
  }

  // src/domain/TaskTitle.ts
  var LINE_BREAK = /\s*(?:\r\n|[\n\r\u2028\u2029])\s*/gu;
  function oneLine(text) {
    return text.replace(LINE_BREAK, " ");
  }
  function taskTitle(text) {
    return oneLine(text).trim();
  }

  // src/domain/operations.ts
  var HOUR_MINUTES4 = 60;
  var MINUTE_MS2 = 6e4;
  function newTask(text, patch2 = {}) {
    return { status: "todo", statusChar: STATUS_CHARS.todo, text: taskTitle(text), dueDate: null, slot: null, reminder: DEFAULT_REMINDER, repeat: null, priority: null, labels: [], collapsed: false, children: [], ...patch2 };
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
  function samePlace(a, b) {
    return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
  }
  function leavingItsTask(operation) {
    return (doc, entry, ...rest) => {
      if (entry.path.length === 0) return operation(doc, entry, ...rest);
      const moved = doc.moveEntry(entry, entry.section, "end");
      const ungrouped = moved.groups(entry.section)[ungroupedIndex(moved.groups(entry.section))].entries;
      return operation(moved, ungrouped[ungrouped.length - 1], ...rest);
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
  function createAtTime(doc, date, today, start, text, boundary = DayBoundary.MIDNIGHT) {
    return createInSlot(doc, { date, start, end: null }, text, marksOf(null, []), today, boundary);
  }
  function setStatus(doc, entry, status) {
    return patch(doc, entry, { status, statusChar: STATUS_CHARS[status] });
  }
  function anchoredRepeat(rule, date) {
    return Repeat.of(rule.kind === "schedule" && rule.every > 1 ? { ...rule, from: date } : rule);
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
  function remove(doc, entry) {
    return doc.removeEntry(entry);
  }
  function moveBefore(doc, entry, before, date, today) {
    if (before === null) return moveInto(doc, entry, listSection(date, today), "end", today);
    if (samePlace(before, entry)) return doc;
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
    const folded = entry.path.map((_, depth) => doc.find(entry.section, entry.index, entry.path.slice(0, depth))).filter((above) => above.task.collapsed);
    return doc.replaceAll(folded.map((above) => [above, { ...above.task, collapsed: false }]));
  }
  function intoUnfolded(doc, parent, operation) {
    if (!parent.task.collapsed) return operation(doc, (entry) => entry);
    const opened = patch(doc, parent, { collapsed: false });
    return operation(opened, (entry) => sameEntryIn(opened, entry));
  }
  function nest(doc, entry, parent, before) {
    if (before && samePlace(before, entry)) return doc;
    return intoUnfolded(doc, parent, (d, same) => d.nestEntry(same(entry), same(parent), before && same(before)));
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
    return intoUnfolded(doc, parent, (d, same) => d.insertUnder(same(parent), task));
  }
  function placeOnTimeline(doc, entry, slot, today, boundary = DayBoundary.MIDNIGHT) {
    const clamped = boundary.clamp(slot, MIN_SLOT_MINUTES);
    if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
    const slotted = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
    return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
  }
  function clearSlot(doc, entry) {
    return patch(doc, entry, { slot: null });
  }
  function snoozedSlot(slot, now, minutes) {
    const at = new Date(now.getTime() + minutes * MINUTE_MS2);
    const start = at.getHours() * HOUR_MINUTES4 + at.getMinutes();
    return { date: localDateOf(at), start, end: slot.end === null ? null : start + (slot.end - slot.start) };
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
      return doc.insert(section, "end", withDraftRepeat(newTask(text, { dueDate, slot: unsorted ? null : slot ?? null, ...marks }), draft, today, boundary));
    }
    if (entry.path.length > 0) return placeSubtask(doc, entry, draft, today, boundary);
    const same = samePlacement(placementOfEntry(entry, today), draft.placement);
    const changed = { ...entry.task, ...draftMarks(doc, entry.task, draft), ...same ? {} : { dueDate }, ...unsorted ? { slot: null } : {} };
    const edited = doc.replace(entry, withDraftRepeat(changed, draft, today, boundary));
    if (same || entry.section === section) return edited;
    return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
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
  function positionIn(doc, list, group, before) {
    if (before !== null && before.section === list) return before.index;
    return group === null ? "end" : { endOf: groupIndex(doc, list, group) };
  }
  function createInPlace(doc, typedText, priority, place, today, boundary, repeat, labels = []) {
    const { text, ...marks } = typed(doc, typedText, priority, labels);
    switch (place.kind) {
      case "subtask":
        return intoUnfolded(
          doc,
          place.parent,
          (d, same) => d.insertUnder(same(place.parent), withRepeat(newTask(text, marks), repeat, today, boundary), place.before && same(place.before))
        );
      case "slot":
        return createInSlot(doc, place.slot, text, marks, today, boundary);
      case "list": {
        const { list, group, before } = place;
        const dueDate = list === "now" ? place.date ?? today : enteringList(list, today, place.date).dueDate;
        const task = newTask(text, { dueDate, ...marks });
        return doc.insert(list, positionIn(doc, list, group, before), withRepeat(task, repeat, today, boundary));
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
    const shown = columnGroups(doc, column, today, boundary).find((g) => g.name === group)?.entries ?? [];
    const at = before === null ? shown.length : shown.findIndex((e) => samePlace(e, before));
    if (at < 0) throw new Error(`Not a task the column shows in its group: ${before.raw}`);
    const below = shown.slice(at);
    const own = below.filter((e) => e.section === list);
    const index = groupIndex(doc, list, group);
    const twin = groupIndex(doc, list, trimmed) >= 0;
    if (twin && below.length === 0) return doc;
    let split = doc.splitGroup(list, index, trimmed, own);
    if (twin) split = split.mergeGroup(list, index + 1, split.groups(list).findIndex((g) => g.index > 0 && g.index !== index + 1 && g.name === trimmed), "end");
    const date = column.kind === "day" ? column.date : null;
    return below.filter((e) => e.section !== list).reduce((current, entry, i) => {
      const target = current.groups(list)[groupIndex(current, list, trimmed)].entries;
      const first = own.length > 0 ? target[target.length - own.length] : null;
      return moveToGroup(current, current.tasks(entry.section)[entry.index - i], list, trimmed, first, today, date);
    }, split);
  }
  function moveGroupTo(doc, list, group, place) {
    const from = groupIndex(doc, list, group);
    const before = place === "end" ? doc.groups(list).length : groupIndex(doc, list, place.before);
    if (before === from) return doc;
    if (before > 0) return doc.moveGroup(list, from, before);
    const moved = doc.moveGroup(list, from, 1);
    return doc.groups(list)[0].entries.length === 0 ? moved : moved.moveGroup(list, 0, 2);
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

  // src/domain/recurrence.ts
  var RECURRING = ["inbox", "backlog", "now", "soon"];
  function closedWithRepeat(entry) {
    return (entry.task.status === "done" || entry.task.status === "cancelled") && entry.task.repeat !== null;
  }
  function recurClosed(doc, today, boundary) {
    if (!doc.hasSection("soon")) return doc;
    for (; ; ) {
      const entry = RECURRING.flatMap((s) => flatten(doc.tasks(s))).find(closedWithRepeat);
      if (!entry) return doc;
      const { task } = entry;
      const copy = newTask(task.text, {
        priority: task.priority,
        labels: task.labels,
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

  // src/domain/normalize.ts
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
      return d.replaceAll(past.map((e) => [e, { ...e.task, slot: null, dueDate: e.task.dueDate ?? boundary.dayOfSlot(e.task.slot) }]));
    });
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
      const all = doc.allTasks();
      let i = all.length - 1;
      while (i >= 0 && (all[i].section === target || !candidate(all[i]))) i--;
      if (i < 0) return doc;
      const entry = all[i];
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
      const slotted = e.task.slot !== null && boundary.dayOfSlot(e.task.slot) <= today;
      return due || slotted;
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
  var GROUPED = ["inbox", "backlog", "now", "soon"];
  function fitsGroup(section, task, today) {
    if (section === "soon") return task.slot === null;
    if (section === "now") return task.slot === null && (task.dueDate === null || task.dueDate <= today);
    return true;
  }
  function misplacedOutOfGroups(doc, today) {
    for (const section of GROUPED) {
      for (; ; ) {
        const entry = doc.tasks(section).find((e) => e.group !== null && !fitsGroup(section, e.task, today));
        if (!entry) break;
        doc = doc.moveEntry(entry, section, "end");
      }
    }
    return doc;
  }
  function mergeDuplicates(doc) {
    for (const section of GROUPED) {
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
    for (const section of GROUPED) {
      for (; ; ) {
        const empty = doc.groups(section).find((g) => g.index > 0 && g.name === null && g.blank);
        if (!empty) break;
        doc = doc.deleteGroup(section, empty.index);
      }
    }
    return doc;
  }
  function placeUngrouped(doc) {
    for (const section of GROUPED) {
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

  // src/domain/EntryTags.ts
  var MARK = 57344;
  var FIRST = 57345;
  var EntryTags = class _EntryTags {
    constructor(count) {
      this.count = count;
    }
    /** Tags `entries` in their order: the n-th is found again as `find(doc, n)`. */
    static tag(doc, entries) {
      const tagged = doc.replaceAll(
        entries.map((entry, n) => {
          const same = doc.find(entry.section, entry.index, entry.path);
          return [same, { ...same.task, text: same.task.text + markOf(n) }];
        })
      );
      return { doc: tagged, tags: new _EntryTags(entries.length) };
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
    untag(doc) {
      const changes = [];
      for (let n = 0; n < this.count; n++) {
        const entry = this.find(doc, n);
        if (entry) changes.push([entry, { ...entry.task, text: entry.task.text.slice(0, -markOf(n).length) }]);
      }
      return doc.replaceAll(changes);
    }
  };
  function markOf(n) {
    return String.fromCharCode(MARK, FIRST + n);
  }

  // src/application/taskKeys.ts
  function samePlace2(a, b) {
    return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
  }
  function sameLine(a, b) {
    return a.raw === b.raw;
  }

  // src/application/contracts.ts
  var StaleTaskError = class extends Error {
    constructor() {
      super("stale task");
      this.code = "staleTask";
      this.name = "StaleTaskError";
    }
  };

  // src/application/documentText.ts
  function markersOf(settings) {
    return {
      dueDate: settings.dueDateMarker,
      slot: settings.slotMarker,
      alarmSlot: settings.alarmSlotMarker,
      liveSlot: settings.liveSlotMarker,
      silentSlot: settings.silentSlotMarker,
      repeat: settings.repeatMarker,
      collapsed: settings.collapsedMarker,
      priorities: usableLevels(settings.priorities).map((l) => l.prefix),
      labelTag: settings.labelTag,
      labels: usableLabels(settings.labels).map((l) => l.name)
    };
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
  function readDocument(text, settings, today, boundary = boundaryOf(settings)) {
    return normalize(parseText(text, settings).ensureSections(sectionNames(settings)), today, boundary, usablePresets(settings.groups.presets));
  }
  function readingKey(settings) {
    return JSON.stringify([settings.sections, settings.groups.ungrouped, settings.groups.presets, markersOf(settings)]);
  }

  // src/application/TaskRules.ts
  var MOVES = /* @__PURE__ */ new Set(["postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest"]);
  function refsOf(change) {
    if (change.kind === "moveBefore" || change.kind === "moveToGroup") return [change.before];
    if (change.kind === "nest") return [change.parent, change.before];
    return [];
  }
  function sameKey(a, b) {
    return samePlace2(a, b) && sameLine(a, b);
  }
  function isAncestor(a, b) {
    return a.section === b.section && a.index === b.index && a.path.length < b.path.length && a.path.every((i, k) => b.path[k] === i);
  }
  function columnOfPlace(place, today) {
    if (place.kind === "day") return { kind: "day", date: place.date };
    if (place.list === "now") return { kind: "day", date: place.date ?? today };
    if (place.list === "soon" && place.date !== void 0 && place.date > today) return { kind: "day", date: place.date };
    return { kind: place.list };
  }
  function blank(text) {
    return text.trim() === "";
  }
  var TaskRules = class {
    constructor(settings, clock) {
      this.settings = settings;
      this.clock = clock;
    }
    moment() {
      const settings = this.settings.get();
      const boundary = boundaryOf(settings);
      return { settings, boundary, today: boundary.dayOf(this.clock.now()), reading: JSON.stringify([readingKey(settings), settings.dayStartHour]) };
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
      const { settings, today, boundary } = at;
      const presets = usablePresets(settings.groups.presets);
      const parsed = parseText(text, settings);
      const whole = parsed.ensureSections(sectionNames(settings));
      const doc = normalize(whole, today, boundary, presets);
      const changed = whole === parsed ? doc !== whole : normalize(parsed, today, boundary, presets) !== parsed;
      return { doc, changed };
    }
    /** The text after `operation` on the document read and normalized; the result is normalized again. */
    change(text, operation, at = this.moment()) {
      const { settings, today, boundary } = at;
      return this.written(readDocument(text, settings, today, boundary), operation, at);
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
      return parseText(text, at.settings).ensureSections(sectionNames(at.settings));
    }
    emptyFile() {
      return TaskDocument.empty(sectionNames(this.settings.get()));
    }
    entryOf(doc, key) {
      const entry = doc.find(key.section, key.index, key.path);
      if (!entry || entry.raw !== key.raw) throw new StaleTaskError();
      return entry;
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
    createAtTime(date, start, text) {
      if (this.isBlank(text)) return null;
      return (doc, today, _settings, boundary) => createAtTime(doc, date, today, start, text, boundary);
    }
    createInPlace(text, priority, place, repeat, labels = []) {
      if (this.isBlank(text)) return null;
      return this.placeNew(text, priority, place, repeat, labels);
    }
    /** A new task where `place` says, whatever its title: `createInPlace` without its check for a blank one. */
    placeNew(text, priority, place, repeat, labels = []) {
      return (doc, today, _settings, boundary) => createInPlace(doc, text, priority, this.resolve(doc, place, today), today, boundary, repeat, labels);
    }
    create(draft, slot) {
      if (this.isBlank(draft.text)) return null;
      return (doc, today, _settings, boundary) => placeTask(doc, null, draft, today, slot, boundary);
    }
    createSubtask(parent, draft) {
      if (this.isBlank(draft.text)) return null;
      return (doc, today) => createSubtask(doc, this.entryOf(doc, parent), draft, today);
    }
    edit(key, draft) {
      if (blank(draft.text)) return null;
      return (doc, today, _settings, boundary) => placeTask(doc, this.entryOf(doc, key), draft, today, void 0, boundary);
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
        const cleared = clearSlot(doc, entry);
        return place ? moveBefore(cleared, cleared.tasks(entry.section)[entry.index], before && cleared.tasks(before.section)[before.index], place.date, today) : cleared;
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
      if (blank(name)) return null;
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
    renameGroup(list, group, name) {
      if (blank(name) || name.trim() === group) return null;
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
    /** A new section `name` at `place`, and the list it goes in; null when the name can't make one there. */
    createSection(name, place) {
      const group = name.trim();
      const today = this.today();
      const column = columnOfPlace(place, today);
      const list = columnList(column, today);
      if (list === null || group === "" || group === this.settings.get().groups.ungrouped || group === place.group) return null;
      const operation = (doc, today2, settings, boundary) => {
        this.groupOf(doc, list, place.group);
        const before = place.before ? this.entryOf(doc, place.before) : null;
        const shown = columnGroups(doc, column, today2, boundary).find((g) => g.name === place.group)?.entries ?? [];
        if (before && !shown.some((e) => e.section === before.section && e.index === before.index && e.path.length === 0)) throw new StaleTaskError();
        return createSection(doc, column, place.group, before, group, settings.groups, today2, boundary);
      };
      return { operation, list, group };
    }
    /** The steps in the file's order, each on its task wherever the earlier ones took it; a move under a task moved too goes along with it. */
    applyAll(steps) {
      if (steps.length === 0) return null;
      return (doc, today, settings) => {
        const named = [];
        const tagOf = (key) => {
          const at = named.findIndex((k) => sameKey(k, key));
          return at >= 0 ? at : named.push(key) - 1;
        };
        const lineOf = (key) => doc.lineOf(this.entryOf(doc, key));
        const plan = steps.filter((step) => !(MOVES.has(step.change.kind) && steps.some((other) => MOVES.has(other.change.kind) && isAncestor(other.key, step.key)))).sort((a, b) => lineOf(a.key) - lineOf(b.key)).map((step) => ({ change: step.change, own: tagOf(step.key), refs: refsOf(step.change).map((ref) => ref === null ? null : tagOf(ref)) }));
        const { doc: tagged, tags } = EntryTags.tag(doc, named.map((key) => this.entryOf(doc, key)));
        let current = tagged;
        for (const { change, own, refs } of plan) {
          const entry = tags.find(current, own);
          if (!entry) continue;
          const [first, second] = refs.map((ref) => ref === null ? null : tags.find(current, ref));
          current = this.step(current, entry, change, first ?? null, second ?? null, today, settings);
        }
        return tags.untag(current);
      };
    }
    /** One step of `applyAll`; `first` and `second` are the tasks its change names, in the order `refsOf` gives them. */
    step(doc, entry, change, first, second, today, settings) {
      switch (change.kind) {
        case "status":
          return setStatus(doc, entry, change.status);
        case "priority":
          return setPriority(doc, entry, change.priority);
        case "labels":
          return setLabels(doc, entry, change.labels);
        case "dueDate":
          return setDueDate(doc, entry, change.date);
        case "postpone":
          return postpone(doc, entry, change.date, today);
        case "remove":
          return remove(doc, entry);
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
          return blank(change.name) ? doc : createGroup(doc, entry, change.list, change.name, settings.groups, today, change.date ?? null);
        case "nest":
          return first ? nest(doc, entry, first, second) : doc;
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
      }
    }
    written(doc, operation, at) {
      const { settings, today, boundary } = at;
      const after = normalize(operation(doc, today, settings, boundary), today, boundary, usablePresets(settings.groups.presets));
      return { text: after.serialize(), before: doc, after };
    }
  };

  // src/application/PhoneDoor.ts
  function timeText(start, end) {
    return end === null ? minutesToHHMM(start) : `${minutesToHHMM(start)}–${minutesToHHMM(end % MINUTES_PER_DAY)}`;
  }
  var STALE = { changed: false, reason: "stale" };
  function action(text) {
    return text === null ? STALE : { changed: true, text };
  }
  function settingsOf(json) {
    return settingsFrom(json.trim() === "" ? null : JSON.parse(json));
  }
  function fixedSettings(settings) {
    return { get: () => settings, update: async () => void 0, onChange: () => () => void 0 };
  }
  var Call = class {
    constructor(settingsJson, nowMs) {
      const clock = { now: () => new Date(nowMs) };
      this.rules = new TaskRules(fixedSettings(settingsOf(settingsJson)), clock);
      this.reminders = new TaskReminders(this.rules, clock);
    }
  };
  var phoneDoor = {
    reminders(text, settingsJson, nowMs) {
      return new Call(settingsJson, nowMs).reminders.ringing(text).map(({ key, startMinute, endMinute, start, dayEnd, title, kind, date }) => ({
        id: key.raw,
        title,
        body: timeText(startMinute, endMinute),
        kind,
        date,
        startMs: start.getTime(),
        dayEndMs: dayEnd.getTime()
      }));
    },
    complete(text, settingsJson, id, nowMs) {
      const { rules, reminders } = new Call(settingsJson, nowMs);
      return action(reminders.act(text, id, (key) => rules.setStatus(key, "done")));
    },
    /** The task stays on its time; it no longer reminds. */
    silence(text, settingsJson, id, nowMs) {
      const { rules, reminders } = new Call(settingsJson, nowMs);
      return action(reminders.act(text, id, (key) => rules.setReminder(key, "none")));
    },
    snooze(text, settingsJson, id, minutes, nowMs) {
      const { rules, reminders } = new Call(settingsJson, nowMs);
      return action(reminders.act(text, id, (key) => rules.snooze(key, minutes)));
    },
    /**
     * A task typed or spoken on the phone, last in `list` as the plugin's quick entry puts it. Only an empty title writes
     * nothing: one of only a priority is written, unlike the plugin's `createInPlace`, as the phone always did.
     */
    capture(text, settingsJson, list, title, nowMs) {
      if (title.trim() === "") return STALE;
      const { rules } = new Call(settingsJson, nowMs);
      return action(rules.change(text, rules.placeNew(title, null, { kind: "list", list, group: null, before: null })).text);
    },
    /** The calendars' files in the vault, in the order `meetings` takes their texts. */
    calendarFiles(settingsJson) {
      const settings = settingsOf(settingsJson);
      return CALENDAR_SOURCES.map((source) => calendarPath(source, settings));
    },
    /** The timed meetings that overlap `from`–`to`, as the calendar on screen shows them; a file missing (`null`) or unreadable adds none. */
    meetings(settingsJson, texts, fromMs, toMs, nowMs) {
      const files = /* @__PURE__ */ new Map();
      CALENDAR_SOURCES.forEach((source, i) => {
        const text = texts[i];
        if (text === null || text === void 0) return;
        try {
          files.set(source, readCalendarFile(text, source));
        } catch {
        }
      });
      return new ShownCalendars(files, settingsOf(settingsJson), new Date(nowMs)).days().timedBetween(new Date(fromMs), new Date(toMs)).map((e) => ({ title: e.title, startMs: e.start.getTime(), endMs: e.end.getTime() }));
    }
  };

  // src/phone/main.ts
  globalThis.TaskCalendarPhone = phoneDoor;
})();
