import Foundation

/// Results through the door (`docs/door.md`, «Results»): a task whose line starts with the result mark, its subtasks the
/// steps of one outcome. The core decides everything; these only name the calls.
extension TaskBoard {
    /// «Make result» or «Make task» (`MenuResult.toggle`).
    public func setResult(_ key: TaskKey, _ result: Bool) throws {
        try write("tasks.setResult", [key.json, .bool(result)])
    }

    /// The Add to result page for `keys`, the results whose title holds `query`.
    public func resultPage(_ keys: [TaskKey], query: String) throws -> ResultPage {
        try read("tasks.resultPage", [.array(keys.map(\.json)), .string(query)], over: try files())
    }

    /// The tasks, with their subtasks, become the result's last steps; the result folds.
    public func addToResult(_ keys: [TaskKey], _ result: TaskKey) throws {
        try write("tasks.addToResult", [.array(keys.map(\.json)), result.json])
    }

    /// «New result…» named `name` at the first task's place, the tasks its steps. The new result's id; nil for a blank
    /// name, which writes nothing.
    @discardableResult
    public func newResult(_ keys: [TaskKey], name: String) throws -> String? {
        try write("tasks.newResult", [.array(keys.map(\.json)), .string(name)])["id"].string
    }

    /// The setting «Result mark»: kept only when the core takes it (one word, no priority's prefix).
    public func setResultMark(_ mark: String) throws {
        try writeSettings("settings.setResultMark", [.string(mark)])
    }
}
