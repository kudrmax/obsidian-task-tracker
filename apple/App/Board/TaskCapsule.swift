import Core
import SwiftUI

/// A task's card, as the plugin draws it: a capsule 35 tall, the title fading out over its last 12 points, the due date
/// in a column on the right, the in-progress dot in the left padding, the colour of its priority or first label.
struct TaskCapsule: View {
    let card: BoardCard
    /// Drawn instead of the task's text: its new text while its rename is written.
    var text: String?
    /// Drawn instead of a folded result's own title in its small line: its new title while its rename is written.
    var overText: String?
    var selecting = false
    var picked = false
    var ringed = false
    var height: CGFloat = CardMetrics.height
    /// The copy over a menu: the title wraps instead of fading, and the card grows down to hold its lines.
    var whole = false
    /// The whole copy Select Text lifts: its title is text to select, all of it selected; Copy hears `onCopied`.
    var selectable = false
    var onCopied: () -> Void = {}
    /// Where the subtask counter is drawn, in the capsule's own space: the card lays its fold button there.
    var onCounter: ((CGRect) -> Void)?
    /// Where the title's room is, in the capsule's own space: the menu's copy grows by what the title lacks of it.
    var onTitle: ((CGRect) -> Void)?
    /// Where each link of the title is drawn, in the capsule's own space: a tap there opens it instead of the menu.
    var onLinks: (([CardLink]) -> Void)?
    /// Where the project's folder mark is drawn, in the capsule's own space: the card lays its button there.
    var onMark: ((CGRect) -> Void)?
    /// Where a folded result's own line is drawn over its step, in the capsule's own space: a tap there opens the result's
    /// menu, anywhere else the step's.
    var onOver: ((CGRect) -> Void)?
    /// A search's find: the found pieces picked out of the title, and the project's name or the description's line under
    /// it where the query was found there, as the plugin's search draws its cards.
    var found: SearchHit?

    @Environment(\.colorScheme) private var scheme

    private static let space = "capsule"
    /// On the timeline the card's content stands at its top, the corner beside the title's first line.
    private var onTimeline: Bool { card.corner != nil || height != CardMetrics.height }
    /// The line a find shows under the title: the project's name when the query was found there, else the description's.
    private var snippet: [FoundPart]? { found.flatMap { $0.project ?? $0.description } }

    var body: some View {
        HStack(alignment: onTimeline || whole ? .top : .center, spacing: 6) {
            if selecting { pickCircle }
            if whole {
                // The copy over a menu shows the whole title, on as many lines as the width it was given needs.
                VStack(alignment: .leading, spacing: 0) {
                    if let over = card.face.over { overLine(overText ?? over) }
                    Group {
                        if selectable {
                            SelectableTitle(parts: parts, closed: card.item.closed, onCopied: onCopied)
                        } else {
                            title.fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: CardMetrics.titleLine, alignment: .leading)
                }
            } else if let found {
                foundTitle(found)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    if let over = card.face.over { overLine(overText ?? over) }
                    // The title never widens the card: it runs on past the room and fades out over its last points.
                    Color.clear
                        .frame(maxWidth: .infinity, minHeight: CardMetrics.titleLine, maxHeight: CardMetrics.titleLine)
                        .overlay(alignment: .leading) { linedTitle }
                        .mask(fadeMask)
                        .accessibilityElement(children: .combine)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { onTitle?($0) }
                }
            }
            if card.item.project?.mark == true { projectMark }
            if card.item.progress != nil || card.item.description != nil { meta }
            if let corner = card.corner { stackCorner(corner) }
            if let due = card.due {
                dueCorner(due)
            } else if card.repeats {
                repeatIcon.frame(minWidth: 24)
            }
        }
        .padding(.leading, CardMetrics.leading)
        .padding(.trailing, CardMetrics.trailing)
        .padding(.top, onTimeline || whole ? edge : snippet == nil ? 0 : Self.snippetPad)
        .padding(.bottom, whole ? edge : snippet == nil ? 0 : Self.snippetPad)
        .frame(maxWidth: .infinity, minHeight: max(height, base), maxHeight: onTimeline || whole || snippet != nil ? .infinity : base, alignment: onTimeline || whole ? .top : .center)
        .frame(height: whole || snippet != nil ? nil : max(height, base), alignment: .top)
        .background(alignment: .topLeading) {
            if card.item.inProgress, !selecting {
                Circle().fill(metaInk(shades)).frame(width: 4, height: 4)
                    .offset(x: 5, y: (base - 4) / 2)
                    .accessibilityLabel("In progress")
            }
        }
        .background { ground.clipShape(.rect(cornerRadius: CardMetrics.radius)) }
        .background(alignment: .bottom) {
            // Its subtasks folded away: a card peeking out under it.
            if card.item.collapsed {
                ground
                    .opacity(0.55)
                    .clipShape(.rect(cornerRadius: CardMetrics.radius))
                    .frame(height: base)
                    .padding(.horizontal, 8)
                    .offset(y: 4)
            }
        }
        .overlay {
            if ringed {
                RoundedRectangle(cornerRadius: CardMetrics.radius + 2).stroke(Palette.accent(scheme), lineWidth: 2).padding(-2)
            }
        }
        .contentShape(.rect(cornerRadius: CardMetrics.radius))
        .coordinateSpace(.named(Self.space))
    }

