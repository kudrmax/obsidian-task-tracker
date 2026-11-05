import AlarmKit
import EventKit
import Core
import Foundation
import UserNotifications

@MainActor
@Observable
final class SettingsModel {
    private static let folderKey = "vaultFolderName"

    private(set) var status = LastSync.load()
    private(set) var folderName = UserDefaults.standard.string(forKey: folderKey)
    private(set) var notifications = UNAuthorizationStatus.notDetermined
    private(set) var alarms = AlarmManager.AuthorizationState.notDetermined
    private(set) var calendar = EKAuthorizationStatus.notDetermined

    var alarmSound = AppSettings.alarmSound {
        didSet {
            AppSettings.alarmSound = alarmSound
            Task { await AppServices.shared.resetAlarms() }
        }
    }

    var alarmSnooze = AppSettings.alarmSnooze {
        didSet { AppSettings.alarmSnooze = alarmSnooze }
    }

    func refresh() async {
        status = await AppServices.shared.refresh()
        await loadPermissions()
    }

    func choose(_ picked: Result<URL, Error>) async {
        do {
            let folder = try picked.get()
            try AppServices.shared.vault.choose(folder: folder)
            folderName = folder.lastPathComponent
            UserDefaults.standard.set(folderName, forKey: Self.folderKey)
        } catch {
            status = .failed("Couldn't open the folder: \(error.localizedDescription)")
            return
        }
        await refresh()
    }

    func allowNotifications() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])
        await refresh()
    }

    func allowAlarms() async {
        _ = try? await AlarmManager.shared.requestAuthorization()
        await refresh()
    }

    func allowCalendar() async {
        await PhoneCalendar.requestAccess()
        await refresh()
    }

    private func loadPermissions() async {
        notifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        alarms = AlarmManager.shared.authorizationState
        calendar = EKEventStore.authorizationStatus(for: .event)
    }
}
