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
    case action(title: String, symbol: String?, tint: String? = nil, destructive: Bool = false, checked: Bool = false, keepsOpen: Bool = false, opens: Bool = false, disabled: Bool = false, subtitle: String? = nil, run: @MainActor () -> Void)
    case submenu(title: String, symbol: String, subtitle: String?, children: [MenuNode])
    /// A group between separators; `row` draws it as the row of icons over their titles on top of a menu.
    case group(row: Bool, children: [MenuNode])
    /// A row whose page is read when it opens: a subtask's own menu.
    case deferred(title: String, symbol: String, subtitle: String?, load: @MainActor () async -> [MenuNode])

    var keepsOpen: Bool {
        if case .action(_, _, _, _, _, let keepsOpen, _, _, _, _) = self { return keepsOpen }
        return false
    }
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
    /// On the task's own full screen, Description puts the caret in its description instead of opening the page again.
    var describe: (@MainActor () -> Void)?

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
                .action(title: tile.mark.title, symbol: "flag.fill", tint: tile.mark.color, checked: tile.on, disabled: menu.levels.disabled) { Task { await model.togglePriority(items, tile.mark.title) } }
            }
        case "labels":
            children = menu.labels.tiles.map { tile in
                .action(title: model.labelTitle(tile.mark.title), symbol: "tag.fill", tint: tile.mark.color, checked: tile.on, keepsOpen: true, disabled: menu.labels.disabled) { Task { await model.toggleLabel(items, tile.mark.title) } }
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
        let items = items, model = model, inStack = inStack, describe = describe
        guard let item = items.first else { return [] }
        var rows: [MenuNode] = []
        var ids: [String] = []
        for edit in menu.edits {
            let before = rows.count
            defer { if rows.count > before { ids.append(edit) } }
            switch edit {
            case "rename" where single:
                rows.append(.action(title: "Rename", symbol: "pencil", opens: true) { if inStack { model.entry.renameInStack(item) } else { model.entry.rename(item) } })
            case "reminder" where single && !menu.reminders.isEmpty:
                rows.append(.submenu(title: "Reminder", symbol: "bell", subtitle: menu.reminders.first(where: \.checked).map { ReminderWords.title($0.kind) }, children: menu.reminders.map { reminder in
                    .action(title: ReminderWords.title(reminder.kind), symbol: nil, checked: reminder.checked) { Task { await model.setReminder(item, reminder.kind) } }
                }))
            case "description" where single:
                rows.append(.action(title: "Description", symbol: "text.alignleft", opens: true) { if let describe { describe() } else { model.describe(item) } })
            case "repeat" where single:
                rows.append(.action(title: "Repeat…", symbol: "repeat", opens: true, subtitle: repeatValue) { model.repeatFor = item })
            case "section":
                if let section = sectionPage { rows.append(section) }
            case "subtask" where single:
                rows.append(.action(title: "Add Subtask", symbol: "arrow.turn.down.right", opens: true) { if inStack { model.entry.addSubtaskInStack(item) } else { model.entry.addSubtask(item) } })
            default: break
            }
        }
        // The Project row, in every menu: right after Section, or where Section would stand, before Add Subtask.
        let at = ids.firstIndex(of: "section").map { $0 + 1 } ?? ids.firstIndex(of: "subtask") ?? rows.count
        rows.insert(projectRow, at: at)
        return rows
    }

    /// The Repeat row's value, the core's (`menu.repeat`): the rule in words, or a weekly schedule's days by their letters
    /// in the week's order.
    private var repeatValue: String? {
        let row = menu.repeat
        if let days = row.days, !days.isEmpty { return model.weekLetters(days) }
        return row.value.isEmpty ? nil : row.value
    }

    /// The Project row and its page: the project notes by name, No Project last, the current one checked; for subtasks
    /// only, the parent's project shown and the row disabled. «No project» in the core's words, as the row's value.
    private var projectRow: MenuNode {
        let project = menu.project, items = items, model = model
        let value = project.value.isEmpty ? nil : project.value
        if project.disabled { return .action(title: "Project", symbol: "folder", disabled: true, subtitle: value) {} }
        var rows: [MenuNode] = project.options.map { option in
            .action(title: option.project.name, symbol: nil, checked: option.checked) { Task { await model.setProject(items, option.project.link) } }
        }
        rows.append(.action(title: "No project", symbol: nil, checked: project.none) { Task { await model.setProject(items, nil) } })
        return .submenu(title: "Project", symbol: "folder", subtitle: value, children: rows)
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
    static func uiMenu(_ nodes: [MenuNode], later: @escaping (@escaping @MainActor () -> Void) -> Void, palette: @escaping (String) -> UIColor?) -> UIMenu {
        UIMenu(children: nodes.map { $0.element(later, palette) })
    }

    @MainActor
    private func element(_ later: @escaping (@escaping @MainActor () -> Void) -> Void, _ palette: @escaping (String) -> UIColor?) -> UIMenuElement {
        switch self {
        case .action(let title, let symbol, let tint, let destructive, let checked, let keepsOpen, let opens, let disabled, let subtitle, let run):
            var image = symbol.flatMap { UIImage(systemName: $0) }
            if let tint, let color = palette(tint) { image = image?.withTintColor(color, renderingMode: .alwaysOriginal) }
            var attributes: UIMenuElement.Attributes = destructive ? [.destructive] : []
            if keepsOpen { attributes.insert(.keepsMenuPresented) }
            if disabled { attributes.insert(.disabled) }
            let action = UIAction(title: title, image: image, attributes: attributes, state: checked ? .on : .off) { _ in
                if opens { later { run() } } else { run() }
            }
            action.subtitle = subtitle
            return action
        case .submenu(let title, let symbol, let subtitle, let children):
            let menu = UIMenu(title: title, image: UIImage(systemName: symbol), children: children.map { $0.element(later, palette) })
            menu.subtitle = subtitle
            return menu
        case .group(let row, let children):
            let menu = UIMenu(options: .displayInline, children: children.map { $0.element(later, palette) })
            if row { menu.preferredElementSize = children.count > 3 ? .small : .medium }
            return menu
        case .deferred(let title, let symbol, let subtitle, let load):
            let rows = UIDeferredMenuElement.uncached { completion in
                Task { @MainActor in completion(await load().map { $0.element(later, palette) }) }
            }
            let menu = UIMenu(title: title, image: UIImage(systemName: symbol), children: [rows])
            menu.subtitle = subtitle
            return menu
        }
    }
}

