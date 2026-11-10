import Core
import SwiftUI
import UIKit

/// The main screen: the plugin's ribbon of lists beside the calendar, one ribbon for Inbox, Soon and Today, the three
/// places it stands at; the system tab bar under it only says where it stands and moves it there, and the plus beside
/// the tab bar opens a new task.
struct BoardScreen: View {
    @State private var model: BoardModel
    @Environment(\.dismiss) private var dismiss

    /// `project`: that project's own view, as the plugin's block in its note.
    /// `openOther`: a project's view shows another project in its place through the screen under it.
    init(project: ProjectRef? = nil, openOther: ((ProjectRef) -> Void)? = nil) {
        let model = BoardModel(project: project)
        model.openOther = openOther
        _model = State(initialValue: model)
    }
    @State private var router = CaptureRouter.shared
    @State private var sync = ObsidianSync.shared
    @State private var sheet: BoardSheet?
    /// Where the system lays out the tab bar's search slot, on the screen.
    @State private var plusSlot: CGRect?
    @Environment(\.scenePhase) private var scene
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack(path: $model.fullScreen) {
            content
                // The board stands under the keyboard, which slides over it; each list and the calendar take the part
                // it covers as room to scroll (`keyboardRoom`), so nothing is cut ahead of the keyboard's own motion.
                .ignoresSafeArea(.keyboard, edges: .bottom)
                .toolbar {
                    if model.selecting { selectionBar } else if let project = model.project { projectBar(project) } else { mainBar }
                }
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: TaskItem.self) { item in TaskFullScreen(item: item, model: model).id(item.id) }
        }
        .overlay {
            // The tab bar hides while a task is typed, in Select Tasks and under a pushed page, as in every app. Its own
            // motion, scoped to it: whatever hides it (a push, the field, Select Tasks), it slides with the system's spring.
            ZStack {
                if barShown { bottomBar.transition(.move(edge: .bottom).combined(with: .opacity)) }
            }
            .animation(.snappy, value: barShown)
        }
        .background {
            TouchWatch { point in
                if model.found != nil { model.found = nil }
                model.touched(at: point)
            }
        }
        .notSyncedAlert(sync)
        // Obsidian hands the phone back after Sync: the board reads the file again.
        .onChange(of: sync.returns) { Task { await model.reload() } }
        .sheet(item: Binding(get: { model.entry.sheet }, set: { model.entry.sheet = $0 }), onDismiss: { model.entry.resume() }) { sheet in
            entrySheet(sheet)
        }
        // Only the screen on top opens it: a project's view over the main screen starts it with that project.
        .sheet(isPresented: Binding(get: { router.capturing && model.projectShown == nil }, set: { router.capturing = $0 }), onDismiss: { Task { await model.reloadIfChanged() } }) {
            CaptureView(focused: router.typing, project: model.snapshot?.screen.project?.link ?? model.projectLink)
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
        .fullScreenCover(item: $model.projectShown, onDismiss: { Task { await model.reloadIfChanged() } }) { shown in
            BoardScreen(project: shown.project, openOther: { other in model.projectShown = BoardModel.ShownProject(project: other) })
                .id(shown.id)
        }
        .task { await model.reload() }
        .onChange(of: scene, initial: true) {
            // The tasks file changes outside the app too: back in front, the screen reads it again if it did or the clock
            // moved on; while in front, a coordinated write (iCloud, a reminder's button) tells the watch and the clock
            // ticks each minute.
            if scene == .active {
                model.watchFile()
                model.startClock()
                Task {
                    await model.reloadIfChanged()
                    await model.refreshNotes()
                }
            } else {
                model.stopWatching()
                model.stopClock()
            }
        }
    }

    private var barShown: Bool { !model.selecting && model.fullScreen.isEmpty && !model.entry.isOpen }

    /// The system tab bar with its search slot, laid out by iOS; the plus stands on that slot, the same size, so it can be
    /// carried while the bar keeps the system's layout.
    private var bottomBar: some View {
        ZStack(alignment: .topLeading) {
            PlaceTabs(place: model.place, choose: { model.go(to: $0) }, slot: {
                plusSlot = $0
                model.route.floor = $0.minY
            })
            if let slot = plusSlot {
                CarriedPlus(model: model, accent: Palette.accent(scheme)) { router.openTyping() }
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
                .overlay { if let stack = model.stackShown { TimelineStack(shown: stack, model: model) } }
                .overlay(alignment: .bottom) { NoteSuggestions(host: model.entry) }
                .animation(.snappy, value: model.entry.notes)
                .animation(.snappy, value: model.stackShown != nil)
                .onChange(of: model.entry.isOpen) { if !model.entry.isOpen { model.stackShown = nil } }
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

    /// A project's view: Close, Undo, the project's name, and its note opened in Obsidian.
    @ToolbarContentBuilder
    private func projectBar(_ project: ProjectRef) -> some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("Close", systemImage: "xmark") { model.entry.blur(); dismiss() }
                .tint(.primary)
        }
        ToolbarItem(placement: .topBarLeading) {
            Button("Undo", systemImage: "arrow.uturn.backward") { Task { await model.undo() } }
                .disabled(model.snapshot?.canUndo != true)
                .tint(.primary)
        }
        ToolbarItem(placement: .principal) {
            Label(project.name, systemImage: "folder").labelStyle(.titleAndIcon).font(.headline)
        }
        ToolbarItem(placement: .topBarTrailing) {
            if model.entry.isOpen {
                Button("Done", systemImage: "checkmark") { model.entry.blur() }
                    .buttonStyle(.glassProminent)
                    .tint(Palette.accent(scheme))
            } else {
                Menu("More", systemImage: "ellipsis") {
                    Button("Search", systemImage: "magnifyingglass") { sheet = .search }
                    Button("Select Tasks", systemImage: "checkmark.circle") { model.startSelection() }
                    if let note = project.note {
                        Divider()
                        Button("Open in Obsidian", systemImage: "arrow.up.forward.app") { model.openNote(note) }
                    }
                }
                .tint(.primary)
            }
        }
    }

    /// A menu badge has one colour in iOS: orange and red alike.
    private var calendarsAlerted: Bool { (model.snapshot?.calendarsAlert ?? CalendarAlert.none) != CalendarAlert.none }

    private var more: some View {
            Menu("More", systemImage: "ellipsis") {
                Button("Search", systemImage: "magnifyingglass") { sheet = .search }
                Button("Select Tasks", systemImage: "checkmark.circle") { model.startSelection() }
                Divider()
                Button("Calendars", systemImage: calendarsAlerted ? "calendar.badge.exclamationmark" : "calendar") { sheet = .calendars }
                    .accessibilityValue(model.snapshot?.calendarWords.alert ?? "")
                Button("Settings", systemImage: "gear") { sheet = .settings }
            }
            .badge(calendarsAlerted ? 1 : 0)
            .tint(.primary)
    }

    /// Select Tasks, as the plugin's: in place of Undo and «⋯» a capsule with the cross that ends it and the number picked;
    /// in place of the plus a circle with «⋯». The number and «⋯» open the menu for every picked task, dimmed while none is.
    @ToolbarContentBuilder
    private var selectionBar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("End Selecting", systemImage: "xmark") { model.endSelection() }
                .tint(.primary)
        }
        ToolbarItem(placement: .topBarLeading) {
            BulkMenu(model: model) {
                Text(verbatim: "\(model.picked.count)")
                    .font(.headline)
                    .monospacedDigit()
                    .frame(minWidth: 28)
            }
            .accessibilityLabel("\(model.picked.count) selected")
        }
        ToolbarSpacer(placement: .bottomBar)
        ToolbarItem(placement: .bottomBar) {
            BulkMenu(model: model) {
                Image(systemName: "ellipsis")
            }
            .buttonStyle(.glassProminent)
            .tint(Palette.accent(scheme))
            .accessibilityLabel("Actions for the selected tasks")
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
    /// The divider holds to the middle now; each time it comes to hold, `snaps` counts one, and a tap is felt.
    @State private var dividerSnapped = false
    @State private var snaps = 0
    @State private var phase = ScrollPhase.idle
    /// The place the ribbon last came to rest on.
    @State private var rested: RibbonPlace?
    /// How far the ribbon stands from Inbox now.
    @State private var offset: CGFloat = 0
    /// The finger's swipe of the ribbon: where it took the ribbon from, and the scroll view it lets go.
    @State private var swipe = RibbonSwipe()

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            // As the plugin's screen: Inbox and Soon split the screen in half wherever the divider stands; at Today the
            // divider sets the day list against the calendar, the list's edge gliding there from the half on the way
            // from Soon (`RibbonColumns`, tested: Max asked for this three times).
            let columns = RibbonColumns(width: Double(width), list: Double(listWidth(width)), done: model.doneShown)
            let half = CGFloat(columns.half)
            let list = CGFloat(columns.list)
            let dayList = CGFloat(columns.dayList(toToday: Double(toToday)))
            let lead = CGFloat(columns.lead)
            let stops = columns.stops.map { CGFloat($0) }
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    if model.doneShown {
                        DoneColumn(model: model)
                            .frame(width: half)
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                    // One column, Inbox over Backlog, each exactly the column's width.
                    column(.inbox, half) {
                        VStack(alignment: .leading, spacing: 0) {
                            lists(.inbox).frame(width: half)
                            lists(.backlog).frame(width: half)
                        }
                    }
                    column(.soon, half) { lists(.soon) }
                    // The day list and the calendar show one day; when it changes, each slides it within itself. The
                    // calendar keeps the divider's width and slides with the list's edge, so it never reflows.
                    ZStack(alignment: .topLeading) {
                        TimelineColumn(timeline: snapshot.timeline, model: model)
                            .equatable()
                            .frame(width: width - list)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .offset(x: dayList)
                        lists(.day, dayArrows: true)
                            .frame(width: dayList)
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                    .overlay(alignment: .leading) { divider(width).offset(x: dayList) }
                    .frame(width: width, alignment: .leading)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .id(RibbonPlace.today)
                }
                .scrollTargetLayout()
                .background { RibbonHooks(model: model, swipe: swipe, distance: width - list) }
                }
            .scrollTargetBehavior(OnePlacePerSwipe(swipe: swipe, model: model))
            .onChange(of: stops, initial: true) { _, stops in swipe.use(stops) }
            .scrollPosition($position, anchor: .leading)
            .scrollIndicators(.hidden)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentOffset.x
            } action: { _, x in
                offset = x
                // At rest (a tab's scroll, the size changing) the ribbon stands where the next swipe starts; under the
                // finger it goes no further than the next place either way, as the plugin's screen.
                swipe.moved(within: stops)
                let from = x - lead
                toToday = CGFloat(columns.toToday(at: Double(x)))
                // The selection moves along with a swipe; a tab's own scroll leaves it on the tab chosen.
                guard phase == .interacting || phase == .decelerating else { return }
                let near = nearest(from, soon: half, width: width)
                if near != model.place { model.place = near }
            }
            .onScrollPhaseChange { _, new in
                phase = new
                if new == .idle {
                    // Off the Done column, onto Inbox or further: it closes until the next search, Inbox where it stood.
                    if lead > 0, offset > lead / 2 {
                        var instant = Transaction()
                        instant.disablesAnimations = true
                        withTransaction(instant) {
                            model.closeDone()
                            position.scrollTo(id: model.place, anchor: .leading)
                        }
                        return
                    }
                    // A touch that stops a tab's scroll on its way leaves the ribbon between two places: it goes on to the
                    // nearer one, as a swipe would.
                    // At rest the tab bar names where the ribbon stands, whatever moved it there.
                    let near = nearest(offset - lead, soon: half, width: width)
                    let stop: CGFloat = switch near { case .inbox: 0; case .soon: half; case .today: width }
                    if lead == 0, model.place != near { model.place = near }
                    if lead == 0, abs(offset - stop) > 0.5 {
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
                guard asked.done else {
                    withAnimation(.smooth) { position.scrollTo(id: asked.place, anchor: .leading) }
                    return
                }
                // The Done column is laid out first, then the ribbon goes to it.
                DispatchQueue.main.async { withAnimation(.smooth) { position.scrollTo(x: 0) } }
            }
        }
    }

    /// The place nearest the ribbon's offset: the tab bar's selection moves along with a swipe.
    private func nearest(_ x: CGFloat, soon: CGFloat, width: CGFloat) -> RibbonPlace {
        let stops: [(RibbonPlace, CGFloat)] = [(.inbox, 0), (.soon, soon), (.today, width)]
        return stops.min { abs($0.1 - x) < abs($1.1 - x) }?.0 ?? .today
    }

    /// The day list's width for its saved share of the screen, within the bounds the core gives (`rules.listWidths`).
    private func listWidth(_ width: CGFloat) -> CGFloat {
        model.listWidths(share: listShare, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
    }

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
                        guard let bounds = model.listWidths(share: listShare, viewWidth: width),
                              let stop = model.dividerAt(start + drag.translation.width, widths: bounds, speed: Double(abs(drag.velocity.width)) / 1000) else { return }
                        if stop.snapped, !dividerSnapped { snaps += 1 }
                        dividerSnapped = stop.snapped
                        listShare = model.listShare(of: CGFloat(stop.width), viewWidth: width) ?? listShare
                    }
                    .onEnded { _ in
                        dragStart = nil
                        dividerSnapped = false
                    }
            )
            .sensoryFeedback(.selection, trigger: dragStart == nil)
            .sensoryFeedback(.impact(weight: .light), trigger: snaps)
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
                .equatable()
        }
    }
}

