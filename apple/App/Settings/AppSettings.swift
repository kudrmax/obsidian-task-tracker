import Foundation

enum AppSettings {
    static let alarmSnoozeChoices = [15, 30, 60]
    private static let alarmSnoozeKey = "alarmSnoozeMinutes"
    private static let defaultAlarmSnooze = 30

    static var alarmSnooze: Int {
        get {
            let minutes = UserDefaults.standard.integer(forKey: alarmSnoozeKey)
            return alarmSnoozeChoices.contains(minutes) ? minutes : defaultAlarmSnooze
        }
        set { UserDefaults.standard.set(newValue, forKey: alarmSnoozeKey) }
    }
}
