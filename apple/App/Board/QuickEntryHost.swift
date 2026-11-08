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
    /// The field writes a section's name.
    var namesSection: Bool { section == true }
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

/// `StackEntry`: where a task's full screen draws the field among the rows of its subtasks.
struct StackEntryView: Decodable, Equatable {
    struct At: Decodable, Equatable {
        let kind: String
        let index: Int?
        let level: Int?
    }

    let at: At
    let pending: [EntryView.Pending]
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
    /// Bumped whenever the field opens or moves: what holds it scrolls it into sight.
    private(set) var moved = 0
    /// A sheet of the bar is up (repeat, date): the field gives the keyboard up for it without ending the entry.
    var paused = false
    /// The sheet the bar asked for; the screen presents it.
    var sheet: BarSheet?

    enum BarSheet: String, Identifiable {
        case repeating, date
        var id: String { rawValue }
    }

    /// The full screen showing the stack the field stands in: its subtasks read again after a write, handed back as the
    /// drawing of them, made in the same drawing as the line it ends.
    @ObservationIgnored var stackRead: (() async -> (() -> Void))?
    /// A rename written: the task as the file now has it.
    @ObservationIgnored var renamed: ((TaskItem) -> Void)?

    @ObservationIgnored private var session: JSONValue = .null
    @ObservationIgnored private var pumping = false
    @ObservationIgnored private var started: Set<String> = []
    @ObservationIgnored private var idleWaiters: [CheckedContinuation<Void, Never>] = []
    /// Where the bar's place turned the ribbon, moving the field there: the ribbon settling there keeps it.
    @ObservationIgnored private var turnedTo: RibbonPlace?
    /// Counts the fields opened: a tap elsewhere that opened one keeps it.
    @ObservationIgnored private var opened = 0
    @ObservationIgnored private var names: [String: String] = [:]
    @ObservationIgnored let field = EntryTextField()

    var isOpen: Bool { state != nil }

