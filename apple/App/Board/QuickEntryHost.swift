import Core
import SwiftUI
import UIKit

/// `EntryState`: the field as the core's quick entry has it, what the lists and the bar over the keyboard draw.
struct EntryView: Decodable, Equatable {
    struct Pending: Decodable, Equatable {
        let text: String
        let level: Int
    }

    struct Tile: Decodable, Equatable {
        let mark: Mark
        let on: Bool
        let enabled: Bool
    }

    struct Tiles: Decodable, Equatable {
        let levels: [Tile]
        let labels: [Tile]
    }

    struct Marks: Decodable, Equatable {
        let tint: String?
        let tiles: Tiles
    }

    let spot: JSONValue
    let text: String
    let pending: [Pending]
    let renaming: TaskItem?
    let indents: Bool
    let canIndent: Bool
    let canOutdent: Bool
    let section: Bool?
    let marks: Marks
    let markable: Bool
    let place: JSONValue?
    let places: [JSONValue]
    let repeatable: Bool
    let repeatDay: String
    let `repeat`: JSONValue?

    var spotKind: String { spot["kind"].string ?? "" }
}

/// `ListEntry`: where a list draws the field and the texts waiting before it.
struct ListEntryView: Decodable, Equatable {
    struct Place: Decodable, Equatable {
        let index: Int
        let level: Int
        let group: String?
    }

    struct At: Decodable, Equatable {
        let kind: String
        let section: Int?
        let card: Int?
        let keepsPlate: Bool?
    }

    let place: Place
    let pending: [EntryView.Pending]
    let section: Bool
    let at: At
}

/// Typing tasks in place, the plugin's quick entry: the core's `entry.*` holds every rule of it and the session between
/// calls; this host hands the session and the screen's look in, draws what the state says, turns keys and taps into
/// calls, and runs the writes the session queues one at a time, each once the lists show the ones before it.
@MainActor
@Observable
final class QuickEntryHost {
    @ObservationIgnored weak var model: BoardModel?
    @ObservationIgnored private let board = AppServices.shared.board

    /// The field, or nil while no entry is open.
    private(set) var state: EntryView?
    /// What each list draws for the field.
    private(set) var lists: [BoardColumn: ListEntryView] = [:]
    /// The field's minute from the day's start, when it stands on the calendar.
    private(set) var slotMinute: Int?
    /// Bumped whenever the field moves or opens: its list scrolls it into sight.
    private(set) var moved = 0
    /// A sheet of the bar is up (repeat, date): the field gives the keyboard up for it without ending the entry.
    var paused = false
    /// The sheet the bar asked for; the screen presents it.
    var sheet: BarSheet?

    enum BarSheet: String, Identifiable {
        case repeating, date
        var id: String { rawValue }
    }

    func ask(_ sheet: BarSheet) {
        paused = true
        self.sheet = sheet
    }

    /// The bar's sheet went: the field takes the keyboard again.
    func resume() {
        paused = false
        if isOpen { field.begin() }
    }

    @ObservationIgnored private var session: JSONValue = .null
    @ObservationIgnored private var pumping = false
    @ObservationIgnored private var started: Set<String> = []
    @ObservationIgnored private var idleWaiters: [CheckedContinuation<Void, Never>] = []
    @ObservationIgnored let field = EntryTextField()

    var isOpen: Bool { state != nil }

    init() {
        field.host = self
    }

    // MARK: Opening

    /// The plus let go in a list or on the calendar: the field where the drop showed.
    func openAtDrop(_ column: BoardColumn?, _ result: JSONValue) {
        call("openAtDrop", [column.map { .string($0.rawValue) } ?? .null, result])
    }

    /// A tap on a «No tasks» plate: the field of a new task in that section.
    func openIn(_ column: BoardColumn, _ group: String?) {
        call("openIn", [.string(column.rawValue), group.json])
    }

    /// Add Subtask: the field last among the task's subtasks in its list; a task only on the calendar is opened full
    /// screen, its subtasks the field's stack.
    func addSubtask(_ parent: TaskItem) {
        guard let spot = value("subtaskSpot", [parent.key.json]) else { return }
        if spot["kind"].string == "stack", model?.fullScreen.last?.id != parent.id { model?.fullScreen.append(parent) }
        call("open", [spot])
    }

