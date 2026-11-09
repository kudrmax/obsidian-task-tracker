import Core
import SwiftUI
import UIKit
import os

/// What the system's drag carries for the board, as its item's `localObject`: a card, or a section by its header, from the
/// column it is drawn in. The carry's token is set when the session begins, and its end names it.
@MainActor
final class DragPayload {
    enum Kind {
        case card(BoardCard)
        case section(BoardGroup)
    }

    let kind: Kind
    let from: String
    var token: Int?
    /// How far below the card's top the finger holds it: the calendar reads the minute at the carried card's top edge.
    var grab: CGFloat = 0

    init(_ kind: Kind, from: String) {
        self.kind = kind
        self.from = from
    }

    static func of(_ session: any UIDragDropSession) -> DragPayload? {
        session.items.first?.localObject as? DragPayload
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

/// A list's rows as the system's own collection draws them, one per column (Inbox, Backlog, Soon, the day). Lift, carry,
/// the rows parting where the card would go, scrolling at the edges and the drop's flight are UIKit's; the list only says
/// which place of the core's a gap is (`ListTarget`) and draws the screen the core says the drop leaves.
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
    }

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
final class ListController: NSObject, UICollectionViewDelegate, UICollectionViewDragDelegate, UICollectionViewDropDelegate, PlusTarget {
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
        let layout = UICollectionViewCompositionalLayout { _, environment in
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
        collection.dragDelegate = self
        collection.dropDelegate = self
        collection.dragInteractionEnabled = true
        collection.reorderingCadence = .immediate
        model.register(self)
    }

    // MARK: The rows

