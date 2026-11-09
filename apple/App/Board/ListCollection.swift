import Core
import SwiftUI
import UIKit
import os

/// What the board's drag carries: a card, or a section by its header, from the column it is drawn in.
@MainActor
final class DragPayload {
    enum Kind {
        case card(BoardCard)
        case section(BoardGroup)
    }

    let kind: Kind
    let from: String
    /// How far below the card's top the finger holds it: the calendar reads the minute at the carried card's top edge.
    var grab: CGFloat = 0
    /// Where the card stood when it was lifted, in the window: a drop that writes nothing flies it back there.
    var home: CGRect?

    init(_ kind: Kind, from: String) {
        self.kind = kind
        self.from = from
    }

    var isSection: Bool {
        if case .section = kind { true } else { false }
    }
}

/// A row of a list as drawn: a section's header or its No tasks plate, a project group's header, a card, a text typed and
/// not written yet, the field it is typed in, or the room the plus held over the list opens.
enum DrawnRow: Hashable {
    case header(BoardGroup, String)
    /// A project group's header in a list grouped by project.
    case project(BoardProject)
    /// The section named for the task being typed in a project's group, over the field.
    case newHead(String)
    case plate(BoardGroup)
    case card(BoardCard)
    case pending(key: String, text: String, level: Int, branch: Branch?)
    /// The field, in the row of the card it renames (by that card's id) or a row of its own.
    case field(id: String, level: Int, branch: Branch?, section: Bool)
    /// Where the plus carried over the list would open its field.
    case plusRoom

    var id: String {
        switch self {
        case .header(let group, _): "\u{0}head/\(group.id)"
        case .project(let project): "\u{0}project/\(project.id)"
        case .newHead: "\u{0}newHead"
        case .plate(let group): "\u{0}plate/\(group.id)"
        case .card(let card): card.id
        case .pending(let key, _, _, _): key
        case .field(let id, _, _, _): id
        case .plusRoom: "\u{0}plus"
        }
    }

    /// The depth of a row that stands among the cards.
    var level: Int? {
        switch self {
        case .card(let card): card.level
        case .pending(_, _, let level, _), .field(_, let level, _, _): level
        case .header, .plate, .project, .newHead, .plusRoom: nil
        }
    }

    /// A header of some kind: it stands a section's gap below the row before it, and the row after it on its bottom.
    var heads: Bool {
        switch self {
        case .header, .project, .newHead: true
        default: false
        }
    }

    /// As a drop reads it.
    var drop: DropRow {
        switch self {
        case .card(let card): .card(level: card.level, group: card.item.group, zone: card.zone)
        case .header(let group, _): .head(group: group.place, opens: false)
        case .project(let project): .head(group: project.head, opens: true)
        default: .other
        }
    }

    /// The room above the row: the cards' gap after a card, a section's gap more over a header, nothing under a header,
    /// as the plugin's list stands.
    static func top(of row: DrawnRow, after previous: DrawnRow?) -> CGFloat {
        guard let previous else { return 0 }
        return (previous.heads ? 0 : CardMetrics.gap) + (row.heads ? ColumnMetrics.sectionGap : 0)
    }
}

/// A list's rows as the system's own collection draws them, one per column (Inbox, Backlog, Soon, the day). A long press
/// on a card or a section's header lifts it into the board's drag (`DragController`); the list says which place of the
/// core's the finger points at, the rows standing still, and draws the screen the core says the drop leaves.
struct ListCollection: UIViewRepresentable {
    let column: BoardColumn
    let model: BoardModel

    func makeCoordinator() -> ListController { ListController(column: column, model: model) }

    func makeUIView(context: Context) -> ListHostView {
        context.coordinator.host
    }

    func updateUIView(_ host: ListHostView, context: Context) {
        let controller = context.coordinator
        // Read here so the list follows them: the screen, the entry's rows, a carry folding rows away, the keyboard.
        _ = model.snapshot?.lists[column]
        _ = model.entry.lists[column]
        _ = model.entry.lineKeys[column]
        _ = model.entry.state?.renaming?.id
        _ = model.carry?.token
        _ = model.carry?.group.count
        _ = model.entry.heirs
        controller.update()
        controller.keyboard(KeyboardRise.shared.top)
        controller.follow(found: model.found, moved: model.entry.moved)
    }
}

/// The list's own view: the collection, softly faded at an edge it scrolls past (as the plugin's lists), half a card high.
final class ListHostView: UIView {
    let collection: UICollectionView
    private let fade = CAGradientLayer()

    init(collection: UICollectionView) {
        self.collection = collection
        super.init(frame: .zero)
        collection.translatesAutoresizingMaskIntoConstraints = false
        addSubview(collection)
        NSLayoutConstraint.activate([
            collection.leadingAnchor.constraint(equalTo: leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: trailingAnchor),
            collection.topAnchor.constraint(equalTo: topAnchor),
            collection.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        fade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        layer.mask = fade
        // The rows' height changes after the list is laid out: the soft edges follow what is now above and below, or a
        // list that came to run on past its bottom faded nothing there and its last row read as cut.
        sized = collection.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.edges() }
        }
    }

