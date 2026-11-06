import AppIntents
import Core

/// A task said to Siri: it asks for the words and writes them into the first list the new task screen offers (Inbox,
/// by its heading's name) without opening the app. The description is read when the app is built, so it names no list.
struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Task"
    static let description = IntentDescription("Adds a task without opening the app.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Task", requestValueDialog: "What's the task?") var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let list = AppServices.shared.captureLists().first else { throw AddTaskError(reason: AddTaskError.noList) }
        switch AppServices.shared.capture(list: list, text: text, recording: nil) {
        case .saved: return .result(dialog: "Added to \(list.name).")
        case .blank: throw AddTaskError(reason: AddTaskError.blank)
        case .failed(let reason): throw AddTaskError(reason: reason)
        }
    }
}

struct AddTaskError: Error, CustomLocalizedStringResourceConvertible {
    static let noList = "Couldn't add the task"
    static let blank = "The task has no words"

    let reason: String

    var localizedStringResource: LocalizedStringResource { "\(reason)" }
}
