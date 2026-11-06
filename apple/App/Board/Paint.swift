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

    static func accent(_ scheme: ColorScheme) -> Color { scheme == .dark ? accentDark : accentLight }
    static func branch(_ scheme: ColorScheme) -> Color { scheme == .dark ? branchDark : branchLight }
    static func strong(_ scheme: ColorScheme) -> Color { scheme == .dark ? strongDark : strongLight }
    /// A plain card: the ground lifted towards the text.
    static func card(_ scheme: ColorScheme) -> Color { Color(.secondarySystemBackground) }
}

/// The card's measures, as the plugin draws a card (`docs/design/README.md`).
enum CardMetrics {
    static let height: CGFloat = 35
    static let radius: CGFloat = 17.5
    static let gap: CGFloat = 2
    static let leading: CGFloat = 14
    static let trailing: CGFloat = 10
    static let title: CGFloat = 15
    static let fade: CGFloat = 12
    static let indent: CGFloat = 20
    static let branchWidth: CGFloat = 1.5
    static let columnInset: CGFloat = 10
    static let hour: CGFloat = 50
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
