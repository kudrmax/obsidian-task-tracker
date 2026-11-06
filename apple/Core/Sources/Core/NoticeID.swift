import Foundation

/// Every notification the app sets is named here and known again by that name alone: what a notification shows (its
/// buttons, the meeting it offers, its category) never decides whose it is or whether a sync takes it away.
public enum NoticeID: Hashable, Codable, Sendable {
    /// A reminder's delivery `minutes` after its task's start. The meeting it offers is part of it: a moved meeting
    /// makes it another delivery, set again.
    case reminder(reminderID: String, minutes: Int, offer: Offer?)
    /// A reminder shown again at once, saying why its button did nothing.
    case failure(reminderID: String)
    /// Why the reminders could not be brought up to date.
    case problem
    /// A warning that the signature runs out.
    case signing(Int)

    public struct Offer: Hashable, Codable, Sendable {
        public let title: String
        public let until: Int

        init(_ after: AfterEvent) {
            title = after.title
            until = Int(after.until.timeIntervalSince1970)
        }
    }

    private static let prefix = "tc:"

    public var identifier: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return Self.prefix + String(decoding: try! encoder.encode(self), as: UTF8.self)
    }

    /// `nil`: not a name given here, so one left by an older version of the app.
    public init?(identifier: String) {
        guard identifier.hasPrefix(Self.prefix),
              let id = try? JSONDecoder().decode(Self.self, from: Data(identifier.dropFirst(Self.prefix.count).utf8)) else { return nil }
        self = id
    }

    public var reminderID: String? {
        switch self {
        case .reminder(let id, _, _), .failure(let id): id
        case .problem, .signing: nil
        }
    }

    /// The reminder sync keeps these equal to the tasks file: a reminder's, and any it cannot name, which an older
    /// version left behind. The problem notice and the signing warnings have owners of their own.
    static func isSyncs(_ identifier: String) -> Bool {
        guard let id = NoticeID(identifier: identifier) else { return true }
        return id.reminderID != nil
    }
}
