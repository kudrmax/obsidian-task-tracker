import Core
import SwiftUI
import UIKit

/// One task on the whole screen, as the plugin's: over a subtask's title the task it belongs to (a tap goes one level up),
/// its title, every subtask as the same capsules with the circle that ticks it done in place, and its description, drawn
/// as it reads (links tappable) and typed straight in, saved by itself. Close goes back to the main screen from any depth;
/// a task gone from its place (done, moved, deleted, here or elsewhere) gives way to the one under it, or closes.
struct TaskFullScreen: View {
    let item: TaskItem
    @Bindable var model: BoardModel
    @State private var current: TaskItem?
    @Environment(\.colorScheme) private var scheme
    @State private var tree: FullTree?
    @State private var text = ""
    @State private var draft: JSONValue = .null
    @State private var saving: Task<Void, Never>?
    @FocusState private var typing: Bool
    /// The description is being typed: the editor shows in place of the drawn text.
    @State private var editing = false
    /// The page has finished coming in.
    @State private var settled = false
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
        _cards = State(initialValue: page?.cards ?? [:])
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
                    if let parent = task.parentText { parentLine(parent) }
                    if renamesTitle {
                        EntryCapsule(host: model.entry, style: .title)
                    } else {
                        TitleText(parts: model.ruleNow("rules.textParts", [.string(task.text)]) ?? [TextPart(text: task.text)])
                            .font(.title2.bold())
                            .strikethrough(task.closed)
                    }
                    if let project = tree?.project { projectLine(project) }
                }
                TaskStack(task: task, model: model, tree: tree, cards: cards, ticks: true) { item, later in menu(for: item, later: later) }
                description
            }
            .padding(.horizontal, Layout.margin)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Close", systemImage: "xmark") { close() }
                    .tint(.primary)
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Undo", systemImage: "arrow.uturn.backward") { Task { await model.undo() } }
                    .disabled(model.snapshot?.canUndo != true)
                    .tint(.primary)
            }
            if model.entry.isOpen || editing {
                // While a task or the description is typed the page's buttons give way to the check that ends typing.
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", systemImage: "checkmark") {
                        if editing { typing = false } else { model.entry.blur() }
                    }
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
                            MenuNodes(nodes: TaskMenu(items: [task], menu: menu, model: model, inStack: true, ownPage: true, describe: { describeLater() }).nodes, palette: { model.ink($0, dark: scheme == .dark) })
                        }
                        .tint(.primary)
                    }
                }
            }
        }
        .animation(.snappy, value: editing)
        .onChange(of: typing) { if !typing { editing = false } }
        .overlay(alignment: .bottom) { NoteSuggestions(host: model.entry) }
        // A page of its own: no columns, no tab bar, no calendar, as the design has it.
        .toolbar(.hidden, for: .tabBar)
        .task { await open() }
        .onAppear {
            follow()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { settled = true }
            // Description (Add description) opens the page with the caret in the description.
            if model.describing == item.id {
                model.describing = nil
                editing = true
            }
        }
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

    @State private var subtaskMenus: [String: TaskMenuModel] = [:]
    /// The subtasks' cards as a list draws them: their colours, dates and title pieces.
    @State private var cards: [String: BoardCard] = [:]

    private func menu(for item: TaskItem, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        guard let menu = subtaskMenus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: model, inStack: true, selectsText: true).nodes, later: later) { model.ink($0, dark: dark) }
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
        // Gone from its place: the page gives way to the one under it, or the screen closes. A read that failed leaves it.
        guard let page = await model.page(task) else { return }
        if page.gone { return leave() }
        withAnimation(.snappy) {
            current = page.task
            tree = page.tree
            cards = page.cards
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
        let read = await TaskStack.read(task, model: model)
        return {
            if let found = read.task { current = found }
            tree = read.tree
            cards = read.cards
        }
    }

    /// The caret goes into the description, as the plugin's Description on its own page.
    private func describeLater() {
        editing = true
    }

    /// The page's place in the screens over the board.
    private var depth: Int? { model.fullScreen.lastIndex(of: item) }

    /// Back to the main screen, however deep, as the plugin's Close.
    private func close() {
        typing = false
        editing = false
        model.fullScreen.removeAll()
    }

    /// The task is gone: this page and every one over it give way to the one under it; none, and the screen closes.
    private func leave() {
        guard let depth else { return }
        model.fullScreen.removeSubrange(depth...)
    }

    /// One level up: back to the page it was opened from, or its task read where it stands.
    private func up() async {
        guard let depth else { return }
        if depth > 0 {
            model.fullScreen.removeSubrange(depth...)
            return
        }
        guard let parentKey = task.parentKey, let parentText = task.parentText,
              let parent: TaskItem = try? await model.read("tasks.find", [parentKey.json, .string(parentText)]) else { return }
        model.fullScreen = [parent]
    }

    /// Over a subtask's title: the task it lies in, its title as a card writes it; a tap goes one level up.
    private func parentLine(_ parent: String) -> some View {
        Button { Task { await up() } } label: {
            Label {
                TitleText(parts: model.ruleNow("rules.textParts", [.string(parent)]) ?? [TextPart(text: parent)])
                    .lineLimit(1)
            } icon: {
                Image(systemName: "arrow.turn.left.up")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Goes to the task this one belongs to")
    }

    /// Under the title: the task's project, a subtask's its parent's, the folder and the name in the caption colour, as a
    /// search hit's project line (spec point 7), on one line cut at its end. A tap opens the project's view; inside that
    /// project's own view it goes back to it, inside another project's view that project's view takes its place. A project with no note to open is drawn the same and takes no tap, as the card's mark.
    @ViewBuilder private func projectLine(_ project: ProjectRef) -> some View {
        let line = Label(project.name, systemImage: "folder")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .truncationMode(.tail)
        if project.canOpenNote {
            Button {
                if model.project != nil, model.isOwnProject(project) {
                    close()
                } else {
                    model.openProject(project)
                }
            } label: { line }
            .buttonStyle(.plain)
            .accessibilityLabel("Project \(project.name)")
            .accessibilityHint("Opens the project")
        } else {
            line.accessibilityLabel("Project \(project.name)")
        }
    }

    /// The description: drawn as it reads, links tappable, until a tap in it puts the caret there; typed, it saves itself.
    @ViewBuilder private var description: some View {
        if editing {
            TextEditor(text: $text)
                .focused($typing)
                .font(.body)
                .scrollDisabled(true)
                .frame(minHeight: 200, alignment: .topLeading)
                .scrollContentBackground(.hidden)
                .onChange(of: text) { if text != placed { typed() } }
                // The caret goes in once the editor stands: after the page's push when it opened typing.
                .task {
                    try? await Task.sleep(for: .milliseconds(settled ? 50 : 600))
                    typing = true
                }
        } else {
            DescriptionText(markdown: text, open: { model.openLink($0) }) { editing = true }
                .frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
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
