import Foundation

/// A new task asked for from outside the app: the screen opens it once the app is up.
struct CaptureRequest: Identifiable, Equatable {
    let id = UUID()
}

@MainActor
@Observable
final class CaptureRouter {
    static let shared = CaptureRouter()
    /// What the lock screen widget opens.
    static let url = URL(string: "taskcalendar://new-task")!

    var request: CaptureRequest?

    func open() {
        request = CaptureRequest()
    }

    func open(_ url: URL) {
        if url.scheme == Self.url.scheme, url.host == Self.url.host { open() }
    }
}
