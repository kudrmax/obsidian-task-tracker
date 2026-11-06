import Foundation

/// A new task asked for from outside the app: the screen opens it once the app is up.
struct CaptureRequest: Identifiable, Equatable {
    let id = UUID()
    let list: CaptureListOption
    let voice: Bool
}

@MainActor
@Observable
final class CaptureRouter {
    static let shared = CaptureRouter()

    var request: CaptureRequest?

    func open(list: CaptureListOption, voice: Bool) {
        request = CaptureRequest(list: list, voice: voice)
    }
}
