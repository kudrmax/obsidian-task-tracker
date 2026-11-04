import Core
import UserNotifications

/// The reminders' notifications in iOS: silent, with Done and three snoozes.
final class UserNotifications: NotificationScheduling {
    static let category = "task-reminder"
    private static let problem = "sync#problem"

    enum Action {
        static let done = "done"
        static let snoozes = ["snooze15": 15, "snooze30": 30, "snooze60": 60]
    }

    private enum Key {
        static let reminderID = "reminderID"
        static let date = "date"
    }

    private static var center: UNUserNotificationCenter { .current() }

    static func registerCategory() {
        let snooze = UNNotificationActionIcon(systemImageName: "clock.arrow.circlepath")
        let actions = [
            UNNotificationAction(identifier: Action.done, title: "Done", options: [], icon: UNNotificationActionIcon(systemImageName: "checkmark")),
            UNNotificationAction(identifier: "snooze15", title: "15 min", options: [], icon: snooze),
            UNNotificationAction(identifier: "snooze30", title: "30 min", options: [], icon: snooze),
            UNNotificationAction(identifier: "snooze60", title: "1 hour", options: [], icon: snooze),
        ]
        center.setNotificationCategories([
            UNNotificationCategory(identifier: category, actions: actions, intentIdentifiers: [], options: [.customDismissAction]),
        ])
    }

    static func shownReminder(_ content: UNNotificationContent) -> ShownReminder? {
        guard let id = content.userInfo[Key.reminderID] as? String, let date = content.userInfo[Key.date] as? String else { return nil }
        return ShownReminder(id: id, title: content.title, body: content.body, date: date)
    }

    /// Shows the reminder again at once, saying why its button did nothing.
    static func showFailure(_ reason: String, of reminder: ShownReminder) {
        let content = content(of: reminder)
        content.subtitle = reason
        center.add(UNNotificationRequest(identifier: "\(reminder.id)#failed", content: content, trigger: nil))
    }

    func pending() async -> Set<String> {
        Set(await Self.center.pendingNotificationRequests().map(\.identifier))
    }

    func delivered() async -> [DeliveredNotification] {
        await Self.center.deliveredNotifications().compactMap { shown in
            guard let id = shown.request.content.userInfo[Key.reminderID] as? String else { return nil }
            return DeliveredNotification(identifier: shown.request.identifier, reminderID: id, at: shown.date)
        }
    }

    func schedule(_ notification: PlannedNotification, reminder: Reminder) async throws {
        let shown = ShownReminder(id: reminder.id, title: reminder.title, body: reminder.body, date: reminder.date)
        let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: notification.fire)
        let request = UNNotificationRequest(
            identifier: notification.identifier,
            content: Self.content(of: shown),
            trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
        try await Self.center.add(request)
    }

    func removePending(_ ids: [String]) async {
        Self.center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func removeDelivered(_ ids: [String]) async {
        Self.center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    /// One notice at most: the same reason already on screen is not shown again on every wake-up.
    func showProblem(_ reason: String?) async {
        guard let reason else {
            Self.center.removeDeliveredNotifications(withIdentifiers: [Self.problem])
            return
        }
        let shown = await Self.center.deliveredNotifications().contains { $0.request.identifier == Self.problem && $0.request.content.body == reason }
        guard !shown else { return }
        let content = UNMutableNotificationContent()
        content.title = "Reminders Not Updated"
        content.body = reason
        content.sound = nil
        content.interruptionLevel = .active
        try? await Self.center.add(UNNotificationRequest(identifier: Self.problem, content: content, trigger: nil))
    }

    private static func content(of reminder: ShownReminder) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = reminder.title
        content.body = reminder.body
        content.sound = nil
        content.interruptionLevel = .active
        content.threadIdentifier = reminder.id
        content.categoryIdentifier = category
        content.userInfo = [Key.reminderID: reminder.id, Key.date: reminder.date]
        return content
    }
}
