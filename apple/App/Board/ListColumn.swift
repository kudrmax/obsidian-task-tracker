import Core
import SwiftUI

/// A list's column: its title (with the day's arrows over the day list), its sections and cards. A long press on a card
/// shows its menu, and moving on lifts it to carry: its rows close up, and the rows part where it would land, the gap
/// drawn at the level it would take.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false
    @Binding var question: MenuQuestion?

    private static let space = "list"
    /// Room after the last row, so the last card scrolls over the keyboard.
    static let trailingRoom: CGFloat = 160

    /// The gap the finger points at: drawn by the drop line, the rows standing still.
    private var gap: ListGap? { model.gap?.column == list.column ? model.gap : nil }
    /// The gap a card let go here flies into: the rows part for it.
    private var settling: ListGap? { model.settling?.column == list.column ? model.settling : nil }
    private var key: String { "list.\(list.column.rawValue)" }
    /// The list's own width: another day slides through it.
    @State private var width: CGFloat = 0
    /// Where the list stands scrolled, for a carry held at its edge to scroll it on.
    @State private var position = ScrollPosition(y: 0)
    @State private var scroll = ScrollSpot()
    /// The header names the day that stands nearer while another comes in.
    private var title: String {
        guard list.column == .day else { return list.title }
        return model.titleSnapshot?.lists[.day]?.title ?? list.title
    }

    var body: some View {
        let column = list.column
        let drawn = rows
        VStack(alignment: .leading, spacing: ColumnMetrics.headGap) {
            ColumnTitle(title: title, dayArrows: dayArrows, grouping: list.canGroup ? list.grouped : nil, lit: model.titleLit == column, model: model) { on in
                Task { await model.setGrouping(list.column, on: on) }
            }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.dropping.move("title.\(column.rawValue)", visible: $0) }
            .onAppear { model.registerTitle(column) }
            .onDisappear { model.dropping.remove("title.\(column.rawValue)") }
            ScrollViewReader { scroller in
                ScrollView {
                    DayLane(model: model, width: width, slides: column == .day, shown: VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(drawn) { row in
                            switch row {
                            case .header(let group, let header):
                                SectionHeader(title: header, group: group, column: column, model: model)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, head: group.id, $0) }
                                    // As the plugin's header: room above it but at the list's top, its bottom on the first card.
                                    .padding(.top, row.id == drawn.first?.id ? 0 : ColumnMetrics.sectionGap)
                                    .padding(.bottom, -CardMetrics.gap)
                            case .project(let head):
                                ProjectHeader(head: head, model: model) { Task { await model.toggleFold(column, head) } }
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, head: head.id, $0) }
                                    .padding(.top, row.id == drawn.first?.id ? 0 : ColumnMetrics.sectionGap)
                                    .padding(.bottom, -CardMetrics.gap)
                            case .plate(let group):
                                EmptyPlate(hot: gap.map { group.names($0.group, zone: $0.zone) && $0.line == nil } ?? false) { model.entry.openIn(column, group.name, zone: group.zone) }
                            case .card(let card):
                                CardRow(card: card, column: column, model: model, question: $question)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, card: card.id, $0) }
                            case .gap:
                                GapSpace()
                            case .mark(let first):
                                SectionMark().padding(.top, first ? 0 : ColumnMetrics.sectionGap)
                            case .pending(_, let text, let level, let branch):
                                EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
                            case .field(let level, let branch, let section):
                                EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry, section: section) }
                            }
                        }
                        Color.clear.frame(height: Self.trailingRoom)
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                    .overlay(alignment: .topLeading) {
                        if let line = gap?.line { DropLine(from: line) }
                    }
                    .coordinateSpace(.named(Self.space))
                    .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(key, origin: $0) }
                    ) { peek in
                        if let other = peek.lists[.day] { DayRows(list: other, model: model) }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollPosition($position)
                .onScrollGeometryChange(for: ScrollSpot.Reach.self) { ScrollSpot.Reach($0) } action: { _, reach in scroll.reach = reach }
                .softEdges(trailing: ListColumn.trailingRoom)
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: {
                    width = $0
                    model.rest(column, width: $0)
                }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: {
                    model.dropping.move(key, visible: $0)
                    shown = $0
                }
                // The field stays in sight: when it opens or moves, and when the keyboard takes the bottom of the list.
                .onChange(of: model.entry.moved) { reveal(scroller) }
                // The card the search led to is scrolled into sight, and nothing more, as the plugin's `FoundCard`.
                // Once the list has laid the card out: a group the find unfolded draws it in this same pass.
                .onChange(of: model.found) { showFound(tries: 10) }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { _ in reveal(scroller) }
            }
        }
        .onAppear {
            model.registerList(column)
            let spot = scroll, position = $position
            model.dropping.scrolls(key) { dy in spot.scroll(by: dy, trailing: ListColumn.trailingRoom) { position.wrappedValue.scrollTo(y: $0) } }
        }
        .onDisappear { model.dropping.remove(key) }
    }

    /// Where the list shows on the screen.
    @State private var shown: CGRect = .zero

    /// The card the search led to is scrolled into sight, and nothing more, as the plugin's `FoundCard`: a card already
    /// whole between the list's soft top and the tab bar stays; another comes to the middle of what shows.
    private func showFound(tries: Int) {
        guard let found = model.found, list.cards.contains(where: { $0.id == found }) else { return }
        guard tries < 10, let frame = model.restFrame(list.column, card: found) else {
            if tries > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { showFound(tries: tries - 1) } }
            return
        }
        let room = min(shown.maxY, model.dropping.floor ?? .infinity) - shown.minY
        let top = frame.minY - scroll.reach.offset
        guard top < SoftEdges.fade || top + frame.height > room - SoftEdges.fade else { return }
        let y = min(max(0, frame.midY - room / 2), scroll.reach.most)
        withAnimation(.snappy) { position.scrollTo(y: y) }
    }

    private func reveal(_ scroller: ScrollViewProxy) {
        guard model.entry.lists[list.column] != nil else { return }
        withAnimation(.snappy) { scroller.scrollTo(ListRowView.fieldID) }
    }

    /// The list as drawn: each section's header, its No tasks plate, its cards with the carry's gap among them, and the
    /// quick entry's field with the texts typed before it, where the core's `listEntry` puts them. The card being renamed
    /// gives its place to the field.
    private var rows: [ListRowView] {
        let entry = model.entry.lists[list.column]
        let renaming = model.entry.state?.renaming?.id
        var typed: [ListRowView] = []
        if let entry {
            typed = entry.pending.enumerated().map { .pending(index: $0.offset, text: $0.element.text, level: $0.element.level, branch: nil) }
            typed.append(.field(level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
        }
        var rows: [ListRowView] = []
        if entry?.at.kind == "top" { rows += typed }
        let slot = model.carry?.section?.column == list.column ? model.sectionSlot : nil
        let heads = Dictionary(grouping: list.heads, by: \.before)
        for (index, group) in list.groups.enumerated() {
            rows += (heads[index] ?? []).map(ListRowView.project)
            if slot == index { rows.append(.mark(first: rows.isEmpty)) }
            // A lifted section folds away, header and tasks, and the list closes over it.
            if model.isLifted(group, in: list.column) { continue }
            if let header = group.header { rows.append(.header(group, header)) }
            let here = entry.flatMap { $0.at.kind == "in" && $0.at.section == index ? $0 : nil }
            if group.empty, here == nil || here?.at.keepsPlate == true { rows.append(.plate(group)) }
            var cards = cardRows(of: group)
            if let here {
                let next = here.at.card.flatMap { list.cards[safe: $0] }
                let before = next.flatMap { next in cards.firstIndex { $0.id == next.id } } ?? cards.count
                cards.insert(contentsOf: typed, at: before)
            }
            rows += cards.filter { row in
                if case .card(let card) = row { card.item.id != renaming } else { true }
            }
        }
        rows += (heads[list.groups.count] ?? []).map(ListRowView.project)
        if let slot, slot >= list.groups.count { rows.append(.mark(first: rows.isEmpty)) }
        // At the end, or in a section the list doesn't draw (a day with no task yet has none): the field stands last.
        if entry?.at.kind == "end" || entry?.at.kind == "in" && !list.groups.indices.contains(entry?.at.section ?? 0) { rows += typed }
        // The card carried keeps its row, a dashed place; its subtasks fold away under it.
        let carried = Set(list.cards.filter { model.isCarried($0) && !model.isWaiting($0) }.map(\.id))
        return entry == nil && settling == nil && carried.isEmpty ? rows : Self.branched(rows, carried: carried, model: model)
    }

    /// The branch lines of every row while the field or a carry's gap stands in the list, or a card of it is carried, as
    /// the core draws a subtask's over the levels of the rows as they stand: a card above the field or the gap keeps its
    /// line going down to it, and a carried card's place closes up with no line left hanging into it.
    private static func branched(_ rows: [ListRowView], carried: Set<String>, model: BoardModel) -> [ListRowView] {
        let standing = rows.filter { !$0.isCarried(carried) }
        let branches = model.branches(levels: standing.compactMap(\.level))
        var at = -1
        return rows.map { row in
            guard let level = row.level, !row.isCarried(carried) else { return row }
            at += 1
            let branch = level > 0 ? branches[safe: at] ?? nil : nil
            switch row {
            case .card(let card) where card.branch != branch:
                return .card(BoardCard(item: card.item, level: card.level, branch: branch, due: card.due, repeats: card.repeats, paint: card.paint, corner: card.corner, id: card.id, zone: card.zone, parts: card.parts))
            case .gap: return .gap(level: level, branch: branch)
            case .pending(let index, let text, _, _): return .pending(index: index, text: text, level: level, branch: branch)
            case .field(_, _, let section): return .field(level: level, branch: branch, section: section)
            default: return row
            }
        }
    }

    /// A group's cards as drawn, with the room a card let go flies into when it lands in this group.
    private func cardRows(of group: BoardGroup) -> [ListRowView] {
        var rows = group.cards.map(ListRowView.card)
        guard let gap = settling, group.names(gap.group, zone: gap.zone), !group.empty else { return rows }
        let others = model.others(in: list.column)
        let next = others[safe: gap.at].flatMap { $0.stands(in: gap.group, zone: gap.zone) ? $0 : nil }
        let at = next.flatMap { card in rows.firstIndex { $0.id == card.id } } ?? rows.count
        rows.insert(.gap(level: gap.level, branch: nil), at: at)
        return rows
    }
}

/// A row of a list as drawn: a section's header or its No tasks plate, a card, the gap a carry would land in, a text
/// typed and not written yet, or the field it is typed in.
private enum ListRowView: Identifiable {
    case header(BoardGroup, String)
    /// A project group's header in a list grouped by project.
    case project(BoardProjectHead)
    case plate(BoardGroup)
    case card(BoardCard)
    case gap(level: Int, branch: Branch?)
    case pending(index: Int, text: String, level: Int, branch: Branch?)
    case field(level: Int, branch: Branch?, section: Bool)
    /// Where a carried section would land, before a header or at the list's end.
    case mark(first: Bool)

    static let fieldID = "\u{0}entry"

    var id: String {
        switch self {
        case .header(let group, _): "\u{0}head/\(group.id)"
        case .project(let head): head.id
        case .plate(let group): "\u{0}plate/\(group.id)"
        case .card(let card): card.id
        case .gap: "\u{0}gap"
        case .pending(let index, _, _, _): "\u{0}pending/\(index)"
        case .field: Self.fieldID
        case .mark: "\u{0}mark"
        }
    }

    func isCarried(_ carried: Set<String>) -> Bool {
        if case .card(let card) = self { carried.contains(card.id) } else { false }
    }

    /// The depth of a row that stands among the cards.
    var level: Int? {
        switch self {
        case .card(let card): card.level
        case .gap(let level, _), .pending(_, _, let level, _), .field(let level, _, _): level
        case .header, .project, .plate, .mark: nil
        }
    }
}

/// One column's day while another day comes in, as the plugin's `DayTrack` lane: the day shown slides out one side as
/// the next comes in from the other, each seen only within the column. Only this lane reads the share of the way, so a
/// frame of the slide moves the two days and draws nothing else anew.
struct DayLane<Shown: View, Next: View>: View {
    let model: BoardModel
    let width: CGFloat
    var slides = true
    let shown: Shown
    @ViewBuilder let next: (BoardSnapshot) -> Next

    var body: some View {
        if slides, let turn = model.dayTurn {
            let shift = CGFloat(turn.shift)
            let share = model.dayShare
            ZStack(alignment: .topLeading) {
                shown.offset(x: -shift * share * width)
                next(turn.peek)
                    .offset(x: shift * (1 - share) * width)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        } else {
            shown
        }
    }
}

/// Another day's list as it will stand, drawn only while it slides in: its headers, plates and cards, nothing to touch.
private struct DayRows: View {
    let list: BoardList
    let model: BoardModel

    var body: some View {
        VStack(alignment: .leading, spacing: CardMetrics.gap) {
            ForEach(Array(list.groups.enumerated()), id: \.element.id) { index, group in
                if let header = group.header {
                    SectionHeader(title: header, group: group, column: list.column, model: model)
                        .padding(.top, index == 0 ? 0 : ColumnMetrics.sectionGap)
                        .padding(.bottom, -CardMetrics.gap)
                }
                if group.empty { EmptyPlate() }
                ForEach(group.cards) { card in
                    TaskCapsule(card: card)
                        .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
                        .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
                        .frame(height: CardMetrics.height)
                }
            }
        }
        .padding(.horizontal, CardMetrics.columnInset)
    }
}

/// A row typed in, at its depth with its branch.
private struct EntryRow<Content: View>: View {
    let level: Int
    let branch: Branch?
    @ViewBuilder let content: Content

    var body: some View {
        content
            .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }
}

/// The room a card let go flies into: the rows part for it as it lands; it draws nothing of its own, the card brings its
/// branch with it.
private struct GapSpace: View {
    var body: some View {
        Color.clear
            .frame(height: CardMetrics.height)
            .frame(maxWidth: .infinity)
            .transition(.identity)
            .accessibilityHidden(true)
    }
}

/// Where a carried card will land, as the plugin shows it (`DropLine`): the calendar's drop line between two cards, from
/// a dot at the left edge of the level it picks to the list's right edge. The rows stand still under it.
private struct DropLine: View {
    let from: CGPoint
    @Environment(\.colorScheme) private var scheme
    static let dot: CGFloat = 8
    static let thickness: CGFloat = 2

    var body: some View {
        GeometryReader { box in
            HStack(spacing: 0) {
                Circle().frame(width: Self.dot, height: Self.dot)
                Rectangle().frame(height: Self.thickness)
            }
            .foregroundStyle(Palette.accent(scheme))
            .frame(width: max(Self.dot, box.size.width - CardMetrics.columnInset - from.x), height: Self.dot)
            .offset(x: from.x, y: from.y - Self.dot / 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A column's title, 20 points bold; the day list's has the arrows that turn the day, and a tap on it comes back to today.
/// Backlog's and Soon's open a menu with Group by Project, checked while the list groups (`grouping`), as the plugin's.
struct ColumnTitle: View {
    let title: String
    var dayArrows = false
    /// The list may group by project: whether it does; nil for a list that never groups.
    var grouping: Bool? = nil
    /// A carried card would land on it: lit in the accent, as an empty section's plate.
    var lit = false
    @Bindable var model: BoardModel
    var setGrouping: (Bool) -> Void = { _ in }
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 4) {
            if dayArrows {
                Button { Task { await model.step(-1) } } label: { arrow("chevron.left") }
                    .accessibilityLabel("Previous Day")
            }
            if dayArrows {
                Button { Task { await model.showToday() } } label: { titleText.frame(height: ColumnMetrics.titleRow).contentShape(.rect) }
                    .accessibilityHint("Back to today")
            } else if let grouping {
                Menu {
                    Toggle("Group by Project", systemImage: "folder", isOn: Binding(get: { grouping }, set: { setGrouping($0) }))
                } label: {
                    titleText.frame(height: ColumnMetrics.titleRow).contentShape(.rect)
                }
                .tint(.primary)
                .accessibilityAddTraits(.isHeader)
            } else {
                titleText.accessibilityAddTraits(.isHeader)
            }
            if dayArrows {
                Button { Task { await model.step(1) } } label: { arrow("chevron.right") }
                    .accessibilityLabel("Next Day")
            }
        }
        .buttonStyle(.plain)
        .fontWeight(.semibold)
        .frame(height: ColumnMetrics.titleRow)
        .padding(.horizontal, dayArrows ? 0 : 16)
        .foregroundStyle(lit ? Palette.accent(scheme) : Color.primary)
        .background {
            if lit {
                RoundedRectangle(cornerRadius: CardMetrics.radius)
                    .fill(Palette.dropBg(scheme))
                    .strokeBorder(Palette.accent(scheme), lineWidth: 1)
            }
        }
    }

    /// A day arrow: the whole 32-point square takes the tap, not only the chevron's strokes, which a plain button's label
    /// alone would.
    private func arrow(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .frame(width: 32, height: 32)
            .contentShape(.rect)
    }

    private var titleText: some View {
        Text(title)
            .font(.system(size: 20, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// A section's heading in a list: a tap opens its menu, which renames or removes it as the core offers (inside a
/// project's group, only that project's tasks); a long press lifts it, as the plugin's.
struct SectionHeader: View {
    let title: String
    let group: BoardGroup
    let column: BoardColumn
    @Bindable var model: BoardModel
    @State private var renaming = false
    @State private var name = ""
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        heading
            .modifier(SectionLift(group: group, column: column, model: model))
            .alert("Rename Section", isPresented: $renaming) {
                TextField("Name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { if let menu = group.menu { Task { await model.renameSection(column, menu, to: name) } } }
            }
    }

    @ViewBuilder
    private var heading: some View {
        if let menu = group.menu, menu.rename || menu.remove {
            Menu {
                if menu.rename { Button("Rename", systemImage: "pencil") { name = menu.section; renaming = true } }
                if menu.remove {
                    Button("Remove Section", systemImage: "trash", role: .destructive) { Task { await model.removeSection(column, menu) } }
                }
            } label: {
                label
            }
            .buttonStyle(.plain)
        } else {
            label
        }
    }

    private var label: some View {
        Text(title)
            .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
            .frame(height: ColumnMetrics.groupLeading)
            .foregroundStyle(group.name == nil ? Palette.muted : Palette.pullInk(scheme))
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, 4)
            .frame(height: ColumnMetrics.groupHead)
            .contentShape(.rect)
    }
}

/// A project group's header in a list grouped by project, as the plugin draws it: a section's header with a chevron before
/// the title, turned down while the group is open; the count of its open tasks while folded; the arrow that opens the
/// project's note. A tap folds or unfolds the group, the arrow opens the note.
struct ProjectHeader: View {
    let head: BoardProjectHead
    let model: BoardModel
    let toggle: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .bold))
                .rotationEffect(.degrees(head.folded ? 0 : 90))
                .frame(width: 16, height: ColumnMetrics.groupLeading)
                .padding(.leading, -6)
            Text(head.title)
                .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
                .lineLimit(1)
                .frame(height: ColumnMetrics.groupLeading)
            if head.folded {
                Text(verbatim: "\(head.count)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Palette.muted)
                    .frame(height: ColumnMetrics.groupLeading)
                    .accessibilityLabel("\(head.count) tasks")
            }
            if head.canOpenNote, let project = head.project {
                Button { model.openProject(project) } label: {
                    Image(systemName: "arrow.up.forward.app")
                        .font(.system(size: 12, weight: .medium))
                        .frame(width: 28, height: ColumnMetrics.groupHead)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open \(head.title)")
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(head.project == nil ? Palette.muted : Palette.pullInk(scheme))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, CardMetrics.leading)
        .padding(.trailing, 4)
        .frame(height: ColumnMetrics.groupHead)
        .contentShape(.rect)
        .onTapGesture(perform: toggle)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(head.folded ? "Folded" : "Open")
    }
}

/// A long press on a section's header lifts the section, as the plugin's (`GroupDrag`): moving on carries it among the
/// list's sections; it shows as a card with the section's name and count over two layers of its tasks.
private struct SectionLift: ViewModifier {
    let group: BoardGroup
    let column: BoardColumn
    let model: BoardModel

    func body(content: Content) -> some View {
        if group.reorder {
            content.onDrag {
                model.startSectionCarry(column, group)
                return NSItemProvider(object: "section" as NSString)
            } preview: {
                SectionFloat(name: group.header ?? "", count: group.cards.filter { $0.level == 0 }.count)
            }
        } else {
            content
        }
    }
}

/// The lifted section under the finger (`.tc-section-float`): its name and the number of its tasks on a card, two layers
/// of its tasks beneath.
private struct SectionFloat: View {
    let name: String
    let count: Int
    @Environment(\.colorScheme) private var scheme
    static let width: CGFloat = 190
    static var height: CGFloat { CardMetrics.height + 2 }
    static let step = CGSize(width: 7, height: 6)

    var body: some View {
        let dark = scheme == .dark
        ZStack(alignment: .topLeading) {
            layer(Color(hex: dark ? "#1C1C1E" : "#EFEFF2"), depth: 2)
            layer(Color(hex: dark ? "#242426" : "#F7F7F9"), depth: 1)
            HStack(spacing: 8) {
                Text(name)
                    .font(.system(size: CardMetrics.title, weight: .semibold))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: "\(count)")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Palette.muted)
            }
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, 12)
            .frame(width: Self.width, height: Self.height)
            .background(Color(hex: dark ? "#2C2C2E" : "#FFFFFF"), in: .capsule)
        }
        .frame(width: Self.width, height: Self.height + 2 * Self.step.height, alignment: .top)
    }

    private func layer(_ fill: Color, depth: CGFloat) -> some View {
        Capsule().fill(fill)
            .frame(width: Self.width - 2 * Self.step.width * depth, height: Self.height)
            .offset(x: Self.step.width * depth, y: Self.step.height * depth)
    }
}

/// Where a carried section would land (`.tc-group-drop`): a dashed card's room before a header or at the list's end.
private struct SectionMark: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: CardMetrics.radius)
            .strokeBorder(Palette.dash(scheme), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .frame(height: CardMetrics.height)
            .accessibilityHidden(true)
    }
}

/// The Done column, left of Inbox, as the plugin's: done and dropped tasks in the file's order. Only the search opens it;
/// a tap on a card opens its menu.
struct DoneColumn: View {
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var title = "Done"

    var body: some View {
        VStack(alignment: .leading, spacing: ColumnMetrics.headGap) {
            ColumnTitle(title: title, model: model)
            ScrollViewReader { scroller in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: CardMetrics.gap) {
                        if model.doneCards.isEmpty { EmptyPlate() }
                        ForEach(model.doneCards) { card in
                            CardButton(
                                card: card,
                                menu: { later in model.cardMenu(card.item, ask: { question = $0 }, later: later) },
                                ringed: model.found == card.id,
                                draggable: false,
                                onTouch: { model.found = nil },
                                onLink: { model.openLink($0) },
                                onProject: model.projectOpener(card.item))
                                .frame(height: CardMetrics.height)
                                .id(card.id)
                        }
                        Color.clear.frame(height: ListColumn.trailingRoom)
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                }
                .scrollIndicators(.hidden)
                .softEdges(trailing: ListColumn.trailingRoom)
                .onChange(of: model.found, initial: true) {
                    guard let found = model.found, model.doneCards.contains(where: { $0.id == found }) else { return }
                    scroller.scrollTo(found, anchor: .center)
                }
            }
        }
        .task { title = (try? await model.read("tasks.listName", ["done"])) ?? title }
    }
}

