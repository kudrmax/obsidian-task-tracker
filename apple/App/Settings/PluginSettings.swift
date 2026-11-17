import Core
import SwiftUI

/// The plugin's settings (`data.json`) as the core's settings form reads them; every change is the core's `settings.*`
/// call, so the phone and Obsidian write them alike.
@MainActor
@Observable
final class PluginSettings {
    private let board = AppServices.shared.board
    private(set) var form: SettingsForm?
    /// Each preset colour's own shade in either theme, as the core draws presets: a typed code that is one reads as it.
    private(set) var presetInk: [String: Themed<String>] = [:]
    /// The six preset colours in the core's order (`PRIORITY_COLORS`).
    private(set) var presets: [String] = []
    /// A clear label's colour (`CLEAR_COLOR`): its swatch is No Color.
    private(set) var clear: String?
    private var shades: [String: Themed<Shades>] = [:]

    func load() async {
        let board = board
        form = try? await Task.detached { try board.read("settings.form", over: try board.files()) }.value
        if presetInk.isEmpty, let constants: [String: JSONValue] = try? board.rule("rules.constants") {
            presets = constants["PRIORITY_COLORS"]?.array.compactMap(\.string) ?? []
            clear = constants["CLEAR_COLOR"]?.string
            for preset in presets {
                let dark: String = (try? board.rule("rules.inkOf", [.string(preset), "dark"])) ?? preset
                let light: String = (try? board.rule("rules.inkOf", [.string(preset), "light"])) ?? preset
                presetInk[preset] = Themed(dark: dark, light: light)
            }
        }
        for mark in (form?.priorities ?? []) + (form?.labels ?? []) where shades[mark.color] == nil {
            if let found = board.markShades(mark.color) { shades[mark.color] = found }
        }
    }

    /// A level's or a label's card ground, as the cards on the screen are painted: a clear label's is a plain card's.
    func fill(_ color: String, _ scheme: ColorScheme) -> Color {
        guard let shades = shades[color] else { return Self.plainCard(scheme) }
        return Color(hex: scheme == .dark ? shades.dark.fill : shades.light.fill)
    }

    /// A plain card as the board draws it, on the screen's own level: the sheet's raised rows would lift the system's
    /// card ground onto their own and hide it.
    private static func plainCard(_ scheme: ColorScheme) -> Color {
        let traits = UITraitCollection { traits in
            traits.userInterfaceStyle = scheme == .dark ? .dark : .light
            traits.userInterfaceLevel = .base
        }
        return Color(UIColor.secondarySystemBackground.resolvedColor(with: traits))
    }

    func write(_ method: String, _ arguments: [JSONValue] = []) async {
        let board = board
        try? await Task.detached { try board.writeSettings(method, arguments) }.value
        await load()
    }

    /// A colour as a level or a label is drawn in either theme: a preset's own shade, any other as it is; none for a
    /// clear label.
    func ink(_ color: String, _ scheme: ColorScheme) -> Color? {
        board.markInk(color, dark: scheme == .dark).map { Color(hex: $0) }
    }

    /// The colours a level's row (`of == "level"`) or a label's row offers, as the core's form gives them.
    func swatches(_ of: String) -> [String] {
        (of == "level" ? form?.levelSwatches : form?.labelSwatches) ?? presets
    }

    /// A colour picked for a level or a label: the core reads it as a preset when it is one, and writes it.
    func recolour(_ of: String, _ index: Int, to color: Color, scheme: ColorScheme) async {
        let shades = JSONValue.object(presetInk.mapValues { .string(scheme == .dark ? $0.dark : $0.light) })
        let board = board
        let hex = color.hexCode
        guard let picked: String = try? await Task.detached(operation: {
            try board.read("settings.typedColour", [.string(of), .number(Double(index)), .string(hex), shades], over: try board.files())
        }).value else { return }
        await write(of == "level" ? "settings.recolourLevel" : "settings.recolourLabel", [.number(Double(index)), .string(picked)])
    }
}

extension Color {
    /// `#RRGGBB`, as the settings write a colour.
    var hexCode: String {
        let resolved = resolve(in: EnvironmentValues())
        let channel = { (value: Float) in Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", channel(resolved.red), channel(resolved.green), channel(resolved.blue))
    }
}
