import Foundation

/// A level's or a label's colour as the app draws it, asked of the core: a colour the core can draw (`rules.usableColor`)
/// has an ink and shades; any other, a clear label's `"clear"` above all, has none and is drawn untinted.
extension TaskBoard {
    /// The colour's ink in either theme (`#RRGGBB`), `nil` when it paints nothing. A host asks once per colour and keeps it.
    public func markInk(_ color: String) -> Themed<String>? {
        guard markPaints(color),
              let dark: String = try? rule("rules.inkOf", [.string(color), "dark"]),
              let light: String = try? rule("rules.inkOf", [.string(color), "light"]) else { return nil }
        return Themed(dark: dark, light: light)
    }

    /// The colour's card shades in both themes, `nil` when it paints nothing.
    public func markShades(_ color: String) -> Themed<Shades>? {
        guard markPaints(color),
              let dark: Shades = try? rule("rules.shadesOf", [.string(color), "dark"]),
              let light: Shades = try? rule("rules.shadesOf", [.string(color), "light"]) else { return nil }
        return Themed(dark: dark, light: light)
    }

    /// The colour a label is given to paint nothing (`CLEAR_COLOR`): the swatch the Labels page draws as No Color.
    public func clearColor() -> String? {
        (try? rule("rules.constants", as: JSONValue.self))?["CLEAR_COLOR"].string
    }

    /// Whether the colour paints: a clear label's does not, and its tile is drawn as an uncoloured one.
    public func markPaints(_ color: String) -> Bool {
        (try? rule("rules.usableColor", [.string(color)], as: Bool.self)) ?? false
    }
}
