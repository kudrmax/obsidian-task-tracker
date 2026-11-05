// Task Calendar: built from src/phone by `node phone/build.mjs`. Do not edit.
"use strict";
(() => {
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

  // src/domain/Task.ts
  var STATUS_CHARS = {
    todo: " ",
    inProgress: "/",
    done: "x",
    cancelled: "-"
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
  function slotMarkers(markers) {
    const kinds = /* @__PURE__ */ new Map();
    for (const [marker, kind] of [[markers.slot, "notification"], [markers.alarmSlot, "alarm"], [markers.silentSlot, "none"]]) {
      if (marker && !kinds.has(marker)) kinds.set(marker, kind);
    }
    return kinds;
  }
  function markerOf(kind, markers) {
    const own = kind === "alarm" ? markers.alarmSlot : kind === "none" ? markers.silentSlot : markers.slot;
    return own || markers.slot;
  }
  var FieldSlicer = class {
    constructor(markers) {
      this.kinds = slotMarkers(markers);
      const alternatives = [...this.kinds.keys()].map(escapeRegExp).join("|");
      this.slotRe = new RegExp(`(?:^|\\s+)(${alternatives})\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
      this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
      this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp(markers.repeat)}\\s+(.+?)$`) : null;
    }
    slice(body) {
      let text = body;
      let dueDate = null;
      let slot = null;
      let reminder = "notification";
      let repeat = null;
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
      return { text: text.trim(), dueDate, slot, reminder, repeat };
    }
    slotOf(m) {
      const date = m[2];
      const start = parseHHMM(m[3]);
      if (!isValidLocalDate(date) || start === null || start >= DAY_MINUTES2) return null;
      if (m[4] === void 0) return { date, start, end: null };
      const end = parseHHMM(m[4]);
      if (end === null || start === end) return null;
      return { date, start, end: end < start ? end + DAY_MINUTES2 : end };
    }
  };
  var slicers = /* @__PURE__ */ new Map();
  function fieldSlicerFor(markers) {
    const key = [markers.slot, markers.alarmSlot ?? "", markers.silentSlot ?? "", markers.dueDate, markers.repeat ?? ""].join("\0");
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
    const fields = fieldSlicerFor(markers).slice(m[4]);
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
      line += ` ${markerOf(task.reminder, markers)} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > DAY_MINUTES2 ? end - DAY_MINUTES2 : end)}`}`;
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
    return a.status === b.status && a.statusChar === b.statusChar && a.text === b.text && a.dueDate === b.dueDate && a.priority === b.priority && (a.repeat?.format() ?? null) === (b.repeat?.format() ?? null) && a.slot?.date === b.slot?.date && a.slot?.start === b.slot?.start && a.slot?.end === b.slot?.end && a.reminder === b.reminder && sameLines(a.children, b.children);
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
    /** The entry's child lines with every subtask `[ ]` and without its due date, slot (with its reminder kind) and repeat; description lines as they are. */
    freshChildren(entry) {
      const first = this.spanOf(entry).line + 1;
      const children = [...entry.task.children];
      const open = (sub) => {
        const task = { ...sub.task, status: "todo", statusChar: STATUS_CHARS.todo, dueDate: null, slot: null, reminder: "notification", repeat: null };
        children[this.spanOf(sub).line - first] = formatTaskLine({ indent: sub.indent, bullet: sub.bullet, task }, this.markers);
        sub.subtasks.forEach(open);
      };
      entry.subtasks.forEach(open);
      return children;
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

  // src/domain/operations.ts
  var SLOT_STEP = 5;
  function newTask(text, patch2 = {}) {
    return { status: "todo", statusChar: STATUS_CHARS.todo, text: text.trim(), dueDate: null, slot: null, reminder: "notification", repeat: null, priority: null, children: [], ...patch2 };
  }
  function dayOf(task, boundary) {
    return task.dueDate ?? (task.slot ? boundary.dayOfSlot(task.slot) : null);
  }
  function isUndated(section) {
    return section === "inbox" || section === "backlog";
  }
  function patch(doc, entry, changes) {
    return doc.replace(entry, { ...entry.task, ...changes });
  }
  function sameEntryIn(doc, entry) {
    return doc.find(entry.section, entry.index, entry.path);
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
  function setStatus(doc, entry, status) {
    return patch(doc, entry, { status, statusChar: STATUS_CHARS[status] });
  }
  function setDueDate(doc, entry, date) {
    return patch(doc, entry, { dueDate: date });
  }
  function setReminder(doc, entry, reminder) {
    return patch(doc, entry, { reminder });
  }
  function placeOnTimeline(doc, entry, slot, today, boundary = DayBoundary.MIDNIGHT) {
    const clamped = boundary.clamp(slot, SLOT_STEP);
    if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
    const slotted = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
    return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
  }
  function toList(doc, entry, date, today) {
    return date === today ? moveInto(doc, entry, "now", "end", today) : setDueDate(doc, entry, date);
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
      const entry = RECURRING.flatMap((s) => doc.tasks(s)).find(closedWithRepeat);
      if (!entry) return doc;
      const { task } = entry;
      const copy = newTask(task.text, {
        priority: task.priority,
        children: doc.freshChildren(entry),
        dueDate: task.repeat.next(dayOf(task, boundary), today),
        repeat: task.repeat
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
  function isOpen(task) {
    return task.status === "todo" || task.status === "inProgress";
  }
  function untilSettled(doc, pass) {
    for (; ; ) {
      const next = pass(doc);
      if (next === doc) return doc;
      doc = next;
    }
  }
  function erasePastSlots(doc, today, boundary) {
    return untilSettled(doc, (d) => {
      const past = d.allTasks().filter((e) => isOpen(e.task) && e.task.slot !== null && boundary.dayOfSlot(e.task.slot) < today);
      return d.replaceAll(past.map((e) => [e, { ...e.task, slot: null, dueDate: e.task.dueDate ?? boundary.dayOfSlot(e.task.slot) }]));
    });
  }
  function pastDatesToToday(doc, today) {
    return untilSettled(doc, (d) => {
      const past = d.allTasks().filter((e) => isOpen(e.task) && e.task.dueDate !== null && e.task.dueDate < today);
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
    return gatherAtStart(doc, "done", (e) => !isOpen(e.task));
  }
  function datedOutOfUndated(doc) {
    if (!doc.hasSection("soon")) return doc;
    for (; ; ) {
      const entry = [...doc.tasks("inbox"), ...doc.tasks("backlog")].find((e) => isOpen(e.task) && (e.task.dueDate !== null || e.task.slot !== null));
      if (!entry) return doc;
      doc = doc.moveEntry(entry, "soon", "end");
    }
  }
  function dueToNow(doc, today, boundary, presets) {
    const came = (e) => {
      if (e.section !== "soon" || !isOpen(e.task)) return false;
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
  function dropEmptyGroups(doc) {
    for (const section of GROUPED) {
      for (; ; ) {
        const empty = doc.groups(section).find((g) => g.index > 0 && g.blank);
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
    return placeUngrouped(dropEmptyGroups(mergeDuplicates(misplacedOutOfGroups(doc, today))));
  }
  function normalize(doc, today, boundary = DayBoundary.MIDNIGHT, presets = []) {
    const listed2 = dueToNow(datedOutOfUndated(closedToDone(recurClosed(pastDatesToToday(erasePastSlots(doc, today, boundary), today), today, boundary))), today, boundary, presets);
    const result = normalizeGroups(listed2, today).spacedHeadings();
    if (result === doc) return doc;
    return result.serialize() === doc.serialize() ? doc : result;
  }

  // src/domain/Priority.ts
  function usablePrefix(prefix) {
    return /^\S+$/.test(prefix);
  }
  function usableLevels(levels) {
    return levels.filter((level, i) => usablePrefix(level.prefix) && levels.findIndex((l) => l.prefix === level.prefix) === i);
  }

  // src/settings.ts
  var DEFAULT_SETTINGS = {
    tasksFile: "TODOs Tasks.md",
    sections: { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" },
    dueDateMarker: "📅",
    slotMarker: "⏰",
    alarmSlotMarker: "🚨",
    silentSlotMarker: "🔕",
    repeatMarker: "🔁",
    workCalendarFile: "calendar/work.json",
    workCalendarTitles: [],
    google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
    longPressMs: 250,
    zoom: 56,
    zoomLevels: [
      { hourPx: 28 },
      { hourPx: 56 },
      { hourPx: 112 },
      { hourPx: 224 }
    ],
    scrollToHour: 9,
    dayStartHour: 5,
    listShare: 0.5,
    rightMode: "calendar",
    staleAfterMinutes: 180,
    priorities: [
      { prefix: "p1", color: "red" },
      { prefix: "p2", color: "orange" }
    ],
    groups: { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" },
    cardHeight: 35,
    cardGap: 2
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

  // src/application/documentText.ts
  function markersOf(settings) {
    return {
      dueDate: settings.dueDateMarker,
      slot: settings.slotMarker,
      alarmSlot: settings.alarmSlotMarker,
      silentSlot: settings.silentSlotMarker,
      repeat: settings.repeatMarker,
      priorities: usableLevels(settings.priorities).map((l) => l.prefix)
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
  function applyOperationAsRead(text, settings, now, op) {
    const boundary = boundaryOf(settings);
    const today = boundary.dayOf(now);
    const doc = parseText(text, settings).ensureSections(sectionNames(settings));
    return normalize(op(doc, today, boundary), today, boundary, usablePresets(settings.groups.presets)).serialize();
  }
  function applyOperation(text, settings, now, op) {
    const boundary = boundaryOf(settings);
    const today = boundary.dayOf(now);
    const doc = readDocument(text, settings, today, boundary);
    return normalize(op(doc, today, boundary), today, boundary, usablePresets(settings.groups.presets)).serialize();
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

  // src/phone/PhoneReminders.ts
  var DAY_MINUTES3 = 1440;
  var HOUR_MINUTES2 = 60;
  function clockOf(date, minutes) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 0, minutes);
  }
  var StaleTask = class extends Error {
  };
  var PhoneReminders = class {
    constructor(settingsJson) {
      this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
      this.boundary = boundaryOf(this.settings);
    }
    reminders(text, now) {
      const doc = readDocument(text, this.settings, this.boundary.dayOf(now), this.boundary);
      return openSlotted(doc).filter((e) => e.task.reminder !== "none").map((e) => this.reminder(e, e.task.slot)).filter((r) => r.dayEnd > now).sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    complete(text, id, now) {
      return this.act(text, id, now, (doc, entry) => setStatus(doc, entry, "done"));
    }
    /** The task stays on its time; it no longer reminds. */
    silence(text, id, now) {
      return this.act(text, id, now, (doc, entry) => setReminder(doc, entry, "none"));
    }
    snooze(text, id, minutes, now) {
      return this.act(text, id, now, (doc, entry, today, boundary) => setSlot(doc, entry, this.from(now, minutes, entry.task.slot), today, boundary));
    }
    act(text, id, now, op) {
      const onTask = (doc, today, boundary) => {
        const entry = openSlotted(doc).find((e) => e.raw === id);
        if (!entry) throw new StaleTask();
        return op(doc, entry, today, boundary);
      };
      for (const apply of [applyOperation, applyOperationAsRead]) {
        try {
          return { changed: true, text: apply(text, this.settings, now, onTask) };
        } catch (e) {
          if (!(e instanceof StaleTask)) throw e;
        }
      }
      return { changed: false, reason: "stale" };
    }
    /** `slot` moved to start `minutes` from now, as long as it was. */
    from(now, minutes, slot) {
      const at = new Date(now.getTime() + minutes * 6e4);
      const start = at.getHours() * HOUR_MINUTES2 + at.getMinutes();
      return { date: localDateOf(at), start, end: slot.end === null ? null : start + (slot.end - slot.start) };
    }
    reminder(entry, slot) {
      const start = minutesToHHMM(slot.start);
      const nextDay = addDays(this.boundary.dayOfSlot(slot), 1);
      return {
        id: entry.raw,
        title: plainText(entry.task.text),
        body: slot.end === null ? start : `${start}–${minutesToHHMM(slot.end % DAY_MINUTES3)}`,
        kind: entry.task.reminder === "alarm" ? "alarm" : "notification",
        date: slot.date,
        start: clockOf(slot.date, slot.start),
        dayEnd: clockOf(nextDay, this.boundary.startHour * HOUR_MINUTES2)
      };
    }
  };

  // src/phone/main.ts
  function wire(r) {
    const { start, dayEnd, ...rest } = r;
    return { ...rest, startMs: start.getTime(), dayEndMs: dayEnd.getTime() };
  }
  globalThis.TaskCalendarPhone = {
    reminders: (text, settingsJson, nowMs) => new PhoneReminders(settingsJson).reminders(text, new Date(nowMs)).map(wire),
    complete: (text, settingsJson, id, nowMs) => new PhoneReminders(settingsJson).complete(text, id, new Date(nowMs)),
    silence: (text, settingsJson, id, nowMs) => new PhoneReminders(settingsJson).silence(text, id, new Date(nowMs)),
    snooze: (text, settingsJson, id, minutes, nowMs) => new PhoneReminders(settingsJson).snooze(text, id, minutes, new Date(nowMs))
  };
})();
