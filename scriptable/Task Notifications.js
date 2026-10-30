// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: bell;

// Task Calendar: уведомления о задачах, поставленных на время. Ставит уведомление на начало каждой несделанной задачи
// из Now и Soon со слотом ⏰ и убирает те, что больше не нужны. Запускать после каждого изменения файла задач:
// автоматизацией Shortcuts «Obsidian закрыт» (см. README, раздел Notifications).
//
// Собран из src/scriptable командой `node scriptable/build.mjs`: править можно только настройки ниже.

const SETTINGS = {
	// Файловая закладка Scriptable на папку vault, та же, что у Export Work Calendar.
	bookmark: "ObsidianVault",
	// Как в настройках плагина Task Calendar.
	tasksFile: "TODOs Tasks.md",
	sections: { now: "Now", soon: "Soon", done: "Done" },
	markers: { dueDate: "📅", slot: "⏰" },
};


// src/scriptable/Scriptable.ts
var scriptable = globalThis;
var ScriptableNotificationCenter = class {
  allPending() {
    return scriptable.Notification.allPending();
  }
  removePending(identifiers) {
    return scriptable.Notification.removePending(identifiers);
  }
  async schedule(n) {
    const notification = new scriptable.Notification();
    notification.identifier = n.identifier;
    notification.threadIdentifier = n.threadIdentifier;
    notification.title = n.title;
    notification.body = n.body;
    notification.sound = n.sound;
    notification.openURL = n.openURL;
    notification.setTriggerDate(n.at);
    await notification.schedule();
  }
};
var ScriptableVaultFiles = class {
  constructor() {
    this.fm = scriptable.FileManager.local();
  }
  vaultPath(bookmark) {
    return this.fm.bookmarkExists(bookmark) ? this.fm.bookmarkedPath(bookmark) : null;
  }
  async read(path) {
    if (!this.fm.fileExists(path)) return null;
    if (this.fm.isFileStoredIniCloud(path)) await this.fm.downloadFileFromiCloud(path);
    return this.fm.readString(path);
  }
};
async function showInApp(title, message) {
  if (!scriptable.config.runsInApp) return;
  const alert = new scriptable.Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  await alert.present();
}
function completeScript() {
  scriptable.Script.complete();
}

// src/domain/LocalDate.ts
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var TIME_RE = /^(\d{2}):(\d{2})$/;
var DAY_MS = 864e5;
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
  const total = hours * 60 + minutes;
  return total > 1440 ? null : total;
}

// src/domain/DayBoundary.ts
var DAY_MINUTES = 1440;
var HOUR_MINUTES = 60;
var DAY_HOURS = 24;
var DayBoundary = class _DayBoundary {
  static {
    this.MIDNIGHT = new _DayBoundary(0);
  }
  constructor(startHour) {
    const hour = Math.floor(startHour);
    this.startHour = hour >= 0 && hour < DAY_HOURS ? hour : 0;
  }
  get startMinute() {
    return this.startHour * HOUR_MINUTES;
  }
  dayOf(at) {
    return this.dayOfClock(localDateOf(at), at.getHours() * HOUR_MINUTES + at.getMinutes());
  }
  dayOfSlot(slot) {
    return this.dayOfClock(slot.date, slot.start);
  }
  /** Minutes from the start of `day` to `at`; negative before it, past 1440 after it. */
  offsetOf(day, at) {
    return this.offsetOfClock(day, localDateOf(at), at.getHours() * HOUR_MINUTES + at.getMinutes());
  }
  /** Minutes from the start of `day` to the start and the end of `slot`. */
  spanOf(slot, day) {
    const start = this.offsetOfClock(day, slot.date, slot.start);
    return { start, end: slot.end === null ? null : start + slot.end - slot.start };
  }
  /** The slot that takes the minutes from `start` to `end` past the start of `day`, at the clock's date and time. */
  slotAt(day, start, end) {
    const clock = this.startMinute + start;
    const nextDay = clock >= DAY_MINUTES;
    const slotStart = nextDay ? clock - DAY_MINUTES : clock;
    return { date: nextDay ? addDays(day, 1) : day, start: slotStart, end: end === null ? null : slotStart + end - start };
  }
  /** The clock hour the `index`-th hour line of a day stands at. */
  hourAt(index) {
    return (this.startHour + index) % DAY_HOURS;
  }
  /** Minutes from the start of a day to `hour` o'clock in it. */
  offsetOfHour(hour) {
    return (hour - this.startHour + DAY_HOURS) % DAY_HOURS * HOUR_MINUTES;
  }
  /** The slot moved and cut to lie within its day and last at least `stepMinutes`; one without a duration starts a step before the day ends. */
  clamp(slot, stepMinutes) {
    const day = this.dayOfClock(slot.date, Math.max(0, slot.start));
    const span = this.spanOf(slot, day);
    if (span.end === null) return this.slotAt(day, Math.max(0, Math.min(span.start, DAY_MINUTES - stepMinutes)), null);
    let { start, end } = span;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    end = Math.min(Math.max(end, stepMinutes), DAY_MINUTES);
    start = Math.max(0, Math.min(start, end - stepMinutes));
    return this.slotAt(day, start, end);
  }
  dayOfClock(date, minutes) {
    return minutes < this.startMinute ? addDays(date, -1) : date;
  }
  offsetOfClock(day, date, minutes) {
    return daysBetween(day, date) * DAY_MINUTES + minutes - this.startMinute;
  }
};