    init() {
        field.host = self
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

    // MARK: Opening

    /// The plus let go in a list or on the calendar: the field where the drop showed.
    func openAtDrop(_ column: BoardColumn?, _ result: JSONValue) {
        opening { call("openAtDrop", [column.map { .string($0.rawValue) } ?? .null, result]) }
    }

    /// A tap on a «No tasks» plate: the field of a new task in that section.
    func openIn(_ column: BoardColumn, _ group: String?) {
        opening { call("openIn", [.string(column.rawValue), group.json]) }
    }

    /// Add Subtask: the field last among the task's subtasks in its list; a task only on the calendar opens full
    /// screen, the field last in the stack of its subtasks there.
    func addSubtask(_ parent: TaskItem) {
        guard let spot = value("subtaskSpot", [parent.key.json]) else { return }
        guard spot["kind"].string == "stack", let model, model.fullScreen.last?.id != parent.id else {
            return opening { call("open", [spot]) }
        }
        // The page is read before it is pushed, then the field opens in it.
        Task {
            await model.openFullScreen(parent)
            opening { call("open", [spot]) }
        }
    }

    /// Rename: the card gives its place to the field with its text.
    func rename(_ item: TaskItem) {
        guard let spot = value("renameSpot", [item.json, .bool(false)]), !spot.isNull else { return }
        opening { call("open", [spot, item.json]) }
    }

    /// The full screen's Add Subtask, or a subtask's there: the field last in the stack of `parent`'s subtasks.
    func addSubtaskInStack(_ parent: TaskItem) {
        guard let spot = value("stackSpot", [parent.key.json]), !spot.isNull else { return }
        opening { call("open", [spot]) }
    }

    /// A rename on the full screen: the title, or a subtask's card there, becomes the field.
    func renameInStack(_ item: TaskItem) {
        guard let spot = value("stackSpot", [item.key.json]), !spot.isNull else { return }
        opening { call("open", [spot, item.json]) }
    }

    private func opening(_ open: () -> Void) {
        opened += 1
        open()
    }

    // MARK: Typing

    func typed(_ text: String) { call("type", [.string(text)], animated: false) }
    /// Enter: the text stands where it was typed and the next field is right under it in the same frame, as a line break
    /// in a text; nothing slides.
    func enter() { call("enter", [], animated: false) }
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

    /// Leaving the page the field stands on: what was typed there is dropped, as the plugin's full screen does.
    func escape() {
        guard state != nil else { return }
        call("escape", [])
    }

    /// A touch on the screen outside the field: once the touch has done its own work, the entry ends unless that work
    /// opened another field.
    func tappedElsewhere() {
        guard isOpen, !paused else { return }
        let mark = opened
        DispatchQueue.main.async { [weak self] in
            guard let self, self.opened == mark else { return }
            self.blur()
        }
    }

    /// The ribbon came to rest on another place than it rested on before (a swipe, a tab): the field is finished as by a
    /// tap elsewhere, unless the bar's place turned it there with the field. A swipe that springs back changes nothing.
    func placeSettled(_ place: RibbonPlace) {
        let turned = turnedTo
        turnedTo = nil
        if place != turned { blur() }
    }

    /// Before the screen shows another day: the field is finished, and every text typed is written for the day it was
    /// typed on.
    func settle() async {
        blur()
        await idle()
    }

    /// A place chosen in the bar: the field goes to the end of that column at once and the ribbon goes there; another day
    /// opens once what was typed is written, the field then at the end of that day's list.
    func choosePlace(_ placement: JSONValue) {
        guard let move = value("choosePlace", [placement], keep: true), !move.isNull, let column = move["column"].string.flatMap(BoardColumn.init) else { return }
        turn(to: column)
        guard let day = move["day"].string else { return }
        Task {
            await idle()
            await model?.show(day: day)
            call("moveToEnd", [.string(column.rawValue)])
        }
    }

    /// The ribbon turned to the place the core says shows `column` from where it stands; a place showing it stays.
    private func turn(to column: BoardColumn) {
        guard let model,
              let key: String = model.ruleNow("rules.placeShowing", [.string(column.rawValue), .string(model.place.key)]),
              let place = RibbonPlace(key: key), place != model.place else { return }
        turnedTo = place
        model.go(to: place)
    }

    /// The name the bar gives a list, as the settings head it: asked again once the screen is read over other settings.
    func name(_ kind: String) -> String {
        let settings = model?.snapshot?.settingsJSON
        if settings != namesSettings {
            names = [:]
            namesSettings = settings
        }
        if let known = names[kind] { return known }
        let found = (try? board.read("tasks.listName", [.string(kind)], over: board.settingsOnly()))?.string ?? kind
        names[kind] = found
        return found
    }

    @ObservationIgnored private var namesSettings: String?

    /// A day picked in the bar's date sheet: today is the Now list, as the plugin's picker gives it, so the field stays
    /// where it is when it already stands there.
    func chooseDay(_ day: String) {
        do {
            choosePlace(try board.read("tasks.placementOfDay", [.string(day)], over: board.settingsOnly()))
        } catch {
            model?.problem(error)
        }
    }

    /// A label's name as the screen shows it.
    func labelTitle(_ name: String) -> String {
        model?.ruleNow("rules.labelTitle", [.string(name)]) ?? name
    }

    // MARK: The door

    /// The lists each place of the ribbon shows, in order, as the core's `SHOWN_LISTS` has them.
    private func shown(at place: RibbonPlace) -> [String] {
        if shownLists == nil, let constants: [String: JSONValue] = model?.ruleNow("rules.constants", []) {
            shownLists = constants["SHOWN_LISTS"].flatMap { try? $0.decode([String: [String]].self) }
        }
        return shownLists?[place.key] ?? []
    }

    @ObservationIgnored private var shownLists: [String: [String]]?

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
        let shown = shown(at: model?.place ?? .today)
        return ["cards": .object(cards), "sections": .object(sections), "sectioned": .object(sectioned), "day": .string(snapshot.day), "shown": .array(shown.map(JSONValue.string))]
    }

