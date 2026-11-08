import Foundation

/// Everything a task's page shows, read in one go over one reading of the files: the task as the file now has it, its
/// subtasks, its list's name, the menus of the page, and its description as the editor opens it.
public struct TaskPage: Sendable {
    public let task: TaskItem
    public let tree: FullTree?
    public let listName: String
    public let menu: TaskMenuModel?
    public let subtaskMenus: [String: TaskMenuModel]
    /// `description.open`: the editor's text and its state.
    public let opened: JSONValue
}

extension TaskBoard {
    /// A task's page, read before it is shown; `screen` is what a menu is opened over (`tasks.menu`).
    public func page(_ item: TaskItem, screen: JSONValue, now: Date = Date()) throws -> TaskPage {
        let files = try files(now: now)
        let found: TaskItem? = try? read("tasks.find", [item.key.json, .string(item.text)], over: files)
        let task = found ?? item
        let tree: FullTree? = try? readRule("tasks.fullTree", [task.json])
        let listName: String = (try? read("tasks.listName", [.string(task.list)], over: files)) ?? ""
        let settingsOnly = BoardFiles(tasks: nil, settingsJSON: files.settingsJSON, calendars: [:], now: files.now)
        let menu: TaskMenuModel? = try? read("tasks.menu", [task.json, "full", screen], over: settingsOnly)
        var menus: [String: TaskMenuModel] = [:]
        for row in tree?.rows ?? [] {
            menus[row.item.id] = try? read("tasks.menu", [row.item.json, "full", screen], over: settingsOnly)
        }
        let opened: JSONValue = (try? readRule("description.open", [task.description.json])) ?? .null
        return TaskPage(task: task, tree: tree, listName: listName, menu: menu, subtaskMenus: menus, opened: opened)
    }
}