/// A section with no task: its dashed plate under the header, as the plugin draws it.
struct EmptyPlate: View {
    /// A carried card would land in the section: the plate lights in the accent, as the plugin's (`is-hot`).
    var hot = false
    /// A tap types a new task in the section.
    var open: (() -> Void)?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text("No tasks")
            .font(.system(size: CardMetrics.title))
            .foregroundStyle(hot ? Palette.accent(scheme) : Palette.muted)
            .padding(.leading, CardMetrics.leading)
            .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
            .background(hot ? Palette.dropBg(scheme) : .clear, in: .rect(cornerRadius: CardMetrics.radius))
            .overlay {
                RoundedRectangle(cornerRadius: CardMetrics.radius)
                    .strokeBorder(hot ? Palette.accent(scheme) : Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: hot ? [] : [4, 3]))
            }
            .contentShape(.rect(cornerRadius: CardMetrics.radius))
            .onTapGesture { open?() }
            .accessibilityAddTraits(open == nil ? [] : .isButton)
    }
}

/// One card in a list: at its depth, with its branch. A long press shows its menu and lifts it to carry. Select Tasks
/// puts the system's selection circle before it, as Mail and Reminders do. Carried, it gives its place up.
struct CardRow: View {
    let card: BoardCard
    let column: BoardColumn
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?