    /// The full screen's own Add Subtask: the field last in the stack of its subtasks there.
    func addSubtaskHere(_ parent: TaskItem) {
        call("open", [["kind": "stack", "parent": parent.key.json]])
    }

    /// Rename: the card becomes the field with its text, where it stands.
    func rename(_ item: TaskItem, inStack: Bool = false) {
        guard let spot = value("renameSpot", [item.json, .bool(inStack)]), !spot.isNull else { return }
        if spot["kind"].string == "list", inStack { model?.fullScreen = [] }
        call("open", [spot, item.json])
    }

    // MARK: Typing

    func typed(_ text: String) { call("type", [.string(text)]) }
    func enter() { call("enter", []) }
    func indent(_ delta: Int) { call("indent", [.number(Double(delta))]) }
    func toggleSection() { call("toggleSection", []) }
    func togglePriority(_ prefix: String) { call("togglePriority", [.string(prefix)]) }
    func toggleLabel(_ name: String) { call("toggleLabel", [.string(name)]) }
    func setRepeat(_ rule: JSONValue) { call("setRepeat", [rule]) }

    /// A tap elsewhere, the check in the top bar, the keyboard put away: the text is kept and the field closes.
    func blur() {
        guard state != nil else { return }
        call("blur", [])
    }

    /// A place chosen in the bar: the field goes to the end of that column at once and the ribbon goes there; another day
    /// opens once what was typed is written, the field then at the end of that day's list.
    func choosePlace(_ placement: JSONValue) {
        guard let move = value("choosePlace", [placement]), !move.isNull, let column = move["column"].string.flatMap(BoardColumn.init) else { return }
        model?.go(to: Self.place(of: column))
        guard let day = move["day"].string else { return }
        Task {
            await idle()
            await model?.show(day: day)
            call("moveToEnd", [.string(column.rawValue)])
        }
    }

    private static func place(of column: BoardColumn) -> RibbonPlace {
        switch column {
        case .inbox, .backlog: .inbox
        case .soon: .soon
        case .day: .today
        }
    }

    // MARK: The door

    /// The screen as the entry reads it: each list's cards and sections, which show sections, the day, and the lists the
    /// ribbon's place shows.
    private func look(_ snapshot: BoardSnapshot) -> JSONValue {
        var cards: [String: JSONValue] = [:]
        var sections: [String: JSONValue] = [:]
        var sectioned: [String: JSONValue] = [:]
        for (column, list) in snapshot.lists {
            cards[column.rawValue] = Self.listCards(list.cards)
            sections[column.rawValue] = .array(list.groups.map(\.name.json))
            sectioned[column.rawValue] = .bool(list.sectioned)
        }
        let shown: [BoardColumn] = switch model?.place ?? .today {
        case .inbox: [.inbox, .backlog, .soon]
        case .soon: [.soon, .day]
        case .today: [.day]
        }
        return ["cards": .object(cards), "sections": .object(sections), "sectioned": .object(sectioned), "day": .string(snapshot.day), "shown": .array(shown.map { .string($0.rawValue) })]
    }

