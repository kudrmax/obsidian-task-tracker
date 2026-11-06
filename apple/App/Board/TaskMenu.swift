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
    case action(title: String, symbol: String?, tint: String? = nil, destructive: Bool = false, checked: Bool = false, keepsOpen: Bool = false, run: @MainActor () -> Void)
    case submenu(title: String, symbol: String, subtitle: String?, children: [MenuNode])
    /// A group between separators; `row` draws it as the row of icons over their titles on top of a menu.
    case group(row: Bool, children: [MenuNode])
}

/// The task's menu as iOS 26 draws a context menu: the statuses in a row on top, then the pages, the edits and the ways
/// out, Delete last. Every row is the core's `TaskMenuModel`: the menu offers what it offers.
@MainActor
struct TaskMenu {
    let items: [TaskItem]
    let menu: TaskMenuModel
    let model: BoardModel
    let ask: (MenuQuestion) -> Void

    private var single: Bool { items.count == 1 }

    var nodes: [MenuNode] {
        var nodes: [MenuNode] = [.group(row: true, children: menu.statuses.map { status in
            .action(title: StatusWords.title(status.id), symbol: StatusWords.symbol(status.id)) { [items, model, ask] in
                if status.confirm { ask(.status(items, status.id)) } else { Task { await model.pickStatus(items, status.id) } }
            }
        })]
        nodes.append(.group(row: false, children: pages))
        if single, let item = items.first { nodes.append(.group(row: false, children: edits(item))) }
        if let remove = menu.remove {
            nodes.append(.group(row: false, children: [
                .action(title: single ? "Delete" : "Delete \(items.count) Tasks", symbol: "trash", destructive: true) { [items, model, ask] in
                    if remove.confirm && single { ask(.remove(items)) } else { Task { await model.remove(items) } }
                },
            ]))
        }
        return nodes
    }

    private var pages: [MenuNode] {
        var pages: [MenuNode] = []
        let items = items, model = model
        if !menu.levels.disabled, !menu.levels.tiles.isEmpty {
            pages.append(.submenu(title: "Priority", symbol: "flag", subtitle: menu.levels.tiles.first(where: \.on)?.mark.title, children: menu.levels.tiles.map { tile in
                .action(title: tile.mark.title, symbol: "flag.fill", tint: tile.mark.color, checked: tile.on) { Task { await model.togglePriority(items, tile.mark.title) } }
            }))
        }
        if !menu.labels.disabled, !menu.labels.tiles.isEmpty {
            let on = menu.labels.tiles.filter(\.on).map(\.mark.title)
            pages.append(.submenu(title: "Labels", symbol: "tag", subtitle: on.isEmpty ? nil : on.joined(separator: ", "), children: menu.labels.tiles.map { tile in
                .action(title: tile.mark.title, symbol: "tag.fill", tint: tile.mark.color, checked: tile.on, keepsOpen: true) { Task { await model.toggleLabel(items, tile.mark.title) } }
            }))
        }
        if !menu.moves.isEmpty || menu.removeDue {
            var moves: [MenuNode] = menu.moves.map { move in
                .action(title: MoveWords.title(move.id), symbol: MoveWords.symbol(move.id)) {
                    if let date = move.date { Task { await model.postpone(items, to: date) } } else { model.dateFor = items }
                }
            }
            if menu.removeDue {
                moves.append(.action(title: "Remove Due Date", symbol: "calendar.badge.minus") { Task { await model.removeDue(items) } })
            }
            pages.append(.submenu(title: "Move To", symbol: "calendar", subtitle: nil, children: moves))
        }
        if let sections = menu.sections, menu.edits.contains("section") {
            var rows: [MenuNode] = sections.options.map { option in
                .action(title: option.name ?? sections.choice.ungrouped, symbol: nil, checked: option.checked) { Task { await model.toSection(items, option.name) } }
            }
            if sections.create {
                rows = [.group(row: false, children: rows), .group(row: false, children: [.action(title: "New Section…", symbol: "plus") { model.newSection = items.first }])]
            }
            let current = sections.options.first(where: \.checked).map { $0.name ?? sections.choice.ungrouped }
            pages.append(.submenu(title: "Section", symbol: "rectangle.stack", subtitle: current, children: rows))
        }
        if single, let item = items.first, !menu.reminders.isEmpty {
            pages.append(.submenu(title: "Reminder", symbol: "bell", subtitle: menu.reminders.first(where: \.checked).map { ReminderWords.title($0.kind) }, children: menu.reminders.map { reminder in
                .action(title: ReminderWords.title(reminder.kind), symbol: nil, checked: reminder.checked) { Task { await model.setReminder(item, reminder.kind) } }
            }))
        }
        return pages
    }

    private func edits(_ item: TaskItem) -> [MenuNode] {
        let model = model
        var edits: [MenuNode] = []
        if menu.edits.contains("rename") { edits.append(.action(title: "Rename", symbol: "pencil") { model.renaming = item }) }
        if menu.edits.contains("repeat") { edits.append(.action(title: "Repeat…", symbol: "repeat") { model.repeatFor = item }) }
        if menu.edits.contains("subtask") { edits.append(.action(title: "Add Subtask", symbol: "arrow.turn.down.right") { model.subtaskOf = item }) }
        edits.append(.action(title: "Open Full Screen", symbol: "arrow.up.left.and.arrow.down.right") { model.fullScreen.append(item) })
        edits.append(.action(title: "Open in Obsidian", symbol: "arrow.up.forward.app") { Task { await model.openInObsidian(item) } })
        return edits
    }
}

// MARK: UIKit: a card's menu

extension MenuNode {
    @MainActor
    static func uiMenu(_ nodes: [MenuNode], palette: (String) -> UIColor?) -> UIMenu {
        UIMenu(children: nodes.map { $0.element(palette) })
    }

    @MainActor
    private func element(_ palette: (String) -> UIColor?) -> UIMenuElement {
        switch self {
        case .action(let title, let symbol, let tint, let destructive, let checked, let keepsOpen, let run):
            var image = symbol.flatMap { UIImage(systemName: $0) }
            if let tint, let color = palette(tint) { image = image?.withTintColor(color, renderingMode: .alwaysOriginal) }
            var attributes: UIMenuElement.Attributes = destructive ? [.destructive] : []
            if keepsOpen { attributes.insert(.keepsMenuPresented) }
            return UIAction(title: title, image: image, attributes: attributes, state: checked ? .on : .off) { _ in run() }
        case .submenu(let title, let symbol, let subtitle, let children):
            let menu = UIMenu(title: title, image: UIImage(systemName: symbol), children: children.map { $0.element(palette) })
            menu.subtitle = subtitle
            return menu
        case .group(let row, let children):
            let menu = UIMenu(options: .displayInline, children: children.map { $0.element(palette) })
            if row { menu.preferredElementSize = .medium }
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
            case .action(let title, let symbol, _, let destructive, let checked, let keepsOpen, let run):
                let button = Button(role: destructive ? .destructive : nil) { run() } label: {
                    if let symbol { Label(title, systemImage: checked ? "checkmark" : symbol) } else if checked { Label(title, systemImage: "checkmark") } else { Text(title) }
                }
                if keepsOpen { button.menuActionDismissBehavior(.disabled) } else { button }
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