    private static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { ["id": .string($0.id), "key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
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

    /// A call that may change the session: its state drawn (the rows parting with the system's spring), its jobs run.
    @discardableResult
    private func call(_ method: String, _ arguments: [JSONValue], animated: Bool = true) -> JSONValue? {
        guard let reply = answer(method, arguments) else { return nil }
        if animated {
            withAnimation(.snappy) { apply(reply) }
        } else {
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { apply(reply) }
        }
        return reply["value"]
    }

    /// A call for its answer; `keep` draws the session it leaves too.
    private func value(_ method: String, _ arguments: [JSONValue], keep: Bool = false) -> JSONValue? {
        guard let reply = answer(method, arguments) else { return nil }
        if keep { withAnimation(.snappy) { apply(reply) } }
        return reply["value"]
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
        guard let next else {
            lists = [:]
            slotMinute = nil
            field.end()
            return
        }
        field.placeholder = next.namesSection ? "Section name" : nil
        placeField(over: snapshot)
        if before == nil || before?.spot != next.spot || before?.pending.count != next.pending.count || before?.section != next.section { moved += 1 }
        field.begin()
    }

    /// Where the field stands in each list, and on the calendar, for the screen as it is about to be drawn.
    private func placeField(over snapshot: BoardSnapshot? = nil) {
        guard let snapshot = snapshot ?? model?.snapshot, let state else { return }
        var found: [BoardColumn: ListEntryView] = [:]
        if state.spotKind == "list" {
            for (column, list) in snapshot.lists {
                let drawn: JSONValue = ["cards": Self.listCards(list.cards), "sections": .array(list.groups.map(\.name.json))]
                if let entry = answer("listEntry", [.string(column.rawValue), drawn], over: snapshot)?["value"], !entry.isNull {
                    found[column] = try? entry.decode(ListEntryView.self)
                }
            }
        }
        lists = found
        if state.spotKind == "slot" {
            let slot = state.spot["slot"]
            slotMinute = (try? board.read("boundary.spanOf", [slot, .string(snapshot.day)], over: board.settingsOnly()))?["start"].number.map { Int($0) }
        } else {
            slotMinute = nil
        }
    }

    /// Where `task`'s full screen draws the field, nil when it stands elsewhere.
    func stackEntry(_ task: TaskItem) -> StackEntryView? {
        guard state != nil, let entry = answer("stackEntry", [task.json])?["value"], !entry.isNull else { return nil }
        return try? entry.decode(StackEntryView.self)
    }

    /// The screen was read anew (a write elsewhere, another day): the field keeps its place among the cards as drawn.
    func screenChanged() {
        guard state != nil else { return }
        placeField()
    }

    // MARK: Jobs

    /// The session's writes, one at a time, in order: each made once the lists show the file as of the one before it;
    /// a task's line leaves the queue in the very drawing that shows its card, so the field never jumps. A job the door
    /// could not end stops the pump: it is never handed out again.
    private func pump() {
        guard !pumping else { return }
        pumping = true
        Task {
            while let id = nextJob() {
                started.insert(id)
                guard await run(id) else { break }
            }
            pumping = false
            let waiting = idleWaiters
            idleWaiters = []
            for waiter in waiting { waiter.resume() }
            model?.readIfAsked()
        }
    }

    /// The session's writes are being made: the screen's other reads wait for them.
    var writing: Bool { pumping }

    private func nextJob() -> String? {
        guard case .array(let jobs) = session["jobs"] else { return nil }
        return jobs.lazy.compactMap { $0["id"].string }.first { !self.started.contains($0) }
    }

    /// Job `id`: its call, its write, the file read again and drawn with the line it ends, then done (`docs/door.md`). Every
    /// task's line ends shown or unshown, whatever failed on the way. False when the door could not end the job.
    private func run(_ id: String) async -> Bool {
        guard let model else { return false }
        guard let call = answer("call", [.string(id)]) else {
            return finish(id) { if let reply = answer("unshown", [.string(id)]) { apply(reply) } }
        }
        session = call["session"]
        let job = call["value"]
        guard let method = job["method"].string, case .array(let args) = job["args"] else {
            // Nothing to write: a line waiting for it stops waiting.
            return finish(id) { if let reply = answer("unshown", [.string(id)]) { apply(reply) } }
        }
        let board = board
        let day = model.shownDay
        // A task typed is made by `createWithId`: its card is found in the next drawing by its id, whatever else wrote to
        // the file between the write and that read (a key names only the place right after the write).
        let call = method == "createInPlace" ? "createWithId" : method
        let written: Result<JSONValue, Error> = await Task.detached {
            Result { try board.write("tasks." + call, args) }
        }.value
        if case .failure(let error) = written { model.problem(error) }
        let read: BoardSnapshot?
        do {
            read = try await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
        } catch {
            model.problem(error)
            read = nil
        }
        if method == "edit", case .success(let answer) = written, let item = try? answer.decode(TaskItem.self) { renamed?(item) }
        let created: JSONValue? = if method == "createInPlace", case .success(let made) = written, !made.isNull, read != nil { made } else { nil }
        let stack = created != nil && state?.spotKind == "stack" ? await stackRead?() : nil
        // Written but not read: the screen reads again once this job is done, so the task shows.
        if read == nil, case .success = written { Task { await model.reload() } }
        // The screen, the field's line and the job's end in one transaction: the field never shows empty before the card
        // that ends its line, and the rows below move once.
        // The job's drawing moves as it differs from the screen (a line written elsewhere in the list slides the rows).
        let motion = read.map { $0.motion(from: model.snapshot) } ?? .still
        return finish(id, motion: motion) {
            if method == "createInPlace" {
                var reply: JSONValue?
                if let created, let read {
                    let coming = JSONValue.object(Dictionary(uniqueKeysWithValues: read.lists.map { ($0.key.rawValue, Self.listCards($0.value.cards)) }))
                    reply = answer("shown", [.string(id), created, coming], over: read)
                }
                if reply == nil { reply = answer("unshown", [.string(id)], over: read) }
                if let read { model.draw(read) }
                stack?()
                if let reply { apply(reply, over: read) }
            } else if let read {
                model.draw(read)
                placeField(over: read)
            }
        }
    }

    /// The job ends, drawn in one transaction with `draw`, what the job showed, moving as the screen's drawing differs;
    /// false when the door refused to end it, and it stays started so it is never run again.
    private func finish(_ id: String, motion: BoardMotion = .still, drawing draw: () -> Void) -> Bool {
        var ended = false
        guard let model else { return false }
        model.draw(motion: motion) {
            draw()
            guard let reply = answer("done", [.string(id)]) else { return }
            apply(reply)
            ended = true
        }
        if ended { started.remove(id) }
        return ended
    }

    /// Resolves once every write the session queued is made.
    func idle() async {
        guard pumping else { return }
        await withCheckedContinuation { idleWaiters.append($0) }
    }
}

/// The field typed in: the system's text field, kept as one view while the entry is open so the keyboard never drops
/// between the lines of a batch; its bar over the keyboard is the entry's own.
final class EntryTextField: UITextField, UITextFieldDelegate, UIGestureRecognizerDelegate {
    weak var host: QuickEntryHost? {
        didSet { if let host { bar.rootView = KeyBar(host: host) } }
    }
    private let bar = UIHostingController(rootView: KeyBar(host: nil))
    /// The entry wants the keyboard: the field takes it again whenever it comes into a window.
    private var wanted = false
    /// A touch anywhere in the window outside the field: a tap elsewhere.
    private lazy var elsewhere: UITapGestureRecognizer = {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedElsewhere))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        return tap
    }()