    /// A find's title: the found pieces picked out as the plugin's search marks them (the selection's ground, semibold),
    /// fading at the end; under it the project's name or the description's line it was found in, small and muted.
    private func foundTitle(_ hit: SearchHit) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .frame(maxWidth: .infinity, minHeight: CardMetrics.titleLine, maxHeight: CardMetrics.titleLine)
                .overlay(alignment: .leading) {
                    marked(hit.title.isEmpty ? [FoundPart(text: card.item.title, match: false)] : hit.title, size: CardMetrics.title)
                        .font(.system(size: CardMetrics.title))
                        .foregroundStyle(card.item.closed ? Palette.muted : Color.primary)
                        .strikethrough(card.item.closed, color: Palette.muted)
                        .lineLimit(1)
                        .fixedSize()
                }
                .mask(fadeMask)
            if let snippet {
                Color.clear
                    .frame(maxWidth: .infinity, minHeight: Self.snippetLine, maxHeight: Self.snippetLine)
                    .overlay(alignment: .leading) {
                        marked(snippet, size: Self.snippetFont).font(.system(size: Self.snippetFont)).foregroundStyle(Palette.muted).lineLimit(1).fixedSize()
                    }
                    .mask(fadeMask)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Found pieces in a line: the found ones on the selection's ground, semibold (`mark.tc-hit`).
    private func marked(_ parts: [FoundPart], size: CGFloat) -> Text {
        var text = AttributedString()
        for part in parts {
            var piece = AttributedString(part.text)
            if part.match {
                piece.backgroundColor = Palette.selection(scheme)
                piece.font = .system(size: size, weight: .semibold)
            }
            text += piece
        }
        return Text(text)
    }

    /// The snippet's type and line (`--tc-font-block`, `--tc-leading-block`), and the room over and under a card that
    /// has one (`--tc-space-6`).
    private static let snippetFont: CGFloat = 12
    private static let snippetLine: CGFloat = 15
    private static let snippetPad: CGFloat = 6

    /// The card's own height: a folded result's card of two lines is taller.
    private var base: CGFloat { card.listHeight }
    /// The room over the title's lines (and under them on a menu's copy).
    private var edge: CGFloat { (base - CardMetrics.titleLine - (card.face.twoLines ? CardMetrics.overLine : 0)) / 2 }

    /// A folded result's own title over its step (results, point 4): small, in the caption colour, after a target, on one
    /// line fading out as a title does.
    private func overLine(_ over: String) -> some View {
        Color.clear
            .frame(maxWidth: .infinity, minHeight: CardMetrics.overLine, maxHeight: CardMetrics.overLine)
            .overlay(alignment: .leading) {
                HStack(spacing: 3) {
                    Image(systemName: "scope").font(.system(size: CardMetrics.overFont, weight: .semibold))
                    Text(verbatim: over).font(.system(size: CardMetrics.overFont))
                }
                .foregroundStyle(metaColor)
                .lineLimit(1)
                .fixedSize()
            }
            .mask(fadeMask)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Result \(over)")
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { onOver?($0) }
    }

    /// The title's pieces: the card's, or its new text alone while its rename is written.
    private var parts: [TextPart] { text.map { [TextPart(text: $0)] } ?? card.parts }

    /// The title as the plugin's card writes it: the text as typed, each link by its word in the accent.
    private var title: Text {
        parts.reduce(Text(verbatim: "")) { text, part in
            text + (part.isLink ? Text(verbatim: part.shown).foregroundColor(Palette.accent(scheme)) : Text(verbatim: part.shown))
        }
        .font(.system(size: CardMetrics.title))
        .foregroundStyle(card.item.closed ? Palette.muted : Color.primary)
        .strikethrough(card.item.closed, color: Palette.muted)
    }

    /// The title on its one line, each piece its own text so a link's place is known for the tap that opens it.
    @ViewBuilder private var linedTitle: some View {
        if parts.contains(where: \.isLink) {
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                    piece(part)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { frame in
                            guard part.isLink else { return }
                            linkFrames[index] = CardLink(part: part, frame: frame)
                        }
                }
            }
            .lineLimit(1)
            .fixedSize()
            .font(.system(size: CardMetrics.title))
            .strikethrough(card.item.closed, color: Palette.muted)
            .onChange(of: linkFrames, initial: true) { onLinks?(Array(linkFrames.values)) }
        } else {
            title.lineLimit(1).fixedSize()
        }
    }

    @State private var linkFrames: [Int: CardLink] = [:]

    private func piece(_ part: TextPart) -> Text {
        Text(verbatim: part.shown).foregroundColor(part.isLink ? Palette.accent(scheme) : card.item.closed ? Palette.muted : Color.primary)
    }

    /// The subtask counter over the description's mark, as the plugin stacks them; either alone when the task has only it.
    private var meta: some View {
        let pair = card.item.progress != nil && card.item.description != nil
        return VStack(spacing: 2) {
            if let progress = card.item.progress {
                Text(verbatim: "\(progress.done)/\(progress.total)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                    .frame(height: pair ? 13 : 18)
                    .foregroundStyle(metaColor)
                    .accessibilityLabel("\(progress.done) of \(progress.total) subtasks done")
            }
            if card.item.description != nil {
                Image(systemName: "text.alignleft")
                    .font(.system(size: pair ? 9 : 11, weight: .semibold))
                    .frame(height: pair ? 11 : 13)
                    .foregroundStyle(metaColor)
                    .accessibilityLabel("Has notes")
            }
        }
        .frame(minWidth: 22)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { onCounter?($0) }
    }

    /// The task's project (board Proj2V1): a folder in the caption colour at the card's right edge, left of the date, the
    /// repeat and the counter, as narrow as the glyph (projects polish, point 4); its button is wider and lies over the
    /// title's faded end (`CardControl`). The card's height does not change.
    private var projectMark: some View {
        Image(systemName: "folder")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(metaColor)
            .fixedSize()
            .frame(height: 18)
            .accessibilityLabel("Project \(card.item.project?.name ?? "")")
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { onMark?($0) }
    }

    /// A list card's corner: the due day over its month, the repeat mark beside the day; it grows with what it holds.
    private func dueCorner(_ due: DueLabel) -> some View {
        VStack(spacing: 1) {
            HStack(spacing: 2) {
                Text(due.day).font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundStyle(Palette.strong(scheme))
                if card.repeats { repeatIcon }
            }
            .frame(height: 13)
            Text(due.month).font(.system(size: 9, weight: .semibold)).kerning(0.3).frame(height: 9).foregroundStyle(metaColor)
        }
        .lineLimit(1)
        .fixedSize()
        .frame(minWidth: 24)
    }

    /// A timeline card's corner: its start when stacked, or its duration when the card is shorter, the two parts one over
    /// the other in the small type.
    private func stackCorner(_ parts: [String]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                Text(part).frame(height: 10)
            }
        }
        .font(.system(size: 9, weight: .semibold))
        .monospacedDigit()
        .lineLimit(1)
        .fixedSize()
        .foregroundStyle(metaColor)
        .frame(minWidth: 14)
        .padding(.top, -1)
        .accessibilityElement(children: .combine)
    }

    private var shades: Shades? { card.shades.map { scheme == .dark ? $0.dark : $0.light } }
    private var fill: Color { shades.map { Color(hex: $0.fill) } ?? Palette.card(scheme) }

    /// The card's ground: its one colour, or, for several labels, each one's fill as stripes or a blend.
    @ViewBuilder private var ground: some View {
        if let paint = card.paint, let fills = LabelFills(paint, scheme) {
            fills
        } else {
            Rectangle().fill(fill)
        }
    }
    private var metaColor: Color { metaInk(shades) }
    private func metaInk(_ shades: Shades?) -> Color { shades.map { Color(hex: $0.meta) } ?? Palette.muted }

    private var fadeMask: some View {
        HStack(spacing: 0) {
            Rectangle()
            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: CardMetrics.fade)
        }
    }

    private var repeatIcon: some View {
        Image(systemName: "repeat")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(metaColor)
            .accessibilityLabel("Repeats")
    }

    private var pickCircle: some View {
        ZStack {
            Circle().strokeBorder(picked ? Palette.accent(scheme) : Color(.tertiaryLabel), lineWidth: 1.5)
            if picked {
                Circle().fill(Palette.accent(scheme))
                Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: 20, height: 20)
        .accessibilityLabel(picked ? "Selected" : "Not selected")
    }
}

