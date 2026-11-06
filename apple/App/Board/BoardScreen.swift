import Core
import SwiftUI

/// What the tab bar selects: a place of the ribbon, or the plus, which opens a new task and selects nothing.
enum BoardTab: Hashable {
    case place(RibbonPlace)
    case newTask
}

/// The main screen: the plugin's ribbon of lists beside the calendar under the system tab bar, Inbox, Soon and Today
/// the three places it stands at; the plus beside the tab bar opens a new task.
struct BoardScreen: View {
    @State private var model = BoardModel()
    @State private var router = CaptureRouter.shared
    @State private var question: MenuQuestion?
    @State private var sheet: BoardSheet?
    @Environment(\.scenePhase) private var scene

    var body: some View {
        TabView(selection: tab) {
            ForEach(RibbonPlace.allCases, id: \.self) { place in
                Tab(place.title, systemImage: place.symbol, value: BoardTab.place(place)) {
                    BoardPage(place: place, model: model, question: $question, sheet: $sheet)
                }
            }
            // The plus is an action, not a place: iOS 26 gives the trailing round button beside the tab bar to it, and
            // choosing it opens a new task over the screen and leaves the tab where it was.
            Tab("New Task", systemImage: "plus", value: BoardTab.newTask, role: .search) {
                Color.clear
            }
        }
        .tabBarMinimizeBehavior(.never)
        .sheet(isPresented: $router.capturing, onDismiss: { Task { await model.reload() } }) {
            CaptureView()
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .search: SearchScreen(model: model)
            case .settings: NavigationStack { SettingsView() }
            case .calendars: NavigationStack { CalendarsView(model: model) }
            }
        }
        .boardSheets(model: model)
        .menuQuestions($question, model: model)
        .task { await model.reload() }
        .onChange(of: scene) { if scene == .active { Task { await model.reload() } } }
        .task {
            // The tasks file changes outside the app too: Obsidian, Sync, a reminder's button.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                if scene == .active { await model.reloadIfChanged() }
            }
        }
    }

    private var tab: Binding<BoardTab> {
        Binding(
            get: { .place(model.place) },
            set: { chosen in
                switch chosen {
                case .place(let place): withAnimation(.snappy) { model.place = place }
                case .newTask: router.capturing = true
                }
            })
    }
}

enum BoardSheet: String, Identifiable {
    case search, settings, calendars
    var id: String { rawValue }
}

/// One tab's page: the ribbon under the top bar, Undo on the left and «⋯» on the right.
struct BoardPage: View {
    let place: RibbonPlace
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @Binding var sheet: BoardSheet?

    var body: some View {
        NavigationStack(path: path) {
            content
                .toolbar {
                    if model.selecting { selectionBar } else { mainBar }
                }
                .navigationBarTitleDisplayMode(.inline)
                // Select Tasks' actions take the tab bar's place, as in Mail and Files.
                .toolbar(model.selecting ? .hidden : .automatic, for: .tabBar)
                .navigationDestination(for: TaskItem.self) { item in TaskFullScreen(item: item, model: model) }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot = model.snapshot, !snapshot.screen.missing {
            Ribbon(snapshot: snapshot, model: model, question: $question)
                .overlay(alignment: .top) { problem }
                .overlay { LiftedCard(drag: model.drag) }
        } else if let problem = model.problem {
            ContentUnavailableView {
                Label("Can’t Read Your Tasks", systemImage: "exclamationmark.triangle")
            } description: {
                Text(problem)
            } actions: {
                Button("Open Settings") { sheet = .settings }.buttonStyle(.glassProminent)
            }
        } else if model.snapshot?.screen.missing == true {
            ContentUnavailableView {
                Label("No Tasks File", systemImage: "doc.badge.plus")
            } description: {
                Text("Your vault has no tasks file yet.")
            } actions: {
                Button("Create Tasks File") { Task { await model.write("tasks.createFile", []) } }.buttonStyle(.glassProminent)
            }
        } else {
            ProgressView()
        }
    }

    @ViewBuilder
    private var problem: some View {
        if let problem = model.problem {
            Label(problem, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassEffect()
                .padding(.top, 4)
                .onTapGesture { Task { await model.reload() } }
        }
    }

    /// Only the tab shown follows the path: a task opened full screen shows in that tab alone.
    private var path: Binding<[TaskItem]> {
        Binding(get: { model.place == place ? model.fullScreen : [] }, set: { if model.place == place { model.fullScreen = $0 } })
    }

    @ToolbarContentBuilder
    private var mainBar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("Undo", systemImage: "arrow.uturn.backward") { Task { await model.undo() } }
                .disabled(model.snapshot?.canUndo != true)
                .tint(.primary)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu("More", systemImage: "ellipsis") {
                Button("Search", systemImage: "magnifyingglass") { sheet = .search }
                Button("Select Tasks", systemImage: "checkmark.circle") { model.startSelection() }
                Divider()
                Button("Calendars", systemImage: model.snapshot?.calendarsStale == true ? "calendar.badge.exclamationmark" : "calendar") { sheet = .calendars }
                Button("Settings", systemImage: "gear") { sheet = .settings }
            }
            .badge(model.snapshot?.calendarsStale == true ? 1 : 0)
            .tint(.primary)
        }
    }

