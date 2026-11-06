import Foundation

/// One delivery of a reminder's quiet notification.
public struct PlannedNotification: Equatable, Hashable, Sendable {
    public let reminderID: String
    /// After the task's start.
    let minutes: Int
    public let fire: Date
    public let after: AfterEvent?

    init(reminderID: String, minutes: Int, fire: Date, after: AfterEvent? = nil) {
        self.reminderID = reminderID
        self.minutes = minutes
        self.fire = fire
        self.after = after
    }

    /// The same delivery keeps its name between plans; a meeting moved or gone makes it another one, set again.
    public var id: NoticeID { .reminder(reminderID: reminderID, minutes: minutes, offer: after.map(NoticeID.Offer.init)) }
    public var identifier: String { id.identifier }

    func offering(_ after: AfterEvent?) -> PlannedNotification {
        guard let after else { return self }
        return PlannedNotification(reminderID: reminderID, minutes: minutes, fire: fire, after: after)
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
    /// the budget that tomorrow morning's task needs to be reminded at all. A card's task that started before it could be
    /// shown is told of at once (`fire` is `now`), unless a notification of it is already on the screen (`told`).
    public static func plan(_ reminders: [Reminder], now: Date, told: Set<String> = []) -> [PlannedNotification] {
        var firsts: [PlannedNotification] = []
        var repeats: [PlannedNotification] = []
        var seen = Set<String>()
        // Two identical task lines are one reminder: an action finds the task by its line.
        for reminder in reminders where seen.insert(reminder.id).inserted {
            if reminder.kind == .live, reminder.start <= now {
                if !told.contains(reminder.id), now < reminder.dayEnd {
                    firsts.append(PlannedNotification(reminderID: reminder.id, minutes: 0, fire: now))
                }
                continue
            }
            let offsets = offsets(for: reminder.kind)
            for offset in offsets {
                let fire = reminder.start.addingTimeInterval(Double(offset) * 60)
                guard fire < reminder.dayEnd else { break }
                guard fire > now else { continue }
                let planned = PlannedNotification(reminderID: reminder.id, minutes: offset, fire: fire)
                if offset == offsets.first { firsts.append(planned) } else { repeats.append(planned) }
            }
        }
        let kept = Array(firsts.sorted(by: nearest).prefix(budget))
        return (kept + repeats.sorted(by: nearest).prefix(budget - kept.count)).sorted(by: nearest)
    }

    private static func nearest(_ a: PlannedNotification, _ b: PlannedNotification) -> Bool {
        a.fire == b.fire ? (a.reminderID, a.minutes) < (b.reminderID, b.minutes) : a.fire < b.fire
    }
}
