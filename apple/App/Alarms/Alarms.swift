import AlarmKit
import Core
import SwiftUI

/// The reminders' alarms in AlarmKit: the task's title, Stop (turns the task's reminder off) and Snooze.
final class Alarms: AlarmScheduling {
    /// Obsidian's accent, so a task's alarm is told apart from the Clock's.
    private static let tint = Color(red: 0.54, green: 0.42, blue: 0.94)

    private let ids = AlarmIDs()

    private var manager: AlarmManager { .shared }

    func id(for reminderID: String) -> String {
        ids.id(for: reminderID).uuidString
    }

    /// Only alarms still to ring: one ringing now is left alone, so a sync never silences it. One not set for a fixed
    /// time is not a reminder's and is listed to be taken away.
    func scheduled() async -> [String: Date] {
        var result: [String: Date] = [:]
        for alarm in (try? manager.alarms) ?? [] where alarm.state == .scheduled {
            guard case .fixed(let at) = alarm.schedule else {
                result[alarm.id.uuidString] = .distantPast
                continue
            }
            result[alarm.id.uuidString] = at
        }
        return result
    }

    func schedule(_ reminder: Reminder) async throws {
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: reminder.title),
            secondaryButton: AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz"),
            secondaryButtonBehavior: .custom)
        let attributes = AlarmAttributes(
            presentation: AlarmPresentation(alert: alert),
            metadata: TaskAlarmMetadata(reminderID: reminder.id),
            tintColor: Self.tint)
        let stop = StopAlarmIntent(reminderID: reminder.id, title: reminder.title, date: reminder.date)
        let snooze = SnoozeAlarmIntent(reminderID: reminder.id, title: reminder.title, date: reminder.date)
        _ = try await manager.schedule(
            id: ids.id(for: reminder.id),
            configuration: .alarm(schedule: .fixed(reminder.start), attributes: attributes, stopIntent: stop, secondaryIntent: snooze, sound: AppSettings.alarmSound ? .default : .named("silence.caf")))
    }

    func cancel(_ alarmIDs: [String]) async {
        for id in alarmIDs.compactMap(UUID.init(uuidString:)) {
            try? manager.cancel(id: id)
        }
    }
}
