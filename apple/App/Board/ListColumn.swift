import Core
import SwiftUI
import UIKit

/// A list's column: its title (with the day's arrows over the day list) over its rows, which the system's own collection
/// draws (`ListCollection`): a long press lifts a card and the rows part where it would land, as in Reminders.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false

    /// The list's own width: another day slides through it.
    @State private var width: CGFloat = 0
    /// The header names the day that stands nearer while another comes in.
    private var title: String {
        guard list.column == .day else { return list.title }
        return model.titleSnapshot?.lists[.day]?.title ?? list.title
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // A card carried onto the title goes into the list keeping its project; the title's drop reaches down to the list.
            // Backlog stands under Inbox: the gap between them is its title's too, so a carry there lands somewhere.
            TitleDrop(column: list.column, model: model, top: list.column == .backlog ? ColumnMetrics.headGap : 0) {
                ColumnTitle(title: title, dayArrows: dayArrows, model: model, list: list)
                    .padding(.top, list.column == .backlog ? ColumnMetrics.headGap : 0)
                    .padding(.bottom, ColumnMetrics.headGap)
            }
            DayLane(model: model, width: width, slides: list.column == .day, shown: ListCollection(column: list.column, model: model)) { peek in
                if let other = peek.lists[.day] { DayRows(list: other, model: model) }
            }
            .clipped()
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
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

    /// The day drawn stays the same view while it slides out (one structure in and out of a turn), so what lives in it,
    /// a drop's copy coming down into it among them, goes with it.
    var body: some View {
        let turn = slides ? model.dayTurn : nil
        let shift = CGFloat(turn?.shift ?? 0)
        let share = turn == nil ? 0 : model.dayShare
        ZStack(alignment: .topLeading) {
            shown.offset(x: -shift * share * width)
            if let turn {
                next(turn.peek)
                    .offset(x: shift * (1 - share) * width)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
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

/// A column's title, 20 points bold; the day list's has the arrows that turn the day, and a tap on it comes back to today.
/// Backlog's and Soon's open a menu with Group by Project. A card carried over the title lights it: let go there, it goes
/// into the list keeping its project.
struct ColumnTitle: View {
    let title: String
    var dayArrows = false
    @Bindable var model: BoardModel
    var list: BoardList?
    @Environment(\.colorScheme) private var scheme

    private var lit: Bool { list.map { model.isTitleLit($0.column) } ?? false }

    var body: some View {
        HStack(spacing: 4) {
            if dayArrows {
                Button { Task { await model.step(-1) } } label: { arrow("chevron.left") }
                    // A card held over an arrow turns the day, as a folder opens under a carried file in Files.
                    .background { SpringLoaded(model: model) { Task { await model.step(-1) } } }
                    .accessibilityLabel("Previous Day")
            }
            if dayArrows {
                Button { Task { await model.showToday() } } label: { litText.frame(height: ColumnMetrics.titleRow).contentShape(.rect) }
                    .accessibilityHint("Back to today")
            } else if let list, list.canGroup {
                Menu {
                    Toggle(isOn: Binding(get: { list.grouped }, set: { on in Task { await model.setGrouping(list.column, on) } })) {
                        Label("Group by Project", systemImage: "folder")
                    }
                } label: {
                    litText.frame(height: ColumnMetrics.titleRow).contentShape(.rect)
                }
                .accessibilityAddTraits(.isHeader)
            } else {
                litText.accessibilityAddTraits(.isHeader)
            }
            if dayArrows {
                Button { Task { await model.step(1) } } label: { arrow("chevron.right") }
                    .background { SpringLoaded(model: model) { Task { await model.step(1) } } }
                    .accessibilityLabel("Next Day")
            }
        }
        .buttonStyle(.plain)
        .fontWeight(.semibold)
        .frame(height: ColumnMetrics.titleRow)
        .padding(.horizontal, dayArrows ? 0 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A day arrow: the whole 32-point square takes the tap, not only the chevron's strokes, which a plain button's label
    /// alone would.
    private func arrow(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .frame(width: 32, height: 32)
            .contentShape(.rect)
    }

    /// Lit under a carried card as a drop target, the way an empty section's plate lights: the accent on the drop's ground,
    /// in its own rounded box.
    private var litText: some View {
        Text(title)
            .font(.system(size: 20, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(lit ? Palette.accent(scheme) : Color.primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(lit ? Palette.dropBg(scheme) : .clear, in: .rect(cornerRadius: 10))
            .padding(.horizontal, -8)
    }
}

/// A section's name over its cards, as the plugin's header: 13 points semibold, its baseline on the first card.
struct SectionTitle: View {
    let title: String
    let muted: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text(title)
            .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
            .frame(height: ColumnMetrics.groupLeading)
            .foregroundStyle(muted ? Palette.muted : Palette.pullInk(scheme))
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, 4)
            .frame(height: ColumnMetrics.groupHead)
            .contentShape(.rect)
    }
}

/// A project's group header, the section header with two additions (board Proj1): a chevron before the title, turned down
/// while the group is open, which a tap on the header folds; folded, the count of its tasks after the title; and the arrow
/// that opens the project's note. «No project» is muted and has no arrow.
struct ProjectHeader: View {
    let project: BoardProject
    let column: BoardColumn
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .bold))
                .rotationEffect(.degrees(project.folded ? 0 : 90))
                .frame(width: 16, height: ColumnMetrics.groupLeading)
                .padding(.leading, -6)
            Text(project.title)
                .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
                .lineLimit(1)
                .frame(height: ColumnMetrics.groupLeading)
            if project.folded {
                // A card dropped into the folded part: the old number fades out and the new one in (decision 56).
                ZStack {
                    Text(verbatim: "\(project.count)")
                        .font(.system(size: 12, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.muted)
                        .id(project.count)
                        .transition(.opacity)
                }
                .frame(height: ColumnMetrics.groupLeading)
                .animation(.easeInOut(duration: 0.25), value: project.count)
            }
            if project.canOpenNote, let ref = project.project {
                Button { model.openProject(ref) } label: {
                    Image(systemName: "arrow.up.forward.app")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 28, height: ColumnMetrics.groupHead)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, -6)
                .accessibilityLabel("Open \(project.title)")
            }
            Spacer(minLength: 0)
        }
        // The fold in the rows' own time, not in one frame: the chevron turns, the count fades in or out and the arrow
        // slides beside it as the rows fold.
        .animation(CarryMotion.dropAnimation, value: project.folded)
        .foregroundStyle(project.zone.isNull ? Palette.muted : Palette.pullInk(scheme))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, CardMetrics.leading)
        .padding(.trailing, 4)
        .frame(height: ColumnMetrics.groupHead)
        .contentShape(.rect)
        .onTapGesture { Task { await model.toggleFold(column, project.key) } }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(project.folded ? "Collapsed, \(project.count) tasks" : "Expanded")
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
        SectionHeaderControl(group: group, column: column, model: model, menu: { rows }) { SectionTitle(title: title, muted: group.name == nil) }
            .frame(height: ColumnMetrics.groupHead)
            .alert("Rename Section", isPresented: $renaming) {
                TextField("Name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { if let menu = group.menu { Task { await model.renameSection(column, menu, to: name) } } }
            }
    }

    /// The header's menu as the core offers it: Rename, Remove Section; none for No section.
    private var rows: [UIMenuElement] {
        guard let menu = group.menu else { return [] }
        var rows: [UIMenuElement] = []
        if menu.rename {
            rows.append(UIAction(title: "Rename", image: UIImage(systemName: "pencil")) { _ in
                DispatchQueue.main.async {
                    name = menu.section
                    renaming = true
                }
            })
        }
        if menu.remove {
            rows.append(UIAction(title: "Remove Section", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
                Task { await model.removeSection(column, menu) }
            })
        }
        return rows
    }
}

/// The lifted section under the finger (`.tc-section-float`): its name and the number of its tasks on a card, two layers
/// of its tasks beneath.
struct SectionFloat: View {
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

    /// The floating section's shape, for the system's shadow round it: the card and its two layers.
    static var outline: UIBezierPath {
        let path = UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: width, height: height), cornerRadius: height / 2)
        for depth in [1, 2] as [CGFloat] {
            let layer = CGRect(x: step.width * depth, y: step.height * depth, width: width - 2 * step.width * depth, height: height)
            path.append(UIBezierPath(roundedRect: layer, cornerRadius: height / 2))
        }
        return path
    }

    private func layer(_ fill: Color, depth: CGFloat) -> some View {
        Capsule().fill(fill)
            .frame(width: Self.width - 2 * Self.step.width * depth, height: Self.height)
            .offset(x: Self.step.width * depth, y: Self.step.height * depth)
    }
}

/// The Done column, left of Inbox, as the plugin's: done and dropped tasks in the file's order. Only the search opens it;
/// a tap on a card opens its menu.
struct DoneColumn: View {
    @Bindable var model: BoardModel
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
                                menu: { later in model.cardMenu(card.item, from: "done", later: later) },
                                ringed: model.found == card.id,
                                draggable: false,
                                onTouch: { model.found = nil },
                                onLink: { model.openLink($0) },
                                onProject: model.projectOpener(card.item))
                                .frame(height: CardMetrics.height)
                                .id(card.id)
                        }
                        Color.clear.frame(height: ListCollection.trailingRoom)
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                }
                .scrollIndicators(.hidden)
                .softEdges(trailing: ListCollection.trailingRoom)
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
                    .strokeBorder(hot ? Palette.accent(scheme) : Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: hot ? [] : CardMetrics.dash))
            }
            .contentShape(.rect(cornerRadius: CardMetrics.radius))
            .onTapGesture { open?() }
            .accessibilityAddTraits(open == nil ? [] : .isButton)
    }
}

