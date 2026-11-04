import AppIntents

/// Run by the «Obsidian Is Closed» automation: re-reads the tasks file without opening the app.
struct SyncRemindersIntent: AppIntent {
    static let title: LocalizedStringResource = "Update Reminders"
    static let description = IntentDescription("Reads the tasks file again and sets its reminders.")
    static let supportedModes: IntentModes = .background

    func perform() async throws -> some IntentResult {
        await AppServices.shared.refresh()
        return .result()
    }
}