    init() {
        super.init(frame: .zero)
        delegate = self
        font = .systemFont(ofSize: CardMetrics.title)
        returnKeyType = .next
        autocorrectionType = .default
        // As the plugin's field: a level's prefix (`p1 `) is typed as it reads, never capitalised.
        autocapitalizationType = .none
        borderStyle = .none
        backgroundColor = .clear
        bar.view.backgroundColor = .clear
        bar.safeAreaRegions = []
        let holder = AccessoryHolder(frame: CGRect(x: 0, y: 0, width: 402, height: KeyBar.height))
        bar.view.frame = holder.bounds
        bar.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        holder.addSubview(bar.view)
        inputAccessoryView = holder
        addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.host?.typed(self.text ?? "")
        }, for: .editingChanged)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    func begin() {
        wanted = true
        take()
    }

    /// Placed in a box: it takes the keyboard if it has not got it yet.
    func placed() {
        take()
    }

    /// The field waits in the window's holder while no box shows it, the keyboard kept.
    var isParked: Bool { superview is EntryParking }

    func park(in window: UIWindow) {
        let parking = window.subviews.lazy.compactMap { $0 as? EntryParking }.first ?? {
            let made = EntryParking()
            window.addSubview(made)
            return made
        }()
        translatesAutoresizingMaskIntoConstraints = true
        parking.addSubview(self)
        frame = parking.bounds
    }

    /// The keyboard taken; while a drop or a menu still holds the screen the system refuses it, and it is asked again a
    /// moment later.
    private func take(tries: Int = 12) {
        guard wanted, !isFirstResponder else { return }
        if window != nil, becomeFirstResponder() { return }
        guard tries > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.take(tries: tries - 1) }
    }

    func end() {
        wanted = false
        if isFirstResponder { resignFirstResponder() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard let window else { return }
        if elsewhere.view !== window { window.addGestureRecognizer(elsewhere) }
        take()
    }

    @objc private func tappedElsewhere() {
        host?.tappedElsewhere()
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard wanted, let view = touch.view else { return false }
        return !view.isDescendant(of: self)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    /// A touch that pans something (the ribbon, a list, the calendar) is no tap elsewhere: the ribbon ends the entry only
    /// if it comes to rest on another place.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRequireFailureOf other: UIGestureRecognizer) -> Bool {
        other is UIPanGestureRecognizer
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        host?.enter()
        return false
    }

    /// The keyboard went to something else (another field, a page's editor): the entry ends as by a tap elsewhere, unless
    /// a sheet of the bar took it for a while. Moving between rows and lists never ends editing: the field stays in the
    /// window.
    func textFieldDidEndEditing(_ textField: UITextField) {
        guard wanted, host?.paused != true else { return }
        host?.blur()
    }
}

