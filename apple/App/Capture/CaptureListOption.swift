import Core

/// The lists the new task screen offers, Inbox first.
enum CaptureListOption: CaseIterable {
    case inbox, now, soon, backlog

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
