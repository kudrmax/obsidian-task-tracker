import Core
import UserNotifications

/// The reminders' notifications in iOS: silent, with Done, three snoozes and, while a meeting is ahead in the task's day,
/// a snooze until it is over.
final class UserNotifications: NotificationScheduling {
    static let category = "task-reminder"
    private static let problem = "sync#problem"

    enum Action {
        static let done = "done"
        static let snoozes = ["snooze15": 15, "snooze30": 30, "snooze60": 60]
        static let afterEvent = "afterEvent"
    }

    private enum Key {
        static let reminderID = "reminderID"
        static let date = "date"
        static let afterTitle = "afterTitle"
        static let afterUntil = "afterUntil"
    }

    private static var center: UNUserNotificationCenter { .current() }

    /// A button's text is the category's, not the notification's: each meeting offered gets a category of its own,
    /// kept while a notification planned or shown still uses it.
    static func registerCategories() async {
        let shown = await center.deliveredNotifications().map(\.request.content)
        let planned = await center.pendingNotificationRequests().map(\.content)
        let offers = Set((shown + planned).compactMap { $0.userInfo[Key.afterTitle] as? String })
        center.setNotificationCategories(Set([category(after: nil)] + offers.map { category(after: $0) }))
    }

    private static func category(after offer: String?) -> UNNotificationCategory {
        let snooze = UNNotificationActionIcon(systemImageName: "clock.arrow.circlepath")
        var actions = [
            UNNotificationAction(identifier: Action.done, title: "Done", options: [], icon: UNNotificationActionIcon(systemImageName: "checkmark")),
            UNNotificationAction(identifier: "snooze15", title: "15 min", options: [], icon: snooze),
            UNNotificationAction(identifier: "snooze30", title: "30 min", options: [], icon: snooze),
            UNNotificationAction(identifier: "snooze60", title: "1 hour", options: [], icon: snooze),
        ]
        if let offer {
            actions.append(UNNotificationAction(identifier: Action.afterEvent, title: offer, options: [], icon: UNNotificationActionIcon(systemImageName: "calendar.badge.clock")))
        }
        return UNNotificationCategory(identifier: categoryID(after: offer), actions: actions, intentIdentifiers: [], options: [.customDismissAction])
    }

    private static func categoryID(after offer: String?) -> String {
        offer.map { "\(category)#\($0)" } ?? category
    }

    static func shownReminder(_ content: UNNotificationContent) -> ShownReminder? {
        guard let id = content.userInfo[Key.reminderID] as? String, let date = content.userInfo[Key.date] as? String else { return nil }
        return ShownReminder(id: id, title: content.title, body: content.body, date: date)
    }

    /// When the meeting the notification offered to wait out is over.
    static func afterEventEnd(_ content: UNNotificationContent) -> Date? {
        (content.userInfo[Key.afterUntil] as? Double).map(Date.init(timeIntervalSince1970:))
    }

    /// Shows the reminder again at once, saying why its button did nothing.
    static func showFailure(_ reason: String, of reminder: ShownReminder) {
        let content = content(of: reminder)
        content.subtitle = reason
        center.add(UNNotificationRequest(identifier: "\(reminder.id)#failed", content: content, trigger: nil))
    }

    /// Only the reminders': the sync leaves the app's other notices (the signature's) alone.
    func pending() async -> Set<String> {
        Set(await Self.center.pendingNotificationRequests().filter { $0.content.categoryIdentifier == Self.category }.map(\.identifier))
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
        let content = Self.content(of: shown)
        if let after = notification.after {
            content.categoryIdentifier = Self.categoryID(after: after.title)
            content.userInfo[Key.afterTitle] = after.title
            content.userInfo[Key.afterUntil] = after.until.timeIntervalSince1970
        }
        let request = UNNotificationRequest(
            identifier: notification.identifier,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
        try await Self.center.add(request)
        if notification.after != nil { await Self.registerCategories() }
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
