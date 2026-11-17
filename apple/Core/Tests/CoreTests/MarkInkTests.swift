import Foundation
import Testing
@testable import Core

/// A clear label (`"clear"`, no colour): the app reads its colour from the core and draws it untinted, never as a hex.
@Suite struct MarkInkTests {
    static let file = Fixtures.file("- [ ] Both #label/Focus #label/Skip", "- [ ] Skipped #label/Skip", "- [ ] Focused #label/Focus")
    static let settings = #"{"labels":[{"name":"Focus","color":"blue"},{"name":"Skip","color":"clear"}]}"#
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board() -> (TaskBoard, FakeVault) {
        let vault = FakeVault(Self.file)
        vault.settings = Self.settings
        return (TaskBoard(core: core, vault: vault), vault)
    }

    @Test func aClearColourHasNoInkAndNoShades() throws {
        let (board, _) = board()
        let clear = try #require(board.clearColor())
        #expect(!board.markPaints(clear))
        #expect(board.markPaints("blue"))
        #expect(board.markInk(clear) == nil)
        #expect(board.markShades(clear) == nil)
        #expect(board.markInk("blue") == Themed(dark: "#0A84FF", light: "#007AFF"))
        #expect(board.markInk("#123456") == Themed(dark: "#123456", light: "#123456"))
        #expect(board.markShades("blue")?.dark == (try board.rule("rules.shadesOf", ["blue", "dark"], as: Shades.self)))
        #expect(board.markInk("nonsense") == nil)
    }

    @Test func aLabelsRowOffersNoColorAfterThePresetsAndAPrioritysDoesNot() throws {
        let (board, vault) = board()
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        let clear = try #require(board.clearColor())
        #expect(form.labelSwatches == form.levelSwatches + [clear])
        #expect(!form.levelSwatches.contains(clear))
        #expect(form.labels.map(\.color) == ["blue", clear])
        try board.writeSettings("settings.recolourLabel", [0, .string(clear)])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        let recoloured: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(recoloured.labels.map(\.color) == [clear, clear])
    }

    @Test func aCardOfFocusAndAClearLabelIsFocusAndOfAClearLabelAlonePlain() throws {
        let (board, _) = board()
        let snapshot = try board.snapshot(day: nil, measures: Self.measures, now: Fixtures.date(6, 10))
        let cards = try #require(snapshot.lists[.day]).cards
        let focus = try #require(board.markShades("blue"))
        #expect(cards.first { $0.item.title == "Both" }?.paint?.colors == [focus])
        #expect(cards.first { $0.item.title == "Focused" }?.paint?.colors == [focus])
        #expect(cards.first { $0.item.title == "Skipped" }?.paint == nil)
    }

    @Test func aClearLabelsMenuTileCarriesTheClearColourTheAppDrawsUntinted() throws {
        let (board, _) = board()
        let snapshot = try board.snapshot(day: nil, measures: Self.measures, now: Fixtures.date(6, 10))
        let skipped = try #require(snapshot.lists[.day]?.cards.first { $0.item.title == "Skipped" }?.item)
        let menu = try #require(snapshot.menus[skipped.id])
        let skip = try #require(menu.labels.tiles.first { $0.mark.title == "Skip" })
        #expect(skip.on)
        #expect(board.markInk(skip.mark.color) == nil)
    }
}