    private static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { ["key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
    }

    private func answer(_ method: String, _ arguments: [JSONValue], over snapshot: BoardSnapshot? = nil) -> JSONValue? {
        guard let snapshot = snapshot ?? model?.snapshot else { return nil }
        do {
            return try board.entry(method, [session, look(snapshot)] + arguments)
        } catch {
            model?.problem(error)
            return nil
        }
    }

    /// A call that may change the session: its state drawn, its jobs run.
    @discardableResult
    private func call(_ method: String, _ arguments: [JSONValue]) -> JSONValue? {
        guard let reply = answer(method, arguments) else { return nil }
        apply(reply)
        return reply["value"]
    }

    /// A call for its answer alone (where a field would open).
    private func value(_ method: String, _ arguments: [JSONValue]) -> JSONValue? {
        answer(method, arguments)?["value"]
    }

    private func apply(_ reply: JSONValue, over snapshot: BoardSnapshot? = nil) {
        session = reply["session"]
        show(reply["state"], over: snapshot)
        if case .array(let jobs) = session["jobs"], !jobs.isEmpty { pump() }
    }

    /// The state drawn: the field's text in the text field, and where each list draws it.
    private func show(_ raw: JSONValue, over snapshot: BoardSnapshot? = nil) {
        let next: EntryView? = raw.isNull ? nil : try? raw.decode(EntryView.self)
        let before = state
        state = next
        if field.text != (next?.text ?? "") { field.text = next?.text ?? "" }
        if next == nil {
            lists = [:]
            slotMinute = nil
            field.end()
            return
        }
        placeField(over: snapshot)
        if before == nil || before?.spot != next?.spot || before?.pending != next?.pending || before?.section != next?.section { moved += 1 }
        field.begin()
    }

    /// Where the field stands in each list, and on the calendar, for the screen as it is about to be drawn.
    private func placeField(over snapshot: BoardSnapshot? = nil) {
        guard let snapshot = snapshot ?? model?.snapshot, state != nil else { return }
        var found: [BoardColumn: ListEntryView] = [:]
        for (column, list) in snapshot.lists {
            let drawn: JSONValue = ["cards": Self.listCards(list.cards), "sections": .array(list.groups.map(\.name.json))]
            if let entry = answer("listEntry", [.string(column.rawValue), drawn], over: snapshot)?["value"], !entry.isNull {
                found[column] = try? entry.decode(ListEntryView.self)
            }
        }
        lists = found
        if let state, state.spotKind == "slot" {
            let slot = state.spot["slot"]
            slotMinute = (try? board.read("boundary.spanOf", [slot, .string(snapshot.day)], over: board.settingsOnly()))?["start"].number.map { Int($0) }
        } else {
            slotMinute = nil
        }
    }

    /// The screen was read anew (a write elsewhere, another day): the field keeps its place among the cards as drawn.
    func screenChanged() {
        guard state != nil else { return }
        placeField()
    }

    // MARK: Jobs

    /// The session's writes, one at a time, in order: each made once the lists show the file as of the one before it;
    /// a task's line leaves the queue in the very drawing that shows its card, so the field never jumps.
    private func pump() {
        guard !pumping else { return }
        pumping = true
        Task {
            while let id = nextJob() {
                started.insert(id)
                await run(id)
            }
            pumping = false
            let waiting = idleWaiters
            idleWaiters = []
            for waiter in waiting { waiter.resume() }
        }
    }

    private func nextJob() -> String? {
        guard case .array(let jobs) = session["jobs"] else { return nil }
        return jobs.lazy.compactMap { $0["id"].string }.first { !self.started.contains($0) }
    }

    private func run(_ id: String) async {
        guard let model else { return }
        let call = answer("call", [.string(id)])
        if let call { session = call["session"] }
        let job = call?["value"] ?? .null
        guard let method = job["method"].string, case .array(let args) = job["args"] else { return finish(id) }
        let board = board
        let day = model.shownDay
        let written: Result<JSONValue, Error> = await Task.detached {
            Result { try board.write("tasks." + method, args) }
        }.value
        let read = try? await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
        if case .failure(let error) = written { model.problem(error) }
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            if method == "createInPlace", let read {
                let coming = JSONValue.object(Dictionary(uniqueKeysWithValues: read.lists.map { ($0.key.rawValue, Self.listCards($0.value.cards)) }))
                let key: JSONValue = (try? written.get()) ?? .null
                let reply = written.isSuccess
                    ? answer("shown", [.string(id), key, coming], over: read)
                    : answer("unshown", [.string(id)], over: read)
                model.draw(read)
                if let reply { apply(reply, over: read) }
            } else if let read {
                model.draw(read)
                placeField(over: read)
            }
        }
        finish(id)
    }

    private func finish(_ id: String) {
        if let reply = answer("done", [.string(id)]) { apply(reply) }
        started.remove(id)
    }

    /// Resolves once every write the session queued is made.
    func idle() async {
        guard pumping else { return }
        await withCheckedContinuation { idleWaiters.append($0) }
    }
}

private extension Result {
    var isSuccess: Bool { if case .success = self { true } else { false } }
}

/// The field typed in: the system's text field, kept as one view while the entry is open so the keyboard never drops
/// between the lines of a batch; its bar over the keyboard is the entry's own.
final class EntryTextField: UITextField, UITextFieldDelegate {
    weak var host: QuickEntryHost? {
        didSet { if let host { bar.rootView = KeyBar(host: host) } }
    }
    private let bar = UIHostingController(rootView: KeyBar(host: nil))
    /// The entry wants the keyboard: the field takes it again whenever it comes into a window.
    private var wanted = false

