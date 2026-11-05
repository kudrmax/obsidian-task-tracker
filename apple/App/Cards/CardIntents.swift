import AppIntents

/// The card's Done: closes the task; the sync then takes the card away.
struct CardDoneIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Complete Task"
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
        #if !WIDGET
        await AppServices.shared.complete(ShownReminder(id: reminderID, title: title, body: "", date: date))
        #endif
        return .result()
    }
}

/// The card's snoozes: move the task by so many minutes from now; the card comes back at the new time.
struct CardSnoozeIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Snooze Task"
    static let isDiscoverable = false

    @Parameter(title: "Reminder") var reminderID: String
    @Parameter(title: "Task") var title: String
    @Parameter(title: "Date") var date: String
    @Parameter(title: "Minutes") var minutes: Int

    init() {}

    init(reminderID: String, title: String, date: String, minutes: Int) {
        self.reminderID = reminderID
        self.title = title
        self.date = date
        self.minutes = minutes
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET
        await AppServices.shared.snooze(ShownReminder(id: reminderID, title: title, body: "", date: date), minutes: minutes)
        #endif
        return .result()
    }
}
