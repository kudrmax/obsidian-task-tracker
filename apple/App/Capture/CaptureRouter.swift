import Foundation

/// The app's two tabs.
enum AppTab: Hashable {
    case newTask, settings
}

/// Which tab is shown, and a new task asked for from outside the app: the lock screen widget, a control, Siri.
@MainActor
@Observable
final class CaptureRouter {
    static let shared = CaptureRouter()
    /// What the lock screen widget opens.
    static let url = URL(string: "taskcalendar://new-task")!

    var tab = AppTab.newTask
    /// Changes each time a new task is asked for: the screen puts the cursor in the task's field.
    private(set) var asked = 0

    func open() {
        tab = .newTask
        asked += 1
    }

    func open(_ url: URL) {
        if url.scheme == Self.url.scheme, url.host == Self.url.host { open() }
    }
}
