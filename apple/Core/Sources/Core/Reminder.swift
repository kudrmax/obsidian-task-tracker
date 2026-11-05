import Foundation

public enum ReminderKind: String, Sendable {
    /// `live`: a Live Activity on the lock screen, from the start until the task is done or moved.
    case notification, alarm, live
}

/// A task on a time, as the phone reminds of it: from `start` until its plugin day ends at `dayEnd`.
public struct Reminder: Equatable, Hashable, Sendable {
    /// The task's line as read; an action finds the task by it.
    public let id: String
    public let title: String
    public let body: String
    public let kind: ReminderKind
    /// The slot's date, `YYYY-MM-DD`.
    public let date: String
    public let start: Date
    public let dayEnd: Date

    public init(id: String, title: String, body: String, kind: ReminderKind, date: String, start: Date, dayEnd: Date) {
        self.id = id
        self.title = title
        self.body = body
        self.kind = kind
        self.date = date
        self.start = start
        self.dayEnd = dayEnd
    }
}

public enum ActionResult: Equatable, Sendable {
    case changed(text: String)
    /// The task is no longer where the reminder saw it.
    case stale
}

/// The plugin's rules for the tasks file.
public protocol TaskRules: Sendable {
    func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder]
    func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    /// The task keeps its time and stops reminding.
    func silence(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    /// The calendars' files in the vault, by path from its folder: the same the plugin's calendar reads.
    func calendarFiles(settingsJSON: String) throws -> [String]
    /// The meetings with a time in those files (`texts` in their order, `nil` for one missing) that overlap `from`–`to`.
    func meetings(settingsJSON: String, texts: [String?], from: Date, to: Date) throws -> [CalendarEvent]
}
