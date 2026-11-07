import Core
import SwiftUI
import UIKit

/// What a task's menu, or the bulk menu, asks before it writes: the core marks which statuses and Delete ask first.
enum MenuQuestion: Identifiable {
    case status([TaskItem], String)
    case remove([TaskItem])

    var id: String {
        switch self {
        case .status(let items, let status): "status/\(status)/\(items.map(\.id))"
        case .remove(let items): "remove/\(items.map(\.id))"
        }
    }
}

/// One row of a menu, drawn the same by UIKit (a card's menu) and SwiftUI (a bar's menu).
indirect enum MenuNode {
    /// `opens`: it opens a sheet, an alert or a page, which UIKit shows only once the menu has gone.
    case action(title: String, symbol: String?, tint: String? = nil, destructive: Bool = false, checked: Bool = false, keepsOpen: Bool = false, opens: Bool = false, disabled: Bool = false, run: @MainActor () -> Void)
    case submenu(title: String, symbol: String, subtitle: String?, children: [MenuNode])
    /// A group between separators; `row` draws it as the row of icons over their titles on top of a menu.
    case group(row: Bool, children: [MenuNode])
}

/// The task's menu as iOS 26 draws a menu, in the plugin's order as the core gives it: the statuses, the priorities and
/// the labels as rows of icons, the moves, the edits, the pages, Delete last. Every row is the core's `TaskMenuModel`.
@MainActor
struct TaskMenu {
    let items: [TaskItem]
    let menu: TaskMenuModel
    let model: BoardModel
    let ask: (MenuQuestion) -> Void
    /// Drawn on the full screen: Rename and Add Subtask type in its stack.
    var inStack = false
    /// The menu of the task its own full screen shows: no Open Full Screen.
    var ownPage = false

    private var single: Bool { items.count == 1 }

    /// The groups in the core's order (`menu.groups`), the plugin's: each drawn as iOS draws a menu's group.
    var nodes: [MenuNode] {
        menu.groups.compactMap(group)
    }

    private func group(_ id: String) -> MenuNode? {
        let items = items, model = model
        let children: [MenuNode]
        var row = true
        switch id {
        case "statuses":
            children = menu.statuses.map(status)
        case "levels":
            children = menu.levels.tiles.map { tile in
                .action(title: tile.mark.title, symbol: tile.on ? "flag.fill" : "flag", tint: tile.mark.color, checked: tile.on, disabled: menu.levels.disabled) { Task { await model.togglePriority(items, tile.mark.title) } }
            }
        case "labels":
            children = menu.labels.tiles.map { tile in
                .action(title: tile.mark.title, symbol: tile.on ? "tag.fill" : "tag", tint: tile.mark.color, checked: tile.on, disabled: menu.labels.disabled) { Task { await model.toggleLabel(items, tile.mark.title) } }
            }
        case "moves":
            children = menu.moves.map { move in
                .action(title: MoveWords.title(move.id), symbol: MoveWords.symbol(move.id), opens: move.date == nil) {
                    if let date = move.date { Task { await model.postpone(items, to: date) } } else { model.dateFor = items }
                }
            }
        case "edits":
            children = editRows
            row = false
        case "opens":
            children = single ? items.first.map(opens) ?? [] : []
            row = false
        case "remove":
            children = remove.map { [$0] } ?? []
            row = false
        default:
            children = []
        }
        return children.isEmpty ? nil : .group(row: row, children: children)
    }