    var body: some View {
        let waiting = model.isWaiting(card)
        // Its subtasks go with a carried card: they fold away under its dashed place.
        let carried = model.isCarried(card) && !waiting
        HStack(spacing: 10) {
            if model.selecting, !carried {
                SelectionCircle(on: model.picked.contains(card.id))
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            capsule(carried: carried || waiting)
                // Behind the card from the lift on, with no fade: the card hides over it once the carried copy leaves.
                .background { if waiting { WaitingPlace().transition(.identity) } }
                .overlay(alignment: .topLeading) { if let branch = card.branch, !carried, !waiting { BranchLine(branch: branch) } }
                .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
        }
        .contentShape(.rect)
        .onTapGesture {
            guard model.selecting else { return }
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
        }
        .frame(height: carried ? 0 : CardMetrics.height, alignment: .top)
        .padding(.bottom, carried ? -CardMetrics.gap : 0)
        .accessibilityHidden(carried)
    }

    @ViewBuilder
    private func capsule(carried: Bool) -> some View {
        if model.selecting {
            // A picked card lifted carries every picked task as a stack, as the plugin's.
            CardButton(
                card: card,
                menu: { _ in nil },
                carried: carried,
                onCarry: { _ in model.startGroupCarry(card, from: column.rawValue) },
                onCancel: { model.cancelCarry() },
                onEnd: { model.carryEnded() },
                picking: CardButton.Picking(picked: model.picked.contains(card.id), count: model.picked.count) {
                    withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
                })
                .frame(height: CardMetrics.height)
                // The other picked tasks go with the lifted one: their rows close up with nothing left showing.
                .opacity(model.isCarried(card) && !model.isWaiting(card) ? 0 : 1)
        } else {
            CardButton(
                card: card,
                menu: { later in model.cardMenu(card.item, ask: { question = $0 }, later: later) },
                ringed: model.found == card.id,
                carried: carried,
                onTouch: { model.found = nil },
                onCarry: { model.startCarry(card, from: column.rawValue, grab: $0) },
                onCancel: { model.cancelCarry() },
                onEnd: { model.carryEnded() },
                onFold: card.item.can.fold ? { Task { await model.toggleCollapsed(card.item) } } : nil,
                onLink: { model.openLink($0) },
                onProject: model.projectOpener(card.item))
                .frame(height: CardMetrics.height)
        }
    }
}

/// The picked tasks carried as one (`.tc-drag-stack`): the lifted card on two layers of cards, the number carried on it.
struct StackFloat: View {
    let card: BoardCard
    let count: Int
    let width: CGFloat
    @Environment(\.colorScheme) private var scheme
    static let step = CGSize(width: 7, height: 6)