/// The window's holder of the field while no box shows it: out of sight, in the window, so the field keeps the keyboard.
private final class EntryParking: UIView {
    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        alpha = 0
        clipsToBounds = true
        isUserInteractionEnabled = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }
}

/// The bar's place over the keyboard: always the bar's own height, whatever the buttons it shows this moment, so the
/// keyboard and the lists above it never move when the field's state changes.
private final class AccessoryHolder: UIView {
    override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: KeyBar.height) }

    override init(frame: CGRect) {
        super.init(frame: frame)
        autoresizingMask = [.flexibleWidth]
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }
}

/// The field in a list's row, on the calendar or on the full screen: the one text field placed in it.
struct EntryFieldView: UIViewRepresentable {
    let host: QuickEntryHost
    let tint: UIColor
    let font: UIFont

    func makeUIView(context: Context) -> EntryFieldBox {
        EntryFieldBox(field: host.field)
    }

    func updateUIView(_ box: EntryFieldBox, context: Context) {
        let field = host.field
        field.tintColor = tint
        if field.font != font { field.font = font }
        box.claimIfFree()
    }
}

/// Where the field is drawn. The field only ever moves between views in the window, never out of it, so it keeps the
/// keyboard and every key typed while it moves: a box takes it once the box is in the window, and a box leaving the
/// window first parks it in the window's own holder, from which the next box takes it.
final class EntryFieldBox: UIView {
    private let field: EntryTextField

    init(field: EntryTextField) {
        self.field = field
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { claim() }
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil, field.superview === self, let window { field.park(in: window) }
    }

    /// Takes the field when no other box in the window holds it (it is parked, or not placed yet).
    func claimIfFree() {
        guard window != nil, field.superview !== self, field.superview == nil || field.isParked else { return }
        claim()
    }

