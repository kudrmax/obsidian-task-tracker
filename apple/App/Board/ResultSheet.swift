import Core
import SwiftUI

/// Add to result (results, point 9), in place of the menu: the system's searchable list of every open result in the
/// file's order, each with its list's symbol, its project's name under it and a tick on the one the tasks are in; «New
/// result…» last, apart, asking the name as New project… does; a query that finds nothing leaves «New result…» alone. The core searches, ticks and words it; a pick writes
/// `tasks.addToResult`.
struct ResultSheet: View {
    let ask: ResultAsk
    @Bindable var model: BoardModel
    @State private var query = ""
    @State private var page: ResultPage?
    @State private var listNames: [String: String] = [:]
    @State private var naming = false
    @State private var name = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let page, !page.options.isEmpty {
                    Section {
                        ForEach(page.options) { option in
                            Button { pick(option) } label: { row(option) }
                                .tint(.primary)
                        }
                    }
                }
                if let page {
                    Section {
                        Button(page.newLabel, systemImage: "plus") { name = ""; naming = true }
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: page?.placeholder ?? "")
            .navigationTitle(ask.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
            }
            .alert("New Result", isPresented: $naming) {
                TextField(page?.namePlaceholder ?? "", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Create") { create() }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .task(id: query) {
                if page != nil { try? await Task.sleep(for: .milliseconds(120)) }
                guard !Task.isCancelled, let read = await model.resultPage(ask.items, query: query), !Task.isCancelled else { return }
                for option in read.options where listNames[option.list] == nil {
                    listNames[option.list] = try? await model.read("tasks.listName", [.string(option.list)])
                }
                withAnimation(.snappy) { page = read }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ option: ResultOption) -> some View {
        HStack(spacing: 12) {
            Image(systemName: Self.symbol(option.list))
                .foregroundStyle(.secondary)
                .frame(width: 24)
                .accessibilityLabel(listNames[option.list] ?? option.list)
            VStack(alignment: .leading, spacing: 2) {
                Text(option.result.title)
                    .lineLimit(2)
                if let project = option.project {
                    // The project's line as the full screen and a search's find draw it: the folder, then the name.
                    HStack(spacing: 4) {
                        Image(systemName: "folder")
                        Text(project).lineLimit(1)
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Project \(project)")
                }
            }
            Spacer(minLength: 0)
            if option.checked {
                Image(systemName: "checkmark")
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.accentColor)
                    .accessibilityLabel("Current")
            }
        }
        .contentShape(.rect)
    }

    /// The symbol of the list a result stands in: its column's, as the tab bar and the quick moves draw them.
    static func symbol(_ list: String) -> String {
        switch list {
        case "inbox": "tray"
        case "now": "sun.max"
        case "soon": "hourglass"
        case "backlog": "archivebox"
        default: "list.bullet"
        }
    }

    private func pick(_ option: ResultOption) {
        let items = ask.items
        dismiss()
        Task { await model.addToResult(items, option) }
    }

    private func create() {
        let items = ask.items, typed = name
        dismiss()
        Task { await model.newResult(items, typed) }
    }
}
