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
    private var shades: [String: Themed<Shades>] = [:]
    /// The timeline's zoom levels as the settings keep them, in the plugin's words (`28, 56, 112, 224`).
    private(set) var zoomLevels = ""
    /// Obsidian updates internal links on a rename (`alwaysUpdateLinks` in the vault's `.obsidian/app.json`, on unless
    /// it says false, as the plugin reads it): off, the Project tag tells to turn it on.
    private(set) var updatesLinks = true

    func load() async {
        let board = board
        form = try? await Task.detached { try board.read("settings.form", over: try board.files()) }.value
        if let levels: JSONValue = try? board.read("timeline.zoomLevels", over: board.settingsOnly()),
           let words: String = try? board.rule("rules.formatZoomLevels", [levels]) {
            zoomLevels = words
        }
        let config = AppServices.shared.vault.read(path: ".obsidian/app.json").flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String: Any] }
        updatesLinks = (config?["alwaysUpdateLinks"] as? Bool) != false
        if presetInk.isEmpty, let constants: [String: JSONValue] = try? board.rule("rules.constants") {
            for preset in constants["PRIORITY_COLORS"]?.array.compactMap(\.string) ?? [] {
                let dark: String = (try? board.rule("rules.inkOf", [.string(preset), "dark"])) ?? preset
                let light: String = (try? board.rule("rules.inkOf", [.string(preset), "light"])) ?? preset
                presetInk[preset] = Themed(dark: dark, light: light)
            }
        }
        for mark in (form?.priorities ?? []) + (form?.labels ?? []) where shades[mark.color] == nil {
            if let dark: Shades = try? board.rule("rules.shadesOf", [.string(mark.color), "dark"]),
               let light: Shades = try? board.rule("rules.shadesOf", [.string(mark.color), "light"]) {
                shades[mark.color] = Themed(dark: dark, light: light)
            }
        }
    }

    /// A level's or a label's card ground, as the cards on the screen are painted.
    func fill(_ color: String, _ scheme: ColorScheme) -> Color {
        guard let shades = shades[color] else { return Palette.card(scheme) }
        return Color(hex: scheme == .dark ? shades.dark.fill : shades.light.fill)
    }

    func write(_ method: String, _ arguments: [JSONValue] = []) async {
        let board = board
        try? await Task.detached { try board.writeSettings(method, arguments) }.value
        await load()
    }

    /// A colour as a level or a label is drawn in either theme: a preset's own shade, any other as it is.
    func ink(_ color: String, _ scheme: ColorScheme) -> Color {
        if let preset = presetInk[color] { return Color(hex: scheme == .dark ? preset.dark : preset.light) }
        return Color(hex: color)
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
