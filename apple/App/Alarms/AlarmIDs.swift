import CryptoKit
import Foundation

/// An alarm's id is made from its reminder's id: the same task always has the same alarm.
struct AlarmIDs: Sendable {
    func id(for reminderID: String) -> UUID {
        let bytes = Array(SHA256.hash(data: Data(reminderID.utf8)).prefix(16))
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}
