import SwiftUI

/// The app's one set of measures, taken from the system grouped form the Settings tab is: a screen built by hand uses
/// these, so it lines up with a `Form`.
enum Layout {
    /// From the screen's edges, between blocks, and above the bar at the bottom.
    static let margin: CGFloat = 16
    /// A card's corners, as a `Form` section's.
    static let cardRadius: CGFloat = 26
    /// How far inside its frame a large system glass button draws its circle: a row of them is moved out by this much
    /// so the circles line up with the cards above.
    static let glassButtonInset: CGFloat = 4
}

extension View {
    /// A block on the screen's ground, as a `Form` section stands: the grouped background's card colour and corners.
    func card() -> some View {
        background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: Layout.cardRadius))
    }

    /// The ground of a screen built by hand, the colour a `Form` lays under its sections.
    func screenGround() -> some View {
        background(Color(.systemGroupedBackground))
    }
}

/// An icon-only label in one square that follows the text size: round glass buttons with different symbols (a tall
/// trash, a short stop) come out the same size.
struct SquareIconLabelStyle: LabelStyle {
    @ScaledMetric private var side: CGFloat = 24

    func makeBody(configuration: Configuration) -> some View {
        configuration.icon.frame(width: side, height: side)
    }
}

extension LabelStyle where Self == SquareIconLabelStyle {
    static var squareIcon: SquareIconLabelStyle { SquareIconLabelStyle() }
}
