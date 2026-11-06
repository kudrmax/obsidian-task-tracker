import Foundation
import JavaScriptCore

public enum PhoneCoreError: Error, Equatable {
    case scriptFailed(String)
    /// The door refused a call: `code` is one of the door's (`staleTask`, `tasksFileMissing`, `unknownMethod`, …).
    case refused(code: String, message: String)
}

/// The undo steps as the door last answered them: the host keeps them and hands them in again (`docs/door.md`, `history`).
public struct DoorHistory: Equatable, Sendable {
    /// The door's `history` as JSON text.
    public let json: String

    public init(json: String) {
        self.json = json
    }
}

/// What a door call is made over: the files' texts, the settings, the moment and the undo steps.
public struct DoorContext: Sendable {
    public let tasks: String?
    public let settingsJSON: String
    public let now: Date
    /// Each calendar file's text by its source (`google`, `iphone`, `work`: `TaskRules.calendarFiles`).
    public let calendars: [String: String]
    /// The calendar sources the host fetches itself; `nil` for the door's own default.
    public let fetched: [String]?
    /// The undo steps the last answer gave; `nil` before the first.
    public let history: DoorHistory?

    public init(tasks: String?, settingsJSON: String = "", now: Date, calendars: [String: String] = [:], fetched: [String]? = nil, history: DoorHistory? = nil) {
        self.tasks = tasks
        self.settingsJSON = settingsJSON
        self.now = now
        self.calendars = calendars
        self.fetched = fetched
        self.history = history
    }
}

/// The door's answer to a call that went through: the method's result as parsed JSON, and the texts to write back.
public struct DoorReply: @unchecked Sendable {
    public let result: Any?
    /// The tasks file's new text, when the call changed it.
    public let tasks: String?
    /// The write is a step undo takes back.
    public let step: Bool
    /// The undo steps after this call, to hand in with the next.
    public let history: DoorHistory?
    /// The new `data.json`, when the call changed the settings.
    public let settingsJSON: String?
}

/// Runs the core's phone module (`phone/task-calendar-phone.js`) in JavaScriptCore: every rule of the tasks
/// file is the core's, asked for through its door (`docs/door.md`).
public final class PhoneCore: TaskRules, @unchecked Sendable {
    private let context: JSContext
    private let phone: JSValue
    private let lock = NSLock()
    private var failure: String?

    public init(script: String) throws {
        guard let context = JSContext() else { throw PhoneCoreError.scriptFailed("No JavaScript context") }
        self.context = context
        var loadFailure: String?
        context.exceptionHandler = { _, exception in loadFailure = exception?.toString() }
        context.evaluateScript(script)
        if let loadFailure { throw PhoneCoreError.scriptFailed(loadFailure) }
        guard let phone = context.objectForKeyedSubscript("TaskCalendarPhone"), phone.isObject else {
            throw PhoneCoreError.scriptFailed("TaskCalendarPhone is missing")
        }
        self.phone = phone
        context.exceptionHandler = { [weak self] _, exception in self?.failure = exception?.toString() }
    }

    /// Every method `call` answers, `space.name`.
    public func methods() throws -> [String] {
        guard let names = try invoke("methods").toArray() as? [String] else { throw PhoneCoreError.scriptFailed("methods: not a list") }
        return names
    }