    private var sized: NSKeyValueObservation?

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        edges()
    }

    /// The fade at each edge as far as the content goes on past it, the room at the end (to scroll the last card over the
    /// keyboard) left out.
    func edges() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = bounds
        let height = max(1, bounds.height)
        let most = SoftEdges.fade
        let above = collection.contentOffset.y + collection.adjustedContentInset.top
        let below = collection.contentSize.height + collection.adjustedContentInset.bottom - ListCollection.trailingRoom - collection.contentOffset.y - bounds.height
        let top = min(most, max(0, above)) / height
        let bottom = min(most, max(0, below)) / height
        fade.locations = [0, NSNumber(value: Double(top)), NSNumber(value: Double(1 - bottom)), 1]
        CATransaction.commit()
    }
}

extension ListCollection {
    /// Room after the last row, so the last card scrolls over the keyboard.
    static let trailingRoom: CGFloat = 160
}

@MainActor
final class ListController: NSObject, UICollectionViewDelegate, UIGestureRecognizerDelegate, BoardTarget {
    let column: BoardColumn
    private weak var model: BoardModel?
    let collection: UICollectionView
    let host: ListHostView
    private var source: UICollectionViewDiffableDataSource<Int, String>!
    private(set) var rows: [DrawnRow] = []
    private var drawn: [String: (row: DrawnRow, top: CGFloat)] = [:]
    private var day: String?
    /// Each row's key in the collection, by the row's id: a card made from a typed line keeps that line's.
    private var keys: [String: String] = [:]
    private var shownIds: [String] = []

