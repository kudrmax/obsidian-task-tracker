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
                TaskStack(task: task, model: model, tree: tree, cards: cards) { item, later in menu(for: item, later: later) }
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
                            MenuNodes(nodes: TaskMenu(items: [task], menu: menu, model: model, ask: { question = $0 }, inStack: true, ownPage: true, describe: { describeLater() }).nodes)
                        }
                        .tint(.primary)
                    }
                }
            }
        }
        .animation(.snappy, value: model.entry.isOpen)
        .overlay(alignment: .bottom) { NoteSuggestions(host: model.entry) }
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
            if item.key.section == shown.key.section, item.key.index == shown.key.index, item.key.path == shown.key.path { current = item }
        }
    }

    private var renamesTitle: Bool {
        model.entry.stackEntry(task)?.at.kind == "title"
    }

    @State private var subtaskMenus: [String: TaskMenuModel] = [:]
    /// The subtasks' cards as a list draws them: their colours, dates and title pieces.
    @State private var cards: [String: BoardCard] = [:]

    private func menu(for item: TaskItem, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        guard let menu = subtaskMenus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: model, ask: { question = $0 }, inStack: true).nodes, later: later) { model.ink($0, dark: dark) }
    }

    private func open() async {
        let opened: [String: JSONValue]? = try? await model.rule("description.open", [task.description.json])
        draft = opened?["state"] ?? .null
        place(opened?["text"]?.string ?? "")
        await refresh()
    }

    /// The task as the file now has it, its subtasks and menu; a change made elsewhere reaches the editor unless it is in use.
    private func refresh() async {
        await readStack()()
        listName = (try? await model.read("tasks.listName", [.string(task.list)])) ?? ""
        menuModel = await model.menu(for: task, from: "full")
        var menus: [String: TaskMenuModel] = [:]
        for row in tree?.rows ?? [] { menus[row.item.id] = await model.menu(for: row.item, from: "full") }
        subtaskMenus = menus
        let read: [String: JSONValue]? = try? await model.rule("description.read", [draft, task.description.json, ["focused": .bool(typing), "pending": .bool(saving != nil)]])
        if let read {
            draft = read["state"] ?? draft
            if let replace = read["replace"]?.string { place(replace) }
        }
    }

    /// The task and its subtasks as the file has them, handed back as their drawing: the quick entry draws a written
    /// subtask in the same step as the line it ends.
    private func readStack() async -> () -> Void {
        let read = await TaskStack.read(task, model: model)
        return {
            if let found = read.task { current = found }
            tree = read.tree
            cards = read.cards
        }
    }

    /// The caret goes into the description, as the plugin's Description on its own page.
    private func describeLater() {
        typing = true
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
