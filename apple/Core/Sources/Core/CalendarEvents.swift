import Foundation

/// A meeting with a time, as the plugin's calendar shows it: read from the calendars' files in the vault.
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

/// A notification's offer to move the task to the moment a meeting is over.
public struct AfterEvent: Equatable, Hashable, Sendable {
    /// The button's text: the meeting and how long until it ends, from the moment the notification shows.
    public let title: String
    /// The meeting's name, shortened as the button shows it.
    public let meeting: String
    /// How long until the meeting is over, from the moment the notification shows: `1 h 28 min`.
    public let left: String
    public let until: Date

    init(meeting: String, left: String, until: Date) {
        self.title = "After \(meeting) (\(left))"
        self.meeting = meeting
        self.left = left
        self.until = until
    }

    static let longestName = 24

    /// The meeting under way at `fire`, or else the next to begin; one that ends after `dayEnd` is not offered:
    /// waiting it out would carry the task into the next day.
    public static func offer(at fire: Date, before dayEnd: Date, among events: [CalendarEvent]) -> AfterEvent? {
        let next = events
            .filter { $0.end > fire && $0.end <= dayEnd }
            .min { ($0.start, $0.end) < ($1.start, $1.end) }
        return next.map { AfterEvent(meeting: name($0.title), left: duration(from: fire, to: $0.end), until: $0.end) }
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
