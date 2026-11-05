import Foundation

/// A meeting in the phone's calendars.
public struct CalendarEvent: Equatable, Sendable {
    public let title: String
    public let start: Date
    public let end: Date

    public init(title: String, start: Date, end: Date) {
        self.title = title
        self.start = start
        self.end = end
    }
}

/// The phone's calendars: the meetings with a time that the person goes to.
public protocol CalendarEvents: Sendable {
    func events(from: Date, to: Date) async -> [CalendarEvent]
}

/// No calendar access: no meeting to wait out.
public struct NoCalendarEvents: CalendarEvents {
    public init() {}
    public func events(from: Date, to: Date) async -> [CalendarEvent] { [] }
}

/// A notification's offer to move the task to the moment a meeting is over.
public struct AfterEvent: Equatable, Hashable, Sendable {
    /// The button's text: the meeting and how long until it ends, from the moment the notification shows.
    public let title: String
    public let until: Date

    static let longestName = 24

    /// The meeting under way at `fire`, or else the next to begin; one that ends after `dayEnd` is not offered:
    /// waiting it out would carry the task into the next day.
    static func offer(at fire: Date, before dayEnd: Date, among events: [CalendarEvent]) -> AfterEvent? {
        let next = events
            .filter { $0.end > fire && $0.end <= dayEnd }
            .min { ($0.start, $0.end) < ($1.start, $1.end) }
        return next.map { AfterEvent(title: "After \(name($0.title)) (\(duration(from: fire, to: $0.end)))", until: $0.end) }
    }

    private static func name(_ title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > longestName else { return trimmed.isEmpty ? "Meeting" : trimmed }
        return trimmed.prefix(longestName - 1).trimmingCharacters(in: .whitespaces) + "…"
    }

    private static func duration(from: Date, to: Date) -> String {
        let minutes = Int((to.timeIntervalSince(from) / 60).rounded(.up))
        let (hours, rest) = minutes.quotientAndRemainder(dividingBy: 60)
        switch (hours, rest) {
        case (0, _): return "\(rest) min"
        case (1, 0): return "1 hour"
        case (_, 0): return "\(hours) hours"
        default: return "\(hours) h \(rest) min"
        }
    }
}
