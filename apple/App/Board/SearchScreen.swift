import Core
import SwiftUI

/// Search, the plugin's: fuzzy, over titles and descriptions and the projects' names, in every list. The field stands at
/// the bottom as iOS 26 puts it; a find is its card, as the plugin's search draws it (colours, date, counter, marks), the
/// found pieces picked out, the project's name or the description's line under the title where the query was found
/// there. A tap takes the ribbon to the task, ringed and scrolled into sight.
struct SearchScreen: View {
    @Bindable var model: BoardModel
    @State private var query = ""
    @State private var groups: [SearchGroup] = []
    @State private var cards: [String: BoardCard] = [:]
    @State private var names: [String: String] = [:]
    @State private var focused = true
    /// Opened over a screen filtered by a node: each find shows where it stands among the projects, so the same task in
    /// two projects is seen side by side.
    private var fromProjects: Bool { model.filter != nil }
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups, id: \.list) { group in
                    Section(names[group.list] ?? group.list) {
                        ForEach(group.hits, id: \.item.id) { hit in
                            Button { Task { await model.reveal(hit.item); dismiss() } } label: { row(hit) }
                                .buttonStyle(.plain)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(top: CardMetrics.gap / 2, leading: Layout.margin, bottom: CardMetrics.gap / 2, trailing: Layout.margin))
                        }
                    }
                }
            }
            .listStyle(.plain)
            .environment(\.defaultMinListRowHeight, CardMetrics.height)
            .overlay {
                if !query.isEmpty, groups.isEmpty { ContentUnavailableView.search(text: query) }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, isPresented: $focused, prompt: "Tasks")
            .onChange(of: focused) { if !focused, query.isEmpty { dismiss() } }
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled else { return }
                let found: [SearchGroup] = (try? await model.read("tasks.search", [.string(query)])) ?? []
                let drawn = await model.cards(found.flatMap(\.hits).map { ListRow(item: $0.item, level: 0) })
                var named = names
                for group in found where named[group.list] == nil {
                    named[group.list] = try? await model.read("tasks.listName", [.string(group.list)])
                }
                guard !Task.isCancelled else { return }
                // The hits change by their tasks' ids: one that stays slides, one that goes or comes fades, in one step
                // with the groups' names.
                withAnimation(.snappy) {
                    cards = Dictionary(drawn.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first })
                    names = named
                    groups = found
                }
            }
        }
    }

    private func row(_ hit: SearchHit) -> some View {
        TaskCapsule(card: cards[hit.item.id] ?? BoardCard(item: hit.item, level: 0, branch: nil, due: nil, repeats: hit.item.repeats, paint: nil), found: hit, path: fromProjects ? hit.projectPath : nil)
    }
}

extension FoundPart {
    init(text: String, match: Bool) {
        self = try! JSONValue.object(["text": .string(text), "match": .bool(match)]).decode()
    }
}
