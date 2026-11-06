import AppIntents

/// The list a new task goes into, as Siri, Shortcuts and the controls name it.
enum CaptureListOption: String, AppEnum {
    case inbox, now

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "List"
    static let caseDisplayRepresentations: [CaptureListOption: DisplayRepresentation] = [
        .inbox: DisplayRepresentation(title: "Inbox", image: .init(systemName: "tray")),
        .now: DisplayRepresentation(title: "Now", image: .init(systemName: "sun.max")),
    ]
}

/// Opens the app on a new task: the lock screen and Control Center buttons, the Action button, Siri.
struct NewTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "New Task"
    static let description = IntentDescription("Opens a new task to type or record, in Inbox or Now.")
    static let supportedModes: IntentModes = .foreground

    @Parameter(title: "List", default: .inbox) var list: CaptureListOption
    @Parameter(title: "Start Recording", default: false) var voice: Bool

    init() {}

    init(list: CaptureListOption, voice: Bool) {
        self.list = list
        self.voice = voice
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        #if !WIDGET
        CaptureRouter.shared.open(list: list, voice: voice)
        #endif
        return .result()
    }
}
