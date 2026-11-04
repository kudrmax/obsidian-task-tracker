import SwiftUI
import UserNotifications

@main
struct TaskCalendarApp: App {
    private static let notifications = NotificationDelegate()

    init() {
        UserNotifications.registerCategory()
        UNUserNotificationCenter.current().delegate = Self.notifications
    }

    var body: some Scene {
        WindowGroup {
            Text("Task Calendar")
        }
    }
}
