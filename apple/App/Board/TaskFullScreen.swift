import Core
import SwiftUI

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
                            subtask(row, branch: Self.branch(index, tree.rows))
                        }
                    }
                }
                TextEditor(text: $text)
                    .focused($typing)
                    .font(.body)
                    .scrollDisabled(true)
                    .frame(minHeight: 200)
                    .scrollContentBackground(.hidden)
                    .onChange(of: text) { typed() }
            }
            .padding(.horizontal, Layout.margin)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add Subtask", systemImage: "plus") { model.subtaskOf = task }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let menu = menuModel {
                    Menu("More", systemImage: "ellipsis") {
                        TaskMenuContent(items: [task], menu: menu, model: model, question: $question)
                    }
                }
            }
        }
        .menuQuestions($question, model: model)
        .task { await open() }
        .onChange(of: model.snapshot?.tasksText) { Task { await refresh() } }
        .onDisappear { Task { await save() } }
    }

    @State private var menuModel: TaskMenuModel?

    private func subtask(_ row: FullRow, branch: Branch?) -> some View {
        let card = BoardCard(item: row.item, level: row.level + 1, branch: branch, due: nil, repeats: row.item.repeats, shades: nil)
        return Menu {
            if let menu = model.snapshot?.menus[row.item.id] {
                TaskMenuContent(items: [row.item], menu: menu, model: model, question: $question)
            } else {
                Button("Open Full Screen", systemImage: "arrow.up.left.and.arrow.down.right") { model.fullScreen.append(row.item) }
            }
        } label: {
            TaskCapsule(card: card)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch).padding(.leading, CGFloat(row.level + 1) * CardMetrics.indent) } }
        .padding(.leading, CGFloat(row.level + 1) * CardMetrics.indent)
    }

    private static func branch(_ index: Int, _ rows: [FullRow]) -> Branch {
        let level = rows[index].level
        for row in rows[(index + 1)...] {
            if row.level == level { return .mid }
            if row.level < level { return .last }
        }
        return .last
    }

    private func open() async {
        let opened: [String: JSONValue]? = try? await model.rule("description.open", [task.description.json])
        draft = opened?["state"] ?? .null
        text = opened?["text"]?.string ?? ""
        await refresh()
    }

    /// The task as the file now has it, its subtasks and menu; a change made elsewhere reaches the editor unless it is in use.
    private func refresh() async {
        if let found: TaskItem = try? await model.read("tasks.find", [task.key.json, .string(task.text)]) { current = found }
        tree = try? await model.rule("tasks.fullTree", [task.json])
        listName = (try? await model.read("tasks.listName", [.string(task.list)])) ?? ""
        menuModel = try? await model.read("tasks.menu", [task.json, "full", model.menuScreen])
        let read: [String: JSONValue]? = try? await model.rule("description.read", [draft, task.description.json, ["focused": .bool(typing), "pending": .bool(saving != nil)]])
        if let read {
            draft = read["state"] ?? draft
            if let replace = read["replace"]?.string { text = replace }
        }
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