/// A link of a card's title and where it is drawn.
struct CardLink: Equatable {
    let part: TextPart
    let frame: CGRect
}

/// A card of several labels, painted as the plugin paints it (`styles.css`, «A task with several labels»): narrow bands
/// of their fills in turn across the card at a slant, or, with the settings' blend, one fill flowing into the next from
/// left to right. The core gives at most `MOST_CARD_COLORS` colours.
struct LabelFills: View {
    let fills: [Color]
    let blend: Bool

    /// A band's width across (`--tc-label-stripe`) and the slant, as CSS turns a gradient (`--tc-label-stripe-angle`).
    static let stripe: CGFloat = 6
    static let angle: Angle = .degrees(120)

    init?(_ paint: CardPaint, _ scheme: ColorScheme) {
        guard paint.colors.count > 1 else { return nil }
        fills = paint.colors.map { Color(hex: scheme == .dark ? $0.dark.fill : $0.light.fill) }
        blend = paint.blend
    }

    var body: some View {
        if blend {
            LinearGradient(colors: fills, startPoint: .leading, endPoint: .trailing)
        } else {
            Canvas { context, size in
                // CSS measures a gradient's stops along its line from the corner it starts at: for this slant the
                // top left, the bands square to the line.
                let along = CGVector(dx: sin(Self.angle.radians), dy: -cos(Self.angle.radians))
                let across = CGVector(dx: -along.dy, dy: along.dx)
                let reach = size.width + size.height
                let length = size.width * along.dx + size.height * along.dy
                var band = 0
                while CGFloat(band) * Self.stripe < length {
                    // Each band reaches a hair into the next, which covers it: no seam of the ground between them.
                    let near = CGFloat(band) * Self.stripe, far = near + Self.stripe + 0.5
                    var path = Path()
                    path.move(to: CGPoint(x: along.dx * near - across.dx * reach, y: along.dy * near - across.dy * reach))
                    path.addLine(to: CGPoint(x: along.dx * near + across.dx * reach, y: along.dy * near + across.dy * reach))
                    path.addLine(to: CGPoint(x: along.dx * far + across.dx * reach, y: along.dy * far + across.dy * reach))
                    path.addLine(to: CGPoint(x: along.dx * far - across.dx * reach, y: along.dy * far - across.dy * reach))
                    path.closeSubpath()
                    context.fill(path, with: .color(fills[band % fills.count]))
                    band += 1
                }
            }
        }
    }
}