/// The menu for every picked task (`tasks.bulkMenu`), the plugin's bulk menu: the statuses, priorities, labels, moves,
/// Section, Project, Delete. Any action ends Select Tasks but a label, which keeps the menu and the picks for the next.
struct BulkMenu<Label: View>: View {
    @Bindable var model: BoardModel
    @ViewBuilder let label: Label
    @State private var menu: TaskMenuModel?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let items = model.pickedItems
        Menu {
            if let menu { MenuNodes(nodes: TaskMenu(items: items, menu: menu, model: model).nodes, palette: { model.ink($0, dark: scheme == .dark) }) }
        } label: {
            label
        }
        // The core's order, the plugin's, wherever the menu opens: Delete stays last even over the bottom bar.
        .menuOrder(.fixed)
        .tint(.primary)
        .disabled(items.isEmpty)
        .task(id: BulkRead(picked: model.picked, file: model.snapshot?.tasksText)) { menu = items.isEmpty ? nil : await model.bulkMenu() }
    }
}

/// The bulk menu is read again for other picks and after each write: a label set keeps the menu open, ticked anew.
private struct BulkRead: Equatable {
    let picked: Set<String>
    let file: String?
}

/// The ribbon's own scroll view, reached from inside it: SwiftUI keeps no switch for these.
/// - It stops at Inbox and at Today as it stops at Soon: no rubber band past its ends that the places between have not.
/// - At Today a sideways swipe that the core's `days.stepScreen` leads to another day's calendar carries the day, as the
///   plugin's swipe does: the ribbon stays, the day slides under the finger (`BoardModel.followDaySwipe`), and let go it
///   runs on or springs back. Any other swipe is the ribbon's own paging, which waits for this one to decline.
private struct RibbonHooks: UIViewRepresentable {
    let model: BoardModel
    let swipe: RibbonSwipe
    /// How far the finger carries a whole day: the calendar's width, the column under the finger (the plugin's lead lane).
    let distance: CGFloat

