import SwiftUI
import UserNotifications

@main
struct TaskCalendarApp: App {
    private static let notifications = NotificationDelegate()

    @Environment(\.scenePhase) private var scenePhase
    @State private var router = CaptureRouter.shared

    init() {
        Task { await UserNotifications.registerCategories() }
        UNUserNotificationCenter.current().delegate = Self.notifications
    }

    var body: some Scene {
        WindowGroup {
            SettingsView()
                .fullScreenCover(item: $router.request) { _ in
                    CaptureView { router.request = nil }
                }
                .onOpenURL { router.open($0) }
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
