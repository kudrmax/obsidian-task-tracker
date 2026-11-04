import AlarmKit
import Core
import SwiftUI

/// The reminders' alarms in AlarmKit: the task's title, the system Stop, and Snooze.
final class Alarms: AlarmScheduling {
    private let ids = AlarmIDs()

    private var manager: AlarmManager { .shared }

    /// Only alarms still to ring: one ringing now is left alone, so a sync never silences it.
    func scheduled() async -> [String: Date] {
        var result: [String: Date] = [:]
        for alarm in (try? manager.alarms) ?? [] where alarm.state == .scheduled {
            guard case .fixed(let at) = alarm.schedule, let reminderID = ids.reminderID(of: alarm.id) else { continue }
            result[reminderID] = at
        }
        return result
    }

    func schedule(_ reminder: Reminder) async throws {
        if manager.authorizationState == .notDetermined {
            _ = try await manager.requestAuthorization()
        }
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: reminder.title),
            secondaryButton: AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz"),
            secondaryButtonBehavior: .custom)
        let attributes = AlarmAttributes(
            presentation: AlarmPresentation(alert: alert),
            metadata: TaskAlarmMetadata(reminderID: reminder.id),
            tintColor: .orange)
        let snooze = SnoozeAlarmIntent(reminderID: reminder.id, title: reminder.title, date: reminder.date)
        _ = try await manager.schedule(
            id: ids.id(for: reminder.id),
            configuration: .alarm(schedule: .fixed(reminder.start), attributes: attributes, secondaryIntent: snooze, sound: .named("alarm.caf")))
    }

    func cancel(_ reminderIDs: [String]) async {
        for reminderID in reminderIDs {
            let id = ids.id(for: reminderID)
            try? manager.cancel(id: id)
            ids.forget(id)
        }
    }
}
