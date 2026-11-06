import Core
import SwiftUI
import UserNotifications

@main
struct TaskCalendarApp: App {
    private static let notifications = NotificationDelegate()

    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Versions before alarms were told by their id kept which task each alarm was for here.
        UserDefaults.standard.removeObject(forKey: "alarmReminders")
        Task { await UserNotifications.registerCategories() }
        UNUserNotificationCenter.current().delegate = Self.notifications
        #if DEBUG
        // A scratch vault for the simulator: `--vault <folder>`, a folder the app can reach without the picker.
        if let at = CommandLine.arguments.firstIndex(of: "--vault"), CommandLine.arguments.indices.contains(at + 1) {
            let folder = URL(fileURLWithPath: CommandLine.arguments[at + 1])
            try? AppServices.shared.vault.choose(folder: folder)
            UserDefaults.standard.set(folder.lastPathComponent, forKey: "vaultFolderName")
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            BoardScreen()
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
            }
        }
        .backgroundTask(.appRefresh(Refresh.identifier)) {
            Refresh.schedule()
            await AppServices.shared.refresh()
        }
    }
}
