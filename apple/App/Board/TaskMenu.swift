import Core
import SwiftUI

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

/// The task's menu as the iOS 26 context menu draws it: the statuses in a row on top, then the pages, the edits, the
/// ways out, and Delete last. Every row is the core's `TaskMenuModel`: the menu offers what it offers.
struct TaskMenuContent: View {
    let items: [TaskItem]
    let menu: TaskMenuModel
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    /// One task's menu: its own rows (Rename, Open Full Screen, …); the bulk menu has none of them.
    var single: Bool { items.count == 1 }

    @Environment(\.openURL) private var openURL

    var body: some View {
        ControlGroup {
            ForEach(menu.statuses, id: \.id) { status in
                Button(StatusWords.title(status.id), systemImage: StatusWords.symbol(status.id)) {
                    if status.confirm { question = .status(items, status.id) } else { Task { await model.pickStatus(items, status.id) } }
                }
            }
        }
        .controlGroupStyle(.menu)

        Section {
            if !menu.levels.disabled, !menu.levels.tiles.isEmpty {
                Menu {
                    ForEach(menu.levels.tiles, id: \.mark) { tile in
                        Toggle(isOn: Binding(get: { tile.on }, set: { _ in Task { await model.togglePriority(items, tile.mark.title) } })) {
                            Label(tile.mark.title, systemImage: "flag.fill")
                        }
                    }
                } label: {
                    Label("Priority", systemImage: "flag")
                    if let on = menu.levels.tiles.first(where: \.on) { Text(on.mark.title) }
                }
            }
            if !menu.labels.disabled, !menu.labels.tiles.isEmpty {
                Menu {
                    ForEach(menu.labels.tiles, id: \.mark) { tile in
                        Toggle(tile.mark.title, isOn: Binding(get: { tile.on }, set: { _ in Task { await model.toggleLabel(items, tile.mark.title) } }))
                    }
                    .menuActionDismissBehavior(.disabled)
                } label: {
                    Label("Labels", systemImage: "tag")
                    let on = menu.labels.tiles.filter(\.on).map(\.mark.title)
                    if !on.isEmpty { Text(on.joined(separator: ", ")) }
                }
            }
            if !menu.moves.isEmpty || menu.removeDue {
                Menu {
                    ForEach(menu.moves, id: \.id) { move in
                        Button(MoveWords.title(move.id), systemImage: MoveWords.symbol(move.id)) {
                            if let date = move.date { Task { await model.postpone(items, to: date) } } else { model.dateFor = items }
                        }
                    }
                    if menu.removeDue {
                        Button("Remove Due Date", systemImage: "calendar.badge.minus") { Task { await model.removeDue(items) } }
                    }
                } label: {
                    Label("Move To", systemImage: "calendar")
                }
            }
            if let sections = menu.sections, menu.edits.contains("section") {
                Menu {
                    ForEach(sections.options, id: \.name) { option in
                        Toggle(option.name ?? sections.choice.ungrouped, isOn: Binding(get: { option.checked }, set: { _ in Task { await model.toSection(items, option.name) } }))
                    }
                    if sections.create {
                        Divider()
                        Button("New Section…", systemImage: "plus") { model.newSection = items.first }
                    }
                } label: {
                    Label("Section", systemImage: "rectangle.stack")
                    if let current = sections.options.first(where: \.checked) { Text(current.name ?? sections.choice.ungrouped) }
                }
            }
            if single, let item = items.first, !menu.reminders.isEmpty {
                Menu {
                    ForEach(menu.reminders, id: \.kind) { reminder in
                        Toggle(ReminderWords.title(reminder.kind), isOn: Binding(get: { reminder.checked }, set: { _ in Task { await model.setReminder(item, reminder.kind) } }))
                    }
                } label: {
                    Label("Reminder", systemImage: "bell")
                    if let on = menu.reminders.first(where: \.checked) { Text(ReminderWords.title(on.kind)) }
                }
            }
        }

        if single, let item = items.first {
            Section {
                if menu.edits.contains("rename") {
                    Button("Rename", systemImage: "pencil") { model.renaming = item }
                }
                if menu.edits.contains("repeat") {
                    Button("Repeat…", systemImage: "repeat") { model.repeatFor = item }
                }
                if menu.edits.contains("subtask") {
                    Button("Add Subtask", systemImage: "arrow.turn.down.right") { model.subtaskOf = item }
                }
                Button("Open Full Screen", systemImage: "arrow.up.left.and.arrow.down.right") { model.fullScreen.append(item) }
                Button("Open in Obsidian", systemImage: "arrow.up.forward.app") { Task { await openInObsidian(item) } }
            }
        }

        if let remove = menu.remove {
            Section {
                Button(single ? "Delete" : "Delete \(items.count) Tasks", systemImage: "trash", role: .destructive) {
                    if remove.confirm && single { question = .remove(items) } else { Task { await model.remove(items) } }
                }
            }
        }
    }

    private func openInObsidian(_ item: TaskItem) async {
        guard let line: Int = try? await model.read("tasks.lineOf", [item.key.json]),
              let file = try? AppServices.shared.vault.tasksFilePath(),
              let vault = UserDefaults.standard.string(forKey: "vaultFolderName")
        else { return }
        var link = URLComponents(string: "obsidian://advanced-uri")!
        link.queryItems = [URLQueryItem(name: "vault", value: vault), URLQueryItem(name: "filepath", value: file), URLQueryItem(name: "line", value: String(line + 1))]
        if let url = link.url { openURL(url) }
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
