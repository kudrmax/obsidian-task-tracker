import Core
import SwiftUI

/// Search, the plugin's: fuzzy, over titles and descriptions, in every list. The field stands at the bottom as iOS 26
/// puts it; a find is shown in its list's group, the matching letters bold in the accent, and a tap takes the ribbon to it.
struct SearchScreen: View {
    @Bindable var model: BoardModel
    @State private var query = ""
    @State private var groups: [SearchGroup] = []
    @State private var names: [String: String] = [:]
    @State private var focused = true
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups, id: \.list) { group in
                    Section(names[group.list] ?? group.list) {
                        ForEach(group.hits, id: \.item.id) { hit in
                            Button { Task { await model.reveal(hit.item); dismiss() } } label: { row(hit) }
                                .buttonStyle(.plain)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(top: 1, leading: 16, bottom: 1, trailing: 16))
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
                groups = (try? await model.read("tasks.search", [.string(query)])) ?? []
                for group in groups where names[group.list] == nil {
                    names[group.list] = try? await model.read("tasks.listName", [.string(group.list)])
                }
            }
        }
    }

    private func row(_ hit: SearchHit) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            parts(hit.title.isEmpty ? [FoundPart(text: hit.item.text, match: false)] : hit.title)
                .font(.system(size: CardMetrics.title))
                .lineLimit(1)
            if let project = hit.project {
                HStack(spacing: 6) {
                    Image(systemName: "folder").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                    parts(project).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            if let description = hit.description {
                HStack(spacing: 6) {
                    Image(systemName: "text.alignleft").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                    parts(description).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .padding(.leading, CardMetrics.leading)
        .padding(.trailing, CardMetrics.trailing)
        .padding(.vertical, hit.description == nil && hit.project == nil ? 0 : 6)
        .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
        .background(Palette.card(scheme), in: .rect(cornerRadius: CardMetrics.radius))
    }

    private func parts(_ parts: [FoundPart]) -> Text {
        parts.reduce(Text("")) { text, part in
            text + (part.match ? Text(part.text).bold().foregroundColor(Palette.accent(scheme)) : Text(part.text))
        }
    }
}

extension FoundPart {
    init(text: String, match: Bool) {
        self = try! JSONValue.object(["text": .string(text), "match": .bool(match)]).decode()
    }
}