    init(column: BoardColumn, model: BoardModel) {
        self.column = column
        self.model = model
        var list = UICollectionLayoutListConfiguration(appearance: .plain)
        list.showsSeparators = false
        list.backgroundColor = .clear
        let layout = FoldingListLayout { _, environment in
            let section = NSCollectionLayoutSection.list(using: list, layoutEnvironment: environment)
            section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: CardMetrics.columnInset, bottom: ListCollection.trailingRoom, trailing: CardMetrics.columnInset)
            return section
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.backgroundColor = .clear
        collection.showsVerticalScrollIndicator = false
        collection.contentInsetAdjustmentBehavior = .never
        collection.keyboardDismissMode = .none
        host = ListHostView(collection: collection)
        super.init()
        let cell = UICollectionView.CellRegistration<UICollectionViewCell, String> { [weak self] cell, _, id in
            guard let self, let model = self.model, let drawn = self.drawn[id] else { return }
            let column = self.column
            cell.contentConfiguration = UIHostingConfiguration {
                ListRowContent(row: drawn.row, top: drawn.top, column: column, model: model)
            }
            .margins(.all, 0)
            .minSize(width: 0, height: 0)
            cell.backgroundConfiguration = .clear()
        }
        source = UICollectionViewDiffableDataSource(collectionView: collection) { view, path, id in
            view.dequeueConfiguredReusableCell(using: cell, for: path, item: id)
        }
        collection.delegate = self
        press.addTarget(self, action: #selector(pressed(_:)))
        press.delegate = self
        press.minimumPressDuration = DragController.liftDelay
        collection.addGestureRecognizer(press)
        model.register(self)
    }

    // MARK: The rows

    /// The list drawn anew from the model: rows come, go and move with the system's own animation; a row whose content
    /// changed is drawn again in place. Another day comes in still: it slid in through the day's own motion.
    func update(force: Bool = false) {
        guard let model else { return }
        // A card's menu going: the list draws the new screen once the card is back in its row; a card renamed from it
        // turns into its field at once, in its own row, the preview landing on it.
        guard !MenuHold.holding || model.entry.state?.renaming != nil else {
            MenuHold.after(self) { [weak self] in self?.update(force: force) }
            return
        }
        let next = Self.rows(column: column, model: model, plusRoom: plusRoom)
        // A card made from a typed line keeps that line's key, so the text becomes the card in its row.
        let heirs = model.entry.heirs
        keys = Dictionary(next.map { row in (row.id, { if case .card(let card) = row, let heir = heirs[card.id] { heir } else { row.id } }()) }, uniquingKeysWith: { first, _ in first })
        var tops: [String: (row: DrawnRow, top: CGFloat)] = [:]
        var previous: DrawnRow?
        for row in next {
            tops[keys[row.id] ?? row.id] = (row, DrawnRow.top(of: row, after: previous))
            previous = row
        }
        var ids = next.map { keys[$0.id] ?? $0.id }
        // A key twice in one list would stop the collection: a second one is told apart by its place.
        if Set(ids).count != ids.count {
            var seen: Set<String> = []
            ids = ids.enumerated().map { index, id in seen.insert(id).inserted ? id : "\(id)\u{0}\(index)" }
            for (row, id) in zip(next, ids) where tops[id] == nil { tops[id] = (row, tops[keys[row.id] ?? row.id]?.top ?? 0) }
        }
        let changed = ids.filter { id in
            guard let old = drawn[id], let new = tops[id] else { return false }
            return old.row != new.row || old.top != new.top
        }
        let shownDay = model.snapshot?.day
        guard force || ids != shownIds || !changed.isEmpty else { return }
        let gone = Set(shownIds).subtracting(ids)
        // Only rows drawn anew in place (a card turning into its field, a title written): drawn at once, never cross-faded.
        let animated = day == shownDay && host.window != nil && ids != shownIds
        shownIds = ids
        day = shownDay
        // The quick entry's one field keeps the keyboard from row to row: a row going away hands it to the window's holder
        // first, as any box that stops showing it does, so the collection never deletes the first responder's row.
        for id in gone {
            guard let path = source.indexPath(for: id), let cell = collection.cellForItem(at: path), let window = host.window,
                  let field = cell.contentView.firstResponderInside as? EntryTextField else { continue }
            field.park(in: window)
        }
        if let layout = collection.collectionViewLayout as? FoldingListLayout {
            layout.covers = (before: Self.covering(rows), after: Self.covering(next))
        }
        rows = next
        drawn = tops
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(ids)
        snapshot.reconfigureItems(changed)
        source.apply(snapshot, animatingDifferences: animated)
        showHeaders()
    }

    /// Each header drawn shows, but the one of a carried section, whose floating copy stands for it until it is down: set
    /// on the row itself, so it shows in the very frame the copy goes.
    /// The rows on the screen drawn anew at once, in place, from the model as it stands now.
    func redrawShown() {
        let shown = collection.indexPathsForVisibleItems.compactMap { source.itemIdentifier(for: $0) }
        if !shown.isEmpty {
            var snapshot = source.snapshot()
            snapshot.reconfigureItems(shown)
            source.apply(snapshot, animatingDifferences: false)
            collection.layoutIfNeeded()
        }
        // Rows the carry folded away (a card's subtasks, a section's tasks) come back in their own motion.
        update()
    }

    /// `all`: the carry's copy is down, every header shows now.
    func showHeaders(all: Bool = false) {
        for cell in collection.visibleCells { shows(cell, at: collection.indexPath(for: cell), all: all) }
    }

    private func shows(_ cell: UICollectionViewCell, at path: IndexPath?, all: Bool = false) {
        guard !all, let path, let model, case .header(let group, _) = rows[safe: path.item] else { return cell.contentView.alpha = 1 }
        cell.contentView.alpha = model.hidesHeader(group, in: column) ? 0 : 1
    }

    /// The rows whose capsule hides a row folding in or out under it: the cards and the texts typed.
    private static func covering(_ rows: [DrawnRow]) -> Set<Int> {
        Set(rows.indices.filter { index in
            switch rows[index] {
            case .card, .pending, .field: true
            default: false
            }
        })
    }

    /// The list's rows: each section's header, its No tasks plate, its cards, and the quick entry's field with the texts
    /// typed before it where the core's `listEntry` puts them. The card being renamed gives its place to the field; the
    /// cards a carry takes along (a card's subtasks, the other picked tasks) and a lifted section's cards are not drawn.
    static func rows(column: BoardColumn, model: BoardModel, plusRoom: Int?) -> [DrawnRow] {
        guard let list = model.snapshot?.lists[column] else { return [] }
        let entry = model.entry.lists[column]
        let renaming = model.entry.state?.renaming?.id
        var typed: [DrawnRow] = []
        if let entry {
            let keys = model.entry.lineKeys[column] ?? []
            typed = entry.pending.enumerated().map { .pending(key: keys[safe: $0.offset] ?? "\u{0}line/\($0.offset)", text: $0.element.text, level: $0.element.level, branch: nil) }
            // A card renamed gives its row to the field: the same row, its content now typed in, so nothing comes or goes.
            typed.append(.field(id: renaming ?? keys.last ?? "\u{0}field", level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
            if let name = entry.newSection { typed.insert(.newHead(name), at: 0) }
        }
        var rows: [DrawnRow] = []
        if entry?.at.kind == "top" { rows += typed }
        for part in moved(list.parts, of: list, column: column, model: model) {
            guard case .section(let index) = part else {
                if case .project(let project) = part { rows.append(.project(project)) }
                continue
            }
            let group = list.groups[index]
            let lifted = model.isLifted(group, in: column)
            if let header = group.header { rows.append(.header(group, header)) }
            if lifted { continue }
            let here = entry.flatMap { $0.at.kind == "in" && $0.at.section == index ? $0 : nil }
            if group.empty, here == nil || here?.at.keepsPlate == true { rows.append(.plate(group)) }
            var cards = group.cards.filter { !model.isFolded($0) }.map(DrawnRow.card)
            if let here {
                let next = here.at.card.flatMap { list.cards[safe: $0] }
                let before = next.flatMap { next in cards.firstIndex { $0.id == next.id } } ?? cards.count
                cards.insert(contentsOf: typed, at: before)
            }
            rows += cards.filter { row in
                if case .card(let card) = row { card.item.id != renaming } else { true }
            }
        }
        // At the end, or in a section the list doesn't draw (a day with no task yet has none): the field stands last.
        if entry?.at.kind == "end" || entry?.at.kind == "in" && !list.groups.indices.contains(entry?.at.section ?? 0) { rows += typed }
        if let plusRoom { rows.insert(.plusRoom, at: min(max(0, plusRoom), rows.count)) }
        let folded = list.cards.contains { model.isFolded($0) }
        return entry == nil && plusRoom == nil && !folded ? rows : branched(rows, model: model)
    }

    /// The list's parts with a section let go moved where it was let go, until the read after its write draws it there.
    private static func moved(_ parts: [BoardPart], of list: BoardList, column: BoardColumn, model: BoardModel) -> [BoardPart] {
        guard let move = model.sectionMove, move.column == column, let index = list.groups.firstIndex(where: { $0.id == move.group }) else { return parts }
        var parts = parts.filter { $0 != .section(index) }
        let before = move.before.flatMap { id in list.groups.firstIndex { $0.id == id } }.flatMap { parts.firstIndex(of: .section($0)) }
        parts.insert(.section(index), at: before ?? parts.count)
        return parts
    }

    /// The branch lines of every row while the field or the plus's room stands in the list, or a carry folds rows away, as
    /// the core draws a subtask's over the levels of the rows as they stand.
    private static func branched(_ rows: [DrawnRow], model: BoardModel) -> [DrawnRow] {
        let levels = rows.compactMap(\.level)
        let branches = model.branches(levels: levels)
        var at = -1
        return rows.map { row in
            guard let level = row.level else { return row }
            at += 1
            let branch = level > 0 ? branches[safe: at] ?? nil : nil
            switch row {
            case .card(let card) where card.branch != branch:
                return .card(BoardCard(item: card.item, level: card.level, branch: branch, due: card.due, repeats: card.repeats, paint: card.paint, corner: card.corner, zone: card.zone, parts: card.parts))
            case .pending(let key, let text, _, _): return .pending(key: key, text: text, level: level, branch: branch)
            case .field(let id, _, _, let section): return .field(id: id, level: level, branch: branch, section: section)
            default: return row
            }
        }
    }

    func indexPath(of id: String) -> IndexPath? {
        source.indexPath(for: keys[id] ?? id)
    }

    // MARK: Scrolling

    private var foundSeen: String?
    private var movedSeen = 0

    /// The card the search led to comes into sight, and nothing more, as the plugin's `FoundCard`; the field stays in sight
    /// when it opens or moves.
    func follow(found: String?, moved: Int) {
        if found != foundSeen {
            foundSeen = found
            if let found, let path = indexPath(of: found) {
                collection.layoutIfNeeded()
                reveal(path, centred: true)
            }
        }
        if moved != movedSeen {
            movedSeen = moved
            reveal(field: ())
        }
    }

    private func reveal(field: Void) {
        guard let model, model.entry.lists[column] != nil else { return }
        let renaming = model.entry.state?.renaming?.id
        guard let id = renaming ?? model.entry.lineKeys[column]?.last ?? rows.first(where: { if case .field = $0 { true } else { false } })?.id,
              let path = indexPath(of: id) else { return }
        collection.layoutIfNeeded()
        reveal(path, centred: false)
    }

    /// A row whole between the list's soft top and the room the keyboard leaves stays; another comes into sight.
    private func reveal(_ path: IndexPath, centred: Bool) {
        guard let frame = collection.layoutAttributesForItem(at: path)?.frame else { return }
        let visible = collection.bounds.inset(by: UIEdgeInsets(top: SoftEdges.fade, left: 0, bottom: collection.contentInset.bottom + SoftEdges.fade, right: 0))
        guard !visible.contains(frame) else { return }
        collection.scrollToItem(at: path, at: centred ? .centeredVertically : .bottom, animated: true)
    }

    /// The keyboard's top at `top` on the screen: the part of the list it covers is room to scroll the last rows above it.
    func keyboard(_ top: CGFloat) {
        guard let window = host.window else { return }
        let frame = host.convert(host.bounds, to: window)
        let covered = min(frame.height, max(0, frame.maxY - max(frame.minY, top)))
        if collection.contentInset.bottom != covered { collection.contentInset.bottom = covered }
    }

    /// A row coming in unfolds from under the row before it, its own view carried down from there with the rows moving
    /// to make its room (`FoldingListLayout`).
    func collectionView(_ collectionView: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt path: IndexPath) {
        shows(cell, at: path)
        guard let layout = collectionView.collectionViewLayout as? FoldingListLayout, let rise = layout.takeUnfolding(path.item) else { return }
        // The cell's own frame and transform are the layout's, set again as it is laid out: its content is carried
        // instead, by an animation of its own that no layout pass resets.
        let unfold = CASpringAnimation(perceptualDuration: Self.unfold, bounce: 0)
        unfold.keyPath = "transform.translation.y"
        unfold.fromValue = rise
        unfold.toValue = 0
        unfold.duration = unfold.settlingDuration
        unfold.fillMode = .backwards
        cell.contentView.layer.add(unfold, forKey: "unfold")
        // Beneath the rows round it while it unfolds, the one it comes from above all.
        let beneath = CABasicAnimation(keyPath: "zPosition")
        beneath.fromValue = -1 - CGFloat(path.item) / 10_000
        beneath.toValue = beneath.fromValue
        beneath.duration = unfold.duration
        cell.layer.add(beneath, forKey: "beneath")
    }

    /// The collection's own time for rows moving in a change.
    static let unfold: TimeInterval = 0.35

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        host.edges()
    }

    // MARK: Lifting

    /// The long press that lifts a card or a section's header, after the settings' Long Press Delay.
    private let press = UILongPressGestureRecognizer()

    /// A press lifts only what may be lifted, and only while nothing else is carried or still landing.
    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === press, let model, model.drag.idle, model.entry.state == nil,
              let path = collection.indexPathForItem(at: press.location(in: collection)), let row = rows[safe: path.item] else { return recognizer !== press }
        switch row {
        case .card(let card): return model.canLift(card, from: column.rawValue)
        case .header(let group, _): return model.canLift(group, in: column)
        default: return false
        }
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        guard let model else { return }
        let point = press.location(in: nil)
        switch press.state {
        case .began:
            guard let window = host.window, let path = collection.indexPathForItem(at: press.location(in: collection)), let lift = lift(at: path, finger: point, in: window) else { return }
            model.drag.lift(lift, at: point, in: window)
        case .changed:
            model.drag.move(to: point)
        case .ended:
            model.drag.letGo(at: point)
        case .cancelled, .failed:
            model.drag.cancel()
        default:
            break
        }
    }

    /// What a press on the row at `path` lifts: the card itself as it is drawn, the picked tasks as a stack with their
    /// number, a section as the plugin's floating section (its name and count on two layers).
    private func lift(at path: IndexPath, finger: CGPoint, in window: UIWindow) -> Lift? {
        guard let model, let row = rows[safe: path.item], let cell = collection.cellForItem(at: path) else { return nil }
        let capsule = capsule(of: row, in: cell.bounds)
        let frame = cell.convert(capsule, to: nil)
        switch row {
        case .card(let card):
            let payload = DragPayload(.card(card), from: column.rawValue)
            payload.grab = finger.y - frame.minY
            payload.home = frame
            let count = model.picked.contains(card.id) && model.selecting ? model.picked.count : 1
            let copy: UIView
            var start = frame
            if count > 1, let stack = FloatImage.view(StackFloat(card: card, count: count, width: capsule.width), like: cell, in: window) {
                copy = stack
                start = CGRect(x: frame.minX - StackFloat.room, y: frame.minY - StackFloat.room, width: stack.bounds.width, height: stack.bounds.height)
            } else {
                copy = Self.image(of: cell.contentView, in: capsule)
            }
            let column = column.rawValue
            return Lift(payload: payload, copy: copy, frame: start, card: count == 1, begin: { model.startCarry(card, from: column) }) { [weak self] in
                self?.capsule(of: card.id) ?? payload.home
            }
        case .header(let group, let header):
            let payload = DragPayload(.section(group), from: column.rawValue)
            payload.home = frame
            let float = SectionFloat(name: header, count: group.cards.filter { $0.level == 0 }.count)
            guard let copy = FloatImage.view(float, like: cell, in: window) else { return nil }
            let start = CGRect(x: frame.minX, y: frame.midY - SectionFloat.height / 2, width: copy.bounds.width, height: copy.bounds.height)
            let column = column
            return Lift(payload: payload, copy: copy, frame: start, begin: { model.startSectionCarry(column, group) ?? 0 }) { [weak self] in
                self?.headerFrame(group) ?? payload.home
            }
        default:
            return nil
        }
    }

    /// The part `rect` of `view` as it is drawn now: the lifted card exactly as it stood.
    static func image(of view: UIView, in rect: CGRect) -> UIImageView {
        let format = UIGraphicsImageRendererFormat.preferred()
        format.opaque = false
        let image = UIGraphicsImageRenderer(bounds: rect, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
        }
        return UIImageView(image: image)
    }

    /// Where a row's capsule stands in its cell: below the room over it, at its depth, after the selection circle.
    func capsule(of row: DrawnRow, in bounds: CGRect) -> CGRect {
        let top = drawn[keys[row.id] ?? row.id]?.top ?? 0
        let height = row.heads ? ColumnMetrics.groupHead : CardMetrics.height
        var left = CGFloat(row.level ?? 0) * CardMetrics.indent
        if case .card = row, let model, model.selecting, model.canPick(column.rawValue) { left += CardRow.circleRoom }
        return CGRect(x: left, y: top, width: max(1, bounds.width - left), height: min(height, max(1, bounds.height - top)))
    }

    /// The capsule of the card `id` in the window, when the list draws it.
    func capsule(of id: String) -> CGRect? {
        guard let path = indexPath(of: id), let row = rows[safe: path.item], let frame = collection.layoutAttributesForItem(at: path)?.frame else { return nil }
        return collection.convert(capsule(of: row, in: CGRect(origin: .zero, size: frame.size)).offsetBy(dx: frame.minX, dy: frame.minY), to: nil)
    }

    /// The header of section `group` in the window, when the list draws it.
    private func headerFrame(_ group: BoardGroup) -> CGRect? {
        guard let path = indexPath(of: DrawnRow.header(group, "").id), let row = rows[safe: path.item], let frame = collection.layoutAttributesForItem(at: path)?.frame else { return nil }
        return collection.convert(capsule(of: row, in: CGRect(origin: .zero, size: frame.size)).offsetBy(dx: frame.minX, dy: frame.minY), to: nil)
    }

    /// Where a dropped card lands in this list as it is laid out now: its row, or the header of the folded project part it
    /// went into (decision 56).
    func landing(of landed: DropLanding) -> CarryLanding? {
        collection.layoutIfNeeded()
        if let capsule = capsule(of: landed.id) { return CarryLanding(rect: capsule) }
        guard let project = model?.foldedHeader(landed, in: column), let path = indexPath(of: DrawnRow.project(project).id),
              let frame = collection.layoutAttributesForItem(at: path)?.frame else { return nil }
        let header = CGRect(x: frame.minX, y: frame.maxY - ColumnMetrics.groupHead, width: frame.width, height: ColumnMetrics.groupHead)
        return CarryLanding(rect: collection.convert(header, to: nil), folds: true)
    }

    // A carry over the list, as the plugin's (approved, `docs/design/README.md`): no row moves under the finger; the
    // purple drop line stands where the task would go, from a dot at the left edge of the level it picks; a subtask's
    // place is the same line one level in; an empty section's plate lights instead. The carried card's own row stays as its
    // dashed place. Let go, the copy flies into its place and the rows open and close as the core's screen after the drop
    // says, in one animation. A section carried shows its room, a dashed card's room before the header it would go before.

    /// The place a carry over the list points at, and where its line stands in the collection: nil where an empty
    /// section's plate lights instead.
    private struct Aim {
        let place: JSONValue
        let line: CGPoint?
    }

    /// The place shown under the carry now.
    private var aimed: Aim?

    private static func carried(_ payload: DragPayload?) -> String? {
        if case .card(let card) = payload?.kind { card.id } else { nil }
    }

    /// The cards and headers a carry is placed among, where each stands in the collection now: the carried ones aside.
    private func standing(_ carried: String?) -> (cards: [(card: BoardCard, rect: CGRect)], heads: [(head: PlacedHead, part: (group: String?, zone: JSONValue?), rect: CGRect)]) {
        var cards: [(card: BoardCard, rect: CGRect)] = []
        var heads: [(head: PlacedHead, part: (group: String?, zone: JSONValue?), rect: CGRect)] = []
        let listed = model?.snapshot?.lists[column]?.cards ?? []
        for (index, row) in rows.enumerated() {
            guard let frame = collection.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame else { continue }
            let top = frame.minY + (drawn[keys[row.id] ?? row.id]?.top ?? 0)
            switch row {
            case .card(let card) where card.id != carried && model?.isCarried(card) != true:
                cards.append((card, CGRect(x: frame.minX, y: top, width: frame.width, height: CardMetrics.height)))
            case .field(let id, _, _, _):
                // A card being renamed stands in the list as its field: to the core's places it is still that card.
                if let card = listed.first(where: { $0.id == id }) { cards.append((card, CGRect(x: frame.minX, y: top, width: frame.width, height: CardMetrics.height))) }
            case .header(let group, _):
                let rect = CGRect(x: frame.minX, y: top, width: frame.width, height: ColumnMetrics.groupHead)
                heads.append((PlacedHead(group: group.place, firstCard: cards.count, top: Double(rect.minY), height: Double(rect.height)), (group.name, group.zone), rect))
            case .project(let project):
                let rect = CGRect(x: frame.minX, y: top, width: frame.width, height: ColumnMetrics.groupHead)
                heads.append((PlacedHead(group: project.head, opens: true, firstCard: cards.count, top: Double(rect.minY), height: Double(rect.height)), (nil, project.zone), rect))
            default:
                break
            }
        }
        return (cards, heads)
    }

    /// Where a carry at `point` (in the collection) points, the rows standing still: the core's place, and its line.
    private func aim(at point: CGPoint, carrying payload: DragPayload?) -> Aim? {
        guard let model else { return nil }
        let carried = Self.carried(payload)
        let (cards, heads) = standing(carried)
        let placed = cards.map { PlacedCard(level: $0.card.level, group: $0.card.item.group, zone: $0.card.zone, top: Double($0.rect.minY), height: Double($0.rect.height)) }
        guard let place = model.placeUnder(column, cards: placed, heads: heads.map(\.head), at: point, grab: payload.map(\.grab), width: collection.bounds.width, held: aimed?.place) else { return nil }
        let shown = model.hoverList(column, place: place)
        guard !shown.plate else { return Aim(place: place, line: nil) }
        let level = CGFloat(place["level"].number ?? 0)
        let x = CardMetrics.columnInset + level * CardMetrics.indent
        // The card's own place: the line at its dashed place's top.
        if shown.stays, let carried, let home = indexPath(of: carried), let frame = collection.layoutAttributesForItem(at: home)?.frame {
            let top = frame.minY + (drawn[keys[carried] ?? carried]?.top ?? 0)
            return Aim(place: place, line: CGPoint(x: x, y: top - CardMetrics.gap / 2))
        }
        let at = Int(place["index"].number ?? 0)
        let group = place["group"].string, zone = place.field("project")
        let inPart = { (card: BoardCard) in card.stands(in: group, zone: zone) }
        if let next = cards[safe: at], inPart(next.card) {
            return Aim(place: place, line: CGPoint(x: x, y: next.rect.minY - CardMetrics.gap / 2))
        }
        let above = cards.prefix(at).last { inPart($0.card) }?.rect
        let head = heads.last { $0.head.firstCard <= at && $0.part.group == group && $0.part.zone == zone }?.rect
            ?? heads.last { $0.head.firstCard <= at && $0.head.opens && $0.part.zone == zone }?.rect
        guard let over = above ?? head else { return Aim(place: place, line: nil) }
        return Aim(place: place, line: CGPoint(x: x, y: over.maxY + CardMetrics.gap / 2))
    }

    /// The carry held at `point` (in the collection): the place under it, its line drawn over everything, the carried copy
    /// too.
    private func hold(at point: CGPoint, carrying payload: DragPayload?) {
        guard let next = aim(at: point, carrying: payload) else { return clearAim() }
        aimed = next
        guard let line = next.line, let window = collection.window else { return model?.drag.hideLine() ?? () }
        let start = collection.convert(line, to: window)
        let end = collection.convert(CGPoint(x: collection.bounds.width - CardMetrics.columnInset, y: line.y), to: window).x
        model?.drag.showLine(from: start, to: end)
        DropLog.target("list \(column.rawValue) \(next.place)")
    }

    private func clearAim() {
        aimed = nil
        model?.drag.hideLine()
        model?.leaveList(column)
    }

    /// A copy landing in a folded project part shrinks to this share of its size into the part's header: nothing of the
    /// part is drawn to land in, so it goes into the header as into a folder (decision 56).
    static let foldedLanding: CGFloat = 0.3

    // MARK: A carry routed here by the board (the plus, or a card over the bars)

    /// The room a carried section opens before the header it would go before: the only row that moves under a carry.
    private var plusRoom: Int?

    func takes(_ payload: DragPayload?) -> Bool {
        guard let payload, payload.isSection else { return true }
        return payload.from == column.rawValue
    }

    var scrolls: UIScrollView? { collection }

    var area: CGRect? {
        guard let window = host.window else { return nil }
        // The title over the list takes the carry too: it is the list's first place.
        let frame = host.convert(host.bounds, to: window)
        return CGRect(x: frame.minX, y: frame.minY - ColumnMetrics.titleRow - ColumnMetrics.headGap, width: frame.width, height: frame.height + ColumnMetrics.titleRow + ColumnMetrics.headGap)
    }

    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        let local = collection.convert(point, from: nil)
        if let payload, case .section(let group) = payload.kind { return hoverSection(group, at: local) }
        hold(at: local, carrying: payload)
    }

