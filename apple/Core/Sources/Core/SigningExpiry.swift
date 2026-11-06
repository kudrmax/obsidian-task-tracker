import Foundation

/// How long the app's signature has left. A free Apple ID signs the app for 7 days; after that it stops opening
/// until it is installed from the Mac again.
public struct SigningCountdown: Equatable, Sendable {
    public enum Urgency: Sendable {
        case calm, soon, urgent, expired
    }

    /// Whole days while a day or more is left, then hours rounded up.
    public enum Left: Equatable, Sendable {
        case days(Int), hours(Int), expired
    }

    public let urgency: Urgency
    public let left: Left

    public init(urgency: Urgency, left: Left) {
        self.urgency = urgency
        self.left = left
    }
}

/// A notice that the signature runs out, set ahead for when the app is not opened.
public struct SigningWarning: Equatable, Sendable {
    public let fire: Date
    public let left: SigningCountdown.Left
}

public enum SigningExpiry {
    private static let hour: TimeInterval = 3600
    private static let day = 24 * hour
    private static let warningLeads = [2 * day, day, 12 * hour, 2 * hour, hour]

    public static func countdown(expiration: Date, now: Date) -> SigningCountdown {
        let remaining = expiration.timeIntervalSince(now)
        let urgency: SigningCountdown.Urgency = switch remaining {
        case ...0: .expired
        case ...day: .urgent
        case ...(2 * day): .soon
        default: .calm
        }
        return SigningCountdown(urgency: urgency, left: left(remaining))
    }

    public static func warnings(expiration: Date, now: Date) -> [SigningWarning] {
        warningLeads
            .map { SigningWarning(fire: expiration.addingTimeInterval(-$0), left: left($0)) }
            .filter { $0.fire > now }
    }

    private static func left(_ remaining: TimeInterval) -> SigningCountdown.Left {
        if remaining <= 0 { return .expired }
        if remaining >= day { return .days(Int(remaining / day)) }
        return .hours(Int((remaining / hour).rounded(.up)))
    }
}
