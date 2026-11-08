import Core
import SwiftUI
import UIKit

/// One task on the whole screen: where it lies, its title, every subtask as the same capsules, and its description,
/// typed straight in and saved by itself. A navigation page: back by the glass arrow or a swipe from the edge.
struct TaskFullScreen: View {
    let item: TaskItem
    @Bindable var model: BoardModel
    @State private var current: TaskItem?
    @Environment(\.colorScheme) private var scheme
    @State private var tree: FullTree?
    @State private var listName = ""
    @State private var text = ""
    @State private var draft: JSONValue = .null
    @State private var saving: Task<Void, Never>?
    @State private var question: MenuQuestion?
    @FocusState private var typing: Bool
    /// The text last put in the editor from the file: a change to anything else is typing.
    @State private var placed = ""

    private var task: TaskItem { current ?? item }

    /// The page's first frame is drawn from what was read before the push.
    init(item: TaskItem, model: BoardModel) {
        self.item = item
        self.model = model
        let page = model.pages[item.id]
        _current = State(initialValue: page?.task)
        _tree = State(initialValue: page?.tree)
        _listName = State(initialValue: page?.listName ?? "")
        _menuModel = State(initialValue: page?.menu)
        _subtaskMenus = State(initialValue: page?.subtaskMenus ?? [:])
        let text = page?.opened["text"].string ?? ""
        _draft = State(initialValue: page?.opened["state"] ?? .null)
        _text = State(initialValue: text)
        _placed = State(initialValue: text)
        _preread = State(initialValue: page != nil)
    }