// MARK: SwiftUI: a bar's menu

/// The same rows inside a SwiftUI `Menu`: the bulk menu's «⋯» and the full screen's. A row's flag or tag is drawn in its
/// level's or label's colour (`palette`), as the card's UIKit menu draws it.
struct MenuNodes: View {
    let nodes: [MenuNode]
    let palette: (String) -> UIColor?

    var body: some View {
        ForEach(Array(nodes.enumerated()), id: \.offset) { _, node in
            switch node {
            case .action(let title, let symbol, let tint, let destructive, let checked, let keepsOpen, _, let disabled, let subtitle, let run):
                let button = Button(role: destructive ? .destructive : nil) { run() } label: {
                    if let symbol { Label { Text(title) } icon: { icon(checked ? "checkmark" : symbol, tint: checked ? nil : tint) } } else if checked { Label(title, systemImage: "checkmark") } else { Text(title) }
                    if let subtitle { Text(subtitle) }
                }
                if keepsOpen { button.menuActionDismissBehavior(.disabled).disabled(disabled) } else { button.disabled(disabled) }
            case .submenu(let title, let symbol, let subtitle, let children):
                Menu {
                    MenuNodes(nodes: children, palette: palette)
                } label: {
                    Label(title, systemImage: symbol)
                    if let subtitle { Text(subtitle) }
                }
            case .group(let row, let children):
                if row {
                    // A row whose tiles keep the menu open (the labels) keeps it open as a whole: SwiftUI reads the
                    // behaviour from the group, not from its buttons.
                    ControlGroup { MenuNodes(nodes: children, palette: palette) }
                        .controlGroupStyle(.menu)
                        .menuActionDismissBehavior(children.contains(where: \.keepsOpen) ? .disabled : .automatic)
                } else {
                    Section { MenuNodes(nodes: children, palette: palette) }
                }
            case .deferred(let title, let symbol, let subtitle, let load):
                DeferredMenu(title: title, symbol: symbol, subtitle: subtitle, palette: palette, load: load)
            }
        }
    }

    /// The symbol in its colour, kept by the menu as drawn (`.alwaysOriginal`); a row with no colour takes the menu's.
    private func icon(_ symbol: String, tint: String?) -> Image {
        if let tint, let color = palette(tint), let image = UIImage(systemName: symbol)?.withTintColor(color, renderingMode: .alwaysOriginal) {
            return Image(uiImage: image)
        }
        return Image(systemName: symbol)
    }
}

/// A row whose page is read as the menu shows it.
private struct DeferredMenu: View {
    let title: String
    let symbol: String
    let subtitle: String?
    let palette: (String) -> UIColor?
    let load: @MainActor () async -> [MenuNode]
    @State private var nodes: [MenuNode] = []

    var body: some View {
        Menu {
            MenuNodes(nodes: nodes, palette: palette)
        } label: {
            Label(title, systemImage: symbol)
            if let subtitle { Text(subtitle) }
        }
        .task { nodes = await load() }
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
