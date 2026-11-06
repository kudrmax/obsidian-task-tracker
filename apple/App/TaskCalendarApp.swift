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
            RootView()
                .onOpenURL { url in
                    if let back = RefreshLink.back(from: url) {
                        Task {
                            await AppServices.shared.refresh()
                            await UIApplication.shared.open(back)
                        }
                    } else {
                        CaptureRouter.shared.open(url)
                    }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                Refresh.schedule()
                CaptureRouter.shared.open()
            }
        }
        .backgroundTask(.appRefresh(Refresh.identifier)) {
            Refresh.schedule()
            await AppServices.shared.refresh()
        }
    }
}
