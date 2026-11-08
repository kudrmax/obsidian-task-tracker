import Core
import SwiftUI
import UIKit

/// The main screen: the plugin's ribbon of lists beside the calendar, one ribbon for Inbox, Soon and Today, the three
/// places it stands at; the system tab bar under it only says where it stands and moves it there, and the plus beside
/// the tab bar opens a new task.
struct BoardScreen: View {
    @State private var model = BoardModel()
    @State private var router = CaptureRouter.shared
    @State private var sync = ObsidianSync.shared
    @State private var question: MenuQuestion?
    @State private var sheet: BoardSheet?
    /// Where the system lays out the tab bar's search slot, on the screen.
    @State private var plusSlot: CGRect?
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
        .overlay {
            // The tab bar hides while a task is typed, in Select Tasks and under a pushed page, as in every app. Its own
            // motion, scoped to it: whatever hides it (a push, the field, Select Tasks), it slides with the system's spring.
            ZStack {
                if barShown { bottomBar.transition(.move(edge: .bottom).combined(with: .opacity)) }
            }
            .animation(.snappy, value: barShown)
        }
        .background { DropAnchor(drop: model.dropping) }
        .notSyncedAlert(sync)
        // Obsidian hands the phone back after Sync: the board reads the file again.
        .onChange(of: sync.returns) { Task { await model.reload() } }
        .sheet(item: Binding(get: { model.entry.sheet }, set: { model.entry.sheet = $0 }), onDismiss: { model.entry.resume() }) { sheet in
            entrySheet(sheet)
        }
        .sheet(isPresented: $router.capturing, onDismiss: { Task { await model.reloadIfChanged() } }) {
            CaptureView(focused: router.typing)
        }
        // Settings may have renamed a list or changed a colour: the screen reads again when it closes.
        .sheet(item: $sheet, onDismiss: { Task { await model.reloadIfChanged() } }) { sheet in
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

    private var barShown: Bool { !model.selecting && model.fullScreen.isEmpty && !model.entry.isOpen }

    /// The system tab bar with its search slot, laid out by iOS; the plus stands on that slot, the same size, so it can be
    /// carried while the bar keeps the system's layout.
    private var bottomBar: some View {
        ZStack(alignment: .topLeading) {
            PlaceTabs(place: model.place, choose: { model.go(to: $0) }, slot: { plusSlot = $0 })
            if let slot = plusSlot {
                PlusButton(open: { router.openTyping() }, accent: Palette.accent(scheme), cancelling: model.showsCancelTarget, drop: model.dropping, onCarry: { model.startCarryingPlus() }, onCancel: { model.cancelCarry() }, onEnd: { model.carryEnded() })
                    .frame(width: slot.width, height: slot.height)
                    .offset(x: slot.minX, y: slot.minY)
            }
        }
        .ignoresSafeArea()
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot = model.snapshot, !snapshot.screen.missing {
            Ribbon(snapshot: snapshot, model: model)
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

    /// The bar's sheets over the field: its repeat, held by the entry until the task is written, and its date.
    @ViewBuilder
    private func entrySheet(_ sheet: QuickEntryHost.BarSheet) -> some View {
        let entry = model.entry
        switch sheet {
        case .repeating:
            if let state = entry.state {
                RepeatSheet(day: state.repeatDay, own: state.repeat ?? .null, model: model) { rule in entry.setRepeat(rule) }
            }
        case .date:
            EntryDateSheet(host: entry)
        }
    }

    @ToolbarContentBuilder
    private var mainBar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("Undo", systemImage: "arrow.uturn.backward") { Task { await model.undo() } }
                .disabled(model.snapshot?.canUndo != true)
                .tint(.primary)
        }
        // Sync and «⋯» stand in one glass group, as iOS 26 groups the trailing items.
        ToolbarItem(placement: .topBarTrailing) {
            Button("Sync", systemImage: "arrow.triangle.2.circlepath") { Task { await ObsidianSync.shared.start() } }
                .disabled(ObsidianSync.shared.vault == nil)
                .tint(.primary)
        }
        ToolbarItem(placement: .topBarTrailing) {
            if model.entry.isOpen {
                // While a task is typed the «⋯» gives way to the check that ends typing.
                Button("Done", systemImage: "checkmark") { model.entry.blur() }
                    .buttonStyle(.glassProminent)
                    .tint(Palette.accent(scheme))
            } else {
                more
            }
        }
    }

    private var more: some View {
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

/// The ribbon: four columns side by side, Inbox over Backlog, Soon, the day list and the calendar, each a fixed width the
/// whole time, as if the ones off the screen stood just past its edges. The day list and Inbox are as wide as the
/// divider leaves the day list, Soon and the calendar the rest; so Inbox–Soon, Soon–day and day–calendar each fill the
/// screen, at offsets 0, the day list's width and the screen's (`2026-11-07-ios-timeline-drag-design.md`). A swipe is the system's paging scroll between them.
struct Ribbon: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel
    @State private var position = ScrollPosition(idType: RibbonPlace.self)
    /// How far the ribbon has come from Soon to Today, 0 to 1: the divider's handle shows at Today.
    @State private var toToday: CGFloat = 0
    @AppStorage("listShare") private var listShare: Double = 0.5
    @State private var dragStart: CGFloat?
    @State private var phase = ScrollPhase.idle
    /// The place the ribbon last came to rest on.
    @State private var rested: RibbonPlace?
    /// How far the ribbon stands from Inbox now.
    @State private var offset: CGFloat = 0

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            // Every column keeps its width the whole time, so nothing reflows under a swipe: the day list and Inbox over
            // Backlog are the divider's width, Soon and the calendar the rest; each place shows two that fill the screen.
            let list = listWidth(width)
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    // One column, Inbox over Backlog, each exactly the column's width.
                    column(.inbox, list) {
                        VStack(alignment: .leading, spacing: ColumnMetrics.headGap) {
                            lists(.inbox).frame(width: list)
                            lists(.backlog).frame(width: list)
                        }
                    }
                    column(.soon, width - list) { lists(.soon) }
                    // The day list and the calendar show one day; when it changes, each slides it within itself.
                    Group {
                        HStack(spacing: 0) {
                            lists(.day, dayArrows: true)
                                .frame(width: list)
                                .frame(maxHeight: .infinity, alignment: .top)
                            TimelineColumn(timeline: snapshot.timeline, model: model)
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
                .background { RibbonHooks(model: model, distance: width - list) }
                }
            .scrollTargetBehavior(OnePlacePerSwipe(stops: [0, list, width]))
            .scrollPosition($position, anchor: .leading)
            .scrollIndicators(.hidden)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentOffset.x
            } action: { _, x in
                offset = x
                toToday = min(1, max(0, (x - list) / max(1, width - list)))
                // The selection moves along with a swipe; a tab's own scroll leaves it on the tab chosen.
                guard phase == .interacting || phase == .decelerating else { return }
                let near = nearest(x, soon: list, width: width)
                if near != model.place { model.place = near }
            }
            .onScrollPhaseChange { _, new in
                phase = new
                // A touch that stops a tab's scroll on its way leaves the ribbon between two places: it goes on to the
                // nearer one, as a swipe would.
                if new == .idle {
                    let near = nearest(offset, soon: list, width: width)
                    let stop: CGFloat = switch near { case .inbox: 0; case .soon: list; case .today: width }
                    if abs(offset - stop) > 0.5 {
                        model.place = near
                        withAnimation(.smooth) { position.scrollTo(id: near, anchor: .leading) }
                        return
                    }
                }
                // The ribbon at rest on another place finishes the task being typed, as a tap elsewhere.
                guard new == .idle, model.place != rested else { return }
                rested = model.place
                model.entry.placeSettled(model.place)
            }
            .onAppear {
                rested = model.place
                position.scrollTo(id: model.place, anchor: .leading)
            }
            .onChange(of: model.asked) {
                guard let asked = model.asked else { return }
                withAnimation(.smooth) { position.scrollTo(id: asked.place, anchor: .leading) }
            }
        }
    }

