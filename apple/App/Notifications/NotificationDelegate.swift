import UIKit
import UserNotifications

/// Carries out what the person did with a reminder's notification.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let reminder = UserNotifications.shownReminder(response.notification.request.content) else { return }
        let services = AppServices.shared
        switch response.actionIdentifier {
        case UserNotifications.Action.done:
            await services.complete(reminder)
        case let action where UserNotifications.Action.snoozes[action] != nil:
            await services.snooze(reminder, minutes: UserNotifications.Action.snoozes[action]!)
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