    /// The edit rows in the core's order (`menu.edits`).
    private var editRows: [MenuNode] {
        let items = items, model = model, inStack = inStack
        guard let item = items.first else { return [] }
        var rows: [MenuNode] = []
        for edit in menu.edits {
            switch edit {
            case "rename" where single:
                rows.append(.action(title: "Rename", symbol: "pencil", opens: true) { if inStack { model.entry.renameInStack(item) } else { model.entry.rename(item) } })
            case "reminder" where single && !menu.reminders.isEmpty:
                rows.append(.submenu(title: "Reminder", symbol: "bell", subtitle: menu.reminders.first(where: \.checked).map { ReminderWords.title($0.kind) }, children: menu.reminders.map { reminder in
                    .action(title: ReminderWords.title(reminder.kind), symbol: nil, checked: reminder.checked) { Task { await model.setReminder(item, reminder.kind) } }
                }))
            case "description" where single:
                rows.append(.action(title: "Description", symbol: "text.alignleft", opens: true) { model.fullScreen.append(item) })
            case "repeat" where single:
                rows.append(.action(title: "Repeat…", symbol: "repeat", opens: true) { model.repeatFor = item })
            case "section":
                if let section = sectionPage { rows.append(section) }
            case "subtask" where single:
                rows.append(.action(title: "Add Subtask", symbol: "arrow.turn.down.right", opens: true) { if inStack { model.entry.addSubtaskInStack(item) } else { model.entry.addSubtask(item) } })
            default: break
            }
        }
        return rows
    }

    private var sectionPage: MenuNode? {
        guard let sections = menu.sections else { return nil }
        let items = items, model = model
        var rows: [MenuNode] = sections.options.map { option in
            .action(title: option.name ?? sections.choice.ungrouped, symbol: nil, checked: option.checked) { Task { await model.toSection(items, option.name) } }
        }
        if sections.create {
            rows = [.group(row: false, children: rows), .group(row: false, children: [.action(title: "New Section…", symbol: "plus", opens: true) { model.newSection = items.first }])]
        }
        let current = sections.options.first(where: \.checked).map { $0.name ?? sections.choice.ungrouped }
        return .submenu(title: "Section", symbol: "rectangle.stack", subtitle: current, children: rows)
    }

    private func status(_ status: MenuStatus) -> MenuNode {
        let items = items, model = model, ask = ask
        return .action(title: StatusWords.title(status.id), symbol: StatusWords.symbol(status.id), opens: status.confirm) {
            if status.confirm { ask(.status(items, status.id)) } else { Task { await model.pickStatus(items, status.id) } }
        }
    }

    private var remove: MenuNode? {
        guard let remove = menu.remove else { return nil }
        let items = items, model = model, ask = ask, single = single
        return .action(title: single ? "Delete" : "Delete \(items.count) Tasks", symbol: "trash", destructive: true, opens: remove.confirm && single) {
            if remove.confirm && single { ask(.remove(items)) } else { Task { await model.remove(items) } }
        }
    }

    /// The pages a task opens: its repeat, its full screen, its line in Obsidian.
    private func opens(_ item: TaskItem) -> [MenuNode] {
        let model = model
        var opens: [MenuNode] = []
        if !ownPage { opens.append(.action(title: "Open Full Screen", symbol: "arrow.up.left.and.arrow.down.right", opens: true) { model.fullScreen.append(item) }) }
        opens.append(.action(title: "Open in Obsidian", symbol: "arrow.up.forward.app") { Task { await model.openInObsidian(item) } })
        return opens
    }
}

// MARK: UIKit: a card's menu

extension MenuNode {
    /// `later`: a row that opens a sheet, an alert or a page runs once the menu has gone, as the menu's own end tells.
    @MainActor
    static func uiMenu(_ nodes: [MenuNode], later: @escaping (@escaping @MainActor () -> Void) -> Void, palette: (String) -> UIColor?) -> UIMenu {
        UIMenu(children: nodes.map { $0.element(later, palette) })
    }

    @MainActor
    private func element(_ later: @escaping (@escaping @MainActor () -> Void) -> Void, _ palette: (String) -> UIColor?) -> UIMenuElement {
        switch self {
        case .action(let title, let symbol, let tint, let destructive, let checked, let keepsOpen, let opens, let disabled, let run):
            var image = symbol.flatMap { UIImage(systemName: $0) }
            if let tint, let color = palette(tint) { image = image?.withTintColor(color, renderingMode: .alwaysOriginal) }
            var attributes: UIMenuElement.Attributes = destructive ? [.destructive] : []
            if keepsOpen { attributes.insert(.keepsMenuPresented) }
            if disabled { attributes.insert(.disabled) }
            return UIAction(title: title, image: image, attributes: attributes, state: checked ? .on : .off) { _ in
                if opens { later { run() } } else { run() }
            }
        case .submenu(let title, let symbol, let subtitle, let children):
            let menu = UIMenu(title: title, image: UIImage(systemName: symbol), children: children.map { $0.element(later, palette) })
            menu.subtitle = subtitle
            return menu
        case .group(let row, let children):
            let menu = UIMenu(options: .displayInline, children: children.map { $0.element(later, palette) })
            if row { menu.preferredElementSize = children.count > 3 ? .small : .medium }
            return menu
        }
    }
}