    private func claim() {
        guard field.superview !== self else { return }
        // Moved, not removed first: from one view in the window to another it stays the first responder.
        field.translatesAutoresizingMaskIntoConstraints = false
        addSubview(field)
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: leadingAnchor),
            field.trailingAnchor.constraint(equalTo: trailingAnchor),
            field.topAnchor.constraint(equalTo: topAnchor),
            field.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        field.placed()
    }
}

/// The capsule a task is typed in, at its place: a card with no frame, the accent cursor, tinted by the priority or the
/// label chosen. A section's name is typed where its header will stand, in the header's type; the full screen's title is
/// renamed in the title's own type, so nothing around it moves.
struct EntryCapsule: View {
    enum Style {
        case card, section, title
    }

    let host: QuickEntryHost
    var style = Style.card
    var height: CGFloat = CardMetrics.height
    @Environment(\.colorScheme) private var scheme

    init(host: QuickEntryHost, section: Bool = false, height: CGFloat = CardMetrics.height) {
        self.host = host
        style = section ? .section : .card
        self.height = height
    }

    init(host: QuickEntryHost, style: Style) {
        self.host = host
        self.style = style
    }

    var body: some View {
        // One field view whatever it writes, so turning it into a section's name never takes the keyboard away.
        EntryFieldView(host: host, tint: UIColor(Palette.accent(scheme)), font: font)
            .frame(height: style == .title ? font.lineHeight.rounded(.up) : 22)
            .padding(.leading, style == .title ? 0 : CardMetrics.leading)
            .padding(.trailing, style == .card ? CardMetrics.trailing : 0)
            .padding(.bottom, style == .section ? 4 : 0)
            .frame(maxWidth: .infinity, minHeight: rowHeight, maxHeight: rowHeight, alignment: style == .section ? .bottomLeading : .leading)
            .background(style == .card ? fill : Color.clear, in: .rect(cornerRadius: CardMetrics.radius))
            .accessibilityLabel(style == .section ? "Section name" : style == .title ? "Title" : "New task")
    }

    private var rowHeight: CGFloat? {
        switch style {
        case .card: height
        case .section: 30
        case .title: nil
        }
    }

