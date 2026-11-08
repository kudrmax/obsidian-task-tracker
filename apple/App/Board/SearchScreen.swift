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
                let found: [SearchGroup] = (try? await model.read("tasks.search", [.string(query)] + (model.projectLink.map { [JSONValue.string($0)] } ?? []))) ?? []
                let drawn = await model.cards(found.flatMap(\.hits).map { ListRow(item: $0.item, level: 0) })
                guard !Task.isCancelled else { return }
                cards = Dictionary(drawn.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first })
                groups = found
                for group in groups where names[group.list] == nil {
                    names[group.list] = try? await model.read("tasks.listName", [.string(group.list)])
                }
            }
        }
    }

    private func row(_ hit: SearchHit) -> some View {
        TaskCapsule(card: cards[hit.item.id] ?? BoardCard(item: hit.item, level: 0, branch: nil, due: nil, repeats: hit.item.repeats, paint: nil), found: hit)
    }
}

extension FoundPart {
    init(text: String, match: Bool) {
        self = try! JSONValue.object(["text": .string(text), "match": .bool(match)]).decode()
    }
}
