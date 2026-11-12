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
        /// A project lifted in the Projects page's tree.
        case project(ProjectsRow)
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

    var isProject: Bool {
        if case .project = kind { true } else { false }
    }
}

/// A row of a list as drawn: a section's header or its No tasks plate, a card, a text typed and not written yet, the field
/// it is typed in, or the room the plus held over the list opens.
enum DrawnRow: Hashable {
    case header(BoardGroup, String)
    case plate(BoardGroup)
    case card(BoardCard)
    case pending(key: String, text: String, level: Int, branch: Branch?)
    /// The field, in the row of the card it renames (by that card's id) or a row of its own.
    case field(id: String, level: Int, branch: Branch?, section: Bool)
    /// Where the plus carried over the list would open its field.
    case plusRoom
    /// The No tasks plate of a list that draws no card, with the core's words (`ViewChoice.plates`): under a filter and in
    /// Rows.
    case vacant(String)

    var id: String {
        switch self {
        case .header(let group, _): "\u{0}head/\(group.id)"
        case .plate(let group): "\u{0}plate/\(group.id)"
        case .card(let card): card.id
        case .pending(let key, _, _, _): key
        case .field(let id, _, _, _): id
        case .plusRoom: "\u{0}plus"
        case .vacant: "\u{0}vacant"
        }
    }

    /// The depth of a row that stands among the cards.
    var level: Int? {
        switch self {
        case .card(let card): card.level
        case .pending(_, _, let level, _), .field(_, let level, _, _): level
        case .header, .plate, .plusRoom, .vacant: nil
        }
    }

    /// A header of some kind: it stands a section's gap below the row before it, and the row after it on its bottom.
    var heads: Bool {
        switch self {
        case .header: true
        default: false
        }
    }

    /// The row's own height, as its content draws it: fixed for everything but a text being typed, which grows with its
    /// lines. The list lays a fixed row out at this height without measuring its content.
    var height: CGFloat? {
        switch self {
        case .header: ColumnMetrics.groupHead
        case .card(let card): card.listHeight
        case .plate, .plusRoom, .vacant: CardMetrics.height
        case .pending, .field: nil
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
    /// One of the Rows view's stacked lists, as tall as the stack gives it (`rules.stackedLists`).
    var stacked = false
    /// Mounted but not shown (the ribbon while another view shows): it takes no carry and draws nothing until it shows.
    var dormant = false

    func makeCoordinator() -> ListController { ListController(column: column, model: model) }

    func makeUIView(context: Context) -> ListHostView {
        context.coordinator.host
    }

    func updateUIView(_ host: ListHostView, context: Context) {
        let controller = context.coordinator
        // Read here so the list follows them: the screen, the entry's rows, the keyboard. A carry's rows folding away and
        // back are drawn by the model as the carry changes (`BoardModel.markCards`), never through the board's own
        // drawing, so a carry lifted or let go redraws the lists alone.
        _ = model.snapshot?.lists[column]
        _ = model.entry.lists[column.rawValue]
        _ = model.entry.lineKeys[column.rawValue]
        _ = model.entry.state?.renaming?.id
        _ = model.entry.heirs
        controller.host.stacked = stacked
        controller.dormant = dormant
        controller.update()
        controller.keyboard(KeyboardRise.shared.top)
        controller.follow(found: model.found, moved: model.entry.moved)
    }
}

/// A list's cell: a row of a known height is laid out at it, its content never measured, so a change of the list (a drop,
/// a carry folding rows away) lays out only what moved; a row that grows with its text is measured as the system does.
final class RowCell: UICollectionViewCell {
    var height: CGFloat?

    override func preferredLayoutAttributesFitting(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        guard let height else { return super.preferredLayoutAttributesFitting(attributes) }
        #if DEBUG
        let measured = super.preferredLayoutAttributesFitting(attributes.copy() as! UICollectionViewLayoutAttributes).size.height
        if abs(measured - height) > 0.5 { ListHeights.mismatch(measured: measured, known: height) }
        #endif
        let fitted = attributes.copy() as! UICollectionViewLayoutAttributes
        fitted.size.height = height
        return fitted
    }
}

/// A DEBUG build's check that a row's known height is what its content draws, told to the log (`category: drop`).
enum ListHeights {
    private static let log = Logger(subsystem: "com.kudrmax.taskcalendar", category: "drop")

    static func mismatch(measured: CGFloat, known: CGFloat) {
        log.fault("ROW HEIGHT measured \(measured) known \(known)")
    }
}

/// The list's own view: the collection, softly faded at an edge it scrolls past (as the plugin's lists), half a card high.
final class ListHostView: UIView {
    let collection: UICollectionView
    private let fade = CAGradientLayer()

    init(collection: UICollectionView, room: TrailingRoom) {
        self.collection = collection
        self.room = room
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
            MainActor.assumeIsolated {
                self?.holdStacked()
                self?.edges()
            }
        }
    }

    private var sized: NSKeyValueObservation?
    /// The room after the last row, so a column's last card scrolls clear of the tab bar and the keyboard; none in a
    /// stacked list, which ends at its last row (the keyboard's part is its content inset, `keyboard(_:)`).
    let room: TrailingRoom
    /// A stacked list of the Rows view: while all its rows fit its height it never scrolls, so no carry or earlier scroll
    /// leaves its rows standing above its top; when they don't, it scrolls no further than its last row.
    var stacked = false {
        didSet {
            guard stacked != oldValue else { return }
            room.points = stacked ? 0 : ListCollection.trailingRoom
            collection.collectionViewLayout.invalidateLayout()
            setNeedsLayout()
        }
    }

    private func holdStacked() {
        guard stacked else {
            if !collection.isScrollEnabled { collection.isScrollEnabled = true }
            return
        }
        let rows = max(0, collection.contentSize.height - room.points)
        let fits = rows <= bounds.height + 0.5
        if collection.isScrollEnabled == fits { collection.isScrollEnabled = !fits }
        let most = fits ? 0 : rows - bounds.height
        let top = -collection.adjustedContentInset.top
        let offset = min(max(collection.contentOffset.y, top), top + most)
        if abs(offset - collection.contentOffset.y) > 0.5 { collection.contentOffset.y = offset }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        holdStacked()
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
        let below = collection.contentSize.height + collection.adjustedContentInset.bottom - room.points - collection.contentOffset.y - bounds.height
        let top = min(most, max(0, above)) / height
        let bottom = min(most, max(0, below)) / height
        fade.locations = [0, NSNumber(value: Double(top)), NSNumber(value: Double(1 - bottom)), 1]
        CATransaction.commit()
    }
}

extension ListCollection {
    /// Room after a column's last row, so the last card scrolls clear of the tab bar.
    static let trailingRoom: CGFloat = 160
}

/// The room after a list's last row, read by its layout each time it lays the section out.
@MainActor
final class TrailingRoom {
    var points = ListCollection.trailingRoom
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
    /// The view's context the rows drawn were read in (`BoardModel.listsContext`): rows of another one come in still.
    private var context: String?
    /// Stale while dormant: drawn anew, still, when it shows again.
    private var stale = false

