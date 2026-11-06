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

/// Which files of the vault hold the tasks and the plugin's settings.
public protocol TasksFileRule: Sendable {
    /// The tasks file by path from the vault folder; `nil` when the settings name none.
    func tasksFile(settingsJSON: String) throws -> String?
    /// The plugin's `data.json`, by path from the vault folder.
    func settingsFile() throws -> String
}

/// A calendar's file in the vault: `source` is the key its text goes under in `meetings`.
public struct CalendarFile: Equatable, Sendable {
    public let source: String
    public let path: String

    public init(source: String, path: String) {
        self.source = source
        self.path = path
    }
}

/// The plugin's rules for the tasks file.
public protocol TaskRules: TasksFileRule {
    func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder]
    func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    /// The task keeps its time and stops reminding.
    func silence(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult
    /// The calendars' files in the vault: the same the plugin's calendar reads.
    func calendarFiles(settingsJSON: String) throws -> [CalendarFile]
    /// The meetings with a time in those files (their texts by `CalendarFile.source`, a missing one left out) that overlap `from`–`to`.
    func meetings(settingsJSON: String, calendars: [String: String], from: Date, to: Date, now: Date) throws -> [CalendarEvent]
    /// A new task last in its list.
    func capture(_ task: CaptureTask, text: String, settingsJSON: String, now: Date) throws -> CaptureWrite
    /// The lists a new task is written into, in the order the new task screen offers them: the first is where Siri's goes.
    func captureLists(settingsJSON: String) throws -> [CaptureList]
    /// Where the phone's calendars go in the vault, by path from its folder.
    func iphoneCalendarFile() throws -> String
    /// That file's text for the phone's calendars, in the format every writer of the plugin's calendar files uses.
    func iphoneCalendarText(_ export: PhoneExport) throws -> String
    /// `new` is worth writing over `old`, the file as it is (`nil`: none).
    func iphoneCalendarAdds(_ new: String, over old: String?, now: Date) throws -> Bool
}
