import AlarmKit
import AppIntents

/// The alarm's Snooze: silences it and moves the task by the app's alarm snooze.
struct SnoozeAlarmIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Snooze Task"
    static let isDiscoverable = false

    @Parameter(title: "Reminder") var reminderID: String
    @Parameter(title: "Task") var title: String
    @Parameter(title: "Date") var date: String

    init() {}

    init(reminderID: String, title: String, date: String) {
        self.reminderID = reminderID
        self.title = title
        self.date = date
    }

    func perform() async throws -> some IntentResult {
        try? AlarmManager.shared.stop(id: AlarmIDs().id(for: reminderID))
        let reminder = ShownReminder(id: reminderID, title: title, body: "", date: date)
        await AppServices.shared.snooze(reminder, minutes: AppSettings.alarmSnooze)
        return .result()
    }
}
