import Foundation

/// A list a task is written into from the phone, by the plugin's name of it (`TaskRules.captureLists`).
public struct CaptureList: Hashable, Sendable {
    public let name: String

    public init(_ name: String) {
        self.name = name
    }
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
/// the task into the list with a link to the recording and the tag that has it transcribed.
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

    /// `recording`: an `m4a` file's bytes, or none; `tag` follows its link, empty for none. Nothing to write when both are empty.
    public func capture(list: CaptureList, text: String, recording: Data?, tag: String = "") -> CaptureOutcome {
        let at = now()
        let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty || recording != nil else { return .saved }
        do {
            var parts = typed.isEmpty ? [] : [typed]
            if let recording {
                let folder = AttachmentFolder.path(appJSON: vault.read(path: AttachmentFolder.appSettingsPath), notePath: try vault.tasksFilePath())
                parts.append("[[\(try vault.save(recording, in: folder, named: Self.recordingName(at)))]]")
                if let tag = Self.tag(tag) { parts.append(tag) }
            }
            let title = parts.joined(separator: " ")
            // A second try reads again: the file may have changed between the read and the write.
            for _ in 0..<2 {
                let file = try vault.read()
                guard case .changed(let written) = try rules.capture(list: list, title: title, text: file.tasks, settingsJSON: file.settingsJSON, now: at) else {
                    return .failed(Self.failure)
                }
                if try vault.write(tasks: written, expecting: file.tasks) { return .saved }
            }
            return .failed(Self.failure)
        } catch VaultError.noAccess {
            return .failed("No access to the vault folder: choose it in the app")
        } catch VaultError.tasksFileMissing(let path) {
            return .failed("No tasks file “\(path)” in the vault folder")
        } catch VaultError.noTasksFile {
            return .failed(VaultError.noTasksFileMessage)
        } catch {
            return .failed("\(Self.failure): \(error.localizedDescription)")
        }
    }

    static let failure = "Couldn't add the task"

    /// The name Obsidian's audio recorder gives a recording.
    static func recordingName(_ at: Date) -> String {
        "Recording \(format("yyyyMMddHHmmss", at)).\(recordingExtension)"
    }

    /// `#name` from what was typed in the settings, with or without the `#`; nil for nothing.
    static func tag(_ typed: String) -> String? {
        let name = typed.trimmingCharacters(in: .whitespaces).drop { $0 == "#" }
        return name.isEmpty ? nil : "#\(name)"
    }

    private static func format(_ pattern: String, _ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}