    /// A call of the plugin's services by name (`tasks.screen`, `rules.constants`, …) with its arguments in order.
    public func call(_ method: String, _ arguments: [Any] = [], context: DoorContext) throws -> DoorReply {
        let answer = try invoke("call", method, try Self.json(arguments), try Self.json(try Self.wire(context)))
        guard let text = answer.toString(), let reply = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
            throw PhoneCoreError.scriptFailed("\(method): not an answer")
        }
        guard reply["ok"] as? Bool == true else {
            let error = reply["error"] as? [String: Any]
            throw PhoneCoreError.refused(code: error?["code"] as? String ?? "failed", message: error?["message"] as? String ?? "")
        }
        return DoorReply(
            result: reply["result"].flatMap { $0 is NSNull ? nil : $0 },
            tasks: reply["tasks"] as? String,
            step: reply["step"] as? Bool ?? false,
            history: try reply["history"].flatMap { $0 is NSNull ? nil : $0 }.map { DoorHistory(json: try Self.json($0)) },
            settingsJSON: reply["settings"] as? String)
    }

    public func tasksFile(settingsJSON: String) throws -> String? {
        let value = try invoke("tasksFile", settingsJSON)
        if value.isNull || value.isUndefined { return nil }
        guard value.isString, let path = value.toString() else { throw PhoneCoreError.scriptFailed("tasksFile: not a path") }
        return path
    }

    public func settingsFile() throws -> String {
        guard let path = try invoke("settingsFile").toString() else { throw PhoneCoreError.scriptFailed("settingsFile: not a path") }
        return path
    }

    public func captureLists(settingsJSON: String) throws -> [CaptureList] {
        guard let rows = try call("capture.lists", context: DoorContext(tasks: nil, settingsJSON: settingsJSON, now: Date())).result as? [[String: Any]] else {
            throw PhoneCoreError.scriptFailed("capture.lists: not a list")
        }
        return try rows.map { row in
            guard let key = row["list"] as? String, let name = row["name"] as? String else { throw PhoneCoreError.scriptFailed("not a list: \(row)") }
            return CaptureList(key: key, name: name)
        }
    }

    public func iphoneCalendarFile() throws -> String {
        guard let path = try invoke("iphoneCalendarFile").toString() else { throw PhoneCoreError.scriptFailed("iphoneCalendarFile: not a path") }
        return path
    }

    public func iphoneCalendarText(_ export: PhoneExport) throws -> String {
        guard let text = try invoke("iphoneCalendarText", try Self.json(Self.wire(export))).toString() else {
            throw PhoneCoreError.scriptFailed("iphoneCalendarText: not a text")
        }
        return text
    }

    public func iphoneCalendarAdds(_ new: String, over old: String?, now: Date) throws -> Bool {
        let value = try invoke("iphoneCalendarAdds", new, old ?? NSNull(), Self.ms(now))
        guard value.isBoolean else { throw PhoneCoreError.scriptFailed("iphoneCalendarAdds: not a yes or no") }
        return value.toBool()
    }

    public func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder] {
        let context = DoorContext(tasks: text, settingsJSON: settingsJSON, now: now)
        guard let rows = try call("reminders.list", context: context).result as? [[String: Any]] else { throw PhoneCoreError.scriptFailed("reminders.list: not a list") }
        return try rows.map(Self.reminder)
    }

    public func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try action("reminders.complete", [id], DoorContext(tasks: text, settingsJSON: settingsJSON, now: now))
    }

    public func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try action("reminders.snooze", [id, minutes], DoorContext(tasks: text, settingsJSON: settingsJSON, now: now))
    }

    public func silence(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try action("reminders.silence", [id], DoorContext(tasks: text, settingsJSON: settingsJSON, now: now))
    }

    public func capture(_ task: CaptureTask, text: String, settingsJSON: String, now: Date) throws -> CaptureWrite {
        let arguments: [Any] = [task.list.key, task.typed, task.recording ?? NSNull(), task.tag]
        do {
            guard let written = try call("capture.add", arguments, context: DoorContext(tasks: text, settingsJSON: settingsJSON, now: now)).tasks else {
                throw PhoneCoreError.scriptFailed("capture.add: nothing written")
            }
            return .written(text: written)
        } catch PhoneCoreError.refused(let code, _) where code == "blank" {
            return .blank
        }
    }

    public func calendarFiles(settingsJSON: String) throws -> [CalendarFile] {
        guard let rows = try call("calendars.sources", context: DoorContext(tasks: nil, settingsJSON: settingsJSON, now: Date())).result as? [[String: Any]] else {
            throw PhoneCoreError.scriptFailed("calendars.sources: not a list")
        }
        return try rows.map { row in
            guard let source = row["source"] as? String, let path = row["path"] as? String else { throw PhoneCoreError.scriptFailed("not a calendar file: \(row)") }
            return CalendarFile(source: source, path: path)
        }
    }

    public func meetings(settingsJSON: String, calendars: [String: String], from: Date, to: Date, now: Date) throws -> [CalendarEvent] {
        let context = DoorContext(tasks: nil, settingsJSON: settingsJSON, now: now, calendars: calendars)
        guard let rows = try call("calendars.meetings", [Self.ms(from), Self.ms(to)], context: context).result as? [[String: Any]] else {
            throw PhoneCoreError.scriptFailed("calendars.meetings: not a list")
        }
        return try rows.map { row in
            guard let title = row["title"] as? String else { throw PhoneCoreError.scriptFailed("not a meeting: \(row)") }
            return CalendarEvent(title: title, start: try Self.date(row["startMs"]), end: try Self.date(row["endMs"]))
        }
    }

    /// An action on a reminder: the new text, or stale when the task is no longer where the reminder saw it.
    private func action(_ method: String, _ arguments: [Any], _ context: DoorContext) throws -> ActionResult {
        do {
            guard let text = try call(method, arguments, context: context).tasks else { throw PhoneCoreError.scriptFailed("\(method): changed without text") }
            return .changed(text: text)
        } catch PhoneCoreError.refused(let code, _) where code == "staleTask" {
            return .stale
        }
    }

    private func invoke(_ name: String, _ arguments: Any...) throws -> JSValue {
        lock.lock()
        defer { lock.unlock() }
        failure = nil
        let value = phone.invokeMethod(name, withArguments: arguments)
        if let failure { throw PhoneCoreError.scriptFailed("\(name): \(failure)") }
        guard let value else { throw PhoneCoreError.scriptFailed("\(name): no result") }
        return value
    }

    static func json(_ value: Any) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), as: UTF8.self)
    }

    static func wire(_ context: DoorContext) throws -> [String: Any] {
        var wire: [String: Any] = ["tasks": context.tasks ?? NSNull(), "settings": context.settingsJSON, "nowMs": ms(context.now), "calendars": context.calendars]
        if let fetched = context.fetched { wire["fetched"] = fetched }
        if let history = context.history { wire["history"] = try JSONSerialization.jsonObject(with: Data(history.json.utf8)) }
        return wire
    }

    private static func wire(_ export: PhoneExport) -> [String: Any] {
        [
            "calendars": export.calendars.map {
                ["title": $0.title, "calendarId": $0.calendarId, "account": $0.account, "color": $0.color ?? NSNull(), "sourceId": $0.sourceId ?? NSNull()] as [String: Any]
            },
            "events": export.events.map {
                ["id": $0.id, "title": $0.title, "startMs": ms($0.start), "endMs": ms($0.end), "allDay": $0.allDay, "calendarId": $0.calendarId] as [String: Any]
            },
            "fromMs": ms(export.from),
            "toMs": ms(export.to),
            "exportedAtMs": ms(export.exportedAt),
            "device": export.device,
            "validUntilMs": export.validUntil.map(ms) ?? NSNull(),
        ]
    }

    private static func ms(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded()
    }

    private static func date(_ value: Any?) throws -> Date {
        guard let ms = value as? Double else { throw PhoneCoreError.scriptFailed("not a time: \(String(describing: value))") }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    private static func reminder(_ row: [String: Any]) throws -> Reminder {
        guard let id = row["id"] as? String, let title = row["title"] as? String, let body = row["body"] as? String,
              let kind = (row["kind"] as? String).flatMap(ReminderKind.init(rawValue:)), let date = row["date"] as? String
        else { throw PhoneCoreError.scriptFailed("not a reminder: \(row)") }
        return Reminder(id: id, title: title, body: body, kind: kind, date: date, start: try Self.date(row["startMs"]), dayEnd: try Self.date(row["dayEndMs"]))
    }
}
