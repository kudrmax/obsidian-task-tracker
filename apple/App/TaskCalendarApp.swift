import SwiftUI
import UserNotifications

@main
struct TaskCalendarApp: App {
    private static let notifications = NotificationDelegate()

    @Environment(\.scenePhase) private var scenePhase

    init() {
        UserNotifications.registerCategory()
        UNUserNotificationCenter.current().delegate = Self.notifications
    }

    var body: some Scene {
        WindowGroup {
            SettingsView()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { Refresh.schedule() }
        }
        .backgroundTask(.appRefresh(Refresh.identifier)) {
            Refresh.schedule()
            await AppServices.shared.refresh()
        }
    }
}