    func makeUIView(context: Context) -> Probe { Probe(swipe: context.coordinator, ribbon: swipe) }

    func updateUIView(_ probe: Probe, context: Context) {
        context.coordinator.model = model
        context.coordinator.distance = distance
    }

    func makeCoordinator() -> DaySwipe { DaySwipe() }

    final class Probe: UIView {
        let swipe: DaySwipe
        let ribbon: RibbonSwipe

        init(swipe: DaySwipe, ribbon: RibbonSwipe) {
            self.swipe = swipe
            self.ribbon = ribbon
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
            self.ribbon.attach(to: ribbon)
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
            // A quick flick can end with no step after its start: the day takes the finger's last place first, so the
            // let-go never reads a day that has not moved.
            model.followDaySwipe(share)
            let speed = -CGFloat(shift) * pan.velocity(in: ribbon).x / 1000
            Task { await model.endDaySwipe(speed: speed) }
        case .cancelled, .failed:
            Task { await model.endDaySwipe(speed: 0) }
        default:
            break
        }
    }
}

/// The finger's swipe of the ribbon, kept by reference so the scroll's target, asked as the finger lets go, reads it then.
/// The place a swipe starts from is fixed the moment the finger touches the ribbon (`began`), never left to an earlier
/// scroll: right after launch nothing has scrolled yet, and a swipe then once ran on past Soon (`RibbonPaging`).
@MainActor
final class RibbonSwipe: NSObject {
    /// The ribbon's own scroll view.
    private(set) weak var scroll: UIScrollView?
    private(set) var paging = RibbonPaging(stops: [0])
    /// The place the swipe under the finger started from.
    private(set) var from: Int?
    /// The place the last swipe sent the ribbon to, while it still glides there.
    private var headedTo: Int?

