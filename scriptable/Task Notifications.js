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
	// Префиксы приоритетов: в заголовке уведомления их нет.
	markers: { dueDate: "📅", slot: "⏰", priorities: ["p1", "p2"] },
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

// src/domain/description.ts
var INDENT_RE = /^[ \t]*/;
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
  return markdown.split(/\r?\n/).filter((line) => line.trim() !== "");
}

// src/domain/queries.ts
function listed(doc) {
  return [...doc.tasks("now"), ...doc.tasks("soon")];
}
function openSlotted(doc) {
  return listed(doc).filter((e) => e.task.slot !== null && e.task.status !== "done" && e.task.status !== "cancelled");
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
var FIRST_WORD_RE = /^(\S+)\s+(\S.*)$/;
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
    task: { status: statusOf(statusChar), statusChar, ...fields, ...priorityOf(fields.text, markers), children: [] }
  };
}
function priorityOf(text, markers) {
  const m = FIRST_WORD_RE.exec(text);
  if (!m || !markers.priorities?.includes(m[1])) return { text, priority: null };
  return { text: m[2], priority: m[1] };
}
function formatTaskLine(parsed, markers) {
  const { indent, bullet, task } = parsed;
  let line = `${indent}${bullet} [${task.statusChar}] ${task.priority ? `${task.priority} ` : ""}${task.text}`;
  if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
  if (task.slot) {
    const { date, start, end } = task.slot;
    line += ` ${markers.slot} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > DAY_MINUTES2 ? end - DAY_MINUTES2 : end)}`}`;
  }
  return line;
}

// src/domain/TaskDocument.ts
function ungroupedIndex(groups) {
  for (let i = groups.length - 1; i > 0; i--) if (groups[i].name === null) return i;
  return 0;
}
var SECTION_KEYS = ["inbox", "now", "soon", "done"];
var LIST_END_RE = /^#{1,2}(\s|$)/;
var GROUP_HEADING_RE = /^###\s+(.*?)\s*$/;
var SECTION_HEADING_RE = /^##\s+(.*?)\s*$/;
var INDENT_RE2 = /^[ \t]*/;
var DEFAULT_INDENT_UNIT = "	";
function indentWidth(line) {
  return INDENT_RE2.exec(line)[0].length;
}
function sameTask(a, b) {
  return a.status === b.status && a.statusChar === b.statusChar && a.text === b.text && a.dueDate === b.dueDate && a.priority === b.priority && a.slot?.date === b.slot?.date && a.slot?.start === b.slot?.start && a.slot?.end === b.slot?.end && a.children.length === b.children.length && a.children.every((c, i) => c === b.children[i]);
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
  /** A subtask moved here leaves its task and becomes a task of `section`. */
  moveEntry(entry, section, position) {
    const span = this.spanOf(entry);
    const moved = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, "");
    const without = this.withLines(this.splice(span.line, span.lineCount, []));
    const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
    return without.withLines(without.splice(target, 0, moved));
  }
  /** An empty `### name` before group `before`; `before` equal to the number of groups puts it last. */
  addGroup(section, name, before) {
    if (before < 1) throw new Error("No group goes above the tasks outside any section");
    return this.withLines(this.splice(this.groupStartLine(section, before), 0, [`### ${name}`]));
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
    const apart = Array(cut.to - cut.from - (content.last - (block.headingLine ?? content.first))).fill("");
    const last = before === this.blockLists.get(section).length;
    const moved = last ? [...apart, ...core] : [...core, ...apart];
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
    return this.withLines(without);
  }
  /**
   * The task's description from Markdown, as one block right under its line and before its subtasks, at the indent its
   * description has, else its subtasks'. The same text changes nothing; an empty one takes the description away.
   */
  setDescription(entry, markdown) {
    const lines = markdownLines(markdown);
    if (lines.join("\n") === (descriptionMarkdown(entry) ?? "")) return this;
    const indent = descriptionIndent(entry) ?? this.childIndent(entry);
    const subtasks = entry.subtasks.flatMap((sub) => [sub.raw, ...sub.task.children]);
    return this.replace(entry, { ...entry.task, children: [...lines.map((line) => indent + line), ...subtasks] });
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
    const block = this.blockLists.get(section)[index];
    if (group.entries.length === 0) return block.start;
    if (position === "start") return this.spans.get(group.entries[0]).line;
    return this.lineAfter(group.entries[group.entries.length - 1]);
  }
  groupInsertionLine(section, index, at) {
    const group = this.groups(section)[index];
    if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
    if (group.entries.length === 0) return this.blockOf(section, index).start;
    return at === "start" ? this.spans.get(group.entries[0]).line : this.lineAfter(group.entries[group.entries.length - 1]);
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
    const blank = this.lines.slice(block.start, block.end).every((line) => line.trim() === "");
    const own = this.readLevel(key, block.start, block.end, null, block.name, entries.length, spans);
    entries.push(...own);
    return { index, name: block.name, heading: block.headingLine !== null, entries: own, blank };
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
      title: plainText(text),
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