    /// The place nearest the ribbon's offset: the tab bar's selection moves along with a swipe.
    private func nearest(_ x: CGFloat, soon: CGFloat, width: CGFloat) -> RibbonPlace {
        let stops: [(RibbonPlace, CGFloat)] = [(.inbox, 0), (.soon, soon), (.today, width)]
        return stops.min { abs($0.1 - x) < abs($1.1 - x) }?.0 ?? .today
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
            .frame(width: width, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .top)
            .id(place)
    }

    @ViewBuilder
    private func lists(_ column: BoardColumn, dayArrows: Bool = false) -> some View {
        if let list = snapshot.lists[column] {
            ListColumn(list: list, model: model, dayArrows: dayArrows)
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
                if let menu { MenuNodes(nodes: TaskMenu(items: items, menu: menu, model: model).nodes) }
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

/// The ribbon's own scroll view, reached from inside it: SwiftUI keeps no switch for these.
/// - It stops at Inbox and at Today as it stops at Soon: no rubber band past its ends that the places between have not.
/// - At Today a sideways swipe that the core's `days.stepScreen` leads to another day's calendar carries the day, as the
///   plugin's swipe does: the ribbon stays, the day slides under the finger (`BoardModel.followDaySwipe`), and let go it
///   runs on or springs back. Any other swipe is the ribbon's own paging, which waits for this one to decline.
private struct RibbonHooks: UIViewRepresentable {
    let model: BoardModel
    /// How far the finger carries a whole day: the calendar's width, the column under the finger (the plugin's lead lane).
    let distance: CGFloat

    func makeUIView(context: Context) -> Probe { Probe(swipe: context.coordinator) }

    func updateUIView(_ probe: Probe, context: Context) {
        context.coordinator.model = model
        context.coordinator.distance = distance
    }

    func makeCoordinator() -> DaySwipe { DaySwipe() }

    final class Probe: UIView {
        let swipe: DaySwipe

        init(swipe: DaySwipe) {
            self.swipe = swipe
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("not from a storyboard") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let next = view, !(next is UIScrollView) { view = next.superview }
            guard let ribbon = view as? UIScrollView else { return }
            ribbon.bounces = false
            swipe.attach(to: ribbon)
        }
    }
}

/// The day carried by the finger on the calendar, as the plugin's `Swipe` and `ScreenPager`: it follows the finger up to a
/// whole day, and let go it arrives when the day has come half the way or a flick sends it on, else it springs back.
@MainActor
final class DaySwipe: NSObject, UIGestureRecognizerDelegate {
    weak var model: BoardModel?
    var distance: CGFloat = 1
    private weak var ribbon: UIScrollView?
    private var shift = 0
    /// The plugin's flick speed (`swipeFlickSpeed`, 0.3 px per ms).
    private static let flick: CGFloat = 300

    func attach(to ribbon: UIScrollView) {
        guard self.ribbon !== ribbon else { return }
        self.ribbon = ribbon
        let pan = UIPanGestureRecognizer(target: self, action: #selector(pan(_:)))
        pan.delegate = self
        ribbon.addGestureRecognizer(pan)
        // A lift takes the touch before the pan has seen it move, so the pan would stay waiting the whole carry and keep
        // the ribbon's pan waiting on it (a dropped section's rows then came in under the rows below): it fails then.
        model?.carryBegins = { [weak pan] in
            guard let pan, pan.state == .possible else { return }
            pan.isEnabled = false
            pan.isEnabled = true
        }
        ribbon.panGestureRecognizer.require(toFail: pan)
    }

    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard let pan = recognizer as? UIPanGestureRecognizer, let ribbon, let model else { return false }
        let atToday = abs(ribbon.contentOffset.x - (ribbon.contentSize.width - ribbon.bounds.width)) < 1
        let velocity = pan.velocity(in: ribbon)
        guard atToday, abs(velocity.x) > abs(velocity.y) else { return false }
        shift = velocity.x < 0 ? 1 : -1
        return model.beginDaySwipe(shift)
    }

    @objc private func pan(_ pan: UIPanGestureRecognizer) {
        guard let model, let ribbon else { return }
        let dx = pan.translation(in: ribbon).x
        let share = -CGFloat(shift) * dx / max(1, distance)
        switch pan.state {
        case .changed:
            model.followDaySwipe(share)
        case .ended:
            let speed = -CGFloat(shift) * pan.velocity(in: ribbon).x
            let arrive = abs(speed) >= Self.flick ? speed > 0 : share * 2 >= 1
            Task { await model.endDaySwipe(arrive: arrive) }
        case .cancelled, .failed:
            Task { await model.endDaySwipe(arrive: false) }
        default:
            break
        }
    }
}

/// The ribbon pages as the plugin's: a swipe, however fast or long, comes to rest on the place next to the one it started
/// from, or back on it; a tab's own scroll goes straight where it was asked.
private struct OnePlacePerSwipe: ScrollTargetBehavior {
    /// Where each place's left edge stands in the ribbon, left to right.
    let stops: [CGFloat]

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        var x = target.rect.minX
        if context.velocity.dx != 0 {
            let start = context.originalTarget.rect.minX
            let from = nearest(start)
            let lower = stops.last { $0 < from } ?? from
            let upper = stops.first { $0 > from } ?? from
            x = min(upper, max(lower, x))
        }
        target.rect.origin.x = nearest(x)
    }

    private func nearest(_ x: CGFloat) -> CGFloat {
        stops.min { abs($0 - x) < abs($1 - x) } ?? x
    }
}
