import Foundation

/// One delivery of a reminder's quiet notification.
public struct PlannedNotification: Equatable, Hashable, Sendable {
    /// `"<reminder id>#<minutes after the start>"`, and the meeting it offers to wait out: the same delivery keeps it
    /// between plans, and a meeting moved or gone sets the delivery again.
    public let identifier: String
    public let reminderID: String
    public let fire: Date
    public let after: AfterEvent?

    init(identifier: String, reminderID: String, fire: Date, after: AfterEvent? = nil) {
        self.identifier = identifier
        self.reminderID = reminderID
        self.fire = fire
        self.after = after
    }

    func offering(_ after: AfterEvent?) -> PlannedNotification {
        guard let after else { return self }
        let until = Int(after.until.timeIntervalSince1970)
        return PlannedNotification(identifier: "\(identifier)#after \(until) \(after.title)", reminderID: reminderID, fire: fire, after: after)
    }
}

/// When a reminder's notification repeats: iOS keeps at most 64 pending notifications and never wakes the app to
/// deliver one, so the repeats are planned ahead, the nearest first, and each wake of the app plans them again.
public enum RepeatPlan {
    public static let budget = 60

    /// Minutes after the start: every minute for a quarter of an hour, every 5 to the hour, then every 15, within a day.
    public static func offsets(for kind: ReminderKind) -> [Int] {
        let all = Array(0..<15) + Array(stride(from: 15, to: 60, by: 5)) + Array(stride(from: 60, through: 24 * 60, by: 15))
        switch kind {
        case .notification: return all
        // An alarm rings at the start itself; its notification follows from the next minute.
        case .alarm: return Array(all.dropFirst())
        // A task whose card could not be shown is told of once: the card does not repeat either.
        case .live: return [0]
        }
    }

    /// Each reminder's first delivery is kept before any repeat: overdue tasks repeating all evening must not use up
    /// the budget that tomorrow morning's task needs to be reminded at all.
    public static func plan(_ reminders: [Reminder], now: Date) -> [PlannedNotification] {
        var firsts: [PlannedNotification] = []
        var repeats: [PlannedNotification] = []
        var seen = Set<String>()
        // Two identical task lines are one reminder: an action finds the task by its line.
        for reminder in reminders where seen.insert(reminder.id).inserted {
            let offsets = offsets(for: reminder.kind)
            for offset in offsets {
                let fire = reminder.start.addingTimeInterval(Double(offset) * 60)
                guard fire < reminder.dayEnd else { break }
                guard fire > now else { continue }
                let planned = PlannedNotification(identifier: "\(reminder.id)#\(offset)", reminderID: reminder.id, fire: fire)
                if offset == offsets.first { firsts.append(planned) } else { repeats.append(planned) }
            }
        }
        let kept = Array(firsts.sorted(by: nearest).prefix(budget))
        return (kept + repeats.sorted(by: nearest).prefix(budget - kept.count)).sorted(by: nearest)
    }

    private static func nearest(_ a: PlannedNotification, _ b: PlannedNotification) -> Bool {
        a.fire == b.fire ? a.identifier < b.identifier : a.fire < b.fire
    }
}
