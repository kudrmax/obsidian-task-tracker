import Core
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
                .onOpenURL { url in
                    if let back = RefreshLink.back(from: url) {
                        Task {
                            await AppServices.shared.refresh()
                            await UIApplication.shared.open(back)
                        }
                    } else {
                        router.open(url)
                    }
                }
                .sheet(item: $router.request) { _ in
                    CaptureView { router.request = nil }
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
