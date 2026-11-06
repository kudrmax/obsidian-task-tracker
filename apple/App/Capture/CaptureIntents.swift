import AppIntents

/// Opens the app on a new task: the lock screen and Control Center buttons, the Action button, Siri, Shortcuts.
struct NewTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "New Task"
    static let description = IntentDescription("Opens a new task to type or record.")
    static let supportedModes: IntentModes = .foreground

    @MainActor
    func perform() async throws -> some IntentResult {
        #if !WIDGET
        CaptureRouter.shared.open()
        #endif
        return .result()
    }
}
