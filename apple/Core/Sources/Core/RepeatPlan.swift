import Foundation

/// One delivery of a reminder's quiet notification.
public struct PlannedNotification: Equatable, Hashable, Sendable {
    /// `"<reminder id>#<minutes after the start>"`: the same delivery keeps it between plans.
    public let identifier: String
    public let reminderID: String
    public let fire: Date
}

/// When a reminder's notification repeats: iOS keeps at most 64 pending notifications and never wakes the app to
/// deliver one, so the repeats are planned ahead, the nearest first, and each wake of the app plans them again.
public enum RepeatPlan {
    public static let budget = 60

    /// Minutes after the start: every minute for a quarter of an hour, every 5 to the hour, then every 15, within a day.
    public static func offsets(for kind: ReminderKind) -> [Int] {
        let all = Array(0..<15) + Array(stride(from: 15, to: 60, by: 5)) + Array(stride(from: 60, through: 24 * 60, by: 15))
        // An alarm rings at the start itself; its notification follows from the next minute.
        return kind == .alarm ? Array(all.dropFirst()) : all
    }

    public static func plan(_ reminders: [Reminder], now: Date) -> [PlannedNotification] {
        var planned: [PlannedNotification] = []
        var seen = Set<String>()
        // Two identical task lines are one reminder: an action finds the task by its line.
        for reminder in reminders where seen.insert(reminder.id).inserted {
            for offset in offsets(for: reminder.kind) {
                let fire = reminder.start.addingTimeInterval(Double(offset) * 60)
                guard fire < reminder.dayEnd else { break }
                guard fire > now else { continue }
                planned.append(PlannedNotification(identifier: "\(reminder.id)#\(offset)", reminderID: reminder.id, fire: fire))
            }
        }
        planned.sort { $0.fire == $1.fire ? $0.identifier < $1.identifier : $0.fire < $1.fire }
        return Array(planned.prefix(budget))
    }
}
