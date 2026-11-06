import Foundation

/// A calendar of the phone, as the app exports it.
public struct ExportedCalendar: Sendable {
    public let title: String
    public let calendarId: String
    public let account: String
    public let color: String?
    /// The account's own id: two accounts may share a title («Gmail»).
    public let sourceId: String?

    public init(title: String, calendarId: String, account: String, color: String?, sourceId: String? = nil) {
        self.title = title
        self.calendarId = calendarId
        self.account = account
        self.color = color
        self.sourceId = sourceId
    }
}

/// A meeting of the phone, as the app exports it.
public struct ExportedEvent: Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let end: Date
    public let allDay: Bool
    public let calendarId: String

    public init(id: String, title: String, start: Date, end: Date, allDay: Bool, calendarId: String) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.allDay = allDay
        self.calendarId = calendarId
    }
}

/// The phone's calendars as the app writes them to the vault: `nil` when it may not read them.
public protocol CalendarExporting: Sendable {
    func export(now: Date) async throws -> String?
}

/// No calendar access asked for: nothing is written.
public struct NoCalendarExport: CalendarExporting {
    public init() {}
    public func export(now: Date) async throws -> String? { nil }
}

/// The phone's calendars and their meetings from `from` to `to`, as the app hands them to the plugin's door to be written.
public struct PhoneExport: Sendable {
    public let calendars: [ExportedCalendar]
    public let events: [ExportedEvent]
    public let from: Date
    public let to: Date
    public let exportedAt: Date
    public let device: String
    /// Until when the app can still write them: its signature's end.
    public let validUntil: Date?

    public init(calendars: [ExportedCalendar], events: [ExportedEvent], from: Date, to: Date, exportedAt: Date, device: String, validUntil: Date?) {
        self.calendars = calendars
        self.events = events
        self.from = from
        self.to = to
        self.exportedAt = exportedAt
        self.device = device
        self.validUntil = validUntil
    }
}