    func leave() {
        clearAim()
        sectionSlot = nil
        guard plusRoom != nil else { return }
        plusRoom = nil
        update()
    }

    /// The section's slot: before the header nearest under the finger, or the list's end; the room stands there.
    private var sectionSlot: Int?

    private func hoverSection(_ group: BoardGroup, at local: CGPoint) {
        let heads = rows.enumerated().compactMap { index, row -> (row: Int, group: Int?, y: CGFloat)? in
            guard case .header(let other, _) = row, other.id != group.id, let frame = collection.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame else { return nil }
            return (index, model?.snapshot?.lists[column]?.groups.firstIndex { $0.id == other.id }, frame.midY)
        }
        let before = heads.first { $0.y > local.y }
        let slot = before?.group ?? model?.snapshot?.lists[column]?.groups.count
        guard slot != sectionSlot else { return }
        sectionSlot = slot
        UISelectionFeedbackGenerator().selectionChanged()
        let lifted = DrawnRow.header(group, "").id
        let shown = rows.filter { $0 != .plusRoom && $0.id != lifted }
        let gap = before.flatMap { head in rows[safe: head.row].flatMap { row in shown.firstIndex(of: row) } } ?? shown.count
        plusRoom = gap
        update()
        DropLog.target("section \(column.rawValue) slot \(slot ?? -1)")
    }

