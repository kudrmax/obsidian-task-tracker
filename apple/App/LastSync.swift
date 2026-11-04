import Core
import Foundation

/// The outcome of the latest sync, kept for the settings screen: most syncs happen in the background.
enum LastSync {
    private static let key = "lastSync"

    @discardableResult
    static func save(_ status: SyncStatus) -> SyncStatus {
        let value: [String: Any] = switch status {
        case .ok(let reminders, let at): ["reminders": reminders, "at": at]
        case .failed(let reason): ["failed": reason]
        }
        UserDefaults.standard.set(value, forKey: key)
        return status
    }

    static func load() -> SyncStatus? {
        guard let value = UserDefaults.standard.dictionary(forKey: key) else { return nil }
        if let reason = value["failed"] as? String { return .failed(reason) }
        guard let reminders = value["reminders"] as? Int, let at = value["at"] as? Date else { return nil }
        return .ok(reminders: reminders, at: at)
    }
}