    @ToolbarContentBuilder
    private var selectionBar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("Select All") { model.pickAll() }
        }
        ToolbarItem(placement: .principal) {
            Text("\(model.picked.count) Selected").font(.headline)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button("Done", systemImage: "checkmark") { model.endSelection() }
                .buttonStyle(.glassProminent)
        }
        ToolbarItemGroup(placement: .bottomBar) {
            BulkActions(model: model, question: $question)
        }
    }
}

/// The ribbon: four half-screen columns, Inbox over Backlog, Soon, the day list and the calendar, standing at one of
/// three places. A swipe moves it, and the tab bar follows.
struct Ribbon: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var leading: Int?

    var body: some View {
        GeometryReader { box in
            let half = box.size.width / 2
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    column(0, half) {
                        VStack(spacing: 12) {
                            list(.inbox)
                            list(.backlog)
                        }
                    }
                    column(1, half) { list(.soon) }
                    column(2, half) { list(.day, dayArrows: true) }
                    column(3, half) { TimelineColumn(timeline: snapshot.timeline, model: model, question: $question) }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned(limitBehavior: .alwaysByOne))
            .scrollPosition(id: $leading, anchor: .leading)
            .scrollIndicators(.hidden)
            .onAppear { leading = model.place.rawValue }
            .onChange(of: model.place) { withAnimation(.snappy) { leading = model.place.rawValue } }
            .onChange(of: leading) {
                if let leading, let place = RibbonPlace(rawValue: min(leading, 2)), place != model.place { model.place = place }
            }
        }
    }

    private func column(_ index: Int, _ width: CGFloat, @ViewBuilder content: () -> some View) -> some View {
        content()
            .frame(width: width)
            .frame(maxHeight: .infinity, alignment: .top)
            .id(index)
    }

    @ViewBuilder
    private func list(_ column: BoardColumn, dayArrows: Bool = false) -> some View {
        if let list = snapshot.lists[column] {
            ListColumn(list: list, model: model, dayArrows: dayArrows, question: $question)
        }
    }
}

/// Select Tasks' actions in the bottom bar, in place of the tab bar: Done, priority, move, more, Delete — the bulk menu
/// as the core reads it for the picked tasks.
struct BulkActions: View {
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var menu: TaskMenuModel?

    var body: some View {
        let items = model.pickedItems
        Group {
            Button("Done", systemImage: "checkmark.circle") { Task { await model.pickStatus(items, "done") } }
            Menu("Priority", systemImage: "flag") {
                if let menu, !menu.levels.disabled {
                    ForEach(menu.levels.tiles, id: \.mark) { tile in
                        Toggle(tile.mark.title, isOn: Binding(get: { tile.on }, set: { _ in Task { await model.togglePriority(items, tile.mark.title) } }))
                    }
                }
            }
            .disabled(menu?.levels.disabled ?? true)
            Menu("Move", systemImage: "calendar") {
                if let menu {
                    ForEach(menu.moves, id: \.id) { move in
                        Button(MoveWords.title(move.id), systemImage: MoveWords.symbol(move.id)) {
                            if let date = move.date { Task { await model.postpone(items, to: date) } } else { model.dateFor = items }
                        }
                    }
                    if menu.removeDue {
                        Button("Remove Due Date", systemImage: "calendar.badge.minus") { Task { await model.removeDue(items) } }
                    }
                }
            }
            .disabled(menu?.moves.isEmpty ?? true)
            Menu("More", systemImage: "ellipsis.circle") {
                if let menu { TaskMenuContent(items: items, menu: menu, model: model, question: $question) }
            }
            Button("Delete", systemImage: "trash", role: .destructive) { Task { await model.remove(items) } }
                .foregroundStyle(.red)
                .disabled(menu?.remove == nil)
        }
        .tint(.primary)
        .disabled(items.isEmpty)
        .task(id: model.picked) { menu = items.isEmpty ? nil : await model.bulkMenu() }
    }
}
