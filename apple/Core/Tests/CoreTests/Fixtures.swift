import Foundation
@testable import Core

enum Fixtures {
    /// The core's phone module from the repository's root, as the app bundles it.
    static let phoneScript: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("phone/task-calendar-phone.js")
        return try! String(contentsOf: url, encoding: .utf8)
    }()

    /// A list a task is captured into, by the plugin's key; its name is not what a write goes by.
    static func list(_ key: String) -> CaptureList {
        CaptureList(key: key, name: key)
    }

    static func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute))!
    }

    static func file(_ now: String...) -> String {
        file(now)
    }

    static func file(_ now: [String]) -> String {
        (["## Now", ""] + now + ["", "## Soon", "", "## Done", ""]).joined(separator: "\n")
    }
}