    private var font: UIFont {
        switch style {
        case .card: .systemFont(ofSize: CardMetrics.title)
        case .section: .systemFont(ofSize: 15, weight: .semibold)
        case .title: UIFont(descriptor: UIFont.preferredFont(forTextStyle: .title2).fontDescriptor.withSymbolicTraits(.traitBold) ?? UIFont.preferredFont(forTextStyle: .title2).fontDescriptor, size: 0)
        }
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

/// The bar over the keyboard (board «5 — Новая задача», `KeyBar.dc.html`): on the left the section button and the
/// outdent–indent pair, on the right the priority flag, the repeat and the place menu in one group, iOS 26 glass over a
/// fade into the ground. Each shows and allows what the entry's state says.
struct KeyBar: View {
    let host: QuickEntryHost?
    @Environment(\.colorScheme) private var scheme
    static let height: CGFloat = 60

    var body: some View {
        if let host, let state = host.state {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    if let section = state.section {
                        Button { host.toggleSection() } label: {
                            Image(systemName: "rectangle.stack")
                                .symbolVariant(section ? .fill : .none)
                                .frame(width: 44, height: 44)
                                .contentShape(.circle)
                        }
                        .foregroundStyle(section ? Color.white : Color.primary)
                        .glassEffect(section ? .regular.tint(Palette.accent(scheme)).interactive() : .regular.interactive(), in: .circle)
                        .accessibilityLabel("Section")
                        .accessibilityAddTraits(section ? .isSelected : [])
                    }
                    if state.indents {
                        HStack(spacing: 0) {
                            Button { host.indent(-1) } label: { icon("decrease.indent") }
                                .disabled(!state.canOutdent)
                                .accessibilityLabel("Outdent")
                            Button { host.indent(1) } label: { icon("increase.indent") }
                                .disabled(!state.canIndent)
                                .accessibilityLabel("Indent")
                        }
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                    Spacer(minLength: 0)
                    if state.markable || state.repeatable || state.place != nil {
                        HStack(spacing: 0) {
                            if state.markable { priority(host, state) }
                            if state.repeatable {
                                Button { host.ask(.repeating) } label: {
                                    icon(state.repeat?.isNull == false ? "repeat.circle.fill" : "repeat")
                                }
                                .accessibilityLabel("Repeat")
                            }
                            if state.place != nil { place(host, state) }
                        }
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                }
                .font(.system(size: 17))
                .foregroundStyle(.primary)
                .buttonStyle(.plain)
                .padding(.horizontal, 8)
            }
            .frame(height: 44)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background {
                // The list fades into the ground under the bar, as the board draws it.
                LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: Color(.systemBackground), location: 0.6)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .frame(width: 44, height: 44)
            .contentShape(.rect)
    }

    /// The flag: the levels, a pick that closes the menu; under them the labels, each tap putting one on or taking it off
    /// while the menu stays for the next.
    private func priority(_ host: QuickEntryHost, _ state: EntryView) -> some View {
        Menu {
            Section {
                ForEach(state.marks.tiles.levels, id: \.mark.title) { tile in
                    Toggle(isOn: Binding(get: { tile.on }, set: { _ in host.togglePriority(tile.mark.title) })) {
                        Label { Text(tile.mark.title) } icon: { swatch(host, "flag.fill", tile.mark.color) }
                    }
                    .disabled(!tile.enabled)
                }
            }
            if !state.marks.tiles.labels.isEmpty {
                Section("Labels") {
                    ForEach(state.marks.tiles.labels, id: \.mark.title) { tile in
                        Toggle(isOn: Binding(get: { tile.on }, set: { _ in host.toggleLabel(tile.mark.title) })) {
                            Label { Text(host.labelTitle(tile.mark.title)) } icon: { swatch(host, "tag.fill", tile.mark.color) }
                        }
                        .disabled(!tile.enabled)
                        .menuActionDismissBehavior(.disabled)
                    }
                }
            }
        } label: {
            Image(systemName: state.marks.tint == nil ? "flag" : "flag.fill")
                .foregroundStyle(tint(host, state.marks.tint))
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Priority")
    }

    /// A menu row's icon in the mark's colour, as the task's own menu draws it: the system menu draws only original colours.
    private func swatch(_ host: QuickEntryHost, _ symbol: String, _ color: String) -> Image {
        let image = UIImage(systemName: symbol) ?? UIImage()
        guard let ink = host.model?.ink(color, dark: scheme == .dark) else { return Image(uiImage: image) }
        return Image(uiImage: image.withTintColor(ink, renderingMode: .alwaysOriginal))
    }

    private func tint(_ host: QuickEntryHost, _ color: String?) -> AnyShapeStyle {
        guard let color, let ink = host.model?.ink(color, dark: scheme == .dark) else { return AnyShapeStyle(.primary) }
        return AnyShapeStyle(Color(ink))
    }

    /// The place: the lists by the names the settings give them and Date…, a check on the one the field is in.
    private func place(_ host: QuickEntryHost, _ state: EntryView) -> some View {
        Menu {
            ForEach(Array(state.places.enumerated()), id: \.offset) { _, choice in
                let kind = choice["kind"].string ?? ""
                if kind == "date" {
                    Section {
                        Button { host.ask(.date) } label: {
                            Label("Date…", systemImage: choice["on"].bool == true ? "checkmark" : "calendar")
                        }
                    }
                } else {
                    Button { host.choosePlace(["kind": .string(kind)]) } label: {
                        if choice["on"].bool == true { Label(host.name(kind), systemImage: "checkmark") } else { Text(host.name(kind)) }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(title(host, state.place)).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
            }
            .font(.system(size: 15))
            .padding(.leading, 6)
            .padding(.trailing, 14)
            .frame(height: 44)
            .contentShape(.rect)
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Place")
    }

    private func title(_ host: QuickEntryHost, _ place: JSONValue?) -> String {
        guard let place, let kind = place["kind"].string else { return "" }
        if kind == "date", let day = place["date"].string, let date = LocalDay.date(day) { return date.formatted(.dateTime.day().month(.abbreviated)) }
        return host.name(kind)
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
                            host.chooseDay(day)
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