    /// Let go: the plus opens its field at the place shown; a card is dropped there; a section goes to its slot. Where it
    /// lands, in the window, the list laid out anew in the animation this is called in.
    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        if let payload, case .section(let group) = payload.kind {
            let slot = sectionSlot
            sectionSlot = nil
            plusRoom = nil
            model?.dropSection(column, group, slot: slot.flatMap { $0 < (model?.snapshot?.lists[column]?.groups.count ?? 0) ? $0 : nil })
            update()
            collection.layoutIfNeeded()
            return headerFrame(group).map { CarryLanding(rect: $0) }
        }
        guard let model, let shown = aimed else { return nil }
        let line = shown.line
        guard payload != nil else {
            clearAim()
            model.openPlus(column, place: shown.place)
            // The plus becomes the field where the line stood.
            return line.map { CGRect(x: $0.x, y: $0.y + CardMetrics.gap / 2, width: collection.bounds.width - CardMetrics.columnInset - $0.x, height: CardMetrics.height) }
                .map { CarryLanding(rect: collection.convert($0, to: nil), opens: true) }
        }
        clearAim()
        switch model.dropOnList(column, place: shown.place) {
        case .landed(let landed):
            return landed.flatMap { landing(of: $0) }
        case .stays, .refused:
            return nil
        }
    }
}

