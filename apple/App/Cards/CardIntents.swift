import AppIntents
import Foundation

/// The card's Done: closes nothing yet, the card asks first; a press that lands on it by chance costs nothing.
struct CardDoneIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Ask to Complete Task"
    static let isDiscoverable = false

    @Parameter(title: "Reminder") var reminderID: String

    init() {}

    init(reminderID: String) {
        self.reminderID = reminderID
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET
        await Cards.confirm(reminderID, asking: true)
        #endif
        return .result()
    }
}

/// The question's Cancel: the card is as it was.
struct CardCancelIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Keep Task Open"
    static let isDiscoverable = false

    @Parameter(title: "Reminder") var reminderID: String

    init() {}

    init(reminderID: String) {
        self.reminderID = reminderID
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET
        await Cards.confirm(reminderID, asking: false)
        #endif
        return .result()
    }
}

/// The question's Complete: closes the task; the sync then takes the card away.
struct CardCompleteIntent: LiveActivityIntent {
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

/// The card's meeting button: the task moves to the moment the meeting is over.
struct CardAfterMeetingIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Snooze Task Until a Meeting Ends"
    static let isDiscoverable = false

    @Parameter(title: "Reminder") var reminderID: String
    @Parameter(title: "Task") var title: String
    @Parameter(title: "Date") var date: String
    @Parameter(title: "Until") var until: Date

    init() {}

    init(reminderID: String, title: String, date: String, until: Date) {
        self.reminderID = reminderID
        self.title = title
        self.date = date
        self.until = until
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET
        await AppServices.shared.snooze(ShownReminder(id: reminderID, title: title, body: "", date: date), until: until)
        #endif
        return .result()
    }
}
