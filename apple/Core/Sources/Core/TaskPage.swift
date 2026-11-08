import Foundation

/// Everything a task's page shows, read in one go over one reading of the files: the task as the file now has it, its
/// subtasks and their cards, the menus of the page, and its description as the editor opens it.
public struct TaskPage: Sendable {
    public let task: TaskItem
    /// The file no longer has the task where it was read (done, moved, deleted, here or elsewhere): the page gives way.
    public let gone: Bool
    public let tree: FullTree?
    /// The subtasks' cards, coloured and dated as a list draws them, by task id.
    public let cards: [String: BoardCard]
    public let menu: TaskMenuModel?
    public let subtaskMenus: [String: TaskMenuModel]
    /// `description.open`: the editor's text and its state.
    public let opened: JSONValue
}

extension TaskBoard {
    /// A task's page, read before it is shown; `screen` is what a menu is opened over (`tasks.menu`).
    public func page(_ item: TaskItem, screen: JSONValue, now: Date = Date()) throws -> TaskPage {
        let files = try files(now: now)
        let answer: TaskItem?? = try? read("tasks.find", [item.key.json, .string(item.text)], over: files) as TaskItem?
        let gone = answer.map { $0 == nil } ?? false
        let task = (answer ?? nil) ?? item
        let tree: FullTree? = try? readRule("tasks.fullTree", [task.json])
        let drawn = (try? cards((tree?.rows ?? []).map { ListRow(item: $0.item, level: $0.level) })) ?? []
        let settingsOnly = BoardFiles(tasks: nil, settingsJSON: files.settingsJSON, calendars: [:], now: files.now)
        let menu: TaskMenuModel? = try? read("tasks.menu", [task.json, "full", screen], over: settingsOnly)
        var menus: [String: TaskMenuModel] = [:]
        for row in tree?.rows ?? [] {
            menus[row.item.id] = try? read("tasks.menu", [row.item.json, "full", screen], over: settingsOnly)
        }
        let opened: JSONValue = (try? readRule("description.open", [task.description.json])) ?? .null
        return TaskPage(
            task: task,
            gone: gone,
            tree: tree,
            cards: Dictionary(drawn.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first }),
            menu: menu,
            subtaskMenus: menus,
            opened: opened)
    }
}