    /// The list drawn anew from the model: rows come, go and move with the system's own animation; a row whose content
    /// changed is drawn again in place. Another day comes in still: it slid in through the day's own motion.
    func update(force: Bool = false) {
        guard let model else { return }
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
        let ids = next.map { keys[$0.id] ?? $0.id }
        let changed = ids.filter { id in
            guard let old = drawn[id], let new = tops[id] else { return false }
            return old.row != new.row || old.top != new.top
        }
        let shownDay = model.snapshot?.day
        guard force || ids != shownIds || !changed.isEmpty else { return }
        let gone = Set(shownIds).subtracting(ids)
        shownIds = ids
        let animated = day == shownDay && host.window != nil
        day = shownDay
        // The quick entry's one field keeps the keyboard from row to row: a row going away hands it to the window's holder
        // first, as any box that stops showing it does, so the collection never deletes the first responder's row.
        for id in gone {
            guard let path = source.indexPath(for: id), let cell = collection.cellForItem(at: path), let window = host.window,
                  let field = cell.contentView.firstResponderInside as? EntryTextField else { continue }
            field.park(in: window)
        }
        rows = next
        drawn = tops
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(ids)
        snapshot.reconfigureItems(changed)
        source.apply(snapshot, animatingDifferences: animated)
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
            typed = entry.pending.enumerated().map { .pending(key: keys[safe: $0.offset] ?? "\u{0}line", text: $0.element.text, level: $0.element.level, branch: nil) }
            // A card renamed gives its row to the field: the same row, its content now typed in, so nothing comes or goes.
            typed.append(.field(id: renaming ?? keys.last ?? "\u{0}field", level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
            if let name = entry.newSection { typed.insert(.newHead(name), at: 0) }
        }
        var rows: [DrawnRow] = []
        if entry?.at.kind == "top" { rows += typed }
        for part in list.parts {
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
                DispatchQueue.main.async { [weak self] in self?.reveal(path, centred: true) }
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
        DispatchQueue.main.async { [weak self] in self?.reveal(path, centred: false) }
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

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        host.edges()
    }

    // MARK: Lifting

    func collectionView(_ collectionView: UICollectionView, itemsForBeginning session: any UIDragSession, at indexPath: IndexPath) -> [UIDragItem] {
        guard let model, let row = rows[safe: indexPath.item] else { return [] }
        DropLog.target("lift asked \(column.rawValue) \(indexPath.item)")
        let payload: DragPayload
        switch row {
        case .card(let card):
            guard model.canLift(card, from: column.rawValue) else { return [] }
            payload = DragPayload(.card(card), from: column.rawValue)
        case .header(let group, _):
            guard model.canLift(group, in: column) else { return [] }
            payload = DragPayload(.section(group), from: column.rawValue)
        default:
            return []
        }
        if let cell = collection.cellForItem(at: indexPath) {
            payload.grab = session.location(in: cell).y - capsule(of: row, in: cell.bounds).minY
        }
        let item = UIDragItem(itemProvider: Carried.provider(row.id))
        item.localObject = payload
        item.previewProvider = previewProvider(row, at: indexPath)
        return [item]
    }

    /// What the finger carries once the lift is done: the picked tasks as a stack with their number, a section as the
    /// plugin's floating section (its name and count on two layers); a card alone, the card itself.
    private func previewProvider(_ row: DrawnRow, at path: IndexPath) -> (() -> UIDragPreview?)? {
        guard let model, let window = host.window, let cell = collection.cellForItem(at: path) else { return nil }
        switch row {
        case .card(let card):
            let count = model.picked.contains(card.id) && model.selecting ? model.picked.count : 1
            guard count > 1 else { return nil }
            let width = capsule(of: row, in: cell.bounds).width
            guard let view = FloatImage.view(StackFloat(card: card, count: count, width: width), like: cell, in: window) else { return nil }
            let parameters = UIDragPreviewParameters()
            parameters.backgroundColor = .clear
            parameters.visiblePath = StackFloat.outline(width: width, count: count)
            return { UIDragPreview(view: view, parameters: parameters) }
        case .header(let group, let header):
            let float = SectionFloat(name: header, count: group.cards.filter { $0.level == 0 }.count)
            guard let view = FloatImage.view(float, like: cell, in: window) else { return nil }
            let parameters = UIDragPreviewParameters()
            parameters.backgroundColor = .clear
            parameters.visiblePath = SectionFloat.outline
            return { UIDragPreview(view: view, parameters: parameters) }
        default:
            return nil
        }
    }

    func collectionView(_ collectionView: UICollectionView, itemsForAddingTo session: any UIDragSession, at indexPath: IndexPath, point: CGPoint) -> [UIDragItem] { [] }

    func collectionView(_ collectionView: UICollectionView, dragPreviewParametersForItemAt indexPath: IndexPath) -> UIDragPreviewParameters? {
        parameters(at: indexPath)
    }

    func collectionView(_ collectionView: UICollectionView, dropPreviewParametersForItemAt indexPath: IndexPath) -> UIDragPreviewParameters? {
        parameters(at: indexPath)
    }

    /// The capsule itself is what lifts and lands, not the room around it in its row.
    private func parameters(at path: IndexPath) -> UIDragPreviewParameters? {
        guard let row = rows[safe: path.item], let cell = collection.cellForItem(at: path) else { return nil }
        let parameters = UIDragPreviewParameters()
        parameters.backgroundColor = .clear
        let shape = capsule(of: row, in: cell.bounds)
        parameters.visiblePath = UIBezierPath(roundedRect: shape, cornerRadius: row.heads ? 8 : CardMetrics.radius)
        return parameters
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

    func collectionView(_ collectionView: UICollectionView, dragSessionWillBegin session: any UIDragSession) {
        guard let model, let payload = DragPayload.of(session) else { return }
        switch payload.kind {
        case .card(let card): payload.token = model.startCarry(card, from: payload.from)
        case .section(let group): payload.token = model.startSectionCarry(column, group)
        }
    }

    func collectionView(_ collectionView: UICollectionView, dragSessionDidEnd session: any UIDragSession) {
        guard let payload = DragPayload.of(session), let token = payload.token else { return }
        DropLog.target("session ended \(token)")
        model?.endCarry(token)
    }

    func collectionView(_ collectionView: UICollectionView, dragSessionIsRestrictedToDraggingApplication session: any UIDragSession) -> Bool { true }

    func collectionView(_ collectionView: UICollectionView, dragSessionAllowsMoveOperation session: any UIDragSession) -> Bool { true }

    // MARK: Dropping

    func collectionView(_ collectionView: UICollectionView, canHandle session: any UIDropSession) -> Bool {
        DragPayload.of(session) != nil
    }

    /// The rows a carry moves among: the list's, without the carried card or the lifted section's header.
    private func others(_ payload: DragPayload) -> [DrawnRow] {
        rows.filter { row in
            switch (row, payload.kind) {
            case (.card(let card), .card(let carried)): card.id != carried.id
            case (.header(let group, _), .section(let lifted)): group.id != lifted.id
            case (.plusRoom, _): false
            default: true
            }
        }
    }

    /// The gap the system opens, as an index among `others`: where the finger is when the system names none. A card
    /// carried within its own list moves its own row as the gap, and over that row the system names the row's place in
    /// the data, not where it now stands: the gap is then read from where the collection lays that row out.
    private func gap(_ destination: IndexPath?, _ session: any UIDropSession, among others: [DrawnRow]) -> Int {
        if let payload = DragPayload.of(session), let home = indexPath(of: Self.movingRow(payload)),
           let holder = collection.layoutAttributesForItem(at: home)?.frame {
            return others.filter { row in
                guard let path = indexPath(of: row.id), let frame = collection.layoutAttributesForItem(at: path)?.frame else { return false }
                return frame.midY < holder.midY
            }.count
        }
        if let destination { return min(destination.item, others.count) }
        let y = session.location(in: collection).y
        let first = collection.layoutAttributesForItem(at: IndexPath(item: 0, section: 0))?.frame.minY ?? 0
        return y < first ? 0 : others.count
    }

    /// The row a carry moves in the list it was lifted from.
    private static func movingRow(_ payload: DragPayload) -> String {
        switch payload.kind {
        case .card(let card): card.id
        case .section(let group): DrawnRow.header(group, "").id
        }
    }

    /// The core's place for the gap before row `gap` of `others`, at the level the finger's `x` asks for.
    private func place(_ gap: Int, among others: [DrawnRow], x: CGFloat) -> JSONValue? {
        model?.listPlace(column, rows: others.map(\.drop), gap: gap, x: x, width: collection.bounds.width)
    }

    func collectionView(_ collectionView: UICollectionView, dropSessionDidUpdate session: any UIDropSession, withDestinationIndexPath destination: IndexPath?) -> UICollectionViewDropProposal {
        guard let model, let payload = DragPayload.of(session) else { return UICollectionViewDropProposal(operation: .cancel) }
        if payload.isSection {
            // A section moves only among its own list's sections.
            guard payload.from == column.rawValue else { return UICollectionViewDropProposal(operation: .forbidden) }
            shownGap = gap(destination, session, among: others(payload))
            DropLog.target("section \(column.rawValue) gap \(shownGap ?? -1)")
            return UICollectionViewDropProposal(operation: .move, intent: .insertAtDestinationIndexPath)
        }
        let others = others(payload)
        let at = gap(destination, session, among: others)
        shownGap = at
        if let place = place(at, among: others, x: session.location(in: collection).x) {
            model.hoverList(column, place: place)
            DropLog.target("list \(column.rawValue) gap \(at) \(place)")
        }
        return UICollectionViewDropProposal(operation: .move, intent: .insertAtDestinationIndexPath)
    }

    /// A section is carried among its list's sections only: the gap the system opens for it stands before a header or at
    /// the list's end, never among a section's cards.
    func collectionView(_ collectionView: UICollectionView, targetIndexPathForMoveOfItemFromOriginalIndexPath original: IndexPath, atCurrentIndexPath current: IndexPath, toProposedIndexPath proposed: IndexPath) -> IndexPath {
        guard let row = rows[safe: original.item], case .header(let lifted, _) = row else { return proposed }
        let others = rows.filter { $0.id != row.id }
        let slots = others.indices.filter { others[$0].heads } + [others.count]
        _ = lifted
        let nearest = slots.min { abs($0 - proposed.item) < abs($1 - proposed.item) } ?? proposed.item
        return IndexPath(item: nearest, section: proposed.section)
    }

    /// The gap the list last showed under the carry: the drop lands where the rows parted, read while they stood so.
    private var shownGap: Int?

    func collectionView(_ collectionView: UICollectionView, dropSessionDidExit session: any UIDropSession) {
        shownGap = nil
        model?.leaveList(column)
    }

    func collectionView(_ collectionView: UICollectionView, dropSessionDidEnd session: any UIDropSession) {
        shownGap = nil
        model?.leaveList(column)
    }

    func collectionView(_ collectionView: UICollectionView, performDropWith coordinator: any UICollectionViewDropCoordinator) {
        guard let model, let item = coordinator.items.first, let payload = item.dragItem.localObject as? DragPayload else { return }
        let others = others(payload)
        let at = shownGap ?? gap(coordinator.destinationIndexPath, coordinator.session, among: others)
        shownGap = nil
        switch payload.kind {
        case .section(let group):
            let slot = others[at...].first { $0.heads }.flatMap { row -> Int? in
                guard case .header(let next, _) = row else { return nil }
                return model.snapshot?.lists[column]?.groups.firstIndex { $0.id == next.id }
            }
            model.dropSection(column, group, slot: slot)
            // The header stands where the system carried it until the screen read after the move draws its section there.
            var snapshot = source.snapshot()
            let id = DrawnRow.header(group, "").id
            let target = others[safe: at].map { keys[$0.id] ?? $0.id }
            if snapshot.itemIdentifiers.contains(id), let target, target != id {
                snapshot.moveItem(id, beforeItem: target)
            } else if snapshot.itemIdentifiers.contains(id), target == nil, let last = snapshot.itemIdentifiers.last, last != id {
                snapshot.moveItem(id, afterItem: last)
            }
            source.apply(snapshot, animatingDifferences: false)
            if let path = indexPath(of: id) { coordinator.drop(item.dragItem, toItemAt: path) }
        case .card:
            guard let place = place(at, among: others, x: coordinator.session.location(in: collection).x) else { return }
            switch model.dropOnList(column, place: place) {
            case .stays:
                if let home = item.sourceIndexPath { coordinator.drop(item.dragItem, toItemAt: home) }
            case .landed(let landed):
                land(item.dragItem, landed, coordinator: coordinator)
            case .refused:
                break
            }
        }
    }

    /// The copy flies into the card's row as the screen after the drop draws it; into a folded project part, onto its
    /// header, shrinking into it (decision 56).
    private func land(_ item: UIDragItem, _ landed: DropLanding?, coordinator: any UICollectionViewDropCoordinator) {
        guard let landed else { return }
        if let path = indexPath(of: landed.id) {
            coordinator.drop(item, toItemAt: path)
        } else if let header = model?.foldedHeader(landed, in: column).flatMap({ indexPath(of: DrawnRow.project($0).id) }),
                  let frame = collection.layoutAttributesForItem(at: header)?.frame {
            let target = UIDragPreviewTarget(container: collection, center: CGPoint(x: frame.midX, y: frame.minY + ColumnMetrics.groupHead / 2), transform: CGAffineTransform(scaleX: 0.3, y: 0.3))
            coordinator.drop(item, to: target)
        }
    }

    // MARK: The plus carried over the list

    /// The room the plus held over the list opens, before row `plusRoom` of the list as drawn without it.
    private var plusRoom: Int?

    var plusArea: CGRect? {
        guard let window = host.window else { return nil }
        // The title over the list takes the plus too: it opens the field at the list's top.
        let frame = host.convert(host.bounds, to: window)
        return CGRect(x: frame.minX, y: frame.minY - ColumnMetrics.titleRow - ColumnMetrics.headGap, width: frame.width, height: frame.height + ColumnMetrics.titleRow + ColumnMetrics.headGap)
    }

    /// The rows drawn, the plus's room aside, with where each stands in the collection now.
    private var standing: [(row: DrawnRow, frame: CGRect)] {
        rows.enumerated().compactMap { index, row in
            guard row != .plusRoom, let frame = collection.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame else { return nil }
            return (row, frame)
        }
    }

    func plusHover(at point: CGPoint) {
        let local = collection.convert(point, from: nil)
        let gap = standing.filter { $0.frame.midY < local.y }.count
        plusX = local.x
        guard gap != plusRoom else { return }
        if plusRoom != nil { UISelectionFeedbackGenerator().selectionChanged() }
        plusRoom = gap
        update()
    }

    private var plusX: CGFloat = 0

    func plusLeave() {
        guard plusRoom != nil else { return }
        plusRoom = nil
        update()
    }

    /// Let go: the field opens where the room stood, at the level the finger asked for; its place in the window.
    func plusLetGo() -> CGRect? {
        guard let model, let gap = plusRoom else { return nil }
        let room = indexPath(of: DrawnRow.plusRoom.id).flatMap { collection.layoutAttributesForItem(at: $0)?.frame }
        let others = rows.filter { $0 != .plusRoom }
        let place = place(gap, among: others, x: plusX)
        plusRoom = nil
        update()
        guard let place else { return nil }
        model.openPlus(column, place: place)
        return room.map { collection.convert($0, to: nil) }.map { frame in
            let top = DrawnRow.top(of: .plusRoom, after: gap > 0 ? others[gap - 1] : nil)
            return CGRect(x: frame.minX, y: frame.minY + top, width: frame.width, height: CardMetrics.height)
        }
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
            Color.clear.frame(height: CardMetrics.height).accessibilityHidden(true)
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
