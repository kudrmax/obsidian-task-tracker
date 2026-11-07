import Foundation

/// A new task asked for: the plus beside the tab bar, the lock screen widget, a control, Siri. It opens over the main screen.
@MainActor
@Observable
final class CaptureRouter {
    static let shared = CaptureRouter()
    /// What the lock screen widget opens.
    static let url = URL(string: "taskcalendar://new-task")!

    var capturing = false
    /// The sheet opens typing: the plus asks for it; the lock screen widget opens it as before, the keyboard down.
    var typing = false

    func open() {
        typing = false
        capturing = true
    }

    /// The plus: the sheet with its field focused as it rises.
    func openTyping() {
        typing = true
        capturing = true
    }

    func open(_ url: URL) {
        if url.scheme == Self.url.scheme, url.host == Self.url.host { open() }
    }
}