// src/domain/queries.ts
function listed(doc) {
  return [...doc.tasks("now"), ...doc.tasks("soon")];
}
function openSlotted(doc) {
  return listed(doc).filter((e) => e.task.slot !== null && e.task.status !== "done" && e.task.status !== "cancelled");
}

// src/domain/Task.ts
var STATUS_CHARS = {
  todo: " ",
  inProgress: "/",
  done: "x",
  cancelled: "-"
};

// src/domain/TaskLine.ts
var DAY_MINUTES2 = 1440;
var LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
var DATE = "(\\d{4}-\\d{2}-\\d{2})";
var TIME = "(\\d{2}:\\d{2})";
function statusOf(char) {
  for (const status of Object.keys(STATUS_CHARS)) {
    if (STATUS_CHARS[status] === char) return status;
  }
  return "todo";
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var FieldSlicer = class {
  constructor(markers) {
    this.slotRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.slot)}\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
    this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
  }
  slice(body) {
    let text = body;
    let dueDate = null;
    let slot = null;
    for (; ; ) {
      const slotMatch = slot === null ? this.slotRe.exec(text) : null;
      if (slotMatch) {
        const parsed = this.slotOf(slotMatch);
        if (!parsed) break;
        slot = parsed;
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
      break;
    }
    return { text: text.trim(), dueDate, slot };
  }
  slotOf(m) {
    const date = m[1];
    const start = parseHHMM(m[2]);
    if (!isValidLocalDate(date) || start === null || start >= DAY_MINUTES2) return null;
    if (m[3] === void 0) return { date, start, end: null };
    const end = parseHHMM(m[3]);
    if (end === null || start === end) return null;
    return { date, start, end: end < start ? end + DAY_MINUTES2 : end };
  }
};
function parseTaskLine(line, markers) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const statusChar = m[3];
  const fields = new FieldSlicer(markers).slice(m[4]);
  return {
    indent: m[1],
    bullet: m[2],
    task: { status: statusOf(statusChar), statusChar, ...fields, children: [] }
  };
}
function formatTaskLine(parsed, markers) {
  const { indent, bullet, task } = parsed;
  let line = `${indent}${bullet} [${task.statusChar}] ${task.text}`;
  if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
  if (task.slot) {
    const { date, start, end } = task.slot;
    line += ` ${markers.slot} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > DAY_MINUTES2 ? end - DAY_MINUTES2 : end)}`}`;
  }
  return line;
}

// src/domain/TaskDocument.ts
var SECTION_KEYS = ["now", "soon", "done"];
var HEADING_RE = /^#{1,6}(\s|$)/;
var SECTION_HEADING_RE = /^##\s+(.*?)\s*$/;
var INDENT_RE = /^[ \t]*/;
function indentWidth(line) {
  return INDENT_RE.exec(line)[0].length;
}
function sameTask(a, b) {
  return a.status === b.status && a.statusChar === b.statusChar && a.text === b.text && a.dueDate === b.dueDate && a.slot?.date === b.slot?.date && a.slot?.start === b.slot?.start && a.slot?.end === b.slot?.end && a.children.length === b.children.length && a.children.every((c, i) => c === b.children[i]);
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
    for (const [key, section] of this.sections) {
      entries.set(key, this.readTasks(key, section, spans));
    }
    this.entries = entries;
    this.spans = spans;
  }
  static parse(text, sections, markers) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const trailingEol = text.endsWith(eol);
    const body = trailingEol ? text.slice(0, -eol.length) : text;
    const lines = body === "" && text === "" ? [] : body.split(eol);
    return new _TaskDocument(lines, eol, trailingEol, sections, markers);
  }
  static empty(all) {
    return _TaskDocument.parse("", { now: "", soon: "", done: "" }, { dueDate: "", slot: "" }).ensureSections(all).serialize();
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
  allTasks() {
    return SECTION_KEYS.flatMap((key) => this.tasks(key));
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
  removeEntry(entry) {
    const span = this.spanOf(entry);
    return this.withLines(this.splice(span.line, span.lineCount, []));
  }
  moveEntry(entry, section, position) {
    const span = this.spanOf(entry);
    const moved = this.lines.slice(span.line, span.line + span.lineCount);
    const without = this.withLines(this.splice(span.line, span.lineCount, []));
    const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
    return without.withLines(without.splice(target, 0, moved));
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
    const own = this.tasks(entry.section)[entry.index];
    const span = own && own.raw === entry.raw ? this.spans.get(own) : void 0;
    if (!span) throw new Error(`Task not found in the document: ${entry.section}[${entry.index}] ${entry.raw}`);
    return span;
  }
  positionAfterRemoval(entry, section, position) {
    if (typeof position !== "number" || section !== entry.section || position <= entry.index) return position;
    return position - 1;
  }
  insertionLine(section, position) {
    const s = this.sections.get(section);
    if (!s) throw new Error(`Section missing: ${this.names[section]}`);
    const tasks = this.tasks(section);
    if (tasks.length === 0) return s.firstLine;
    const index = position === "start" ? 0 : position === "end" ? tasks.length : position;
    if (index >= tasks.length) {
      const last = this.spans.get(tasks[tasks.length - 1]);
      return last.line + last.lineCount;
    }
    return this.spans.get(tasks[Math.max(0, index)]).line;
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
      if (HEADING_RE.test(this.lines[i])) return i;
    }
    return this.lines.length;
  }
  readTasks(key, section, spans) {
    const entries = [];
    let i = section.firstLine;
    while (i < section.endLine) {
      const raw = this.lines[i];
      const parsed = parseTaskLine(raw, this.markers);
      if (!parsed) {
        i++;
        continue;
      }
      const children = this.childrenOf(i, section.endLine, parsed.indent.length);
      const entry = {
        section: key,
        index: entries.length,
        raw,
        indent: parsed.indent,
        bullet: parsed.bullet,
        task: { ...parsed.task, children }
      };
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

// src/scriptable/SlotReminders.ts
var DAY_MINUTES3 = 1440;
var SlotReminders = class _SlotReminders {
  constructor(settings) {
    this.settings = settings;
  }
  static {
    /** iOS keeps 64 pending notifications per app; the rest is left to Scriptable's other scripts. */
    this.LIMIT = 50;
  }
  static {
    this.THREAD = "task-calendar";
  }
  of(text, now) {
    return openSlotted(TaskDocument.parse(text, this.settings.sections, this.settings.markers)).map((e) => this.reminder(e.task.text, e.task.slot)).filter((r) => r.at > now).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, _SlotReminders.LIMIT);
  }
  reminder(text, slot) {
    const start = minutesToHHMM(slot.start);
    const [year, month, day] = slot.date.split("-").map(Number);
    return {
      id: `${_SlotReminders.THREAD} ${slot.date} ${start} ${text}`,
      title: text,
      body: slot.end === null ? start : `${start}–${minutesToHHMM(slot.end % DAY_MINUTES3)}`,
      at: new Date(year, month - 1, day, 0, slot.start)
    };
  }
};

// src/scriptable/TaskNotifications.ts
var SOUND = "alert";
var TaskNotifications = class {
  constructor(settings, files, center) {
    this.settings = settings;
    this.files = files;
    this.center = center;
    this.reminders = new SlotReminders(settings);
  }
  /** Returns how many notifications are now pending. */
  async run(now) {
    const vault = this.files.vaultPath(this.settings.bookmark);
    if (vault === null) throw new Error(`Нет файловой закладки "${this.settings.bookmark}" на папку vault`);
    const text = await this.files.read(`${vault}/${this.settings.tasksFile}`);
    if (text === null) throw new Error(`Нет файла задач "${this.settings.tasksFile}" в vault`);
    const reminders = this.reminders.of(text, now);
    const ours = (await this.center.allPending()).filter((n) => n.threadIdentifier === SlotReminders.THREAD);
    await this.center.removePending(ours.map((n) => n.identifier));
    const openURL = `obsidian://open?vault=${encodeURIComponent(vault.split("/").pop())}`;
    for (const r of reminders) {
      await this.center.schedule({ identifier: r.id, threadIdentifier: SlotReminders.THREAD, title: r.title, body: r.body, sound: SOUND, openURL, at: r.at });
    }
    return reminders.length;
  }
};

// src/scriptable/main.ts
var count = await new TaskNotifications(SETTINGS, new ScriptableVaultFiles(), new ScriptableNotificationCenter()).run(/* @__PURE__ */ new Date());
await showInApp("Уведомления поставлены", `Задач на время впереди: ${count}`);
completeScript();
