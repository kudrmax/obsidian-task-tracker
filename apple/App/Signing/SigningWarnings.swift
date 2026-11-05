import Core
import UserNotifications

/// Notices set ahead before the signature runs out, so they come even if the app is not opened. Set again whenever
/// the app opens: a fresh install brings a new signature.
enum SigningWarnings {
    private static let prefix = "signing#"

    static func schedule(now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let old = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: old)
        guard let expiration = AppSignature.expiration else { return }
        for (index, warning) in SigningExpiry.warnings(expiration: expiration, now: now).enumerated() {
            let content = UNMutableNotificationContent()
            content.title = "Task Calendar Stops in \(SigningText.left(warning.left))"
            content.body = "Its signature ends \(SigningText.end(expiration)). Install the app from the Mac again before then."
            content.sound = nil
            content.interruptionLevel = .active
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: warning.fire.timeIntervalSince(now), repeats: false)
            try? await center.add(UNNotificationRequest(identifier: "\(prefix)\(index)", content: content, trigger: trigger))
        }
    }
}
