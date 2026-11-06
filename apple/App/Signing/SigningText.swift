import Core
import Foundation

enum SigningText {
    static func left(_ left: SigningCountdown.Left) -> String {
        switch left {
        case .days(let days): days == 1 ? "1 day" : "\(days) days"
        case .hours(let hours): hours == 1 ? "1 hour" : "\(hours) hours"
        case .expired: "no time"
        }
    }

    static func end(_ expiration: Date) -> String {
        expiration.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())
    }
}