    init() {
        super.init(frame: .zero)
        delegate = self
        font = .systemFont(ofSize: CardMetrics.title)
        returnKeyType = .next
        autocorrectionType = .default
        borderStyle = .none
        backgroundColor = .clear
        bar.view.backgroundColor = .clear
        bar.sizingOptions = .intrinsicContentSize
        bar.view.frame = CGRect(x: 0, y: 0, width: 402, height: 60)
        bar.view.autoresizingMask = [.flexibleWidth]
        inputAccessoryView = bar.view
        addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.host?.typed(self.text ?? "")
        }, for: .editingChanged)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    func begin() {
        wanted = true
        if window != nil, !isFirstResponder { becomeFirstResponder() }
    }

    func end() {
        wanted = false
        if isFirstResponder { resignFirstResponder() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if wanted, window != nil, !isFirstResponder { becomeFirstResponder() }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        host?.enter()
        return false
    }

    /// The keyboard went: the entry ends as by a tap elsewhere, unless the field only moved to another row or a sheet of
    /// the bar took it for a while.
    func textFieldDidEndEditing(_ textField: UITextField) {
        Task { @MainActor [weak self] in
            guard let self, self.wanted, !self.isFirstResponder, self.host?.paused != true else { return }
            self.host?.blur()
        }
    }
}

/// The field in a list's row, on the calendar or in the full screen: the one text field placed in it.
struct EntryFieldView: UIViewRepresentable {
    let host: QuickEntryHost

    func makeUIView(context: Context) -> UIView {
        let box = UIView()
        place(in: box)
        return box
    }

    func updateUIView(_ box: UIView, context: Context) {
        place(in: box)
    }

    private func place(in box: UIView) {
        let field = host.field
        guard field.superview !== box else { return }
        field.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(field)
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            field.topAnchor.constraint(equalTo: box.topAnchor),
            field.bottomAnchor.constraint(equalTo: box.bottomAnchor),
        ])
    }
}

/// The capsule a task is typed in, at its place: no frame, the accent cursor, tinted by the priority typed.
struct EntryCapsule: View {
    let host: QuickEntryHost
    var section = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        EntryFieldView(host: host)
            .tint(Palette.accent(scheme))
            .frame(height: section ? 30 : 18)
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, CardMetrics.trailing)
            .frame(maxWidth: .infinity, minHeight: section ? 30 : CardMetrics.height, alignment: .leading)
            .background(section ? Color.clear : fill, in: .rect(cornerRadius: CardMetrics.radius))
            .accessibilityLabel(section ? "Section name" : "New task")
    }

    private var fill: Color {
        guard let tint = host.state?.marks.tint, let shades = host.model?.shades(tint) else { return Palette.card(scheme) }
        return Color(hex: scheme == .dark ? shades.dark.fill : shades.light.fill)
    }
}

/// A text entered and not yet written: drawn as its card will be, where it will stand.
struct PendingCapsule: View {
    let text: String
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text(text)
            .font(.system(size: CardMetrics.title))
            .lineLimit(1)
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, CardMetrics.trailing)
            .frame(maxWidth: .infinity, minHeight: CardMetrics.height, maxHeight: CardMetrics.height, alignment: .leading)
            .background(Palette.card(scheme), in: .rect(cornerRadius: CardMetrics.radius))
    }
}

/// The bar over the keyboard (board «5 — Новая задача»): left the section button and the outdent–indent pair, right the
/// priority flag, the repeat and the place menu, as iOS 26 glass groups. Each shows and allows what the entry's state says.
struct KeyBar: View {
    let host: QuickEntryHost?

