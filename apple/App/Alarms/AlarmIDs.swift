import CryptoKit
import Foundation

/// An alarm's id is made from its reminder's id; the reverse is remembered, since AlarmKit lists alarms by id only.
struct AlarmIDs: Sendable {
    private static let key = "alarmReminders"

    func id(for reminderID: String) -> UUID {
        let bytes = Array(SHA256.hash(data: Data(reminderID.utf8)).prefix(16))
        let uuid = UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                               bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
        var known = Self.known()
        known[uuid.uuidString] = reminderID
        UserDefaults.standard.set(known, forKey: Self.key)
        return uuid
    }

    func reminderID(of id: UUID) -> String? {
        Self.known()[id.uuidString]
    }

    func forget(_ id: UUID) {
        var known = Self.known()
        known[id.uuidString] = nil
        UserDefaults.standard.set(known, forKey: Self.key)
    }

    private static func known() -> [String: String] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
    }
}