    func attach(to scroll: UIScrollView) {
        guard self.scroll !== scroll else { return }
        self.scroll = scroll
        scroll.panGestureRecognizer.addTarget(self, action: #selector(panned(_:)))
    }

    @objc private func panned(_ pan: UIPanGestureRecognizer) {
        guard pan.state == .began, let scroll else { return }
        from = paging.start(at: Double(scroll.contentOffset.x), gliding: scroll.isDecelerating ? headedTo : nil)
    }

    /// Where the places stand, from the ribbon's first layout on, so a swipe right after launch knows them.
    func use(_ stops: [CGFloat]) {
        let paging = RibbonPaging(stops: stops.map(Double.init))
        if paging != self.paging { self.paging = paging }
    }

    /// The ribbon moved within `stops`. Under the finger it goes no further than the places next to where the swipe
    /// started, either way.
    func moved(within stops: [CGFloat]) {
        use(stops)
        guard let scroll, scroll.isDragging, let from, paging.stops.indices.contains(from) else { return }
        let x = Double(scroll.contentOffset.x)
        let held = paging.clamp(x, from: from)
        if held != x { scroll.contentOffset.x = CGFloat(held) }
    }

    /// Where the ribbon let go at `proposed` lands: one place at most from where the finger took it, as the core's
    /// `swipeLanding` says; a scroll with no finger on it (a tab, the size changing) settles on the nearest place.
    func landing(_ proposed: CGFloat, rule: (Double, Double, Double) -> Int) -> CGFloat {
        guard let scroll, scroll.panGestureRecognizer.state != .possible, let from, paging.stops.indices.contains(from) else {
            return CGFloat(paging.stops[paging.nearest(Double(proposed))])
        }
        let speed = -Double(scroll.panGestureRecognizer.velocity(in: scroll).x) / 1000
        let landed = paging.landing(from: from, offset: Double(scroll.contentOffset.x), speed: speed, rule: rule)
        headedTo = landed
        self.from = nil
        return CGFloat(paging.stops[landed])
    }
}

/// The ribbon follows the finger and, let go, goes on to the next place or back to the one it was taken from, as the
/// plugin's screen swipe: the core's `swipeLanding` decides, never further than the next place. A scroll with no finger
/// (a tab, the size changing) settles on the nearest place.
private struct OnePlacePerSwipe: ScrollTargetBehavior {
    let swipe: RibbonSwipe
    let model: BoardModel

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let proposed = target.rect.minX
        target.rect.origin.x = MainActor.assumeIsolated {
            swipe.landing(proposed) { moved, distance, speed in
                model.swipeLanding(moved: CGFloat(moved), distance: CGFloat(distance), speed: CGFloat(speed))
            }
        }
    }
}

/// The plus, the cancel target while a carry is under way: it alone reads whether one is, so a carry lifted or landing
/// redraws the plus, not the board.
private struct CarriedPlus: View {
    let model: BoardModel
    let accent: Color
    let open: () -> Void

    var body: some View {
        PlusButton(open: open, accent: accent, cancelling: model.showsCancelTarget, drag: model.drag, onCarry: { model.startCarryingPlus() })
    }
}
