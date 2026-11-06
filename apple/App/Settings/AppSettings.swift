import Foundation

enum AppSettings {
    static let alarmSnoozeChoices = [15, 30, 60]
    private static let alarmSnoozeKey = "alarmSnoozeMinutes"
    private static let defaultAlarmSnooze = 30

    private static let alarmSoundKey = "alarmSound"

    /// Off until it is turned on in the settings: an alarm then shows on the whole screen without a sound.
    static var alarmSound: Bool {
        get { UserDefaults.standard.bool(forKey: alarmSoundKey) }
        set { UserDefaults.standard.set(newValue, forKey: alarmSoundKey) }
    }

    static var alarmSnooze: Int {
        get {
            let minutes = UserDefaults.standard.integer(forKey: alarmSnoozeKey)
            return alarmSnoozeChoices.contains(minutes) ? minutes : defaultAlarmSnooze
        }
        set { UserDefaults.standard.set(newValue, forKey: alarmSnoozeKey) }
    }

    private static let recordingTagKey = "recordingTag"
    private static let defaultRecordingTag = "#transcribe"

    /// Follows a recording's link in its task, for the plugin that transcribes it; empty for none.
    static var recordingTag: String {
        get { UserDefaults.standard.string(forKey: recordingTagKey) ?? defaultRecordingTag }
        set { UserDefaults.standard.set(newValue, forKey: recordingTagKey) }
    }
}