    var body: some View {
        if let host, let state = host.state {
            GlassEffectContainer {
                HStack(spacing: 8) {
                    if let section = state.section {
                        Button { host.toggleSection() } label: { Image(systemName: section ? "number.square.fill" : "number") }
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular.interactive(), in: .circle)
                            .accessibilityLabel("Section")
                    }
                    if state.indents {
                        HStack(spacing: 0) {
                            Button { host.indent(-1) } label: { Image(systemName: "decrease.indent") }
                                .frame(width: 44, height: 44)
                                .disabled(!state.canOutdent)
                                .accessibilityLabel("Outdent")
                            Button { host.indent(1) } label: { Image(systemName: "increase.indent") }
                                .frame(width: 44, height: 44)
                                .disabled(!state.canIndent)
                                .accessibilityLabel("Indent")
                        }
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                    Spacer(minLength: 0)
                    if state.markable || state.repeatable {
                        HStack(spacing: 0) {
                            if state.markable { priority(host, state) }
                            if state.repeatable {
                                Button { host.ask(.repeating) } label: { Image(systemName: state.repeat?.isNull == false ? "repeat.circle.fill" : "repeat") }
                                    .frame(width: 44, height: 44)
                                    .accessibilityLabel("Repeat")
                            }
                        }
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                    if state.place != nil { place(host, state) }
                }
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(.primary)
                .buttonStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private func priority(_ host: QuickEntryHost, _ state: EntryView) -> some View {
        Menu {
            ForEach(state.marks.tiles.levels, id: \.mark.title) { tile in
                Toggle(tile.mark.title, isOn: Binding(get: { tile.on }, set: { _ in host.togglePriority(tile.mark.title) }))
                    .disabled(!tile.enabled)
            }
            if !state.marks.tiles.labels.isEmpty {
                Section("Labels") {
                    ForEach(state.marks.tiles.labels, id: \.mark.title) { tile in
                        Toggle(tile.mark.title, isOn: Binding(get: { tile.on }, set: { _ in host.toggleLabel(tile.mark.title) }))
                            .disabled(!tile.enabled)
                    }
                }
            }
        } label: {
            Image(systemName: state.marks.tint == nil ? "flag" : "flag.fill")
                .foregroundStyle(tint(host, state))
                .frame(width: 44, height: 44)
        }
        .menuActionDismissBehavior(.disabled)
        .accessibilityLabel("Priority")
    }

    private func tint(_ host: QuickEntryHost, _ state: EntryView) -> AnyShapeStyle {
        guard let color = state.marks.tint, let ink = host.model?.ink(color, dark: UITraitCollection.current.userInterfaceStyle == .dark) else { return AnyShapeStyle(.primary) }
        return AnyShapeStyle(Color(ink))
    }

    private func place(_ host: QuickEntryHost, _ state: EntryView) -> some View {
        Menu {
            ForEach(Array(state.places.enumerated()), id: \.offset) { _, choice in
                let kind = choice["kind"].string ?? ""
                if kind == "date" {
                    Divider()
                    Button { host.ask(.date) } label: {
                        Label("Date…", systemImage: choice["on"].bool == true ? "checkmark" : "calendar")
                    }
                } else {
                    Button { host.choosePlace(["kind": .string(kind)]) } label: {
                        if choice["on"].bool == true { Label(Self.name(kind), systemImage: "checkmark") } else { Text(Self.name(kind)) }
                    }
                }
            }
        } label: {
            Text(Self.title(state.place))
                .font(.system(size: 15, weight: .semibold))
                .padding(.horizontal, 16)
                .frame(height: 44)
        }
        .glassEffect(.regular.interactive(), in: .capsule)
        .accessibilityLabel("Place")
    }

    private static func name(_ kind: String) -> String {
        switch kind {
        case "inbox": "Inbox"
        case "backlog": "Backlog"
        case "soon": "Soon"
        case "now": "Today"
        default: kind
        }
    }

    private static func title(_ place: JSONValue?) -> String {
        guard let place, let kind = place["kind"].string else { return "" }
        if kind == "date", let day = place["date"].string, let date = LocalDay.date(day) { return date.formatted(.dateTime.day().month(.abbreviated)) }
        return name(kind)
    }

}

/// The bar's date sheet: the system calendar; Done puts the field on that day.
struct EntryDateSheet: View {
    let host: QuickEntryHost
    @State private var date = Date()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            DatePicker("Date", selection: $date, displayedComponents: .date)
                .datePickerStyle(.graphical)
                .padding(.horizontal)
                .navigationTitle("Date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", systemImage: "checkmark") {
                            let day = LocalDay.string(date)
                            dismiss()
                            host.choosePlace(["kind": "date", "date": .string(day)])
                        }
                        .buttonStyle(.glassProminent)
                    }
                }
        }
        .presentationDetents([.medium])
        .onAppear {
            let chosen = host.state?.places.first { $0["kind"].string == "date" }?["date"].string
            date = chosen.flatMap(LocalDay.date) ?? Date()
        }
    }
}
