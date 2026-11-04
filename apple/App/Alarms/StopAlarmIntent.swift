import AppIntents

/// The alarm's Stop: the task keeps its time and no longer reminds.
struct StopAlarmIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Turn Off Reminder"
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
        await AppServices.shared.silence(ShownReminder(id: reminderID, title: title, body: "", date: date))
        return .result()
    }
}
