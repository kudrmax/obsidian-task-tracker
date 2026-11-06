import Foundation

/// A new task asked for: the plus beside the tab bar, the lock screen widget, a control, Siri. It opens over the main screen.
@MainActor
@Observable
final class CaptureRouter {
    static let shared = CaptureRouter()
    /// What the lock screen widget opens.
    static let url = URL(string: "taskcalendar://new-task")!

    var capturing = false

    func open() {
        capturing = true
    }

    func open(_ url: URL) {
        if url.scheme == Self.url.scheme, url.host == Self.url.host { open() }
    }
}
