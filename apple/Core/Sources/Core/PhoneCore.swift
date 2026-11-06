import Foundation
import JavaScriptCore

public enum PhoneCoreError: Error, Equatable {
    case scriptFailed(String)
    /// The door refused a call: `code` is one of the door's (`staleTask`, `tasksFileMissing`, `unknownMethod`, …).
    case refused(code: String, message: String)
}

/// What a door call is made over: the files' texts, the settings and the moment.
public struct DoorContext: Sendable {
    public let tasks: String?
    public let settingsJSON: String
    public let now: Date
    /// Each calendar file's text by its source (`google`, `iphone`, `work`).
    public let calendars: [String: String]

    public init(tasks: String?, settingsJSON: String = "", now: Date, calendars: [String: String] = [:]) {
        self.tasks = tasks
        self.settingsJSON = settingsJSON
        self.now = now
        self.calendars = calendars
    }
}

/// The door's answer to a call that went through: the method's result as parsed JSON, and the texts to write back.
public struct DoorReply: @unchecked Sendable {
    public let result: Any?
    /// The tasks file's new text, when the call changed it.
    public let tasks: String?
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
        let answer = try invoke("call", method, try Self.json(arguments), try Self.json(Self.wire(context)))
        guard let text = answer.toString(), let reply = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
            throw PhoneCoreError.scriptFailed("\(method): not an answer")
        }
        guard reply["ok"] as? Bool == true else {
            let error = reply["error"] as? [String: Any]
            throw PhoneCoreError.refused(code: error?["code"] as? String ?? "failed", message: error?["message"] as? String ?? "")
        }
        return DoorReply(result: reply["result"].flatMap { $0 is NSNull ? nil : $0 }, tasks: reply["tasks"] as? String, settingsJSON: reply["settings"] as? String)
    }

    public func tasksFile(settingsJSON: String) throws -> String? {
        let value = try invoke("tasksFile", settingsJSON)
        if value.isNull || value.isUndefined { return nil }
        guard value.isString, let path = value.toString() else { throw PhoneCoreError.scriptFailed("tasksFile: not a path") }
        return path
    }

    public func captureLists() throws -> [CaptureList] {
        let constants = try call("rules.constants", context: DoorContext(tasks: nil, now: Date())).result as? [String: Any]
        guard let names = constants?["LISTS"] as? [String] else { throw PhoneCoreError.scriptFailed("rules.constants: no LISTS") }
        return names.map(CaptureList.init)
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

    public func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder] {
        let value = try invoke("reminders", text, settingsJSON, Self.ms(now))
        guard let rows = value.toArray() as? [[String: Any]] else { throw PhoneCoreError.scriptFailed("reminders: not a list") }
        return try rows.map(Self.reminder)
    }

    public func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(invoke("complete", text, settingsJSON, id, Self.ms(now)))
    }

    public func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(invoke("snooze", text, settingsJSON, id, minutes, Self.ms(now)))
    }

    public func silence(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(invoke("silence", text, settingsJSON, id, Self.ms(now)))
    }

    public func capture(list: CaptureList, title: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(invoke("capture", text, settingsJSON, list.name, title, Self.ms(now)))
    }

    public func calendarFiles(settingsJSON: String) throws -> [String] {
        guard let paths = try invoke("calendarFiles", settingsJSON).toArray() as? [String] else { throw PhoneCoreError.scriptFailed("calendarFiles: not a list") }
        return paths
    }

    public func meetings(settingsJSON: String, texts: [String?], from: Date, to: Date, now: Date) throws -> [CalendarEvent] {
        let value = try invoke("meetings", settingsJSON, texts.map { $0 ?? NSNull() as Any }, Self.ms(from), Self.ms(to), Self.ms(now))
        guard let rows = value.toArray() as? [[String: Any]] else { throw PhoneCoreError.scriptFailed("meetings: not a list") }
        return try rows.map { row in
            guard let title = row["title"] as? String else { throw PhoneCoreError.scriptFailed("not a meeting: \(row)") }
            return CalendarEvent(title: title, start: try Self.date(row["startMs"]), end: try Self.date(row["endMs"]))
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

    private static func json(_ value: Any) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), as: UTF8.self)
    }

    private static func wire(_ context: DoorContext) -> [String: Any] {
        ["tasks": context.tasks ?? NSNull(), "settings": context.settingsJSON, "nowMs": ms(context.now), "calendars": context.calendars]
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

    private static func action(_ value: JSValue) throws -> ActionResult {
        guard let row = value.toDictionary() as? [String: Any], let changed = row["changed"] as? Bool else {
            throw PhoneCoreError.scriptFailed("not an action result")
        }
        guard changed else { return .stale }
        guard let text = row["text"] as? String else { throw PhoneCoreError.scriptFailed("changed without text") }
        return .changed(text: text)
    }
}
