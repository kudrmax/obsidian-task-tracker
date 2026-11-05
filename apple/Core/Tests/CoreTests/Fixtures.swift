import Foundation

enum Fixtures {
    /// The plugin's phone module from the submodule, as the app bundles it.
    static let phoneScript: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("plugin/phone/task-calendar-phone.js")
        return try! String(contentsOf: url, encoding: .utf8)
    }()

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