    var body: some View {
        let dark = scheme == .dark
        ZStack(alignment: .topLeading) {
            if count > 1 {
                layer(Color(hex: dark ? "#1C1C1E" : "#EFEFF2"), depth: 2)
                layer(Color(hex: dark ? "#242426" : "#F7F7F9"), depth: 1)
            }
            TaskCapsule(card: card)
                .frame(width: width, height: CardMetrics.height)
                .overlay(alignment: .topTrailing) {
                    if count > 1 {
                        Text(verbatim: "\(count)")
                            .font(.system(size: 12, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(Palette.accent(scheme), in: .capsule)
                            .offset(x: 6, y: -6)
                    }
                }
        }
        .frame(width: width, height: CardMetrics.height + 2 * Self.step.height, alignment: .top)
        .padding(Self.room)
    }

    /// Room round the stack for the number on its corner.
    static let room: CGFloat = 8

    private func layer(_ fill: Color, depth: CGFloat) -> some View {
        Capsule().fill(fill)
            .frame(width: width - 2 * Self.step.width * depth, height: CardMetrics.height)
            .offset(x: Self.step.width * depth, y: Self.step.height * depth)
    }
}

/// Where a carried card was lifted from, as the plugin keeps it (`is-waiting`): a dashed outline of the card. The card itself
/// hides over it once the carried copy has left.
private struct WaitingPlace: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: CardMetrics.radius)
            .strokeBorder(Palette.dash(scheme), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .accessibilityHidden(true)
    }
}

/// The system's selection mark, as Mail and Reminders draw it: an empty ring, or the accent's filled circle with a check.
struct SelectionCircle: View {
    let on: Bool

