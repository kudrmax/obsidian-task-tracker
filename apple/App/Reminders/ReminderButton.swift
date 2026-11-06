/// A button a reminder offers. The notification and the card show the same ones, in this order: a change here changes both.
enum ReminderButton: Hashable, Sendable {
    case done
    case snooze(minutes: Int)

    static let all: [ReminderButton] = [.done, .snooze(minutes: 15), .snooze(minutes: 30), .snooze(minutes: 60)]

    /// The notification action's identifier: the button a person pressed is told by it.
    var identifier: String {
        switch self {
        case .done: "done"
        case .snooze(let minutes): "snooze\(minutes)"
        }
    }

    var title: String {
        switch self {
        case .done: "Done"
        case .snooze(let minutes) where minutes % 60 == 0: minutes == 60 ? "1 hour" : "\(minutes / 60) hours"
        case .snooze(let minutes): "\(minutes) min"
        }
    }

    init?(identifier: String) {
        guard let button = Self.all.first(where: { $0.identifier == identifier }) else { return nil }
        self = button
    }
}
