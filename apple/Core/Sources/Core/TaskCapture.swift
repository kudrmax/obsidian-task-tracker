import Foundation

/// The lists a task is written into from the phone: Inbox to sort out later, Now for today.
public enum CaptureList: String, CaseIterable, Sendable {
    case inbox, now
}

public enum CaptureOutcome: Equatable, Sendable {
    case saved
    case failed(String)
}

/// Where Obsidian puts a new attachment of `notePath`, by the vault's «Default location for new attachments».
public enum AttachmentFolder {
    static let appSettingsPath = ".obsidian/app.json"

    /// `appJSON`: the vault's `.obsidian/app.json`, `nil` or empty for Obsidian's defaults (the vault folder).
    public static func path(appJSON: String?, notePath: String) -> String {
        let setting = setting(appJSON).trimmingCharacters(in: .whitespaces)
        let noteFolder = (notePath as NSString).deletingLastPathComponent
        if setting == "" || setting == "/" { return "" }
        if setting == "./" || setting == "." { return noteFolder }
        if setting.hasPrefix("./") { return join(noteFolder, String(setting.dropFirst(2))) }
        return trimSlashes(setting)
    }

    private static func setting(_ appJSON: String?) -> String {
        guard let data = appJSON?.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return "" }
        return object["attachmentFolderPath"] as? String ?? ""
    }

    private static func join(_ folder: String, _ path: String) -> String {
        let path = trimSlashes(path)
        return folder.isEmpty ? path : "\(folder)/\(path)"
    }

    private static func trimSlashes(_ path: String) -> String {
        path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}

/// A task typed or spoken on the phone: the recording goes into the vault as Obsidian's own recorder would save it,
/// the task into the list with the recording as its description.
public final class TaskCapture: Sendable {
    static let recordingExtension = "m4a"

    private let vault: TasksVault
    private let rules: TaskRules
    private let now: @Sendable () -> Date

    public init(vault: TasksVault, rules: TaskRules, now: @escaping @Sendable () -> Date = Date.init) {
        self.vault = vault
        self.rules = rules
        self.now = now
    }

    /// `recording`: an `m4a` file's bytes, or none. Nothing to write when both are empty.
    public func capture(list: CaptureList, text: String, recording: Data?) -> CaptureOutcome {
        let at = now()
        let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty || recording != nil else { return .saved }
        do {
            var description = ""
            if let recording {
                let folder = AttachmentFolder.path(appJSON: vault.read(path: AttachmentFolder.appSettingsPath), notePath: try vault.tasksFilePath())
                let name = try vault.save(recording, in: folder, named: Self.recordingName(at))
                description = "![[\(name)]]"
            }
            let title = typed.isEmpty ? Self.voiceNoteTitle(at) : Self.oneLine(typed)
            // A second try reads again: the file may have changed between the read and the write.
            for _ in 0..<2 {
                let file = try vault.read()
                guard case .changed(let written) = try rules.capture(list: list, title: title, description: description, text: file.tasks, settingsJSON: file.settingsJSON, now: at) else {
                    return .failed(Self.failure)
                }
                if try vault.write(tasks: written, expecting: file.tasks) { return .saved }
            }
            return .failed(Self.failure)
        } catch VaultError.noAccess {
            return .failed("No access to the vault folder: choose it in the app")
        } catch VaultError.tasksFileMissing(let path) {
            return .failed("No tasks file “\(path)” in the vault folder")
        } catch {
            return .failed("\(Self.failure): \(error.localizedDescription)")
        }
    }

    static let failure = "Couldn't add the task"

    /// The name Obsidian's audio recorder gives a recording.
    static func recordingName(_ at: Date) -> String {
        "Recording \(format("yyyyMMddHHmmss", at)).\(recordingExtension)"
    }

    static func voiceNoteTitle(_ at: Date) -> String {
        "Voice note \(format("HH:mm", at))"
    }

    /// A task is one line: the lines typed are joined by spaces.
    static func oneLine(_ text: String) -> String {
        text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
    }

    private static func format(_ pattern: String, _ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}
