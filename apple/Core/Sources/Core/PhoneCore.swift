import Foundation
import JavaScriptCore

public enum PhoneCoreError: Error, Equatable {
    case scriptFailed(String)
}

/// Runs the plugin's phone module (`plugin/phone/task-calendar-phone.js`) in JavaScriptCore.
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

    public func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder] {
        let value = try call("reminders", text, settingsJSON, Self.ms(now))
        guard let rows = value.toArray() as? [[String: Any]] else { throw PhoneCoreError.scriptFailed("reminders: not a list") }
        return try rows.map(Self.reminder)
    }

    public func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(call("complete", text, settingsJSON, id, Self.ms(now)))
    }

    public func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(call("snooze", text, settingsJSON, id, minutes, Self.ms(now)))
    }

    public func silence(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult {
        try Self.action(call("silence", text, settingsJSON, id, Self.ms(now)))
    }

    public func calendarFiles(settingsJSON: String) throws -> [String] {
        guard let paths = try call("calendarFiles", settingsJSON).toArray() as? [String] else { throw PhoneCoreError.scriptFailed("calendarFiles: not a list") }
        return paths
    }

    public func meetings(settingsJSON: String, texts: [String?], from: Date, to: Date) throws -> [CalendarEvent] {
        let value = try call("meetings", settingsJSON, texts.map { $0 ?? NSNull() as Any }, Self.ms(from), Self.ms(to))
        guard let rows = value.toArray() as? [[String: Any]] else { throw PhoneCoreError.scriptFailed("meetings: not a list") }
        return try rows.map { row in
            guard let title = row["title"] as? String else { throw PhoneCoreError.scriptFailed("not a meeting: \(row)") }
            return CalendarEvent(title: title, start: try Self.date(row["startMs"]), end: try Self.date(row["endMs"]))
        }
    }

    private func call(_ name: String, _ arguments: Any...) throws -> JSValue {
        lock.lock()
        defer { lock.unlock() }
        failure = nil
        let value = phone.invokeMethod(name, withArguments: arguments)
        if let failure { throw PhoneCoreError.scriptFailed("\(name): \(failure)") }
        guard let value else { throw PhoneCoreError.scriptFailed("\(name): no result") }
        return value
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
