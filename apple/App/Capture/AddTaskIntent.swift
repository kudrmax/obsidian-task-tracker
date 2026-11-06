import AppIntents
import Core

/// A task said to Siri: it asks for the words and writes them into Inbox without opening the app.
struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Task"
    static let description = IntentDescription("Adds a task to Inbox without opening the app.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Task", requestValueDialog: "What's the task?") var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch AppServices.shared.capture(list: CaptureListOption.inbox, text: text, recording: nil) {
        case .saved: return .result(dialog: "Added to Inbox.")
        case .failed(let reason): throw AddTaskError(reason: reason)
        }
    }
}

struct AddTaskError: Error, CustomLocalizedStringResourceConvertible {
    let reason: String

    var localizedStringResource: LocalizedStringResource { "\(reason)" }
}
