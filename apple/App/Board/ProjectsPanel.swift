import Core
import SwiftUI
import UIKit

/// The projects' panel (boards `projects-one-view/T2Panel`, `T5Drag`): the tree slid in from the left over the lists,
/// as wide as the left column, the rest dimmed. The projects button in the toolbar opens and closes it; a pick closes it
/// (the core's `pickProjectNode`); a card held at the screen's left edge brings it out for as long as it is held, so it
/// can be let go on a row. Everything is the core's answer (`ProjectsBoard`).
struct ProjectsPanelView: View {
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var scale

    var body: some View {
        GeometryReader { box in
            let shown = model.panelShown
            ZStack(alignment: .topLeading) {
                // The dim over the lists: a tap there closes the panel the button opened. It stands only while the panel
                // does: closed, nothing of it lies over the lists.
                if shown {
                Color.black.opacity(scheme == .dark ? 0.5 : 0.2)
                    .ignoresSafeArea()
                    // A tap where the panel will stand while it still slides in is the panel's: its row by height (a
                    // row's height does not move with the slide), elsewhere the dim's.
                    .gesture(SpatialTapGesture(coordinateSpace: .global).onEnded { tap in
                        let panel = max(Self.least, box.size.width / 2)
                        if tap.location.x < box.frame(in: .global).minX + panel,
                           let row = model.projects.rows.first(where: { model.projects.geometry.rows[$0.node].map { tap.location.y >= $0.minY && tap.location.y <= $0.maxY } == true }) {
                            Task { await model.projects.tap(row) }
                        } else {
                            Task { await model.funnelState.togglePanel() }
                        }
                    })
                    // Closed, the dim takes no touch at all: below it the lists lift their cards.
                    .allowsHitTesting(model.funnel?.panel?.dimCloses == true)
                    .transition(.opacity)
                    .zIndex(0)
                }
                if shown {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Projects")
                            .font(.system(size: 20, weight: .bold))
                            .frame(height: ColumnMetrics.titleRow)
                            .padding(.horizontal, 16)
                            .padding(.bottom, ColumnMetrics.headGap)
                            .accessibilityAddTraits(.isHeader)
                        ProjectTree(model: model)
                            // The tree ends above the view button and the plus, and scrolls under them no further.
                            .padding(.bottom, max(0, box.frame(in: .global).maxY - model.barTop))
                    }
                    .frame(width: max(Self.least, box.size.width / 2))
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background {
                        Color(.systemBackground)
                            .ignoresSafeArea()
                            .shadow(color: .black.opacity(scheme == .dark ? 0.6 : 0.15), radius: 12, x: 2)
                    }
                    // Its edge, as the divider between a list and the calendar: seen on a black ground too.
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(Color(.separator)).frame(width: 1 / scale).ignoresSafeArea()
                    }
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxX } action: { model.panelRight = $0 }
                    .transition(.move(edge: .leading))
                    .zIndex(1)
                }
            }
            .animation(.snappy, value: shown)
        }
    }

    /// The panel is never narrower than this, whatever the screen: a tile's name keeps room to be read.
    static let least: CGFloat = 196
}

/// Over the lists while a node filters them (board `T3`): the folder, the node's name 20 points bold (a project's opens
/// its menu: Rename, Folder, the note, Delete), and the cross that clears the filter.
struct FilterTitle: View {
    let filter: ProjectFilter
    @Bindable var model: BoardModel

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "folder")
                .font(.system(size: 17))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            name
            if filter.clearable {
                Button { Task { await model.funnelState.clear() } } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Show All Tasks")
            }
            Spacer(minLength: 0)
        }
        .frame(height: ColumnMetrics.titleRow)
        .padding(.leading, 16)
        .padding(.trailing, 8)
    }

    private var text: some View {
        Text(verbatim: filter.title)
            .font(.system(size: 20, weight: .bold))
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var name: some View {
        if let menu = filter.menu {
            Menu {
                Button(menu.renameLabel, systemImage: "pencil") { model.projects.asking = .rename(menu.project.name) }
                FolderToggle(menu: menu, projects: model.projects)
                if let note = menu.note {
                    Section(menu.noteLabel) {
                        Button(note.name, systemImage: "doc.text") { model.projects.openNote(note.link) }
                        Button(menu.detachLabel, systemImage: "minus.circle", role: .destructive) { Task { await model.projects.detach(menu.project.name) } }
                    }
                }
                Section {
                    Button(menu.delete.label, systemImage: "trash", role: menu.delete.destructive ? .destructive : nil) { model.projects.deleting = menu }
                }
            } label: {
                text.contentShape(.rect)
            }
            .buttonStyle(.plain)
            .menuOrder(.fixed)
        } else {
            text
        }
    }
}

/// What the projects ask for over the whole screen: a name (the plus let go in the tree, Rename) and Delete project's
/// question.
struct ProjectsAsks: ViewModifier {
    @Bindable var model: BoardModel

    func body(content: Content) -> some View {
        let projects = model.projects
        content
            .alert(projects.asking?.title ?? "", isPresented: Binding(get: { projects.asking != nil }, set: { if !$0 { projects.asking = nil } }), presenting: projects.asking) { ask in
                NameField(ask: ask, board: projects)
            }
            .confirmationDialog(
                projects.deleting?.delete.title ?? "",
                isPresented: Binding(get: { projects.deleting != nil }, set: { if !$0 { projects.deleting = nil } }),
                titleVisibility: .visible,
                presenting: projects.deleting
            ) { asked in
                Button(asked.delete.confirm, role: asked.delete.destructive ? .destructive : nil) { Task { await projects.delete(asked.project.name) } }
                Button(asked.delete.cancel, role: .cancel) {}
            } message: { asked in
                Text(verbatim: asked.delete.message)
            }
    }
}

/// The view button (board `V1PhoneCols`): a glass circle with the current mode's symbol; a tap opens the modes as the
/// system's menu, a check at the current one, and under them the Subprojects row while the core offers it. The core gives
/// the modes, their words and icons.
struct ViewButton: View {
    let view: ViewChoice
    @Bindable var model: BoardModel
    /// The plus's size beside it: the same circle.
    var size: CGFloat = 48

    var body: some View {
        Menu {
            ForEach(view.modes, id: \.mode) { option in
                Toggle(isOn: Binding(get: { option.checked }, set: { _ in Task { await model.funnelState.setMode(option.mode) } })) {
                    Label(option.label, systemImage: Self.symbol(option.icon))
                }
            }
            if let subprojects = view.subprojects {
                Section {
                    Toggle(isOn: Binding(get: { subprojects.checked }, set: { _ in Task { await model.funnelState.toggleSubprojects() } })) {
                        Text(verbatim: subprojects.label)
                    }
                }
            }
        } label: {
            Image(systemName: Self.symbol(view.icon))
                .font(.system(size: 19, weight: .medium))
                .frame(width: size, height: size)
                .contentShape(.circle)
        }
        .menuOrder(.fixed)
        .tint(.primary)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel("View")
        .accessibilityValue(view.modes.first { $0.checked }?.label ?? "")
    }

    /// The system symbol for the core's Lucide icon name.
    static func symbol(_ icon: String) -> String {
        switch icon {
        case "columns-2": "rectangle.split.2x1"
        case "columns-4": "rectangle.split.3x1"
        case "rows-3": "rectangle.split.1x2"
        case "folder-tree": "list.bullet.indent"
        default: "rectangle.split.2x1"
        }
    }
}