    var body: some View {
        Image(systemName: on ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 22))
            .symbolRenderingMode(on ? .palette : .monochrome)
            .foregroundStyle(on ? AnyShapeStyle(.white) : AnyShapeStyle(Color(.tertiaryLabel)), AnyShapeStyle(.tint))
            .contentTransition(.symbolEffect(.replace))
            .accessibilityLabel(on ? "Selected" : "Not selected")
    }
}

/// A list or the calendar fades out softly at an edge it scrolls past, over half a card's height: at the top under its
/// title while something is scrolled up there, at the bottom while more is below (where Inbox meets Backlog), as the
/// plugin's lists do; a list at its top shows no fade there. iOS's own soft scroll edge shows only under the system's bars,
/// and these columns scroll under their own titles: a mask of the same kind. `trailing` is room at the end of the content
/// that holds nothing (a list's space to scroll its last card over the keyboard): no fade for it.
struct SoftEdges: ViewModifier {
    var trailing: CGFloat = 0
    @State private var edges = Edges()
    static var fade: CGFloat { CardMetrics.height / 2 }

    struct Edges: Equatable {
        var top: CGFloat = 0
        var bottom: CGFloat = 0
    }

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Edges.self) { geometry in
                let above = geometry.contentOffset.y + geometry.contentInsets.top
                let below = geometry.contentSize.height + geometry.contentInsets.bottom - trailing - geometry.contentOffset.y - geometry.containerSize.height
                return Edges(top: min(Self.fade, max(0, above)), bottom: min(Self.fade, max(0, below)))
            } action: { _, new in edges = new }
            .mask {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: edges.top)
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: edges.bottom)
                }
            }
    }
}

extension View {
    func softEdges(trailing: CGFloat = 0) -> some View { modifier(SoftEdges(trailing: trailing)) }
}

/// How far a calendar's top fade reaches at a scroll offset: an event cut by the top edge keeps its title under it.
enum SoftEdge {
    static func top(at offset: CGFloat) -> CGFloat { min(SoftEdges.fade, max(0, offset)) }
}
