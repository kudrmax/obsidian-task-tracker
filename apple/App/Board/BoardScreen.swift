import Core
import SwiftUI
import UIKit

/// The main screen: the plugin's ribbon of lists beside the calendar, one ribbon for Inbox, Soon and Today, the three
/// places it stands at; the system tab bar under it only says where it stands and moves it there, and the plus beside
/// the tab bar opens a new task.
struct BoardScreen: View {
    @State private var model = BoardModel()
    @State private var router = CaptureRouter.shared
    @State private var question: MenuQuestion?
    @State private var sheet: BoardSheet?
    @Environment(\.scenePhase) private var scene
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack(path: $model.fullScreen) {
            content
                .toolbar {
                    if model.selecting { selectionBar } else { mainBar }
                }
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: TaskItem.self) { item in TaskFullScreen(item: item, model: model) }
        }
        .overlay(alignment: .bottom) {
            if !model.selecting, model.fullScreen.isEmpty {
                bottomBar.transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: model.selecting)
        .background { DropAnchor(drop: model.dropping) }
        .sheet(item: Binding(get: { model.newTaskAt }, set: { model.newTaskAt = $0 })) { spot in
            NameSheet(title: "New Task", action: "Add") { title in Task { await model.create(title, at: spot) } }
        }
        .sheet(isPresented: $router.capturing, onDismiss: { Task { await model.reloadIfChanged() } }) {
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
        .onChange(of: scene, initial: true) {
            // The tasks file changes outside the app too: back in front, the screen reads it again if it did; while in
            // front, a coordinated write (iCloud, a reminder's button) tells the watch.
            if scene == .active {
                model.watchFile()
                Task { await model.reloadIfChanged() }
            } else {
                model.stopWatching()
            }
        }
    }

    /// The tab bar beside the plus, measured from the screen's edges as the design stands them.
    private var bottomBar: some View {
        HStack(spacing: 10) {
            // The bar draws its glass inside its own margins: the glass, not the bar, lines up with the screen's edge.
            PlaceBar(place: model.place) { model.go(to: $0) }
                .frame(width: PlaceBar.glass + 2 * PlaceBar.margin, height: PlusButton.side)
                .padding(.horizontal, -PlaceBar.margin)
            Spacer(minLength: 0)
            PlusButton(open: { router.capturing = true }, accent: Palette.accent(scheme), cancelling: model.carrying, onCarry: { model.startCarry(Carried.plus) }, onCancel: { model.cancelCarry() })
                .frame(width: PlusButton.side, height: PlusButton.side)
        }
        .padding(.horizontal, PlusButton.inset)
        .padding(.bottom, PlusButton.bottom)
        .ignoresSafeArea(edges: .bottom)
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot = model.snapshot, !snapshot.screen.missing {
            Ribbon(snapshot: snapshot, model: model, question: $question)
                .overlay(alignment: .top) { problem }
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

enum BoardSheet: String, Identifiable {
    case search, settings, calendars
    var id: String { rawValue }
}

/// The system tab bar, standing alone beside the plus: its items are the ribbon's places, the selected one where the
/// ribbon stands, and a tap moves the ribbon there.
struct PlaceBar: UIViewRepresentable {
    /// How far inside its bounds a standalone tab bar draws its glass, and the widest glass it draws for three items.
    static let margin: CGFloat = 21
    static let glass: CGFloat = 273

    let place: RibbonPlace
    let choose: (RibbonPlace) -> Void

    func makeUIView(context: Context) -> UITabBar {
        let bar = UITabBar()
        bar.items = RibbonPlace.allCases.map { place in
            UITabBarItem(title: place.name, image: UIImage(systemName: place.symbol), tag: place.rawValue)
        }
        bar.delegate = context.coordinator
        bar.selectedItem = bar.items?[place.rawValue]
        return bar
    }

    func updateUIView(_ bar: UITabBar, context: Context) {
        context.coordinator.choose = choose
        if bar.selectedItem?.tag != place.rawValue { bar.selectedItem = bar.items?[place.rawValue] }
    }

    func makeCoordinator() -> Coordinator { Coordinator(choose: choose) }

    final class Coordinator: NSObject, UITabBarDelegate {
        var choose: (RibbonPlace) -> Void

        init(choose: @escaping (RibbonPlace) -> Void) { self.choose = choose }

        func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
            if let place = RibbonPlace(rawValue: item.tag) { choose(place) }
        }
    }
}

/// The ribbon: four columns side by side, Inbox over Backlog, Soon, the day list and the calendar, each a fixed width the
/// whole time, as if the ones off the screen stood just past its edges. The day list and Inbox are as wide as the
/// divider leaves the day list, Soon and the calendar the rest; so Inbox–Soon, Soon–day and day–calendar each fill the
/// screen, at offsets 0, the day list's width and the screen's. A swipe is the system's paging scroll between them.
struct Ribbon: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var position = ScrollPosition(idType: RibbonPlace.self)
    /// How far the ribbon has come from Soon to Today, 0 to 1: the divider's handle shows at Today.
    @State private var toToday: CGFloat = 0
    @AppStorage("listShare") private var listShare: Double = 0.5
    @State private var dragStart: CGFloat?
    @State private var phase = ScrollPhase.idle

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            let list = listWidth(width)
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    column(.inbox, list) {
                        VStack(spacing: 12) {
                            lists(.inbox)
                            lists(.backlog)
                        }
                    }
                    column(.soon, width - list) { lists(.soon) }
                    // The day list and the calendar are one day: they slide together when it changes.
                    dayPart {
                        HStack(spacing: 0) {
                            lists(.day, dayArrows: true)
                                .frame(width: list)
                                .frame(maxHeight: .infinity, alignment: .top)
                            TimelineColumn(timeline: snapshot.timeline, model: model, question: $question)
                                .frame(width: width - list)
                                .frame(maxHeight: .infinity, alignment: .top)
                        }
                    }
                    .overlay(alignment: .leading) { divider(width).offset(x: list) }
                    .frame(width: width)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .id(RibbonPlace.today)
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned(limitBehavior: .alwaysByOne))
            .scrollPosition($position, anchor: .leading)
            .scrollIndicators(.hidden)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentOffset.x
            } action: { _, x in
                toToday = min(1, max(0, (x - list) / max(1, width - list)))
                // The selection moves along with a swipe; a tab's own scroll leaves it on the tab chosen.
                guard phase == .interacting || phase == .decelerating else { return }
                let near = nearest(x, list: list, width: width)
                if near != model.place { model.place = near }
            }
            .onScrollPhaseChange { _, new in phase = new }
            .onAppear { position.scrollTo(id: model.place, anchor: .leading) }
            .onChange(of: model.asked) {
                guard let asked = model.asked else { return }
                withAnimation(.smooth) { position.scrollTo(id: asked.place, anchor: .leading) }
            }
        }
    }

    /// The place nearest the ribbon's offset: the tab bar's selection moves along with a swipe.
    private func nearest(_ x: CGFloat, list: CGFloat, width: CGFloat) -> RibbonPlace {
        let stops: [(RibbonPlace, CGFloat)] = [(.inbox, 0), (.soon, list), (.today, width)]
        return stops.min { abs($0.1 - x) < abs($1.1 - x) }?.0 ?? .today
    }

    /// The day list and the calendar change days together: the new day slides in from the side the arrow points to.
    private func dayPart(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .id(snapshot.day)
            .transition(.push(from: model.dayMotion > 0 ? .trailing : .leading))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .clipShape(.rect)
    }

    /// The day list's width: its share of the screen, within the plugin's bounds for a phone.
    private func listWidth(_ width: CGFloat) -> CGFloat {
        min(Self.maxList, width - Self.minList, max(Self.minList, listShare * width))
    }

    /// The plugin's bounds on a list's width on a phone (`LIST_WIDTH_MIN`, `LIST_WIDTH_MAX`).
    static let minList: CGFloat = 110
    static let maxList: CGFloat = 280

    /// The handle on the line between the day list and the calendar; it shows and moves only at Today.
    private func divider(_ width: CGFloat) -> some View {
        Capsule()
            .fill(Color(.tertiaryLabel))
            .frame(width: 5, height: 36)
            .frame(width: 28)
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .offset(x: -14)
            .opacity(toToday)
            .allowsHitTesting(toToday > 0.99)
            .gesture(
                DragGesture(minimumDistance: 2, coordinateSpace: .global)
                    .onChanged { drag in
                        let start = dragStart ?? listWidth(width)
                        if dragStart == nil { dragStart = start }
                        listShare = Double(min(Self.maxList, width - Self.minList, max(Self.minList, start + drag.translation.width)) / width)
                    }
                    .onEnded { _ in dragStart = nil }
            )
            .sensoryFeedback(.selection, trigger: dragStart == nil)
            .accessibilityLabel("Divider")
            .accessibilityHint("Drag to make the list wider or narrower")
    }

    private func column(_ place: RibbonPlace, _ width: CGFloat, @ViewBuilder content: () -> some View) -> some View {
        content()
            .frame(width: width)
            .frame(maxHeight: .infinity, alignment: .top)
            .id(place)
    }

    @ViewBuilder
    private func lists(_ column: BoardColumn, dayArrows: Bool = false) -> some View {
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
            Button("Done", systemImage: "checkmark.circle") {
                guard let done = menu?.statuses.first(where: { $0.id == "done" }) else { return }
                if done.confirm { question = .status(items, done.id) } else { Task { await model.pickStatus(items, done.id) } }
            }
            .disabled(menu?.statuses.contains { $0.id == "done" } != true)
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
                if let menu { MenuNodes(nodes: TaskMenu(items: items, menu: menu, model: model) { question = $0 }.nodes) }
            }
        }
        .tint(.primary)
        .disabled(items.isEmpty)
        .task(id: model.picked) { menu = items.isEmpty ? nil : await model.bulkMenu() }
        Button("Delete", systemImage: "trash", role: .destructive) { Task { await model.remove(items) } }
            .tint(.red)
            .disabled(items.isEmpty || menu?.remove == nil)
    }
}
