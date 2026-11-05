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

/// `calendar/iphone.json`, in the format every writer of the plugin's calendar files uses.
public enum CalendarExport {
    public static let path = "calendar/iphone.json"

    public static func text(calendars: [ExportedCalendar], events: [ExportedEvent], from: Date, to: Date, exportedAt: Date, device: String, validUntil: Date?) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let byId = Dictionary(calendars.map { ($0.calendarId, $0) }, uniquingKeysWith: { first, _ in first })
        let file: [String: Any] = [
            "exportedAt": iso.string(from: exportedAt),
            "device": device,
            "from": iso.string(from: from),
            "to": iso.string(from: to),
            "validUntil": validUntil.map(iso.string(from:)) ?? NSNull(),
            "calendars": calendars.map {
                ["calendar": $0.title, "calendarId": $0.calendarId, "account": $0.account, "color": $0.color ?? NSNull(), "sourceId": $0.sourceId ?? NSNull()] as [String: Any]
            },
            "events": events.map { event -> [String: Any] in
                let calendar = byId[event.calendarId]
                return [
                    "id": event.id, "title": event.title, "start": iso.string(from: event.start), "end": iso.string(from: event.end),
                    "allDay": event.allDay, "calendar": calendar?.title ?? "", "calendarId": event.calendarId,
                    "account": calendar?.account ?? NSNull(), "color": calendar?.color ?? NSNull(),
                ]
            },
        ]
        let data = try! JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys])
        return String(decoding: data, as: UTF8.self) + "\n"
    }

    /// Sync carries every write: the same calendars are written again only to say they are still fresh, at most this often.
    static let freshStep: TimeInterval = 10 * 60

    /// `new` says nothing `old` did not, and `old` is not yet due to be called fresh again.
    static func adds(_ new: String, over old: String?, at now: Date) -> Bool {
        guard let old, let before = parsed(old), let after = parsed(new) else { return true }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let written = (before["exportedAt"] as? String).flatMap(iso.date(from:)), now.timeIntervalSince(written) < freshStep else { return true }
        var a = before, b = after
        a["exportedAt"] = nil
        b["exportedAt"] = nil
        return !NSDictionary(dictionary: a).isEqual(to: b)
    }

    private static func parsed(_ text: String) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
    }
}