    /// Mounted but not shown: it takes no carry and draws the screen only once it shows again, still.
    var dormant = false {
        didSet {
            guard dormant != oldValue, !dormant, stale else { return }
            stale = false
            context = nil
            update(force: true)
        }
    }

    init(column: BoardColumn, model: BoardModel) {
        self.column = column
        self.model = model
        var list = UICollectionLayoutListConfiguration(appearance: .plain)
        list.showsSeparators = false
        list.backgroundColor = .clear
        let room = TrailingRoom()
        let layout = FoldingListLayout { _, environment in
            let section = NSCollectionLayoutSection.list(using: list, layoutEnvironment: environment)
            section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: CardMetrics.columnInset, bottom: room.points, trailing: CardMetrics.columnInset)
            return section
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.backgroundColor = .clear
        collection.showsVerticalScrollIndicator = false
        collection.contentInsetAdjustmentBehavior = .never
        collection.keyboardDismissMode = .none
        host = ListHostView(collection: collection, room: room)
        super.init()
        let cell = UICollectionView.CellRegistration<RowCell, String> { [weak self] cell, _, id in
            guard let self, let model = self.model, let drawn = self.drawn[id] else { return }
            let column = self.column
            cell.height = drawn.row.height.map { $0 + drawn.top }
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
        press.minimumPressDuration = CarryMotion.liftDelay
        collection.addGestureRecognizer(press)
        model.register(self)
    }

    // MARK: The rows

    /// The list drawn anew from the model: rows come, go and move with the system's own animation; a row whose content
    /// changed is drawn again in place. Another day comes in still: it slid in through the day's own motion.
    func update(force: Bool = false) {
        guard let model else { return }
        guard !dormant else {
            stale = true
            return
        }
        // A card's menu going: the list draws the new screen once the card is back in its row; a card renamed from it
        // turns into its field at once, in its own row, the preview landing on it. A carry lifted meanwhile is drawn at
        // once: its drop lands on the rows as they are, never on the screen the menu holds.
        guard !MenuHold.holding || model.entry.state?.renaming != nil || model.carry != nil else {
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
        let shownDay = model.drawing?.day
        guard force || ids != shownIds || !changed.isEmpty else { return }
        let gone = Set(shownIds).subtracting(ids)
        // Only rows drawn anew in place (a card turning into its field, a title written): drawn at once, never cross-faded.
        let animated = day == shownDay && context == model.listsContext && host.window != nil && ids != shownIds
        shownIds = ids
        day = shownDay
        context = model.listsContext
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
        // Rows moving now are moved now; the rows only drawn anew (a card's line in the file, its branch) are drawn in the
        // next frame, so a drop's frame lays the rows out without drawing them all again.
        let later = animated ? changed : []
        snapshot.reconfigureItems(animated ? [] : changed)
        source.apply(snapshot, animatingDifferences: animated)
        if !later.isEmpty {
            NextFrame.run { [weak self] in
                guard let self else { return }
                var next = self.source.snapshot()
                let still = later.filter { next.indexOfItem($0) != nil }
                guard !still.isEmpty else { return }
                next.reconfigureItems(still)
                self.source.apply(next, animatingDifferences: false)
            }
        }
        rowsVersion += 1
        showHeaders()
    }

    /// The rows of the cards `ids` on the screen drawn anew at once, in place, from the model as it stands now (the carry
    /// ended: a dashed place goes, a card the copy landed as shows); no other row is touched.
    func redraw(_ ids: Set<String>) {
        let shown = collection.indexPathsForVisibleItems.compactMap { path -> String? in
            guard let row = rows[safe: path.item], case .card(let card) = row, ids.contains(card.id) else { return nil }
            return source.itemIdentifier(for: path)
        }
        if !shown.isEmpty {
            var snapshot = source.snapshot()
            snapshot.reconfigureItems(shown)
            source.apply(snapshot, animatingDifferences: false)
            collection.layoutIfNeeded()
        }
        // Rows the carry folded away (a card's subtasks, a section's tasks) come back in their own motion.
        update()
    }

    /// Each header drawn shows, but the one of a carried section, whose floating copy stands for it until it is down: set
    /// on the row itself, so it shows in the very frame the copy goes. `all`: the carry's copy is down, every header shows.
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
        guard let list = model.drawing?.lists[column] else { return [] }
        let entry = model.entry.lists[column.rawValue]
        let renaming = model.entry.state?.renaming?.id
        var typed: [DrawnRow] = []
        if let entry {
            let keys = model.entry.lineKeys[column.rawValue] ?? []
            typed = entry.pending.enumerated().map { .pending(key: keys[safe: $0.offset] ?? "\u{0}line/\($0.offset)", text: $0.element.text, level: $0.element.level, branch: nil) }
            // A card renamed gives its row to the field: the same row, its content now typed in, so nothing comes or goes.
            typed.append(.field(id: renaming ?? keys.last ?? "\u{0}field", level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
        }
        var rows: [DrawnRow] = []
        if entry?.at.kind == "top" { rows += typed }
        for index in moved(of: list, column: column, model: model) {
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
        if rows.isEmpty, let words = model.drawing?.funnel.view.plate(column.rawValue) { rows.append(.vacant(words)) }
        let folded = list.cards.contains { model.isFolded($0) }
        return entry == nil && plusRoom == nil && !folded ? rows : branched(rows, model: model)
    }

    /// The list's sections in drawing order, a section let go moved where it was let go, until the read after its write
    /// draws it there.
    private static func moved(of list: BoardList, column: BoardColumn, model: BoardModel) -> [Int] {
        var order = Array(list.groups.indices)
        guard let move = model.sectionMove, move.column == column, let index = list.groups.firstIndex(where: { $0.id == move.group }) else { return order }
        order.removeAll { $0 == index }
        let before = move.before.flatMap { id in list.groups.firstIndex { $0.id == id } }.flatMap { order.firstIndex(of: $0) }
        order.insert(index, at: before ?? order.count)
        return order
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
                return .card(BoardCard(item: card.item, level: card.level, branch: branch, due: card.due, repeats: card.repeats, paint: card.paint, corner: card.corner, parts: card.parts, face: card.face))
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
            // A stacked list grows with its field in this same drawing: the field is brought into sight once that is laid
            // out, so a list that grew to hold it never scrolls first and then snaps back.
            if host.stacked {
                DispatchQueue.main.async { [weak self] in self?.reveal(field: ()) }
            } else {
                reveal(field: ())
            }
        }
    }

    private func reveal(field: Void) {
        guard let model, model.entry.lists[column.rawValue] != nil else { return }
        let renaming = model.entry.state?.renaming?.id
        guard let id = renaming ?? model.entry.lineKeys[column.rawValue]?.last ?? rows.first(where: { if case .field = $0 { true } else { false } })?.id,
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
        cover(top)
        // A stacked list rises over the keyboard in the same drawing: its place is read again once that is laid out.
        if host.stacked { DispatchQueue.main.async { [weak self] in self?.cover(KeyboardRise.shared.top) } }
    }

    private func cover(_ top: CGFloat) {
        guard let window = host.window else { return }
        let frame = host.convert(host.bounds, to: window)
        let covered = min(frame.height, max(0, frame.maxY - max(frame.minY, top)))
        guard collection.contentInset.bottom != covered else { return }
        collection.contentInset.bottom = covered
        host.edges()
    }

    /// A row coming in unfolds from under the row before it, its own view carried down from there with the rows moving
    /// to make its room (`FoldingListLayout`).
    func collectionView(_ collectionView: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt path: IndexPath) {
        shows(cell, at: path)
        guard let layout = collectionView.collectionViewLayout as? FoldingListLayout, let rise = layout.takeUnfolding(path.item) else { return }
        // The cell's own frame and transform are the layout's, set again as it is laid out: its content is carried
        // instead, by an animation of its own that no layout pass resets, on the drop's one spring, so a row coming in
        // with a drop comes to rest with the copy.
        let unfold = CarryMotion.layerSpring("transform.translation.y")
        unfold.fromValue = rise
        unfold.toValue = 0
        unfold.fillMode = .backwards
        cell.contentView.layer.add(unfold, forKey: "unfold")
        // Beneath the rows round it while it unfolds, the one it comes from above all.
        let beneath = CABasicAnimation(keyPath: "zPosition")
        beneath.fromValue = -1 - CGFloat(path.item) / 10_000
        beneath.toValue = beneath.fromValue
        beneath.duration = unfold.duration
        cell.layer.add(beneath, forKey: "beneath")
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        host.edges()
    }

    // MARK: Lifting

    /// The long press that lifts a card or a section's header, after the settings' Long Press Delay.
    private let press = UILongPressGestureRecognizer()

    /// A press lifts only what may be lifted now: the board's one rule (`BoardModel.mayLift`), the calendar's too.
    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === press else { return true }
        guard let model, let path = collection.indexPathForItem(at: press.location(in: collection)), let row = rows[safe: path.item] else { return false }
        switch row {
        case .card(let card): return model.mayLift(card, from: column.rawValue)
        case .header(let group, _): return model.mayLift(group, in: column)
        default: return false
        }
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        guard let model else { return }
        let point = press.firstFinger
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
        let height = row.height ?? CardMetrics.height
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

    /// Where a dropped card lands in this list as it is laid out now: its row.
    /// What of the screen the list shows, in the window: a row outside it is not seen.
    var shown: CGRect? {
        guard let window = host.window else { return nil }
        return host.convert(host.bounds, to: window).intersection(window.bounds)
    }

    func landing(of landed: DropLanding) -> CarryLanding? {
        collection.layoutIfNeeded()
        return capsule(of: landed.id).map { CarryLanding(rect: $0) }
    }

    // A carry over the list, as the plugin's (approved, `docs/design/README.md`): no row moves under the finger; the
    // purple drop line stands where the task would go, from a dot at the left edge of the level it picks; a subtask's
    // place is the same line one level in; an empty section's plate lights instead; over the card's own place no line, its
    // dashed place shows it. A list that places nothing in a gap (`rules.placesInGap`) shows its end. Let go, the copy
    // flies into its place and the rows open and close as the core's screen after the drop says, in one animation. A
    // section carried shows its room, a dashed card's room before the header it would go before.

    /// The place a carry over the list points at, what it shows and writes, and where its line stands in the collection:
    /// nil at the card's own place or where an empty section's plate lights.
    private struct Aim {
        let place: JSONValue
        let line: CGPoint?
        let shown: BoardModel.Aim
        /// What the rows were read over.
        let over: StandingKey
    }

    /// The place shown under the carry now.
    private var aimed: Aim?

    private static func carried(_ payload: DragPayload?) -> String? {
        if case .card(let card) = payload?.kind { card.id } else { nil }
    }

    /// The cards and headers a carry is placed among, where each stands in the collection, the carried ones aside: read
    /// once for a layout of the rows, not on every move of the finger.
    private struct Standing {
        let key: StandingKey
        let cards: [(card: BoardCard, rect: CGRect)]
        let heads: [(head: PlacedHead, group: String?, rect: CGRect)]
        let placed: [PlacedCard]
    }

    private struct StandingKey: Equatable {
        let layout: Int
        let rows: Int
        let carried: String?
        let along: Int
    }

    private var standingRead: Standing?
    /// Counts the rows drawn: the standing read before is stale after.
    private var rowsVersion = 0

    private func standing(_ carried: String?) -> Standing {
        collection.layoutIfNeeded()
        let key = StandingKey(layout: (collection.collectionViewLayout as? FoldingListLayout)?.generation ?? 0, rows: rowsVersion, carried: carried, along: model?.carry?.group.count ?? 0)
        if let standingRead, standingRead.key == key { return standingRead }
        var cards: [(card: BoardCard, rect: CGRect)] = []
        var heads: [(head: PlacedHead, group: String?, rect: CGRect)] = []
        let listed = model?.drawing?.lists[column]?.cards ?? []
        for (index, row) in rows.enumerated() {
            guard let frame = collection.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame else { continue }
            let top = frame.minY + (drawn[keys[row.id] ?? row.id]?.top ?? 0)
            switch row {
            case .card(let card) where card.id != carried && model?.isCarried(card) != true:
                cards.append((card, CGRect(x: frame.minX, y: top, width: frame.width, height: card.listHeight)))
            case .field(let id, _, _, _):
                // A card being renamed stands in the list as its field: to the core's places it is still that card.
                if let card = listed.first(where: { $0.id == id }) { cards.append((card, CGRect(x: frame.minX, y: top, width: frame.width, height: CardMetrics.height))) }
            case .header(let group, _):
                let rect = CGRect(x: frame.minX, y: top, width: frame.width, height: ColumnMetrics.groupHead)
                heads.append((PlacedHead(group: group.place, firstCard: cards.count, top: Double(rect.minY), height: Double(rect.height)), group.name, rect))
            default:
                break
            }
        }
        let placed = cards.map { PlacedCard(level: $0.card.level, group: $0.card.item.group, top: Double($0.rect.minY), height: Double($0.rect.height)) }
        let read = Standing(key: key, cards: cards, heads: heads, placed: placed)
        standingRead = read
        return read
    }

    /// Where a carry at `point` (in the collection) points, the rows standing still: the core's place, and its line. A list
    /// that places nothing in a gap takes the carry at its end, wherever the finger is in it, as the plugin's.
    private func aim(at point: CGPoint, carrying payload: DragPayload?) -> Aim? {
        guard let model else { return nil }
        let carried = Self.carried(payload)
        let standing = standing(carried)
        let anywhere = model.placesInGap(column, carrying: payload)
        let place: JSONValue
        if anywhere {
            guard let under = model.placeUnder(column, cards: standing.placed, heads: standing.heads.map(\.head), at: point, grab: payload.map(\.grab), width: collection.bounds.width, held: aimed?.place) else { return nil }
            place = under
        } else {
            place = ["kind": "gap", "index": .number(Double(standing.cards.count)), "level": 0, "group": .null]
        }
        // The same place over the same rows: what it shows was asked already.
        if let aimed, aimed.place == place, aimed.over == standing.key { return aimed }
        let shown = model.hoverList(column, place: place, anywhere: anywhere)
        return Aim(place: place, line: line(at: place, shown: shown, among: standing, carried: carried), shown: shown, over: standing.key)
    }

    /// The drop line of `place`: through the middle of the gap, from the left edge of its level; none at the card's own
    /// place or over a lit plate. A card moved to another level where it stood has it in the gap over its dashed place.
    private func line(at place: JSONValue, shown: BoardModel.Aim, among standing: Standing, carried: String?) -> CGPoint? {
        guard let model, !shown.plate, !shown.stays else { return nil }
        let level = CGFloat(place["level"].number ?? 0)
        let x = CardMetrics.columnInset + level * CardMetrics.indent
        if let carried, model.isLiftedGap(column, place), let home = indexPath(of: carried), let frame = collection.layoutAttributesForItem(at: home)?.frame {
            let top = frame.minY + (drawn[keys[carried] ?? carried]?.top ?? 0)
            return CGPoint(x: x, y: top - CardMetrics.gap / 2)
        }
        let at = Int(place["index"].number ?? 0)
        let group = place["group"].string
        let inPart = { (card: BoardCard) in card.stands(in: group) }
        let cards = standing.cards, heads = standing.heads
        if let next = cards[safe: at], inPart(next.card) {
            return CGPoint(x: x, y: next.rect.minY - CardMetrics.gap / 2)
        }
        let above = cards.prefix(at).last { inPart($0.card) }?.rect
        let head = heads.last { $0.head.firstCard <= at && $0.group == group }?.rect
        if let over = above ?? head { return CGPoint(x: x, y: over.maxY + CardMetrics.gap / 2) }
        // No card or header of its part drawn (an empty list): the line at the list's top, as the plugin's.
        return CGPoint(x: x, y: (heads.first?.rect.minY ?? cards.last?.rect.maxY ?? 0) - CardMetrics.gap / 2)
    }

    /// The carry held at `point` (in the collection): the place under it, its line drawn over everything, the carried copy
    /// too.
    private func hold(at point: CGPoint, carrying payload: DragPayload?) {
        guard let next = aim(at: point, carrying: payload) else { return clearAim() }
        let moved = aimed?.place != next.place
        aimed = next
        guard let line = next.line, let window = collection.window else { return model?.drag.hideLine() ?? () }
        let start = collection.convert(line, to: window)
        let end = collection.convert(CGPoint(x: collection.bounds.width - CardMetrics.columnInset, y: line.y), to: window).x
        model?.drag.showLine(from: start, to: end)
        if moved { DropLog.target("list \(column.rawValue) \(next.place)") }
    }

    private func clearAim() {
        aimed = nil
        model?.drag.hideLine()
        model?.leaveList(column)
    }

    // MARK: A carry routed here by the board (the plus, or a card over the bars)

    /// The room a carried section opens before the header it would go before: the only row that moves under a carry.
    private var plusRoom: Int?

    func takes(_ payload: DragPayload?) -> Bool {
        guard let payload, !payload.isProject else { return payload == nil && model?.drawing?.presentation.plusList == .funnel }
        guard payload.isSection else { return true }
        return payload.from == column.rawValue
    }

    var scrolls: UIScrollView? { collection.isScrollEnabled ? collection : nil }

    var area: CGRect? {
        guard !dormant, let window = host.window else { return nil }
        // The title over the list takes the carry too: it is the list's first place.
        let frame = host.convert(host.bounds, to: window)
        let title = (host.stacked ? ColumnMetrics.groupHead : ColumnMetrics.titleRow) + ColumnMetrics.headGap
        return CGRect(x: frame.minX, y: frame.minY - title, width: frame.width, height: frame.height + title)
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
            return (index, model?.drawing?.lists[column]?.groups.firstIndex { $0.id == other.id }, frame.midY)
        }
        let before = heads.first { $0.y > local.y }
        let slot = before?.group ?? model?.drawing?.lists[column]?.groups.count
        guard slot != sectionSlot else { return }
        sectionSlot = slot
        CarryFeel.tick()
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
            model?.dropSection(column, group, slot: slot.flatMap { $0 < (model?.drawing?.lists[column]?.groups.count ?? 0) ? $0 : nil })
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
        switch model.dropOnList(shown.shown) {
        case .landed(let landed):
            return model.landingOnScreen(landed, from: column)
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
    /// Counts the layouts made: what a carry read of the rows' frames holds for.
    private(set) var generation = 0
    /// Where the rows stood before the change, by their index then.
    private var before: [Int: CGRect] = [:]

    override func prepare() {
        // The layout as it stood, read before it is laid out anew: a row going folds under the row that stood before it.
        generation += 1
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
        case .plate(let group):
            EmptyPlate(hot: model.platesLit(column, group)) { model.entry.openIn(column.rawValue, group.name) }
        case .card(let card):
            CardRow(card: card, column: column, model: model)
        case .pending(_, let text, let level, let branch):
            EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
        case .field(_, let level, let branch, let section):
            EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry, section: section) }
        case .vacant(let label):
            EmptyPlate(hot: model.isTitleLit(column), open: { model.entry.openIn(column.rawValue, nil) }, label: label)
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