    /// The description was opened before the push.
    @State private var preread = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(listName).font(.subheadline).foregroundStyle(.secondary)
                    if renamesTitle {
                        EntryCapsule(host: model.entry, style: .title)
                    } else {
                        Text(task.text).font(.title2.bold()).strikethrough(task.closed)
                    }
                }
                let rows = stackRows
                if !rows.isEmpty {
                    VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            let branch = row.level > 0 ? model.branch(levels: rows.map(\.level), index: index) : nil
                            switch row {
                            case .row(let full): subtask(full, branch: branch)
                            case .pending(_, let text, let level): typed(level: level, branch: branch) { PendingCapsule(text: text) }
                            case .field(let level): typed(level: level, branch: branch) { EntryCapsule(host: model.entry) }
                            }
                        }
                    }
                }
                TextEditor(text: $text)
                    .focused($typing)
                    .font(.body)
                    .scrollDisabled(true)
                    .frame(minHeight: 200)
                    .scrollContentBackground(.hidden)
                    .onChange(of: text) { if text != placed { typed() } }
            }
            .padding(.horizontal, Layout.margin)
        }
        .toolbar {
            if model.entry.isOpen {
                // While a task is typed the page's buttons give way to the check that ends typing, as on the main screen.
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", systemImage: "checkmark") { model.entry.blur() }
                        .buttonStyle(.glassProminent)
                        .tint(Palette.accent(scheme))
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add Subtask", systemImage: "plus") { model.entry.addSubtaskInStack(task) }
                        .tint(.primary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if let menu = menuModel {
                        Menu("More", systemImage: "ellipsis") {
                            MenuNodes(nodes: TaskMenu(items: [task], menu: menu, model: model, ask: { question = $0 }, inStack: true, ownPage: true).nodes)
                        }
                        .tint(.primary)
                    }
                }
            }
        }
        // A page of its own: no columns, no tab bar, no calendar, as the design has it.
        .toolbar(.hidden, for: .tabBar)
        .menuQuestions($question, model: model)
        .task { await open() }
        .onAppear { follow() }
        .onChange(of: model.snapshot?.tasksText) { Task { await refresh() } }
        .onDisappear {
            // Back is a tap elsewhere: what was typed in the stack is written.
            if model.entry.state?.spotKind == "stack" { model.entry.blur() }
            saving?.cancel()
            Task { await save() }
        }
    }

    @State private var menuModel: TaskMenuModel?

    /// The quick entry's field in this page's stack: the subtasks read again before a written one is shown, and the
    /// task as a rename left it.
    private func follow() {
        let shown = task
        model.entry.stackRead = { await readStack() }
        model.entry.renamed = { item in
            if item.id == shown.id { current = item }
        }
    }

    private var renamesTitle: Bool {
        model.entry.stackEntry(task)?.at.kind == "title"
    }

    /// The subtasks as drawn, with the field and the texts waiting before it where the core puts them.
    private var stackRows: [StackRow] {
        var rows = (tree?.rows ?? []).map(StackRow.row)
        guard let entry = model.entry.stackEntry(task), let index = entry.at.index, let level = entry.at.level else { return rows }
        switch entry.at.kind {
        case "row" where rows.indices.contains(index):
            rows[index] = .field(level: level)
        case "new" where index <= rows.count:
            let typed = entry.pending.enumerated().map { StackRow.pending(index: $0.offset, text: $0.element.text, level: $0.element.level) }
            rows.insert(contentsOf: typed + [.field(level: level)], at: index)
        default:
            break
        }
        return rows
    }

    private enum StackRow: Identifiable {
        case row(FullRow)
        case pending(index: Int, text: String, level: Int)
        case field(level: Int)

        var id: String {
            switch self {
            case .row(let row): row.item.id
            case .pending(let index, _, _): "\u{0}pending/\(index)"
            case .field: "\u{0}entry"
            }
        }


        var level: Int {
            switch self {
            case .row(let row): row.level
            case .pending(_, _, let level), .field(let level): level
            }
        }
    }

    private func typed(level: Int, branch: Branch?, @ViewBuilder _ content: () -> some View) -> some View {
        content()
            .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }

    @State private var subtaskMenus: [String: TaskMenuModel] = [:]

    /// A subtask as the same capsule as on the main screen, at its depth; a long press shows its own menu.
    private func subtask(_ row: FullRow, branch: Branch?) -> some View {
        let card = BoardCard(item: row.item, level: row.level, branch: row.level > 0 ? branch : nil, due: nil, repeats: row.item.repeats, shades: nil)
        return CardButton(card: card, menu: { later in menu(for: row.item, later: later) }, draggable: false)
            .frame(height: CardMetrics.height)
            .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(row.level) * CardMetrics.indent)
    }

    private func menu(for item: TaskItem, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        guard let menu = subtaskMenus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: model, ask: { question = $0 }, inStack: true).nodes, later: later) { model.ink($0, dark: dark) }
    }

    private func open() async {
        if !preread {
            let opened: [String: JSONValue]? = try? await model.rule("description.open", [task.description.json])
            draft = opened?["state"] ?? .null
            place(opened?["text"]?.string ?? "")
        }
        await refresh()
    }

    /// The task as the file now has it, its subtasks and menu; a change made elsewhere reaches the editor unless it is in use.
    private func refresh() async {
        guard let page = await model.page(task) else { return }
        withAnimation(.snappy) {
            current = page.task
            tree = page.tree
            listName = page.listName
            menuModel = page.menu
            subtaskMenus = page.subtaskMenus
        }
        let read: [String: JSONValue]? = try? await model.rule("description.read", [draft, task.description.json, ["focused": .bool(typing), "pending": .bool(saving != nil)]])
        if let read {
            draft = read["state"] ?? draft
            if let replace = read["replace"]?.string { place(replace) }
        }
    }

    /// The task and its subtasks as the file has them, handed back as their drawing: the quick entry draws a written
    /// subtask in the same step as the line it ends.
    private func readStack() async -> () -> Void {
        let found: TaskItem? = try? await model.read("tasks.find", [task.key.json, .string(task.text)])
        let read: FullTree? = try? await model.rule("tasks.fullTree", [(found ?? task).json])
        return {
            if let found { current = found }
            tree = read
        }
    }

    private func place(_ new: String) {
        placed = new
        text = new
    }

    private func typed() {
        Task {
            draft = (try? await model.rule("description.typed", [draft])) ?? draft
        }
        saving?.cancel()
        saving = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await save()
        }
    }

    private func save() async {
        saving = nil
        guard let saved: [String: JSONValue] = try? await model.rule("description.save", [draft]) else { return }
        draft = saved["state"] ?? draft
        if saved["write"]?.bool == true { await model.write("tasks.setDescription", [task.key.json, .string(text)]) }
    }
}
