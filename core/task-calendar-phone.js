// Task Calendar: built from core/phone by `node core/build.mjs`. Do not edit.
"use strict";
(() => {
  // core/domain/TaskTitle.ts
  var LINE_BREAK = /\s*(?:\r\n|[\n\r\u2028\u2029])\s*/gu;
  function oneLine(text) {
    return text.replace(LINE_BREAK, " ");
  }
  function taskTitle(text) {
    return oneLine(text).trim();
  }

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

  // core/domain/DayBoundary.ts
  var HOUR_MINUTES2 = 60;
  var DAY_HOURS = MINUTES_PER_DAY / HOUR_MINUTES2;
  var MIN_SLOT_MINUTES = 5;
  function clampSlot(start, end) {
    const duration = end === null ? null : end - start;
    const latest = MINUTES_PER_DAY - (duration ?? MIN_SLOT_MINUTES);
    const moved2 = Math.min(latest, Math.max(0, start));
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

  // core/domain/Lists.ts
  var GROUPED_LISTS = ["inbox", "backlog", "now", "soon"];

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
  function dayOfTask(section, task, today) {
    if (task.slot) return task.slot.date;
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

  // core/domain/Label.ts
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

  // core/domain/TaskLine.ts
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
  var readLines = /* @__PURE__ */ new WeakMap();
  var KEPT_LINES = 2e4;
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

  // core/domain/TaskDocument.ts
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
    /**
     * Where each of `moved`, tasks of `before`, stands after a change moved them: the task line an ordered diff finds only
     * here with its text, as a line the move rewrote is; else its very line, when this document has it once. Undefined when
     * neither finds it.
     */
    movedSince(before, moved2) {
      const inserted = insertedLines(before.lines, this.lines);
      const all = flatten(this.allTasks());
      const fresh = all.filter((entry) => inserted.has(this.lineOf(entry)));
      const taken = /* @__PURE__ */ new Set();
      const take = (entry) => (entry && taken.add(entry), entry);
      return moved2.map((entry) => {
        const rewritten = fresh.find((candidate) => !taken.has(candidate) && candidate.task.text === entry.task.text);
        if (rewritten) return take(rewritten);
        const same = all.filter((candidate) => !taken.has(candidate) && candidate.raw === entry.raw);
        return take(same.length === 1 ? same[0] : void 0);
      });
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
      const moved2 = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, "");
      const without = this.withLines(this.splice(span.line, span.lineCount, []));
      const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
      return this.leftBy(entry, without.withLines(without.splice(target, 0, moved2)));
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
    splitGroup(section, index, name, moved2) {
      if (moved2.length === 0) return this.addGroup(section, name, index + 1);
      const block = this.blockOf(section, index);
      const spans = moved2.map((entry) => this.spanOf(entry));
      const inMoved = (line) => spans.some((span) => line >= span.line && line < span.line + span.lineCount);
      let at = block.end;
      while (at > block.start && (this.lines[at - 1].trim() === "" || inMoved(at - 1))) at--;
      if (at === block.start) at = Math.min(...spans.map((span) => span.line));
      const lines = moved2.flatMap((entry, i) => reindented(this.lines.slice(spans[i].line, spans[i].line + spans[i].lineCount), entry.indent, ""));
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
      const moved2 = last ? [...apart2, ...core] : [...core, ...apart2];
      return this.withLines(this.cutAndInsert(cut, this.groupStartLine(section, before), moved2));
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
      const moved2 = this.lines.slice(content.first, content.last);
      return this.withLines(this.cutAndInsert(this.cutOf(section, from), this.groupInsertionLine(section, into, at), moved2));
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
      const moved2 = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, this.childIndent(parent));
      const without = this.splice(span.line, span.lineCount, []);
      without.splice(target > span.line ? target - span.lineCount : target, 0, ...moved2);
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
    cutAndInsert(cut, target, moved2) {
      const size = cut.to - cut.from;
      const lines = this.splice(cut.from, size, []);
      lines.splice(target >= cut.to ? target - size : Math.min(target, cut.from), 0, ...moved2);
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

  // core/domain/queries.ts
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
  function slottedOn(doc, date, boundary = DayBoundary.MIDNIGHT) {
    return listed(doc).filter((e) => slottedOnDate(e, date, boundary));
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
    const shown = column.kind === "day" ? dayList(doc, column.date, today, boundary) : column.kind === "soon" ? soonWithoutDate(doc) : doc.tasks(list);
    const groups = doc.groups(list);
    const ungrouped = ungroupedIndex(groups);
    const others = shown.filter((e) => e.section !== list);
    return groups.map((g) => ({ list, index: g.index, name: g.name, entries: [...g.index === ungrouped ? others : [], ...shown.filter((e) => e.section === list && g.entries.includes(e))] })).filter((g, i) => g.entries.length > 0 || groups[i].heading && g.name !== null && groups[i].entries.length === 0);
  }

  // core/domain/operations.ts
  var HOUR_MINUTES3 = 60;
  var MINUTE_MS = 6e4;
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
  function createAtTime(doc, date, today, start, text, boundary = DayBoundary.MIDNIGHT) {
    return createInSlot(doc, { date, start, end: null }, text, marksOf(null, []), today, boundary);
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
    const folded2 = entry.path.map((_, depth) => doc.find(entry.section, entry.index, entry.path.slice(0, depth))).filter((above) => above.task.collapsed);
    return doc.replaceAll(folded2.map((above) => [above, { ...above.task, collapsed: false }]));
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
    const slotted2 = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
    return slotted2.moveEntry(sameEntryIn(slotted2, entry), "soon", "end");
  }
  function clearSlot(doc, entry) {
    return patch(doc, entry, { slot: null });
  }
  function snoozedSlot(slot, now, minutes) {
    const at = new Date(now.getTime() + minutes * MINUTE_MS);
    const start = at.getHours() * HOUR_MINUTES3 + at.getMinutes();
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
    const changed2 = { ...entry.task, ...draftMarks(doc, entry.task, draft), ...same ? {} : { dueDate }, ...unsorted ? { slot: null } : {} };
    const edited = doc.replace(entry, withDraftRepeat(changed2, draft, today, boundary));
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

  // core/settings.ts
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

  // core/application/documentText.ts
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
  function readDocument(text, settings, today, boundary = boundaryOf(settings)) {
    return normalize(parseText(text, settings).ensureSections(sectionNames(settings)), today, boundary, usablePresets(settings.groups.presets));
  }
  function readingKey(settings) {
    return JSON.stringify([settings.sections, settings.groups.ungrouped, settings.groups.presets, markersOf(settings)]);
  }

  // core/domain/IsoMoment.ts
  var ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  var MINUTE_MS2 = 6e4;
  function isoMoment(text) {
    const m = ISO.exec(text.trim());
    if (!m) return new Date(Number.NaN);
    const [, y, mo, d, h, mi, s, fraction, zone] = m;
    const ms = fraction === void 0 ? 0 : Math.floor(Number(`0.${fraction}`) * 1e3);
    const fields = [Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms];
    if (!valid(fields)) return new Date(Number.NaN);
    if (h === void 0) return new Date(Date.UTC(...fields));
    if (zone === void 0) return new Date(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]);
    return new Date(Date.UTC(...fields) - offsetMinutes(zone) * MINUTE_MS2);
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
    const content = JSON.parse(text);
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
  function calendarFileText(file) {
    const iso = (d) => d ? d.toISOString() : null;
    const content = {
      exportedAt: file.exportedAt.toISOString(),
      device: file.device,
      from: iso(file.from),
      to: iso(file.to),
      validUntil: iso(file.validUntil),
      calendars: file.calendars.map((c) => ({ calendar: c.title, calendarId: c.calendarId, account: c.account, color: c.color, ...c.sourceId ? { sourceId: c.sourceId } : {} })),
      events: file.events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        allDay: e.allDay,
        calendar: e.calendar,
        calendarId: e.calendarId,
        account: e.account,
        color: e.color
      }))
    };
    return `${JSON.stringify(content, null, "	")}
`;
  }
  function phoneCalendarText(file) {
    const byId = /* @__PURE__ */ new Map();
    for (const c of file.calendars) if (!byId.has(c.calendarId)) byId.set(c.calendarId, c);
    return calendarFileText({
      exportedAt: new Date(file.exportedAtMs),
      device: file.device,
      from: new Date(file.fromMs),
      to: new Date(file.toMs),
      validUntil: file.validUntilMs === null || file.validUntilMs === void 0 ? null : new Date(file.validUntilMs),
      calendars: file.calendars.map((c) => ({ title: c.title, calendarId: c.calendarId, account: c.account, color: c.color ?? null, ...c.sourceId ? { sourceId: c.sourceId } : {} })),
      events: file.events.map((e) => {
        const calendar = byId.get(e.calendarId);
        return {
          id: e.id,
          title: e.title,
          start: new Date(e.startMs),
          end: new Date(e.endMs),
          allDay: e.allDay,
          calendar: calendar?.title ?? "",
          calendarId: e.calendarId,
          account: calendar?.account ?? null,
          color: calendar?.color ?? null
        };
      })
    });
  }
  var IPHONE_FRESH_MS = 10 * 6e4;
  function iphoneCalendarAdds(next, last, nowMs) {
    const before = parsedObject(last);
    const after = parsedObject(next);
    if (before === null || after === null || typeof before.exportedAt !== "string") return true;
    const written = isoMoment(before.exportedAt).getTime();
    if (Number.isNaN(written) || nowMs - written >= IPHONE_FRESH_MS) return true;
    return !sameJson(withoutExportedAt(before), withoutExportedAt(after));
  }
  function parsedObject(text) {
    if (text === null) return null;
    try {
      const value = JSON.parse(text);
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }
  function withoutExportedAt({ exportedAt: _, ...rest }) {
    return rest;
  }
  function sameJson(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return a === b;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson(a[k], b[k]));
  }

  // core/domain/RepeatDraft.ts
  var KINDS = ["schedule", "afterDone"];
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
    return { ...state, kinds: KINDS, units: UNITS, detail: detailOf(state), can: { fewer: writable({ ...state, every: state.every - 1 }) }, rule: ruleOf(state) };
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
  function changed(draft, change) {
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
    const next = changed(draft, change);
    return next && writable(next) ? draftOf(next) : null;
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
  var MINUTE_MS3 = 6e4;
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
      return new CalendarChoice(this.files, hidden, this.settings.staleAfterMinutes * MINUTE_MS3, this.now);
    }
  };

  // core/application/calendarDay.ts
  var KINDS2 = { google: "synced", iphone: "exported", work: "exported" };
  var MINUTE_MS4 = 6e4;
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
      const shown = (name) => events.filter((e) => e.source === name).length;
      return {
        events,
        allDay: events.filter((e) => e.allDay),
        timed: events.filter((e) => !e.allDay),
        statuses: this.reading.sources.map((source) => this.status(source, shown(source))),
        stale: chosen.stale
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
    shownChange(account, title, shown) {
      const others = this.hidden().filter((k) => k.account !== account || k.title !== title);
      return { hiddenCalendars: shown ? others : [...others, { account, title }], calendarsMigrated: true };
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
    status(source, shown) {
      const problem = this.reading.problem(source);
      const file = this.reading.files.get(source);
      const updatedAt = file?.exportedAt ?? null;
      return {
        source,
        kind: KINDS2[source],
        problem,
        events: shown,
        updatedAt,
        updatedDay: updatedAt === null ? null : this.relationOf(updatedAt),
        updatedDate: updatedAt === null ? null : localDateOf(updatedAt),
        detail: this.reading.fed(source) ? null : file?.device ?? null,
        stale: problem !== null || this.isOld(updatedAt)
      };
    }
    /** How the calendar date of `at` stands to the clock's: a moment's today and yesterday are calendar days, not the plugin's day. */
    relationOf(at) {
      return dayRelation(localDateOf(at), localDateOf(this.now));
    }
    isOld(updatedAt) {
      if (updatedAt === null) return true;
      return this.now.getTime() - updatedAt.getTime() > this.settings.staleAfterMinutes * MINUTE_MS4;
    }
  };

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

  // core/application/cardDue.ts
  function cardDue(item, day) {
    const date = item.dueDate !== null && item.dueDate !== day ? item.dueDate : null;
    const repeats = item.repeat !== null;
    return date === null && !repeats ? null : { date, repeats };
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
  function dueLabel(date) {
    const { month, day } = partsOf(date);
    return { day: String(day), month: MONTHS[month - 1].toUpperCase() };
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

  // core/application/timelineStack.ts
  var MINUTES_PER_HOUR = 60;
  var STACK_SLACK = 0.5;
  function overlayLeft(level, insets) {
    return level === 0 ? insets.itemInset : level * insets.overlayInset;
  }
  function eventLeft(level, insets) {
    return overlayLeft(level.level, insets);
  }
  function stackTasks(tasks, events, hourPx, card, insets) {
    const head = card.height;
    const y = (minutes) => minutes / MINUTES_PER_HOUR * hourPx;
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
    if (minutes < MINUTES_PER_HOUR) return [String(minutes), "MIN"];
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;
    return [rest ? `${hours}:${pad(rest)}` : String(hours), "H"];
  }
  function timeParts(minutes) {
    return [String(Math.floor(minutes / MINUTES_PER_HOUR)), pad(minutes % MINUTES_PER_HOUR)];
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function stackCorner(box, slotStart, span) {
    if (box.stacked) return timeParts(slotStart);
    if (box.hiddenDuration && span.end !== null) return durationParts(span.end - span.start);
    return null;
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

  // core/application/screenPlaces.ts
  var SCREEN_PLACES = ["inbox", "soon", "calendar"];
  var SHOWN_LISTS = { inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] };
  function placeShowing(column, place) {
    if (SHOWN_LISTS[place].includes(column)) return place;
    const from = SCREEN_PLACES.indexOf(place);
    const showing = SCREEN_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
    return showing.reduce((best, other) => Math.abs(SCREEN_PLACES.indexOf(other) - from) < Math.abs(SCREEN_PLACES.indexOf(best) - from) ? other : best);
  }

  // core/application/timelineZoom.ts
  var DEFAULT_ZOOM_LEVELS = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];
  var DEFAULT_ZOOM_HOUR = 56;
  function parseZoomLevels(text) {
    const levels = [];
    for (const part of text.split(",")) {
      const m = /^\s*(\d+)\s*(?::\s*\d+\s*)?$/.exec(part);
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
  var MINUTES_PER_HOUR2 = 60;
  function gridAt(hourPx, measures) {
    const px = (minutes) => minutes / MINUTES_PER_HOUR2 * hourPx;
    const labels = measures.divisions.find((minutes) => px(minutes) >= measures.labelGap) ?? MINUTES_PER_HOUR2;
    const ticks = px(measures.tickMinutes) >= measures.tickGap;
    return { labels, lines: ticks ? measures.tickMinutes : labels };
  }
  function gridMarks(grid, dayHours) {
    const marks = [];
    for (let minutes = grid.lines; minutes < dayHours * MINUTES_PER_HOUR2; minutes += grid.lines) {
      const minute = minutes % MINUTES_PER_HOUR2;
      if (minute === 0) continue;
      marks.push({ minute: minutes, label: minute % grid.labels === 0 ? `:${String(minute).padStart(2, "0")}` : null });
    }
    return marks;
  }
  function zoomLevelsOf(saved) {
    const kept = saved !== null && typeof saved === "object" ? saved.zoomLevels : void 0;
    if (!Array.isArray(kept) || kept.length === 0) return [...DEFAULT_ZOOM_LEVELS];
    const levels = kept.map((level) => level !== null && typeof level === "object" ? level.hourPx : void 0);
    if (!levels.every((hourPx) => typeof hourPx === "number" && Number.isFinite(hourPx) && hourPx > 0)) return [...DEFAULT_ZOOM_LEVELS];
    return levels.map((hourPx) => ({ hourPx }));
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

  // core/application/taskKeys.ts
  function samePlace2(a, b) {
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

  // core/application/nesting.ts
  function levelRange(cards, index, group) {
    const prev = cards[index - 1]?.group === group ? cards[index - 1] : void 0;
    const next = cards[index]?.group === group ? cards[index] : void 0;
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
    const next = cards[place.index]?.group === place.group ? cards[place.index] : void 0;
    const before = next && next.level === place.level ? next.key : null;
    if (place.level === 0) return { kind: "task", group: place.group, before };
    let parent = place.index - 1;
    while (cards[parent].level !== place.level - 1) parent--;
    return { kind: "subtask", parent: cards[parent].key, before };
  }
  function gapOfPlace(cards, place) {
    const at = (key) => cards.findIndex((card) => samePlace2(card.key, key));
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
  function groupPlaceOf(groups, lifted, slot) {
    if (slot === lifted || slot === lifted + 1) return null;
    return slot >= groups.length ? "end" : { before: groups[slot] };
  }

  // core/application/fullTree.ts
  function unfolded(items) {
    return items.map((item) => ({ ...item, collapsed: false, subtasks: unfolded(item.allSubtasks) }));
  }
  function rowsOf(items, level, rows) {
    for (const item of items) {
      const at = rows.length;
      rows.push({ item, level, newSubtask: { index: at + 1, level: level + 1 } });
      rowsOf(item.subtasks, level + 1, rows);
      rows[at] = { ...rows[at], newSubtask: { index: rows.length, level: level + 1 } };
    }
  }
  function fullTree(task) {
    const subtasks = unfolded(task.allSubtasks);
    const rows = [];
    rowsOf(subtasks, 0, rows);
    return { task, subtasks, rows, newSubtask: { index: rows.length, level: 0 } };
  }

  // core/application/QuickEntry.ts
  function entryAt(drawing, place, section) {
    const { cards, sections } = drawing;
    if (!sections.some((name) => name !== null)) return place.index <= cards.length ? { kind: "in", section: 0, card: place.index, keepsPlate: true } : { kind: "end" };
    const at = sections.indexOf(place.group);
    if (at < 0) return place.group === null ? { kind: "top" } : { kind: "end" };
    const start = cards.findIndex((card2) => sections.indexOf(card2.group) >= at);
    const from = start < 0 ? cards.length : start;
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
      if (samePlace2(renaming.key, task.key)) return { at: { kind: "title" }, pending: [] };
      const index = rows.findIndex((row) => samePlace2(row.item.key, renaming.key));
      return index < 0 ? null : { at: { kind: "row", index, level: rows[index].level }, pending: [] };
    }
    const parent = state.spot.parent;
    const place = samePlace2(parent, task.key) ? newSubtask : rows.find((row) => samePlace2(row.item.key, parent))?.newSubtask;
    if (!place) return null;
    return { at: { kind: "new", index: place.index, level: place.level }, pending: state.pending.map(({ text }) => ({ text, level: place.level })) };
  }
  var ENTRY_PLACES = ["inbox", "backlog", "soon", "now"];
  function emptySession() {
    return { field: null, runs: {}, jobs: [], next: 0 };
  }
  function listSpot(spot) {
    return spot.kind === "list" ? spot : null;
  }
  var ALL_COLUMNS = ["day", "soon", "inbox", "backlog"];
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
      const place = task ? this.shownPlace(field) : null;
      const run = this.run(field.run);
      return {
        spot: run.spot,
        text: field.text,
        priority: field.priority,
        labels: field.labels,
        repeat: field.repeat,
        pending: run.pending.map(({ text, level }) => ({ text, level })),
        renaming: field.rename?.item ?? null,
        indents: task && listSpot(run.spot) !== null,
        ...this.mayShift(field),
        section: this.maySection(field) ? field.section : null,
        marks,
        markable: task && marks.tiles.levels.length + marks.tiles.labels.length > 0,
        place,
        places: placeChoices(place),
        repeatable: task && run.spot.kind !== "slot",
        repeatDay: repeatDay(place && this.tasks.dayOfPlacement(place), this.look.today())
      };
    }
    /** The renamed task, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
    get renaming() {
      return this.session.field?.rename?.item.key ?? null;
    }
    /** What `column`'s list draws for the field: its gap, the texts waiting before it, and whether it is a section's name; null when it stands elsewhere. */
    /**
     * What `column`'s list draws for the field: none when it stands elsewhere. `drawn` is what the list is about to draw
     * (the look's cards and sections when left out); `at` is where among them the field stands.
     */
    listEntry(column, drawn) {
      const state = this.state;
      const list = state && listSpot(state.spot);
      if (!state || !list || list.column !== column) return null;
      const section = state.section === true;
      const drawing = drawn ?? { cards: this.look.cards(column), sections: this.look.sections(column) };
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
    /** The plus tapped: the end of the day column while it shows, else of Inbox. */
    openFromPlus() {
      this.openAtEnd(this.look.shown().includes("day") ? "day" : "inbox");
    }
    /** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
    openIn(column, group) {
      const cards = this.look.cards(column);
      this.open({ kind: "list", column, place: { kind: "gap", index: gapOfPlace(cards, { kind: "task", group, before: null }).index, level: 0, group } });
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
      if (!found) return { kind: "stack", parent };
      return { kind: "list", column: found.column, place: gapOfPlace(this.look.cards(found.column), { kind: "subtask", parent, before: null }) };
    }
    /**
     * Where `item` is renamed: right before its card in the list that shows it; else, opened from a menu's stack, there; else
     * over its card on the timeline; null when it shows nowhere the field can stand.
     */
    renameSpot(item, inStack) {
      const found = this.find(item.key);
      if (found) {
        const card = this.look.cards(found.column)[found.index];
        return { kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } };
      }
      if (inStack) return { kind: "stack", parent: item.key };
      return item.slot ? { kind: "slot", slot: item.slot } : null;
    }
    /** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
    open(spot, renaming) {
      if (this.session.field) this.save(this.session.field);
      const rename2 = renaming ? { item: renaming, home: this.newRun(spot), moved: false } : null;
      this.reset({ run: this.newRun(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, labels: renaming?.labels.map((l) => l.name) ?? [], repeat: renaming?.repeat ?? null, rename: rename2, section: false });
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
      const shown = this.shownPlace(field);
      if (shown && samePlacement(shown, placement)) return null;
      const column = placement.kind === "now" || placement.kind === "date" ? "day" : placement.kind;
      const rename2 = field.rename && { ...field.rename, moved: true };
      this.reset({ ...field, rename: rename2, run: this.newRun(this.endOf(column)) });
      const day = this.tasks.dayOfPlacement(placement);
      return { column, day: day === null || day === this.look.day() ? null : day };
    }
    /** The field, its text and marks, at the end of `column`; what was entered at the old spot is still written there. */
    moveToEnd(column) {
      const field = this.session.field;
      if (field) this.reset({ ...field, run: this.newRun(this.endOf(column)) });
    }
    /** Where a task written in `column` goes: a list's place, or the day column's on the day it shows. */
    placeOf(column, result) {
      if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
      const { group, before } = result;
      if (column !== "day") return { kind: "list", list: column, group, before };
      return { kind: "day", date: this.look.day(), group, before };
    }
    job(id) {
      const job = this.session.jobs.find((j) => j.id === id);
      if (!job) throw new Error(`Task Calendar: no entry job ${id}`);
      return job;
    }
    /**
     * The service call job `id` is, read when the lists show every write before it: a task at the level it was entered at,
     * as far as the cards then allow; a rename by the key the lists give the task then; a section at the top level where the
     * field stood. Null when it is nothing to write. A slot takes no rule.
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
              return { method: "createInPlace", args: [line.text, line.priority, { kind: "slot", slot: spot.slot }, null, line.labels] };
            case "stack":
              return { method: "createInPlace", args: [line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null }, line.repeat, line.labels] };
            case "list": {
              const cards = this.look.cards(spot.column);
              const place = fitLevel(cards, { ...spot.place, level: line.level });
              job.landing = spot.column;
              return { method: "createInPlace", args: [line.text, line.priority, this.placeOf(spot.column, placeOfGap(cards, place)), line.repeat, line.labels] };
            }
          }
          break;
        }
        case "rename":
          return { method: "edit", args: [this.keyAt(job.home, job.item), job.draft] };
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
    shown(id, created, coming) {
      const job = this.job(id);
      if (job.kind !== "create") return;
      const held = this.session.field?.run ?? null;
      const was = held === null ? null : this.run(held).spot;
      if (job.landing && created) this.landed(job.landing, created, coming(job.landing));
      this.run(job.run).pending.shift();
      job.shown = true;
      this.shifts = null;
      if (held !== null && (held === job.run || this.run(held).spot !== was)) this.emit(this.state, true);
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
      this.release(job.kind === "rename" ? job.home : job.run);
      this.session.jobs.splice(this.session.jobs.indexOf(job), 1);
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
      return list.place.level > 0 ? null : this.columnPlacement(list.column);
    }
    /** Where a renamed task goes: where it was, until a place is chosen in the bar. */
    placement(field) {
      const item = field.rename?.item ?? null;
      const list = listSpot(this.run(field.run).spot);
      if (list && (field.rename?.moved || !item)) return this.columnPlacement(list.column);
      return item ? this.tasks.placementOf(item) : this.columnPlacement("day");
    }
    columnPlacement(column) {
      return column === "day" ? this.tasks.placementOfDay(this.look.day()) : { kind: column };
    }
    /** After the last card, in the last section, at the top level. */
    endOf(column) {
      const sections = this.look.sections(column);
      return { kind: "list", column, place: { kind: "gap", index: this.look.cards(column).length, level: 0, group: sections[sections.length - 1] ?? null } };
    }
    find(key) {
      const shown = this.look.shown();
      for (const column of [...shown, ...ALL_COLUMNS.filter((c) => !shown.includes(c))]) {
        const index = this.look.cards(column).findIndex((card) => samePlace2(card.key, key));
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
        this.reset(list ? { run: this.newRun(this.under(list, rename2.item)), text: "", priority: null, labels: [], repeat: null, rename: null, section: false } : null);
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
      this.reset(this.run(field.run).spot.kind === "slot" ? null : { ...field, text: "", priority: null, labels: [], repeat: null });
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
      const draft = { text: field.text, placement: this.placement(field), priority: field.priority, ...!sameNames(field.labels, item.labels.map((l) => l.name)) && { labels: field.labels }, ...!sameRule(field.repeat, item.repeat) && { repeat: field.repeat } };
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
      const line = { text: field.text, priority: field.priority, labels: field.labels, repeat: field.repeat, level: listSpot(run.spot)?.place.level ?? 0 };
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
      const index = cards.findIndex((card) => samePlace2(card.key, created) && sameLine(card.key, created));
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
      const shown = item.subtasks.length > 0 && !item.collapsed;
      return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (shown ? 1 : 0) } };
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
      const shown = [...cards.slice(0, place.index), ...unwritten, ...cards.slice(place.index)];
      const shifted = shiftLevel(shown, { ...place, index: place.index + unwritten.length }, delta);
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
  function placeChoices(place) {
    const lists = ENTRY_PLACES.map((kind) => ({ kind, on: place?.kind === kind }));
    return [...lists, { kind: "date", on: place?.kind === "date", date: place?.kind === "date" ? place.date : null }];
  }
  function runsOf(field) {
    if (!field) return [];
    return field.rename ? [field.run, field.rename.home] : [field.run];
  }
  function sameNames(a, b) {
    return a.length === b.length && a.every((name, i) => name === b[i]);
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

  // core/application/sections.ts
  function rowsOf2(items, level = 0) {
    return items.flatMap((item) => [{ item, level }, ...item.collapsed ? [] : rowsOf2(item.subtasks, level + 1)]);
  }
  function groupOf(name, items) {
    const section = name !== null;
    return { name, items, rows: rowsOf2(items), empty: section && items.length === 0, menu: section ? { section: name, rename: true, remove: true } : null };
  }
  function listView(items, sections, listSections = []) {
    if (!sections) return { showsHeaders: false, groups: [groupOf(null, items)] };
    const groups = withEmptySections(byGroup(items), listSections);
    return { showsHeaders: groups.some((g) => g.name !== null), groups };
  }
  function byGroup(items) {
    const groups = [];
    for (const item of items) {
      const group = groups.find((g) => g.name === item.group);
      if (group) group.items.push(item);
      else groups.push({ name: item.group, items: [item] });
    }
    return groups.map((g) => groupOf(g.name, g.items));
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
      drawn.splice(at, 0, groupOf(section.name, []));
    });
    return drawn;
  }
  function shownSections(groups, sections) {
    const shown = groups.reduce((all, name) => all.some((g) => g.name === name) ? all : [...all, groupOf(name, [])], []);
    return withEmptySections(shown, sections).map((g) => g.name);
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

  // core/application/listDrop.ts
  function levelAt(x, list, indent) {
    return indent > 0 ? (x - (list.left + list.width / 2)) / indent : 0;
  }
  function carriedMiddle(y, grabPx, cardHeight) {
    return y - grabPx + cardHeight / 2;
  }
  function orderOf(heads, group) {
    return heads.findIndex((h) => h.group === group);
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
    const headAfterGap = (h) => gap !== null && (h.firstCard > gap.index || h.firstCard === gap.index && orderOf(heads, h.group) > orderOf(heads, gap.group));
    const headEdge = (h, i) => h.top + (headAfterGap(h) ? shift : 0) + (i === 0 && h.group !== null ? h.height : h.height / 2);
    const index = cards.filter((c, i) => y > top(i) + c.height / 2).length;
    const passed = heads.filter((head, i) => head.firstCard === index && y > headEdge(head, i)).map((head) => head.group);
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

  // core/application/ScreenSettingsImpl.ts
  function screenSettingsOf(settings) {
    return {
      longPressMs: settings.longPressMs,
      scrollToHour: settings.scrollToHour,
      tasksFile: settings.tasksFile,
      sections: settings.sections,
      ungrouped: settings.groups.ungrouped,
      priorities: settings.priorities,
      labels: settings.labels
    };
  }

  // core/application/SettingsServiceImpl.ts
  function countOf(text) {
    const n = Number(text);
    return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
  }
  var SECTION_ORDER = ["inbox", "now", "soon", "backlog", "done"];
  var MARKER_ORDER = ["dueDateMarker", "slotMarker", "alarmSlotMarker", "liveSlotMarker", "silentSlotMarker", "repeatMarker", "collapsedMarker"];
  var DAY_START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
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
        googleClientReady: s.google.clientId !== ""
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
        const start = lower.indexOf(piece, at);
        if (start < 0) return null;
        const joined = letters2 && start === at;
        if (!joined && insideWord(text, start)) broken++;
        const last = found[found.length - 1];
        if (last && last.end === start) last.end = start + piece.length;
        else found.push({ start, end: start + piece.length });
        at = start + piece.length;
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

  // core/application/marks.ts
  function markColors(priority, labels) {
    return priority ? [priority.color] : labels.map((label) => label.color);
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
    const offered = items.flatMap((item) => quickMoves(item, today));
    return MOVE_ORDER.flatMap((id) => offered.find((move) => move.id === id) ?? []);
  }
  function sharedDueDate(items) {
    const first = items[0]?.dueDate ?? null;
    return items.every((item) => item.dueDate === first) ? first : null;
  }
  var A_LIST_CARD = { kind: "task", from: "day" };
  var COLUMNS = /* @__PURE__ */ new Set(["day", "soon", "inbox", "backlog"]);
  function menuOffer(froms, screen, columnSections) {
    const shown = froms.every((from) => COLUMNS.has(from) && columnSections(from, screen.day) !== null);
    return shown ? screen.offer : null;
  }
  function tileStatus(id) {
    const statuses = { done: "done", inProgress: "inProgress", stopProgress: "todo", wontDo: "cancelled", stop: null };
    return statuses[id];
  }
  function menuStatuses(items, of) {
    const one = of.kind === "task";
    const progress = nextProgress(items.map((item) => item.status)) === "todo" ? "stopProgress" : "inProgress";
    return [
      { id: "done", confirm: false },
      { id: progress, confirm: false },
      { id: "wontDo", confirm: one },
      ...one && items.every((item) => item.can.stop) ? [{ id: "stop", confirm: true }] : []
    ];
  }
  function menuEdits(items, of, sections) {
    const section = sections ? ["section"] : [];
    if (of.kind === "bulk") return section;
    const item = items[0];
    const edits = [
      ["rename", true],
      ["reminder", item.can.remind],
      ["description", item.can.addDescription],
      ["repeat", item.repeatable],
      ["section", sections !== null],
      ["subtask", of.from !== "stack"]
    ];
    return edits.flatMap(([id, offered]) => offered ? [id] : []);
  }
  function menuSections(items, offer, of) {
    const choice = offer ? sectionChoice(items, offer) : null;
    if (!choice) return null;
    const shared = items.every((item) => item.group === choice.current);
    const names = [...choice.names, null];
    return { choice, options: names.map((name) => ({ name, checked: shared && name === choice.current })), create: of.kind === "task" };
  }
  function taskMenu(items, today, levels, labels, offer, of = A_LIST_CARD) {
    const sections = menuSections(items, offer, of);
    const edits = menuEdits(items, of, sections);
    return {
      statuses: menuStatuses(items, of),
      levels: { tiles: levels.map((level) => ({ level, on: levelOn(items, level.prefix) })), disabled: priorityHolders(items).length === 0 },
      labels: { tiles: labels.map((label) => ({ label, on: labelOn(items, label.name) })), disabled: labelHolders(items).length === 0 },
      moves: sharedMoves(items, today),
      removeDue: items.some((item) => item.can.removeDue),
      dueDate: sharedDueDate(items),
      sections,
      edits,
      reminders: edits.includes("reminder") ? REMINDER_KINDS.map((kind) => ({ kind, checked: kind === items[0].reminder })) : [],
      remove: { confirm: of.kind === "task" }
    };
  }
  function carriedWith(lifted, picked) {
    const id = keyId(lifted);
    return picked.filter((key) => keyId(key) !== id && !picked.some((other) => other !== key && isUnder(key, other)));
  }

  // core/application/taskItems.ts
  function progressOf(entry) {
    if (entry.subtasks.length === 0) return null;
    const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
    return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
  }
  function keyOf(entry) {
    return { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw };
  }
  var NO_LEVELS = { levelOf: () => null, labelsOf: () => [] };
  function itemLevels(levels, labels) {
    return {
      levelOf: (prefix) => levels.find((l) => l.prefix === prefix) ?? null,
      labelsOf: (names) => labels.filter((l) => names.includes(l.name))
    };
  }
  function toItem(entry, today, levels = NO_LEVELS, parent = null, boundary = DayBoundary.MIDNIGHT) {
    const marks = marksOfTask(entry.task);
    const choices = markChoices(marks);
    const priority = marks.priority === null ? null : levels.levelOf(marks.priority);
    const labels = levels.labelsOf(marks.labels);
    const allSubtasks = entry.subtasks.map((sub) => toItem(sub, today, levels, entry, boundary));
    const description = descriptionMarkdown(entry);
    return {
      key: keyOf(entry),
      text: entry.task.text,
      title: plainText(entry.task.text),
      status: entry.task.status,
      dueDate: entry.task.dueDate,
      slot: entry.task.slot,
      durationMin: entry.task.slot && entry.task.slot.end !== null ? entry.task.slot.end - entry.task.slot.start : null,
      reminder: entry.task.reminder,
      repeat: entry.task.repeat?.rule ?? null,
      open: isOpen(entry.task.status),
      repeatable: repeatable(entry),
      priority,
      labels,
      colors: markColors(priority, labels),
      group: entry.group,
      list: entry.section,
      isSubtask: entry.path.length > 0,
      day: dayOfTask(entry.section, entry.task, today),
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
        resize: entry.task.slot !== null
      },
      subtasks: allSubtasks.filter((sub) => sub.open),
      allSubtasks,
      progress: progressOf(entry),
      collapsed: entry.task.collapsed && hasOpenSubtask(entry),
      description,
      parentText: parent?.task.text ?? null,
      parentKey: parent ? keyOf(parent) : null
    };
  }

  // core/application/TimelineSpans.ts
  function droppedSpan(start, durationMin) {
    return clampSlot(start, durationMin === null ? null : start + durationMin);
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
    /**
     * The card while a dot is held at `minute`: the end no earlier than the start nor past the day; the start no earlier
     * than the day nor past the end, and on a task without a duration no later than its start, which becomes the end.
     */
    stretched(task, day, edge, minute) {
      const shown = this.shown(task, day);
      if (edge === "end") return { start: shown.start, end: Math.min(MINUTES_PER_DAY, Math.max(shown.start, minute)) };
      const end = shown.end ?? shown.start;
      return { start: Math.max(0, Math.min(minute, end)), end };
    }
    /**
     * The slot a dot let go at `minute` writes, null when nothing changes. A span no longer than `minDurationMin` loses
     * its duration and stands at its start; a task without one whose start dot was pulled keeps its start. The bottom dot
     * changes only how long the task lasts, so a card riding the now line ends where the finger let go while the file keeps
     * its own start; the top dot is a new start and writes it.
     */
    resized(task, day, edge, minute, minDurationMin) {
      const shown = this.shown(task, day);
      const held = this.stretched(task, day, edge, minute);
      const keepsDuration = held.end - held.start > minDurationMin;
      const unmoved = edge === "start" && shown.end === null;
      const next = keepsDuration ? held : { start: unmoved ? shown.start : held.start, end: null };
      if (next.start === shown.start && next.end === shown.end) return null;
      if (edge === "start") return this.boundary.slotAt(day, next.start, next.end);
      const start = this.boundary.spanOf(task.slot, day).start;
      return this.boundary.slotAt(day, start, next.end === null ? null : start + next.end - next.start);
    }
    /** Minutes from the start of `day` to now; null on another day than today. */
    nowOn(day) {
      return this.boundary.dayOf(this.now) === day ? this.boundary.offsetOf(day, this.now) : null;
    }
  };

  // core/application/TaskReads.ts
  function sectionsOf(doc, list) {
    return doc.groups(list).filter((g) => g.heading || g.entries.length > 0).map((g) => ({ name: g.name, empty: g.name !== null && g.entries.length === 0 }));
  }
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
    constructor(rules, settings, clock) {
      this.rules = rules;
      this.settings = settings;
      this.clock = clock;
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
    /** The screen of `date`: the file tidied for today first; without a file, the empty screen. */
    screenRead(date) {
      return { reads: true, tidies: true, missing: () => this.missingScreen(date), answer: (s) => this.screen(s, date) };
    }
    screen(s, date) {
      return {
        day: this.dayView(s, date),
        soon: this.soonWithoutDateView(s),
        inbox: this.inboxView(s),
        backlog: this.backlogView(s),
        done: this.doneView(s),
        sections: this.listSections(s),
        offer: this.sectionOffer(s, date),
        missing: false,
        calendars: true
      };
    }
    /** The screen without a tasks file: nothing in any list, and no calendars beside nothing. */
    missingScreen(date) {
      const none = { inbox: [], backlog: [], soon: [], now: [] };
      return {
        day: { date, list: [], slotted: [] },
        soon: [],
        inbox: [],
        backlog: [],
        done: [],
        sections: none,
        offer: { lists: none, ungrouped: this.settings.get().groups.ungrouped },
        missing: true,
        calendars: false
      };
    }
    dayView({ doc, today, boundary }, date) {
      const item = this.itemOf(today);
      return { date, list: dayList(doc, date, today, boundary).map(item), slotted: slottedOn(doc, date, boundary).map(item) };
    }
    soonWithoutDateView({ doc, today }) {
      return soonWithoutDate(doc).map(this.itemOf(today));
    }
    inboxView({ doc, today }) {
      return inboxList(doc).map(this.itemOf(today));
    }
    backlogView({ doc, today }) {
      return backlogList(doc).map(this.itemOf(today));
    }
    doneView({ doc, today }) {
      return doc.tasks("done").map(this.itemOf(today));
    }
    sectionOffer({ doc, today, boundary }, date) {
      const { presets, ungrouped } = this.settings.get().groups;
      const shown = [...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)];
      const names = (list) => offeredNames(shownSections(shown.filter((entry) => entry.section === list).map((entry) => entry.group), sectionsOf(doc, list)), presets, ungrouped);
      return { lists: { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") }, ungrouped };
    }
    listSections({ doc }) {
      return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf(doc, list)]));
    }
    /** A query that finds nothing reads no file. */
    searchRead(query) {
      return { reads: FuzzyQuery.of(query) !== null, answer: (s) => this.search(s, query) };
    }
    search(s, query) {
      const fuzzy = FuzzyQuery.of(query);
      if (!fuzzy || !s) return [];
      const { doc, today } = s;
      const item = this.itemOf(today);
      const ranked = [];
      const visit = (entry) => {
        const titleText = plainText(entry.task.text);
        const title = fuzzy.match(titleText);
        const markdown = descriptionMarkdown(entry);
        const descriptionText = markdown === null ? "" : plainDescription(markdown);
        const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
        if (title || description) {
          const hit = {
            item: item(entry),
            title: title ? matchParts(titleText, title.found) : [],
            description: description ? snippetParts(descriptionText, description.found) : null
          };
          ranked.push({ hit, title, description });
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
    screenOf({ doc, today }, item) {
      const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : void 0;
      return top ? taskScreen(top.section, dayOfTask(top.section, top.task, today)) : taskScreen(item.list, item.day);
    }
    findIn(items, key) {
      for (const item of items) {
        if (samePlace2(item.key, key)) return item;
        const inner = this.findIn(item.subtasks, key);
        if (inner) return inner;
      }
      return null;
    }
    find({ doc, today }, key, text) {
      const atPlace = doc.find(key.section, key.index, key.path);
      const alike = flatten(doc.allTasks()).filter((entry2) => entry2.raw === key.raw);
      const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : void 0;
      return entry ? this.itemAt(doc, entry, today) : null;
    }
    /** The tasks the keys name as the file has them, in their order; throws StaleTaskError when one is gone. */
    itemsAt({ doc, today }, keys) {
      const levels = this.itemLevels();
      return keys.map((key) => {
        const entry = this.rules.entryOf(doc, key);
        const parent = key.path.length > 0 ? doc.find(key.section, key.index, key.path.slice(0, -1)) ?? null : null;
        return toItem(entry, today, levels, parent);
      });
    }
    /** The task at `place` in `doc` as the UI sees it, with the task it sits under; null when none stands there. */
    itemAt(doc, place, today) {
      const entry = doc.find(place.section, place.index, place.path);
      if (!entry) return null;
      const parent = place.path.length > 0 ? doc.find(place.section, place.index, place.path.slice(0, -1)) ?? null : null;
      return toItem(entry, today, this.itemLevels(), parent, this.rules.moment().boundary);
    }
    /** The task's line in the file once tidied for today, from 0. */
    lineOfRead(key) {
      return { reads: true, tidies: true, answer: (s) => this.lineOf(s.text, key) };
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
    listName(list) {
      return this.settings.get().sections[list];
    }
    dayOfPlacement(placement) {
      return dayOfPlacement(placement, this.today());
    }
    menu(item, from, screen) {
      const offer = menuOffer([from], screen, (column, date) => this.columnSections(column, date));
      return taskMenu([item], screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "task", from });
    }
    bulkMenu(picked, screen) {
      const offer = menuOffer(picked.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
      return taskMenu(picked.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "bulk" });
    }
    carried(lifted, picked) {
      return carriedWith(lifted, picked);
    }
    fullTree(item) {
      return fullTree(item);
    }
    shownSpan(item, day) {
      return this.timeline().shown(slotted(item), day);
    }
    dropSpan(item, from, start) {
      return droppedSpan(start, from === "timeline" ? item?.durationMin ?? null : null);
    }
    newSlot(day, start) {
      return this.rules.moment().boundary.slotAt(day, droppedSpan(start, null).start, null);
    }
    stretch(item, day, edge, minute) {
      return this.timeline().stretched(slotted(item), day, edge, minute);
    }
    /** The timeline's rules by the clock and the day's boundary now. */
    timeline() {
      return new TimelineSpans(this.rules.moment().boundary, this.clock.now());
    }
    itemOf(today) {
      const levels = this.itemLevels();
      const { boundary } = this.rules.moment();
      return (entry) => toItem(entry, today, levels, null, boundary);
    }
    itemLevels() {
      const settings = this.settings.get();
      return itemLevels(usableLevels(settings.priorities), usableLabels(settings.labels));
    }
    today() {
      return this.rules.today();
    }
  };

  // core/domain/EntryTags.ts
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

  // core/application/TaskRules.ts
  var MOVES = /* @__PURE__ */ new Set(["postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest"]);
  function refsOf(change) {
    if (change.kind === "moveBefore" || change.kind === "moveToGroup") return [change.before];
    if (change.kind === "nest") return [change.parent, change.before];
    return [];
  }
  function sameKey(a, b) {
    return samePlace2(a, b) && sameLine(a, b);
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
      const changed2 = whole === parsed ? doc !== whole : normalize(parsed, today, boundary, presets) !== parsed;
      return { doc, changed: changed2 };
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
    /** The text as the file has it, unnormalized and without the sections it lacks: where a line stands in it. */
    parse(text) {
      return parseText(text, this.settings.get());
    }
    /** The document after `operation` on `doc`, already read and normalized at `at`, normalized again. */
    changeOf(doc, operation, at = this.moment()) {
      return this.written(doc, operation, at);
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
    /** The task sheet's edit, and where the task stands after it (null before it ran); null for a blank title, a priority alone too. */
    edit(key, draft) {
      if (this.isBlank(draft.text)) return null;
      let place = null;
      const operation = (doc, today, _settings, boundary) => {
        const { doc: tagged, tags } = EntryTags.tag(doc, [this.entryOf(doc, key)]);
        const entry = tags.find(tagged, 0);
        const edited = placeTask(tagged, entry, { ...draft, text: EntryTags.marked(taskTitle(draft.text), 0) }, today, void 0, boundary);
        const moved2 = tags.find(edited, 0);
        place = moved2 && { section: moved2.section, index: moved2.index, path: moved2.path, raw: "" };
        return tags.untag(edited);
      };
      return { operation, place: () => place };
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
        const plan = steps.filter((step) => !(MOVES.has(step.change.kind) && steps.some((other) => MOVES.has(other.change.kind) && isUnder(step.key, other.key)))).sort((a, b) => lineOf(a.key) - lineOf(b.key)).map((step) => ({ change: step.change, own: tagOf(step.key), refs: refsOf(step.change).map((ref) => ref === null ? null : tagOf(ref)) }));
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

  // core/application/TaskReminders.ts
  var HOUR_MINUTES4 = 60;
  function clockOf(date, minutes) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 0, minutes);
  }
  function keyOf2(entry) {
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
      return entry ? keyOf2(entry) : null;
    }
    reminder(entry, slot, at) {
      const nextDay = addDays(at.boundary.dayOfSlot(slot), 1);
      return {
        key: keyOf2(entry),
        title: plainText(entry.task.text),
        startMinute: slot.start,
        endMinute: slot.end,
        kind: entry.task.reminder === "none" ? "notification" : entry.task.reminder,
        date: slot.date,
        start: clockOf(slot.date, slot.start),
        dayEnd: clockOf(nextDay, at.boundary.startHour * HOUR_MINUTES4)
      };
    }
  };

  // core/application/TaskWrites.ts
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
    createAtTime(date, start, text) {
      return nothing(this.rules.createAtTime(date, start, text));
    }
    createInPlace(text, priority, place, repeat, labels = []) {
      return {
        operation: this.rules.createInPlace(text, priority, place, repeat, labels),
        answer: (change) => {
          const created = change?.after.insertedSince(change.before);
          return created ? { section: created.section, index: created.index, path: created.path, raw: created.raw } : null;
        }
      };
    }
    create(draft, slot) {
      return nothing(this.rules.create(draft, slot));
    }
    createSubtask(parent, draft) {
      return nothing(this.rules.createSubtask(parent, draft));
    }
    edit(key, draft) {
      const edit = this.rules.edit(key, draft);
      return {
        operation: edit?.operation ?? null,
        answer: (change) => {
          const place = edit?.place() ?? null;
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
      const all = this.setLabelsAll([{ key, labels }]);
      return { operation: all.operation, answer: (change) => all.answer(change)[0] ?? null };
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
    toTime(s, key, from, start, day) {
      const { slot } = this.rules.entryOf(s.doc, key).task;
      const span = droppedSpan(start, from === "timeline" && slot && slot.end !== null ? slot.end - slot.start : null);
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
    drop(tasks, to, day) {
      const moves = dropMoves(tasks, readDrop(to, (column) => this.reads.columnSections(column, day)), day);
      return {
        reads: moves.kind === "one" && moves.move.kind === "toTime",
        answer: (s) => this.landed(tasks, moves.kind === "one" ? this.moveOne(s, moves.key, moves.move) : this.applyAll(moves.steps))
      };
    }
    /** The dropped tasks where `write` left them. */
    landed(tasks, write) {
      return {
        operation: write.operation,
        answer: (change) => {
          if (!change) return tasks.map((task) => task.key);
          const moved2 = tasks.map((task) => this.rules.entryOf(change.before, task.key));
          return change.after.movedSince(change.before, moved2).flatMap((entry) => entry ? [{ section: entry.section, index: entry.index, path: entry.path, raw: entry.raw }] : []);
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

  // core/domain/TextPatch.ts
  var CONTEXT = 2;
  var TextPatch = class _TextPatch {
    constructor(changes) {
      this.changes = changes;
    }
    static between(before, after) {
      return new _TextPatch(hunksOf(before.split("\n"), after.split("\n")));
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
      return this.swap(current, "added", "removed");
    }
    /** `current` with the change made again, or null when a block it changes is no longer to be found. */
    apply(current) {
      return this.swap(current, "removed", "added");
    }
    swap(current, from, to) {
      const lines = current.split("\n");
      const shift = (hunk) => from === "added" ? hunk.after : hunk.before;
      const places = this.changes.map((hunk) => find(lines, hunk, hunk[from], shift(hunk)));
      if (places.some((place, i) => place === null || i > 0 && place <= places[i - 1] + this.changes[i - 1][from].length - 1)) return null;
      for (let i = this.changes.length - 1; i >= 0; i--) {
        const hunk = this.changes[i];
        lines.splice(places[i], hunk[from].length, ...hunk[to]);
      }
      return lines.join("\n");
    }
  };
  function find(text, hunk, lines, near) {
    const block = [...hunk.above, ...lines, ...hunk.below];
    let best = null;
    for (let start = 0; start + block.length <= text.length; start++) {
      if (hunk.atStart && start !== 0) break;
      if (hunk.atEnd && start + block.length !== text.length) continue;
      if (!block.every((line, i) => text[start + i] === line)) continue;
      const at = start + hunk.above.length;
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
    const same = sharedLines(b, a);
    const blocks = [];
    let i = 0;
    let j = 0;
    let open = null;
    const close = () => {
      if (open) blocks.push([head + open[0], head + i, head + open[1], head + j]);
      open = null;
    };
    for (const [x, y] of [...same, [b.length, a.length]]) {
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
    record(before, after) {
      const patch2 = TextPatch.between(before, after);
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
      return way === "undo" ? patch2.revert(text) : patch2.apply(text);
    }
    /** A step made: it can be made the other way now. A step that could not be made is dropped. */
    made(way, patch2) {
      (way === "undo" ? this.undone : this.done).push(patch2);
    }
    /** A whole step over `text`, at once: the outcome and the text it leaves. */
    step(way, text) {
      const patch2 = this.take(way);
      if (!patch2) return { outcome: "nothing", text };
      const next = _UndoSteps.make(way, patch2, text);
      if (next === null) return { outcome: "conflict", text };
      this.made(way, patch2);
      return { outcome: "done", text: next };
    }
  };

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

  // core/application/DayServiceImpl.ts
  function dayOpening(date, boundary, today, now, hour) {
    return date === today ? { kind: "now", minute: boundary.offsetOf(date, now) } : { kind: "hour", minute: boundary.offsetOfHour(hour) };
  }

  // core/application/PhoneCalls.ts
  var DoorError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };
  function settingsOf(json) {
    return settingsFrom(json.trim() === "" ? null : JSON.parse(json));
  }
  var Call = class {
    constructor(context) {
      this.context = context;
      /** What the call changed of the settings, every key it wrote. */
      this.changed = {};
      this.effects = {};
      this.settingsText = context.settings ?? "";
      this.current = settingsOf(this.settingsText);
      const clock = { now: () => new Date(context.nowMs) };
      this.clock = clock;
      const store = {
        get: () => this.current,
        update: async (patch2) => this.saveSettings(patch2),
        onChange: () => () => void 0
      };
      this.store = store;
      this.rules = new TaskRules(store, clock);
      this.reads = new TaskReads(this.rules, store, clock);
      this.writes = new TaskWrites(this.rules, this.reads);
      this.text = context.tasks ?? null;
    }
    get settings() {
      return this.current;
    }
    get now() {
      return new Date(this.context.nowMs);
    }
    /** The tasks file's text as this call has it now: a write earlier in the call already in it. */
    tasks() {
      if (this.text === null) throw new TasksFileMissingError(this.settings.tasksFile);
      return this.text;
    }
    hasTasks() {
      return this.text !== null;
    }
    snapshot() {
      const at = this.rules.moment();
      const text = this.tasks();
      return { text, doc: this.rules.read(text, at).doc, today: at.today, boundary: at.boundary };
    }
    /** A read as it asks: the file tidied first, read, or missing. */
    ask(read) {
      if (read.tidies) this.normalize();
      if (!read.reads) return read.answer(null);
      if (!this.hasTasks() && read.missing) return read.missing();
      return read.answer(this.snapshot());
    }
    /** The file tidied for today, as the plugin's service writes it before a screen: no step. */
    normalize() {
      if (this.text === null || !this.rules.read(this.text).changed) return;
      this.setText(this.rules.change(this.text, (d) => d).text, false);
    }
    /** A text the call wrote as one action: a step of the history. */
    write(text) {
      this.setText(text, true);
    }
    /** A write as one action: its operation over the text, the new text a step of the history. */
    run(write) {
      if (!write.operation) return write.answer(null);
      const before = this.tasks();
      const change = this.rules.change(before, write.operation);
      this.setText(change.text, true);
      return write.answer({ before: change.before, after: change.after });
    }
    /** The tasks text a step back or forward leaves. */
    undo(way) {
      const steps = new UndoSteps(this.context.history);
      const { outcome, text } = steps.step(way, this.tasks());
      this.effects.history = steps.state;
      if (text !== this.text) this.setText(text, false);
      return outcome;
    }
    /** A change of the settings, at once: the rest of the call reads it, and the answer's `data.json` has it, every other key kept, written as Obsidian writes it. */
    saveSettings(patch2) {
      this.current = { ...this.current, ...patch2 };
      this.changed = { ...this.changed, ...patch2 };
      const raw = this.settingsText.trim() === "" ? {} : JSON.parse(this.settingsText);
      this.effects.settings = JSON.stringify({ ...raw, ...this.changed }, null, 2);
    }
    setText(text, step) {
      const before = this.text;
      if (text === before) return;
      this.text = text;
      this.effects.tasks = text;
      if (!step) return;
      const steps = new UndoSteps(this.effects.history ?? this.context.history);
      if (before !== null && steps.record(before, text)) {
        this.effects.step = true;
        this.effects.history = steps.state;
      }
    }
  };
  var KEPT = (call) => call.snapshot();
  var TASKS = {
    priorityLevels: (c) => c.reads.priorityLevels(),
    labelLevels: (c) => c.reads.labelLevels(),
    parseTitle: (c, [text]) => c.reads.parseTitle(text),
    isBlank: (c, [text]) => c.reads.isBlank(text),
    withPriority: (c, [text, prefix]) => c.reads.withPriority(text, prefix ?? null),
    draftMarks: (c, [text, priority, labels]) => c.reads.draftMarks(text, priority ?? null, labels ?? []),
    screen: (c, [date]) => c.ask(c.reads.screenRead(date)),
    dayView: (c, [date]) => c.reads.dayView(KEPT(c), date),
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
    createAtTime: (c, [date, start, text]) => c.run(c.writes.createAtTime(date, start, text)),
    createInPlace: (c, [text, priority, place, repeat, labels]) => c.run(c.writes.createInPlace(text, priority ?? null, place, repeat ?? null, labels ?? [])),
    create: (c, [draft, slot]) => c.run(c.writes.create(draft, slot ?? void 0)),
    createSubtask: (c, [parent, draft]) => c.run(c.writes.createSubtask(parent, draft)),
    edit: (c, [key, draft]) => c.run(c.writes.edit(key, draft)),
    placementOf: (c, [item]) => c.reads.placementOf(item),
    dayColumn: (c, [date]) => c.reads.dayColumn(date),
    columnSections: (c, [column, date]) => c.reads.columnSections(column, date),
    placementOfDay: (c, [date]) => c.reads.placementOfDay(date),
    listName: (c, [list]) => c.reads.listName(list),
    dayOfPlacement: (c, [placement]) => c.reads.dayOfPlacement(placement),
    setStatus: (c, [key, status]) => c.run(c.writes.setStatus(key, status)),
    toggleDone: (c, [key]) => c.run(c.writes.toggleDone(key)),
    setDueDate: (c, [key, date]) => c.run(c.writes.setDueDate(key, date ?? null)),
    setPriority: (c, [key, priority]) => c.run(c.writes.setPriority(key, priority ?? null)),
    setLabels: (c, [key, labels]) => c.run(c.writes.setLabels(key, labels)),
    setLabelsAll: (c, [steps]) => c.run(c.writes.setLabelsAll(steps)),
    setReminder: (c, [key, reminder]) => c.run(c.writes.setReminder(key, reminder)),
    togglePriority: (c, [keys, prefix]) => c.run(c.ask(c.writes.togglePriority(keys, prefix))),
    toggleLabel: (c, [keys, name]) => c.run(c.ask(c.writes.toggleLabel(keys, name))),
    removeDue: (c, [keys]) => c.run(c.writes.removeDue(KEPT(c), keys)),
    menu: (c, [item, from, screen]) => c.reads.menu(item, from, screen),
    bulkMenu: (c, [picked, screen]) => c.reads.bulkMenu(picked, screen),
    pickStatus: (c, [keys, id]) => c.run(c.writes.pickStatus(keys, id)),
    postponeAll: (c, [keys, date]) => c.run(c.writes.postponeAll(KEPT(c), keys, date)),
    removeAll: (c, [keys]) => c.run(c.writes.removeAll(keys)),
    carried: (c, [lifted, picked]) => c.reads.carried(lifted, picked),
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
    dropSpan: (c, [item, from, start]) => c.reads.dropSpan(item ?? null, from, start),
    newSlot: (c, [day, start]) => c.reads.newSlot(day, start),
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
    drop: (c, [tasks, to, day]) => c.run(c.ask(c.writes.drop(tasks, to, day))),
    normalize: (c) => c.normalize(),
    createFile: (c) => {
      if (c.hasTasks()) throw new DoorError("failed", "the tasks file is there already");
      c.effects.tasks = c.rules.emptyFile();
    }
  };
  function boundaryOf2(c) {
    return c.rules.moment().boundary;
  }
  var DAYS = {
    today: (c) => c.rules.today(),
    relation: (c, [date]) => dayRelation(date, c.rules.today()),
    step: (_c, [date, days]) => addDays(date, days),
    openAt: (c, [date]) => dayOpening(date, boundaryOf2(c), c.rules.today(), c.now, c.settings.scrollToHour),
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
    slotAt: (c, [day, start, end]) => boundaryOf2(c).slotAt(day, start, end ?? null),
    hourAt: (c, [index]) => boundaryOf2(c).hourAt(index),
    offsetOfHour: (c, [hour]) => boundaryOf2(c).offsetOfHour(hour),
    clamp: (c, [slot, step]) => boundaryOf2(c).clamp(slot, step)
  };
  function wireEvent(e, calendar) {
    const { start, end, ...rest } = e;
    return { ...rest, startMs: start.getTime(), endMs: end.getTime(), past: calendar.isPast(e) };
  }
  function wireDay(day, calendar) {
    const wire = (events) => events.map((e) => wireEvent(e, calendar));
    return {
      events: wire(day.events),
      allDay: wire(day.allDay),
      timed: wire(day.timed),
      statuses: day.statuses.map(({ updatedAt, ...rest }) => ({ ...rest, updatedAtMs: updatedAt === null ? null : updatedAt.getTime() })),
      stale: day.stale
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
        problems.set(source, { kind: "failed", detail: e instanceof Error ? e.message : String(e) });
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
    setShown: (c, [account, title, shown]) => {
      c.saveSettings(calendarDay(c).shownChange(account, title, shown));
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
        const answer = new SettingsServiceImpl(c.store)[name](...args);
        return answer instanceof Promise ? null : answer;
      }
    ])
  );
  var SCREEN_SETTINGS = {
    get: (c) => screenSettingsOf(c.settings)
  };
  function reminderTime(start, end) {
    return end === null ? minutesToHHMM(start) : `${minutesToHHMM(start)}–${minutesToHHMM(end % MINUTES_PER_DAY)}`;
  }
  function onReminder(c, id, action) {
    const text = new TaskReminders(c.rules, c.clock).act(c.tasks(), id, action);
    if (text === null) throw new DoorError("staleTask", `no reminding task ${id}`);
    c.write(text);
  }
  var REMINDERS = {
    list: (c) => new TaskReminders(c.rules, c.clock).ringing(c.tasks()).map(
      ({ key, startMinute, endMinute, start, dayEnd, title, kind, date }) => ({
        id: key.raw,
        title,
        body: reminderTime(startMinute, endMinute),
        kind,
        date,
        startMs: start.getTime(),
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
    add: (c, [list, typed2, recording, tag]) => {
      const title = captureTitle({ typed: typed2, recording: recording ?? null, tag: tag ?? "" });
      if (title === "") throw new DoorError("blank", "the task has no title");
      c.write(c.rules.change(c.tasks(), c.rules.placeNew(title, null, { kind: "list", list, group: null, before: null })).text);
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
    samePlace: samePlace2,
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
    acceptsDrop,
    placesInGap,
    shadesOf,
    inkOf,
    contrast,
    eventHex,
    bgAlphaFor,
    eventColors: (hex, bgAlpha, theme) => eventColors(hex, bgAlpha ?? EVENT_BG_ALPHA, theme ?? "dark"),
    dayTitle,
    dueLabel,
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
    placeShowing
  };
  var CONSTANTS = { REMINDER_KINDS, MINUTES_PER_DAY, DESCRIPTION_TEMPLATE, PRIORITY_COLORS, EVENT_BG_ALPHA, LISTS: GROUPED_LISTS, DEFAULT_ZOOM_LEVELS, DEFAULT_ZOOM_HOUR, SCREEN_PLACES, SHOWN_LISTS };
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
      shown: () => look.shown
    };
  }
  var ENTRY_METHODS = [
    "listEntry",
    "openAtEnd",
    "openFromPlus",
    "openIn",
    "openSlot",
    "openAtDrop",
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
      return { session: entry.session, state: entry.state, changes, jobs, value: value === void 0 ? null : value };
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
  var SPACES = {
    tasks: TASKS,
    days: DAYS,
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
    rules: { ...Object.fromEntries(Object.entries(RULES).map(([name, fn]) => [name, (_c, args) => fn(...args)])), constants: () => CONSTANTS }
  };
  function doorMethods() {
    return Object.entries(SPACES).flatMap(([space, handlers]) => Object.keys(handlers).map((name) => `${space}.${name}`));
  }
  function callDoor(method, args, context) {
    try {
      const [space, name] = method.split(".");
      const handler = SPACES[space]?.[name];
      if (!handler || !Object.prototype.hasOwnProperty.call(SPACES, space) || !Object.prototype.hasOwnProperty.call(SPACES[space], name)) throw new DoorError("unknownMethod", `no method ${method}`);
      if (!Array.isArray(args)) throw new DoorError("badArguments", "the arguments are a list");
      const call = new Call(context);
      const result = handler(call, [...args]);
      return { ok: true, result: result === void 0 ? null : result, ...call.effects };
    } catch (e) {
      return { ok: false, error: errorOf(e) };
    }
  }
  function errorOf(e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof DoorError) return { code: e.code, message };
    if (e instanceof StaleTaskError) return { code: e.code, message };
    if (e instanceof TasksFileMissingError) return { code: e.code, message };
    if (e instanceof SyntaxError) return { code: "badArguments", message };
    return { code: "failed", message };
  }
  function plainJson(value, strict = false) {
    if (strict) checkPlain(value, "answer");
    return JSON.stringify(value);
  }
  function checkPlain(value, path) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${path} is ${value}: no JSON number`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((v, i) => checkPlain(v, `${path}[${i}]`));
    if (typeof value !== "object") throw new Error(`${path} is ${typeof value}: no JSON value`);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${path} is a ${value.constructor?.name ?? "class"}: no plain object`);
    for (const [key, v] of Object.entries(value)) {
      if (v === void 0) throw new Error(`${path}.${key} is undefined: JSON drops it`);
      checkPlain(v, `${path}.${key}`);
    }
  }
  function callDoorJson(method, argsJson, contextJson, strict = false) {
    let args;
    let context;
    try {
      args = argsJson.trim() === "" ? [] : JSON.parse(argsJson);
      context = JSON.parse(contextJson);
    } catch (e) {
      return JSON.stringify({ ok: false, error: { code: "badArguments", message: e instanceof Error ? e.message : String(e) } });
    }
    return plainJson(callDoor(method, args, context), strict);
  }

  // core/application/PhoneDoor.ts
  var SETTINGS_FILE = ".obsidian/plugins/task-calendar/data.json";
  var STALE = { changed: false, reason: "stale" };
  function answerOf(method, args, context) {
    return JSON.parse(callDoorJson(method, JSON.stringify(args), JSON.stringify(context)));
  }
  function resultOf(method, args, context) {
    const answer = answerOf(method, args, context);
    if (!answer.ok) throw new Error(answer.error.message);
    return answer.result;
  }
  function actionOf(method, args, context) {
    const answer = answerOf(method, args, context);
    if (answer.ok) return { changed: true, text: answer.tasks ?? context.tasks };
    if (answer.error.code === "staleTask" || answer.error.code === "blank") return STALE;
    throw new Error(answer.error.message);
  }
  var phoneDoor = {
    /** `reminders.list`. */
    reminders(text, settingsJson, nowMs) {
      return resultOf("reminders.list", [], { tasks: text, settings: settingsJson, nowMs });
    },
    /** `reminders.complete`. */
    complete(text, settingsJson, id, nowMs) {
      return actionOf("reminders.complete", [id], { tasks: text, settings: settingsJson, nowMs });
    },
    /** `reminders.silence`: the task stays on its time; it no longer reminds. */
    silence(text, settingsJson, id, nowMs) {
      return actionOf("reminders.silence", [id], { tasks: text, settings: settingsJson, nowMs });
    },
    /** `reminders.snooze`. */
    snooze(text, settingsJson, id, minutes, nowMs) {
      return actionOf("reminders.snooze", [id, minutes], { tasks: text, settings: settingsJson, nowMs });
    },
    /** `capture.add`; a blank title answers stale here. */
    capture(text, settingsJson, list, title, nowMs) {
      return actionOf("capture.add", [list, title], { tasks: text, settings: settingsJson, nowMs });
    },
    /** `calendars.files`: the calendars' files in the vault, in the order `meetings` takes their texts. */
    calendarFiles(settingsJson) {
      return resultOf("calendars.files", [], { tasks: null, settings: settingsJson, nowMs: 0 });
    },
    /** `calendars.meetings`, the files' texts in `calendarFiles`' order; a file missing (`null`) or unreadable adds none. */
    meetings(settingsJson, texts, fromMs, toMs, nowMs) {
      const calendars = Object.fromEntries(CALENDAR_SOURCES.map((source, i) => [source, texts[i] ?? null]));
      return resultOf("calendars.meetings", [fromMs, toMs], { tasks: null, settings: settingsJson, nowMs, calendars });
    },
    /**
     * Every call of the services a frontend makes, by name (`tasks.screen`, `entry.enter`, …: see `docs/door.md`): the
     * arguments a JSON list, the context the files' texts, the settings and the moment; the answer JSON, the result with the
     * texts to write back, or the error by its code.
     */
    call(method, argsJson, contextJson) {
      return callDoorJson(method, argsJson, contextJson);
    },
    /** Every method `call` answers, `space.name`. */
    methods() {
      return doorMethods();
    },
    /** The tasks file a host reads, by path from the vault folder, as the plugin reads it: none for a blank setting. */
    tasksFile(settingsJson) {
      return tasksFilePath(settingsOf(settingsJson));
    },
    /** The plugin's settings, `data.json`, by path from the vault folder: what `settings` in a call's context is read from. */
    settingsFile() {
      return SETTINGS_FILE;
    },
    /** Where the iOS app writes the phone's calendars, by path from the vault folder. */
    iphoneCalendarFile() {
      return IPHONE_CALENDAR_FILE;
    },
    /** `iphoneCalendarFile`'s text for the phone's calendars and events (`PhoneExport`, as JSON), in the format every writer of the calendars uses. */
    iphoneCalendarText(exportJson) {
      return phoneCalendarText(JSON.parse(exportJson));
    },
    /** Whether the phone's calendars as `iphoneCalendarText` wrote them now are worth writing over the file as it is (`null`: none). */
    iphoneCalendarAdds(newText, oldText, nowMs) {
      return iphoneCalendarAdds(newText, oldText, nowMs);
    },
    /** A task is one line: a line break in its title reads as one space, as the plugin writes it. */
    oneLine(text) {
      return oneLine(text);
    }
  };

  // core/phone/main.ts
  globalThis.TaskCalendarPhone = phoneDoor;
})();
