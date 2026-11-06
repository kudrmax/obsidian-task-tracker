import AppIntents
import Core

/// A task said to Siri or passed by a shortcut, written without opening the app.
struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Task"
    static let description = IntentDescription("Adds a task to Inbox, Now, Soon or Backlog in the tasks file.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Task", requestValueDialog: "What's the task?") var text: String
    @Parameter(title: "List", default: .inbox) var list: CaptureListOption

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) to \(\.$list)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch AppServices.shared.capture(list: list.core, text: text, recording: nil) {
        case .saved: return .result(dialog: "Added to \(list.title).")
        case .failed(let reason): throw CaptureError.failed(reason)
        }
    }
}

enum CaptureError: Error, CustomLocalizedStringResourceConvertible {
    case failed(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .failed(let reason): "\(reason)"
        }
    }
}

extension CaptureListOption {
    var core: CaptureList {
        switch self {
        case .inbox: .inbox
        case .now: .now
        case .soon: .soon
        case .backlog: .backlog
        }
    }

    var title: String {
        switch self {
        case .inbox: "Inbox"
        case .now: "Now"
        case .soon: "Soon"
        case .backlog: "Backlog"
        }
    }
}