/// The list's layout, whose rows come and go as a folder's do: a row that comes slides out from under the row before it
/// (a subtask from its parent, a task from the one above) while the rows after it move down to make its room, and a row
/// that goes slides back under the row before it while the rows after it close over it. Nothing fades in place under rows
/// sliding past it, and no two rows cross: the ones coming and going stay beneath the rest, each under the one before.
/// A row under no card (the first, or one after a header) fades instead, where it stands.
final class FoldingListLayout: UICollectionViewCompositionalLayout {
    /// The rows, before and after the change, that cover a row folding under them (`ListController.covering`).
    var covers: (before: Set<Int>, after: Set<Int>) = ([], [])
    private var inserted: Set<Int> = []
    private var deleted: Set<Int> = []
    /// Where the rows stood before the change, by their index then.
    private var before: [Int: CGRect] = [:]

    override func prepare() {
        // The layout as it stood, read before it is laid out anew: a row going folds under the row that stood before it.
        if let view = collectionView, !view.bounds.isEmpty {
            let shown = layoutAttributesForElements(in: view.bounds.insetBy(dx: 0, dy: -view.bounds.height)) ?? []
            before = Dictionary(shown.filter { $0.representedElementCategory == .cell }.map { ($0.indexPath.item, $0.frame) }, uniquingKeysWith: { first, _ in first })
        }
        super.prepare()
    }

