import AppIntents

/// Run by the «Obsidian Is Closed» automation: re-reads the tasks file without opening the app.
struct SyncRemindersIntent: AppIntent {
    static let title: LocalizedStringResource = "Обновить напоминания"
    static let description = IntentDescription("Перечитывает файл задач и ставит напоминания заново.")
    static let supportedModes: IntentModes = .background

    func perform() async throws -> some IntentResult {
        await AppServices.shared.refresh()
        return .result()
    }
}
