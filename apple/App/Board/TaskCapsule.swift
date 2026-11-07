import Core
import SwiftUI

/// A task's card, as the plugin draws it: a capsule 35 tall, the title fading out over its last 12 points, the due date
/// in a column on the right, the in-progress dot in the left padding, the colour of its priority or first label.
struct TaskCapsule: View {
    let card: BoardCard
    var selecting = false
    var picked = false
    var ringed = false
    var height: CGFloat = CardMetrics.height
    /// Where the subtask counter is drawn, in the capsule's own space: the card lays its fold button there.
    var onCounter: ((CGRect) -> Void)?

    @Environment(\.colorScheme) private var scheme

    private static let space = "capsule"
    /// On the timeline the card's content stands at its top, the corner beside the title's first line.
    private var onTimeline: Bool { card.corner != nil || height != CardMetrics.height }

    var body: some View {
        HStack(alignment: onTimeline ? .top : .center, spacing: 6) {
            if selecting { pickCircle }
            // The title never widens the card: it runs on past the room and fades out over its last points.
            Color.clear
                .frame(maxWidth: .infinity, minHeight: 18, maxHeight: 18)
                .overlay(alignment: .leading) {
                    Text(card.item.text)
                        .font(.system(size: CardMetrics.title))
                        .lineLimit(1)
                        .fixedSize()
                        .foregroundStyle(card.item.closed ? Palette.muted : Color.primary)
                        .strikethrough(card.item.closed, color: Palette.muted)
                }
                .mask(fadeMask)
                .accessibilityElement(children: .combine)
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
        .padding(.top, onTimeline ? (CardMetrics.height - 18) / 2 : 0)
        .frame(maxWidth: .infinity, minHeight: CardMetrics.height, maxHeight: onTimeline ? .infinity : CardMetrics.height, alignment: onTimeline ? .top : .center)
        .frame(height: max(height, CardMetrics.height), alignment: .top)
        .background(alignment: .topLeading) {
            if card.item.inProgress, !selecting {
                Circle().fill(metaInk(shades)).frame(width: 4, height: 4)
                    .offset(x: 5, y: (CardMetrics.height - 4) / 2)
                    .accessibilityLabel("In progress")
            }
        }
        .background(fill, in: .rect(cornerRadius: CardMetrics.radius))
        .background(alignment: .bottom) {
            // Its subtasks folded away: a card peeking out under it.
            if card.item.collapsed {
                RoundedRectangle(cornerRadius: CardMetrics.radius)
                    .fill(fill.opacity(0.55))
                    .frame(height: CardMetrics.height)
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

/// The lines from a task to its subtasks, as a folder tree draws them: the row's own line goes on to a sibling or bends
/// in with a rounded corner at the last, and the lines of the tasks further up that go on past the row run through it.
struct BranchLine: View {
    let branch: Branch
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let color = Palette.branch(scheme)
        let mid = CardMetrics.height / 2
        let height = CardMetrics.height + 4 + CardMetrics.gap
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