// MARK: SwiftUI: a bar's menu

/// The same rows inside a SwiftUI `Menu`: the bulk menu's «⋯» and the full screen's.
struct MenuNodes: View {
    let nodes: [MenuNode]

    var body: some View {
        ForEach(Array(nodes.enumerated()), id: \.offset) { _, node in
            switch node {
            case .action(let title, let symbol, _, let destructive, let checked, let keepsOpen, _, let disabled, let run):
                let button = Button(role: destructive ? .destructive : nil) { run() } label: {
                    if let symbol { Label(title, systemImage: checked ? "checkmark" : symbol) } else if checked { Label(title, systemImage: "checkmark") } else { Text(title) }
                }
                if keepsOpen { button.menuActionDismissBehavior(.disabled).disabled(disabled) } else { button.disabled(disabled) }
            case .submenu(let title, let symbol, let subtitle, let children):
                Menu {
                    MenuNodes(nodes: children)
                } label: {
                    Label(title, systemImage: symbol)
                    if let subtitle { Text(subtitle) }
                }
            case .group(let row, let children):
                if row {
                    ControlGroup { MenuNodes(nodes: children) }.controlGroupStyle(.menu)
                } else {
                    Section { MenuNodes(nodes: children) }
                }
            }
        }
    }
}

extension View {
    /// The questions a menu asks before it writes, as system confirmation dialogs.
    func menuQuestions(_ question: Binding<MenuQuestion?>, model: BoardModel) -> some View {
        confirmationDialog(
            question.wrappedValue.map(Self.title) ?? "",
            isPresented: Binding(get: { question.wrappedValue != nil }, set: { if !$0 { question.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: question.wrappedValue
        ) { asked in
            switch asked {
            case .status(let items, let status):
                Button(StatusWords.title(status), role: .destructive) { Task { await model.pickStatus(items, status) } }
            case .remove(let items):
                Button("Delete", role: .destructive) { Task { await model.remove(items) } }
            }
        }
    }

    private static func title(_ question: MenuQuestion) -> String {
        switch question {
        case .status(let items, let status): "\(StatusWords.title(status)): \(items.first?.title ?? "")"
        case .remove(let items): "Delete “\(items.first?.title ?? "")”?"
        }
    }
}

enum StatusWords {
    static func title(_ id: String) -> String {
        switch id {
        case "done": "Done"
        case "inProgress": "In Progress"
        case "stopProgress": "Stop Progress"
        case "wontDo": "Won’t Do"
        case "stop": "Stop Repeating"
        default: id
        }
    }

    static func symbol(_ id: String) -> String {
        switch id {
        case "done": "checkmark.circle"
        case "inProgress": "play.circle"
        case "stopProgress": "pause.circle"
        case "wontDo": "xmark.circle"
        case "stop": "stop.circle"
        default: "circle"
        }
    }
}

enum MoveWords {
    static func title(_ id: String) -> String {
        switch id {
        case "today": "Today"
        case "tomorrow": "Tomorrow"
        default: "Pick a Date…"
        }
    }

    static func symbol(_ id: String) -> String {
        switch id {
        case "today": "sun.max"
        case "tomorrow": "sunrise"
        default: "calendar"
        }
    }
}

enum ReminderWords {
    static func title(_ kind: String) -> String {
        switch kind {
        case "live": "Live Activity"
        case "notification": "Notification"
        case "alarm": "Alarm"
        case "none": "Off"
        default: kind
        }
    }
}
