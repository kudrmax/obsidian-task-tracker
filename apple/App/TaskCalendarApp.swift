import Core
import SwiftUI
import UserNotifications

@main
struct TaskCalendarApp: App {
    private static let notifications = NotificationDelegate()

    @Environment(\.scenePhase) private var scenePhase

    init() {
        Task { await UserNotifications.registerCategories() }
        UNUserNotificationCenter.current().delegate = Self.notifications
    }

    var body: some Scene {
        WindowGroup {
            SettingsView()
                .onOpenURL { url in
                    guard let back = RefreshLink.back(from: url) else { return }
                    Task {
                        await AppServices.shared.refresh()
                        await UIApplication.shared.open(back)
                    }
                }
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