    override func prepare(forCollectionViewUpdates updateItems: [UICollectionViewUpdateItem]) {
        super.prepare(forCollectionViewUpdates: updateItems)
        inserted = Set(updateItems.compactMap { $0.updateAction == .insert ? $0.indexPathAfterUpdate?.item : nil })
        deleted = Set(updateItems.compactMap { $0.updateAction == .delete ? $0.indexPathBeforeUpdate?.item : nil })
    }

    override func finalizeCollectionViewUpdates() {
        super.finalizeCollectionViewUpdates()
        unfolding = [:]
        inserted = []
        deleted = []
    }

    /// How far above its place each row coming in starts, hidden under the row before it, by its index: the collection
    /// lays a list's coming row out at its own measured size, so the row's own view carries this start
    /// (`ListController.willDisplay`) rather than the layout's first frame, which its measuring overrides.
    private(set) var unfolding: [Int: CGFloat] = [:]

    func takeUnfolding(_ item: Int) -> CGFloat? {
        unfolding.removeValue(forKey: item)
    }

    override func initialLayoutAttributesForAppearingItem(at path: IndexPath) -> UICollectionViewLayoutAttributes? {
        guard inserted.contains(path.item), let shown = layoutAttributesForItem(at: path)?.copy() as? UICollectionViewLayoutAttributes else {
            return super.initialLayoutAttributesForAppearingItem(at: path)
        }
        var anchor = path.item - 1
        while anchor >= 0, inserted.contains(anchor) { anchor -= 1 }
        guard anchor >= 0, covers.after.contains(anchor), let over = layoutAttributesForItem(at: IndexPath(item: anchor, section: path.section)) else {
            shown.alpha = 0
            return shown
        }
        unfolding[path.item] = over.frame.maxY - shown.frame.maxY
        shown.zIndex = anchor - path.item
        // Fading in as it slides out: where the row above is narrower (a subtask's), what of it shows beside that row
        // comes in softly rather than sliding in whole.
        shown.alpha = 0
        return shown
    }

