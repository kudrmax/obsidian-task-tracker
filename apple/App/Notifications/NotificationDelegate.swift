import UIKit
import UserNotifications

/// Carries out what the person did with a reminder's notification.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let reminder = UserNotifications.shownReminder(response.notification.request) else { return }
        let services = AppServices.shared
        if let button = ReminderButton(identifier: response.actionIdentifier) {
            switch button {
            case .done: await services.complete(reminder)
            case .snooze(let minutes): await services.snooze(reminder, minutes: minutes)
            }
            return
        }
        switch response.actionIdentifier {
        case UserNotifications.afterEvent:
            guard let end = UserNotifications.afterEventEnd(response.notification.request.content) else { return }
            await services.snooze(reminder, until: end)
        case UNNotificationDefaultActionIdentifier:
            await Self.openCalendar(on: reminder.date)
        case UNNotificationDismissActionIdentifier:
            await services.refresh()
        default:
            break
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }

    @MainActor
    private static func openCalendar(on date: String) async {
        var link = URLComponents(string: "obsidian://task-calendar-open")!
        link.queryItems = [URLQueryItem(name: "date", value: date)]
        await UIApplication.shared.open(link.url!)
    }
}
