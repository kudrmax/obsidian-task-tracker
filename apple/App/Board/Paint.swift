import Core
import SwiftUI

/// The board's own colours, from the design's palette (`docs/design`, «Палитра»): what is not a system colour.
enum Palette {
    static let accentDark = Color(hex: "#9580FF")
    static let accentLight = Color(hex: "#8A5CF5")
    static let branchDark = Color(hex: "#48484A")
    static let branchLight = Color(hex: "#C7C7CC")
    static let muted = Color(hex: "#8E8E93")
    static let strongDark = Color(hex: "#E5E5EA")
    static let strongLight = Color(hex: "#3A3A3C")

    /// The timeline's lines and marks (`--tc-hour-line`, `--tc-minor-line`, `--tc-minor-label`, `--tc-now`).
    static func hourLine(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#232325" : "#EFEFF4") }
    static func minorLine(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#161618" : "#F6F6F9") }
    static func minorLabel(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#636366" : "#AEAEB2") }
    static func now(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#D92C24" : "#FF3B30") }

    static func accent(_ scheme: ColorScheme) -> Color { scheme == .dark ? accentDark : accentLight }
    static func branch(_ scheme: ColorScheme) -> Color { scheme == .dark ? branchDark : branchLight }
    static func strong(_ scheme: ColorScheme) -> Color { scheme == .dark ? strongDark : strongLight }
    /// A section's name over its tasks (`--tc-pull-ink`).
    static func pullInk(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#AEAEB2" : "#6C6C70") }
    /// A drop's lit plate (`--tc-drop-bg`) and a waiting place's dashes (`--tc-dash`).
    static func dropBg(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#251F3D" : "#F1ECFE") }
    static func dash(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "#3A3A3C" : "#C7C7CC") }
    /// A search's found piece (`--tc-selection`).
    static func selection(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(.sRGB, red: 149 / 255, green: 128 / 255, blue: 1, opacity: 0.38) : Color(.sRGB, red: 138 / 255, green: 92 / 255, blue: 245 / 255, opacity: 0.28) }
    /// A plain card: the ground lifted towards the text.
    static func card(_ scheme: ColorScheme) -> Color { Color(.secondarySystemBackground) }
}

/// A column's head and sections, as the plugin spaces them: the title's row (`--tc-day-row`), the gap under it to the
/// list (`--tc-head-gap`), a section's header (`--tc-group-head-h`, its name 13 on a 20 line) and the room above every
/// header but the first (`--tc-section-gap`).
enum ColumnMetrics {
    static let titleRow: CGFloat = 36
    static let headGap: CGFloat = 4
    static let groupHead: CGFloat = 26
    static let groupName: CGFloat = 13
    static let groupLeading: CGFloat = 20
    static let sectionGap: CGFloat = 10
    /// The corner of a section header's lifted and landing shape.
    static let headRadius: CGFloat = 8
}

/// The shared settings' size of a card, observed: every view that reads it while it draws is drawn again when it
/// changes, as the plugin's `--tc-card-h` and `--tc-card-gap` restyle every card at once.
@Observable
final class CardSize: @unchecked Sendable {
    static let shared = CardSize()
    var height: CGFloat = 35
    var gap: CGFloat = 2
    /// When a touch becomes a carry, on a card and on the empty calendar alike (Settings → Long press delay), seconds.
    var press: TimeInterval = 0.25
}

/// The card's measures, as the plugin draws a card (`docs/design/README.md`). The height and the gap are the shared
/// settings' (Settings → Cards), as the plugin sets its `--tc-card-h` and `--tc-card-gap` for the whole screen: the screen
/// sets them from each read (`follow(_:)`) into `CardSize`, which every card drawn observes; the ends of a card round at
/// half its height.
enum CardMetrics {
    static var height: CGFloat { CardSize.shared.height }
    static var radius: CGFloat { height / 2 }
    static var gap: CGFloat { CardSize.shared.gap }
    static var press: TimeInterval { CardSize.shared.press }

    /// The shared settings' size of a card, read with the screen: true when it changed.
    @discardableResult
    static func follow(_ look: ScreenSettings) -> Bool {
        let size = CardSize.shared
        let changed = size.height != CGFloat(look.cardHeight) || size.gap != CGFloat(look.cardGap)
        let press = TimeInterval(look.longPressMs) / 1000
        if size.press != press { size.press = press }
        if size.height != CGFloat(look.cardHeight) { size.height = CGFloat(look.cardHeight) }
        if size.gap != CGFloat(look.cardGap) { size.gap = CGFloat(look.cardGap) }
        return changed
    }
    static let leading: CGFloat = 14
    static let trailing: CGFloat = 10
    static let title: CGFloat = 15
    /// A title's line (`--tc-leading-card`): one on a card, as many as a copy over the menu needs.
    static let titleLine: CGFloat = 18
    static let fade: CGFloat = 12
    /// What a copy grown over a menu keeps from the window's edges (`--tc-whole-margin`).
    static let wholeMargin: CGFloat = 10
    static let indent: CGFloat = 20
    /// The drop line's dot (`--tc-drop-dot`) and its line.
    static let dropDot: CGFloat = 8
    static let dropLine: CGFloat = 2
    /// The dashed edge of a place (the lifted card's, an empty section's plate): its dash and gap.
    static let dash: [CGFloat] = [4, 3]
    /// How far past the place shown the finger goes before another is shown (`LAYOUT.dropHysteresis`).
    static let dropHysteresis: Double = 6
    /// How strongly a menu tile that can't be pressed shows (`--tc-tile-off-opacity`).
    static let tileOffOpacity: CGFloat = 0.35
    static let branchWidth: CGFloat = 1.5
    static let columnInset: CGFloat = 10
    /// The hour's height the screen is read at; the timeline stacks its cards anew at the zoom it shows.
    static let hour: CGFloat = 56
    /// The timeline's measures the core lays out the stack of task cards in, as the plugin's design has them.
    static var timeline: TimelineMeasures { TimelineMeasures(hour: hour, cardHeight: height, cardGap: gap, itemInset: 1, itemGap: 2, overlayInset: 18) }
}

extension Color {
    /// `#RRGGBB` or `rgba(r, g, b, a)`, as the core writes colours.
    init(hex text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("rgba(") {
            let parts = trimmed.dropFirst(5).dropLast().split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
            self = Color(.sRGB, red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255, opacity: parts.count > 3 ? parts[3] : 1)
            return
        }
        let hex = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
        let value = UInt64(hex, radix: 16) ?? 0
        self = Color(.sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }
}

extension View {
    /// The design's accent over the whole app, in either theme: the selected tab, the glass checks, links, the cursor.
    func boardTint() -> some View { modifier(BoardTint()) }
}

private struct BoardTint: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.tint(Palette.accent(scheme))
    }
}
