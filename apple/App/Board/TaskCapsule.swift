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

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 6) {
            if selecting { pickCircle }
            // The title never widens the card: it runs on past the room and fades out over its last points.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: 18)
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
            if let progress = card.item.progress, card.item.can.fold || card.item.collapsed {
                Text(verbatim: "\(progress.done)/\(progress.total)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(meta)
                    .accessibilityLabel("\(progress.done) of \(progress.total) subtasks done")
            }
            if card.item.description != nil {
                Image(systemName: "text.alignleft")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(meta)
                    .accessibilityLabel("Has notes")
            }
            if let due = card.due {
                VStack(spacing: 1) {
                    HStack(spacing: 2) {
                        Text(due.day).font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.strong(scheme))
                        if card.repeats { repeatIcon }
                    }
                    .frame(height: 13)
                    Text(due.month).font(.system(size: 9, weight: .semibold)).kerning(0.3).foregroundStyle(meta)
                }
                .frame(width: 24)
            } else if card.repeats {
                repeatIcon
            }
        }
        .padding(.leading, CardMetrics.leading)
        .padding(.trailing, CardMetrics.trailing)
        .frame(maxWidth: .infinity, minHeight: CardMetrics.height, maxHeight: CardMetrics.height)
        .frame(height: max(height, CardMetrics.height), alignment: .top)
        .background(alignment: .topLeading) {
            if card.item.inProgress {
                Circle().fill(meta).frame(width: 4, height: 4)
                    .offset(x: 5, y: (CardMetrics.height - 4) / 2)
                    .accessibilityLabel("In progress")
            }
        }
        .background(fill, in: .rect(cornerRadius: CardMetrics.radius))
        .overlay {
            if ringed {
                RoundedRectangle(cornerRadius: CardMetrics.radius + 2).stroke(Palette.accent(scheme), lineWidth: 2).padding(-2)
            }
        }
        .contentShape(.rect(cornerRadius: CardMetrics.radius))
    }

    private var shades: Shades? { card.shades.map { scheme == .dark ? $0.dark : $0.light } }
    private var fill: Color { shades.map { Color(hex: $0.fill) } ?? Palette.card(scheme) }
    private var meta: Color { shades.map { Color(hex: $0.meta) } ?? Palette.muted }

    private var fadeMask: some View {
        HStack(spacing: 0) {
            Rectangle()
            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: CardMetrics.fade)
        }
    }

    private var repeatIcon: some View {
        Image(systemName: "repeat")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(meta)
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

/// The line from a task to its subtasks, as a folder tree draws it: the last one's turns with a rounded corner.
struct BranchLine: View {
    let branch: Branch
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let color = Palette.branch(scheme)
        let mid = CardMetrics.height / 2
        Canvas { context, size in
            var path = Path()
            path.move(to: CGPoint(x: 0, y: 0))
            switch branch {
            case .mid:
                path.addLine(to: CGPoint(x: 0, y: size.height))
                path.move(to: CGPoint(x: 0, y: mid + 4))
                path.addLine(to: CGPoint(x: size.width, y: mid + 4))
            case .last:
                path.addLine(to: CGPoint(x: 0, y: mid + 4 - 6))
                path.addQuadCurve(to: CGPoint(x: 6, y: mid + 4), control: CGPoint(x: 0, y: mid + 4))
                path.addLine(to: CGPoint(x: size.width, y: mid + 4))
            }
            context.stroke(path, with: .color(color), lineWidth: CardMetrics.branchWidth)
        }
        .frame(width: 11, height: CardMetrics.height + 4 + CardMetrics.gap)
        .offset(x: -11, y: -4)
        .accessibilityHidden(true)
    }
}
