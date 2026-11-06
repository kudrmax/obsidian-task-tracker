import Core
import SwiftUI
import UIKit

/// One task on the whole screen: where it lies, its title, every subtask as the same capsules, and its description,
/// typed straight in and saved by itself. A navigation page: back by the glass arrow or a swipe from the edge.
struct TaskFullScreen: View {
    let item: TaskItem
    @Bindable var model: BoardModel
    @State private var current: TaskItem?
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
                    Text(task.text).font(.title2.bold()).strikethrough(task.closed)
                }
                if let tree, !tree.rows.isEmpty {
                    VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(Array(tree.rows.enumerated()), id: \.element.item.id) { index, row in
                            subtask(row, branch: model.branch(levels: tree.rows.map(\.level), index: index))
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
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add Subtask", systemImage: "plus") { model.subtaskOf = task }
                    .tint(.primary)
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let menu = menuModel {
                    Menu("More", systemImage: "ellipsis") {
                        MenuNodes(nodes: TaskMenu(items: [task], menu: menu, model: model) { question = $0 }.nodes)
                    }
                    .tint(.primary)
                }
            }
        }
        // A page of its own: no columns, no tab bar, no calendar, as the design has it.
        .toolbar(.hidden, for: .tabBar)
        .menuQuestions($question, model: model)
        .task { await open() }
        .onChange(of: model.snapshot?.tasksText) { Task { await refresh() } }
        .onDisappear {
            saving?.cancel()
            Task { await save() }
        }
    }

    @State private var menuModel: TaskMenuModel?

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
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: model) { question = $0 }.nodes, later: later) { model.ink($0, dark: dark) }
    }

    private func open() async {
        let opened: [String: JSONValue]? = try? await model.rule("description.open", [task.description.json])
        draft = opened?["state"] ?? .null
        place(opened?["text"]?.string ?? "")
        await refresh()
    }

    /// The task as the file now has it, its subtasks and menu; a change made elsewhere reaches the editor unless it is in use.
    private func refresh() async {
        if let found: TaskItem = try? await model.read("tasks.find", [task.key.json, .string(task.text)]) { current = found }
        tree = try? await model.rule("tasks.fullTree", [task.json])
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