/// One card in a list: at its depth, with its branch. A tap opens its menu; a long press lifts it, the list's own drag.
/// Select Tasks puts the system's selection circle before it, as Mail and Reminders do. Carried, its row is its dashed
/// place, as the plugin's.
struct CardRow: View {
    let card: BoardCard
    let column: BoardColumn
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme

    /// A branch coming in: its fade ends as the rows' spring comes to rest, as fast as a glance; going, at once.
    static let branchComes = AnyTransition.asymmetric(
        insertion: .opacity.animation(.easeOut(duration: CarryMotion.branchFade).delay(CarryMotion.settles - CarryMotion.branchFade)),
        removal: .identity)

    /// The room the selection circle takes before the card.
    static let circleRoom: CGFloat = 32

    var body: some View {
        let selecting = model.selecting
        let picks = self.picks
        let hidden = model.isHidden(card)
        HStack(spacing: 10) {
            if picks, !hidden {
                SelectionCircle(on: model.picked.contains(card.id))
                    .frame(width: Self.circleRoom - 10)
                    .contentShape(.rect)
                    .onTapGesture { pick() }
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            // One card in and out of Select Tasks: the circle slides in beside it and it makes room, never a new card.
            CardButton(
                card: card,
                renamedText: model.entry.renamedTexts[card.id],
                menu: { later in selecting ? nil : model.cardMenu(card.item, later: later) },
                ringed: model.found == card.id,
                draggable: false,
                carried: model.isHidden(card),
                onTouch: { model.found = nil },
                onFold: card.item.can.fold && !selecting ? { Task { await model.toggleCollapsed(card.item) } } : nil,
                onLink: selecting ? nil : { model.openLink($0) },
                onProject: model.projectOpener(card.item),
                picking: picks ? CardButton.Picking(picked: model.picked.contains(card.id), count: model.picked.count) { pick() } : nil)
                .frame(height: CardMetrics.height)
                // Carried, the card's row is its dashed place, as the plugin keeps it (`is-waiting`), until the carry ends.
                .background { if model.isWaiting(card) { DashedPlace().transition(.identity) } }
                // The branch comes with the card's place (the drop's screen drawn), fading in as the row and the copy flying
                // into it come to rest, so it never travels with a row moving there.
                .overlay(alignment: .topLeading) { if let branch = card.branch, !model.isWaiting(card) { ComingBranch(branch: branch, flying: model.dropFlies).transition(Self.branchComes) } }
                .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
        }
        .frame(height: CardMetrics.height, alignment: .top)
    }

    /// Select Tasks picks this card: the core says which columns' cards are picked.
    private var picks: Bool { model.selecting && model.canPick(column.rawValue) }

    private func pick() {
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
    }
}

/// A subtask's branch that comes with a drop: it waits while the drop's copy flies and fades in once the copy is down
/// (the carry's end, heard from the flight's own completion), so it never travels with a row moving under the copy.
struct ComingBranch: View {
    let branch: Branch
    /// A drop's copy is flying now.
    let flying: Bool
    @State private var shown: Bool