    override func finalLayoutAttributesForDisappearingItem(at path: IndexPath) -> UICollectionViewLayoutAttributes? {
        guard deleted.contains(path.item), let gone = super.finalLayoutAttributesForDisappearingItem(at: path)?.copy() as? UICollectionViewLayoutAttributes,
              let stood = before[path.item] else {
            return super.finalLayoutAttributesForDisappearingItem(at: path)
        }
        gone.frame = stood
        var anchor = path.item - 1
        while anchor >= 0, deleted.contains(anchor) { anchor -= 1 }
        guard anchor >= 0, covers.before.contains(anchor), let over = before[anchor] else {
            gone.alpha = 0
            return gone
        }
        gone.frame.origin.y = over.maxY - stood.height
        gone.zIndex = anchor - path.item
        // Fading as it slides under: where the row above is narrower (a subtask's), what of it shows beside that row
        // goes softly rather than sliding past it.
        gone.alpha = 0
        return gone
    }
}

/// One row of a list, drawn by SwiftUI in the collection's cell, the room above it included.
struct ListRowContent: View {
    let row: DrawnRow
    let top: CGFloat
    let column: BoardColumn
    @Bindable var model: BoardModel

    var body: some View {
        content
            .padding(.top, top)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        switch row {
        case .header(let group, let header):
            // Lifted, the section is its floating copy: its header keeps its place but is not drawn twice (the list hides
            // its row, `ListController.showHeaders`).
            SectionHeader(title: header, group: group, column: column, model: model)
        case .project(let project):
            ProjectHeader(project: project, column: column, model: model)
        case .newHead(let name):
            SectionTitle(title: name, muted: false)
        case .plate(let group):
            EmptyPlate(hot: model.platesLit(column, group)) { model.entry.openIn(column, group.name, zone: group.zone) }
        case .card(let card):
            CardRow(card: card, column: column, model: model)
        case .pending(_, let text, let level, let branch):
            EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
        case .field(_, let level, let branch, let section):
            EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry, section: section) }
        case .plusRoom:
            // Where a carried section would go (`.tc-group-drop`): a dashed card's room before a header or at the end.
            DashedPlace().frame(height: CardMetrics.height).accessibilityHidden(true)
        }
    }
}

extension UIView {
    /// The first responder, when it is this view or one inside it.
    var firstResponderInside: UIView? {
        if isFirstResponder { return self }
        for view in subviews { if let found = view.firstResponderInside { return found } }
        return nil
    }
}

/// A row typed in, at its depth with its branch.
struct EntryRow<Content: View>: View {
    let level: Int
    let branch: Branch?
    @ViewBuilder let content: Content

    var body: some View {
        content
            .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }
}

/// The resolved target of a carry, told to the log in a DEBUG build (`category: drop`): a sweep over the board shows a
/// place everywhere.
enum DropLog {
    private static let log = Logger(subsystem: "com.kudrmax.taskcalendar", category: "drop")

    static func target(_ words: @autoclosure () -> String) {
        #if DEBUG
        let text = words()
        log.notice("DROP target \(text, privacy: .public)")
        #endif
    }
}