/// The lines from a task to its subtasks, as a folder tree draws them: the row's own line goes on to a sibling or bends
/// in with a rounded corner at the last, and the lines of the tasks further up that go on past the row run through it.
struct BranchLine: View {
    let branch: Branch
    /// The row's card height: a folded result's card of two lines is taller.
    var card: CGFloat = CardMetrics.height
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let color = Palette.branch(scheme)
        let mid = card / 2
        let height = card + 4 + CardMetrics.gap
        let reach = CGFloat(branch.through.count) * CardMetrics.indent
        Canvas { context, size in
            var path = Path()
            let own = reach
            path.move(to: CGPoint(x: own, y: 0))
            if branch.last {
                path.addLine(to: CGPoint(x: own, y: mid + 4 - 6))
                path.addQuadCurve(to: CGPoint(x: own + 6, y: mid + 4), control: CGPoint(x: own, y: mid + 4))
            } else {
                path.addLine(to: CGPoint(x: own, y: size.height))
                path.move(to: CGPoint(x: own, y: mid + 4))
            }
            path.addLine(to: CGPoint(x: size.width, y: mid + 4))
            for (k, on) in branch.through.enumerated() where on {
                let x = CGFloat(k) * CardMetrics.indent
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
            }
            context.stroke(path, with: .color(color), lineWidth: CardMetrics.branchWidth)
        }
        .frame(width: 11 + reach, height: height)
        .offset(x: -11 - reach, y: -4)
        .accessibilityHidden(true)
    }
}