    init(branch: Branch, flying: Bool) {
        self.branch = branch
        self.flying = flying
        _shown = State(initialValue: !flying)
    }

    var body: some View {
        BranchLine(branch: branch)
            .opacity(shown ? 1 : 0)
            .onChange(of: flying) { _, now in
                guard !now, !shown else { return }
                withAnimation(.easeOut(duration: CarryMotion.branchFade)) { shown = true }
            }
    }
}

/// Where a carried card was lifted from, as the plugin keeps it (`is-waiting`), and where a carried section would go
/// (`.tc-group-drop`): a dashed outline of a card.
struct DashedPlace: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: CardMetrics.radius)
            .strokeBorder(Palette.dash(scheme), style: StrokeStyle(lineWidth: 1, dash: CardMetrics.dash))
            .accessibilityHidden(true)
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
                            .frame(minWidth: Self.badge, minHeight: Self.badge)
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
    static let badge: CGFloat = 20

    /// The stack's shape, for the system's shadow round the carried stack: the card, its two layers and the number.
    static func outline(width: CGFloat, count: Int) -> UIBezierPath {
        let height = CardMetrics.height
        let path = UIBezierPath(roundedRect: CGRect(x: room, y: room, width: width, height: height), cornerRadius: height / 2)
        for depth in [1, 2] as [CGFloat] {
            let layer = CGRect(x: room + step.width * depth, y: room + step.height * depth, width: width - 2 * step.width * depth, height: height)
            path.append(UIBezierPath(roundedRect: layer, cornerRadius: height / 2))
        }
        let digits = CGFloat(String(count).count)
        let badgeWidth = max(badge, 12 + 7 * digits)
        path.append(UIBezierPath(roundedRect: CGRect(x: room + width + 6 - badgeWidth, y: room - 6, width: badgeWidth, height: badge), cornerRadius: badge / 2))
        path.usesEvenOddFillRule = false
        return path
    }

    private func layer(_ fill: Color, depth: CGFloat) -> some View {
        Capsule().fill(fill)
            .frame(width: width - 2 * Self.step.width * depth, height: CardMetrics.height)
            .offset(x: Self.step.width * depth, y: Self.step.height * depth)
    }
}

/// A floating copy (the carried stack or section, the menu's whole title): an image of the view at its own size, in the screen's look. A hosting
/// view made for a preview has had no layout yet and drew the copy cut, or blank, on a plate.
enum FloatImage {
    @MainActor
    static func view(_ content: some View, like host: UIView, in window: UIWindow) -> UIImageView? {
        let renderer = ImageRenderer(content: content.environment(\.colorScheme, host.traitCollection.userInterfaceStyle == .dark ? .dark : .light))
        renderer.scale = window.screen.scale
        guard let drawn = renderer.cgImage else { return nil }
        let image = UIImage(cgImage: drawn, scale: renderer.scale, orientation: .up)
        let view = UIImageView(image: image)
        view.frame = CGRect(origin: .zero, size: image.size)
        return view
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

