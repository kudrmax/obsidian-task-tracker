import Foundation
import Testing
@testable import Core

/// What the app takes from the core instead of deciding it: a task's names (its line, its place), the menu's Project row
/// and its words, the divider's hold to the middle, and whether Google is logged in.
@Suite struct CoreDecidesTests {
    static let day = "2026-11-06"
    static let file = [
        "## Inbox", "", "- [ ] Buy milk", "- [ ] Call Anna", "",
        "## Now", "", "## Soon", "", "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(6, 10)

    @Test func aTaskIsNamedByTheCoreItsPlaceOutlivingARename() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let milk = try #require(try board.snapshot(day: Self.day, measures: Self.measures, now: at).screen.inbox.first)
        #expect(milk.place == (try board.placeId(milk.key)))
        #expect(milk.id == (try board.rule("rules.keyId", [milk.key.json], as: String.self)))
        try board.write("tasks.rename", [milk.key.json, "Buy oat milk"])
        let renamed = try #require(try board.snapshot(day: Self.day, measures: Self.measures, now: at).screen.inbox.first)
        #expect(renamed.place == milk.place)
        #expect(renamed.id != milk.id)
    }

    @Test func theMenuPutsProjectWhereTheCoreSaysAndNamesNoProject() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let milk = try #require(snapshot.screen.inbox.first)
        let menu = try #require(snapshot.menus[milk.id])
        #expect(menu.edits.suffix(2) == ["project", "subtask"])
        #expect(menu.project.noneLabel == "No project")
        #expect(menu.project.value == "No project")
    }

    @Test func theDividerHoldsToTheMiddleOnlyWhenBroughtSlowly() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let widths = try board.listWidths(share: 0.3, viewWidth: 390, dividerWidth: 0)
        #expect(try board.dividerAt(widths.center + 5, widths: widths, speed: 0.01) == DividerStop(width: widths.center, snapped: true))
        #expect(try board.dividerAt(widths.center + 5, widths: widths, speed: 1).snapped == false)
    }

    @Test func theSettingsSayWhetherGoogleIsLoggedIn() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        #expect((try board.read("settings.form", over: board.settingsOnly(), as: SettingsForm.self)).googleLoggedIn == false)
        vault.settings = #"{"google":{"clientId":"id","clientSecret":"","refreshToken":"token","refreshSeconds":60,"calendarIds":[]}}"#
        #expect((try board.read("settings.form", over: board.settingsOnly(), as: SettingsForm.self)).googleLoggedIn == true)
    }
}
