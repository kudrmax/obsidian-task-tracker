import Foundation
import Testing
@testable import Core

/// Results (`docs/superpowers/specs/2026-11-11-results-design.md`) through the door in JavaScriptCore: the card's two
/// lines and its step's menu, the timeline's block, the menu rows, Add to result, New result…, Make result, the setting.
@Suite struct ResultsTests {
    static let file = [
        "## Inbox", "", "- [ ] Call bank", "",
        "## Now", "", "- [ ] 🎯 Компания 📁 📅 2026-11-06", "\t- [ ] Write to Marko", "\t- [ ] Rent a flat", "- [ ] 🎯 Trip ⏰ 2026-11-06 10:00-11:00", "\t- [ ] Book train", "",
        "## Soon", "", "- [ ] 🎯 Garden", "\t- [ ] Seeds", "- [ ] 🎯 Done steps", "\t- [x] Old step", "",
        "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault) -> TaskBoard {
        TaskBoard(core: core, vault: vault, clock: { Fixtures.date(6, 9) })
    }

    func snapshot(_ board: TaskBoard) throws -> BoardSnapshot {
        try board.snapshot(day: "2026-11-06", measures: IdentityTests.measures, now: Fixtures.date(6, 9))
    }

    func card(_ snapshot: BoardSnapshot, _ title: String) throws -> BoardCard {
        try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == title })
    }

    @Test func aFoldedResultsCardShowsItsNextStepUnderItsOwnTitleAndHasTheStepsMenu() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        let result = try card(snapshot, "Компания")
        #expect(result.item.isResult)
        #expect(result.face.over == "Компания")
        #expect(result.face.text == "Write to Marko")
        #expect(result.parts.map(\.shown).joined() == "Write to Marko")
        #expect(!result.face.semibold)
        let step = try #require(result.face.step)
        #expect(step.title == "Write to Marko")
        #expect(snapshot.menus[step.id] != nil)
        #expect(snapshot.menus[result.item.id] != nil)
    }

    @Test func anUnfoldedResultAndOneWithNoOpenStepAreOneLineInSemibold() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        let garden = try card(snapshot, "Garden")
        #expect(garden.face.over == nil && garden.face.semibold && garden.face.text == "Garden")
        let done = try card(snapshot, "Done steps")
        #expect(done.face.over == nil && done.face.semibold && done.face.step == nil)
    }

    @Test func theTimelinesBlockShowsTheStepWithItsMenu() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        let slot = try #require(snapshot.timeline.slots.first { $0.card.item.title == "Trip" })
        #expect(slot.card.face.text == "Book train")
        #expect(slot.card.face.over == nil && !slot.card.face.semibold)
        let step = try #require(slot.card.face.step)
        #expect(snapshot.menus[step.id] != nil)
    }

    @Test func aSearchDrawsTheResultsOwnTitleInSemibold() throws {
        let board = board(FakeVault(Self.file))
        let found: [SearchGroup] = try board.read("tasks.search", ["Компания"], over: try board.files())
        let hit = try #require(found.flatMap(\.hits).first { $0.item.isResult })
        let own = try #require(try board.cards([ListRow(item: hit.item, level: 0)]).first)
        #expect(own.face.over == nil && own.face.text == "Компания" && own.face.semibold && own.face.step == nil)
    }

    @Test func newResultsCreateIsOffForTheMarkAlone() throws {
        let board = board(FakeVault(Self.file))
        #expect(board.isBlank("🎯"))
        #expect(board.isBlank("  "))
        #expect(!board.isBlank("Bank"))
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(form.defaultResultMark == "🎯")
    }

    @Test func theMenuOffersAddToResultAndMakeResultAfterProject() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        let call = try card(snapshot, "Call bank")
        let menu = try #require(snapshot.menus[call.item.id])
        #expect(menu.result.rows == ["addToResult", "toggle"])
        #expect(menu.result.label == "Add to result")
        #expect(menu.result.toggle.label == "Make result" && menu.result.toggle.result)
        let result = try #require(snapshot.menus[try card(snapshot, "Компания").item.id])
        #expect(result.result.toggle.label == "Make task" && !result.result.toggle.result)
    }

    @Test func addToResultMovesTheTaskToTheResultsEnd() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let call = try card(try snapshot(board), "Call bank")
        let page = try board.resultPage([call.item.key], query: "КОМП")
        #expect(page.options.map(\.result.title) == ["Компания"])
        #expect(page.options.first?.list == "now")
        #expect(page.newLabel == "New result…")
        try board.addToResult([call.item.key], try #require(page.options.first).result.key)
        #expect(vault.text.contains("\t- [ ] Rent a flat\n\t- [ ] Call bank\n"))
    }

    @Test func theWholePageListsEveryOpenResultInFileOrder() throws {
        let board = board(FakeVault(Self.file))
        let call = try card(try snapshot(board), "Call bank")
        #expect(try board.resultPage([call.item.key], query: "").options.map(\.result.title) == ["Компания", "Trip", "Garden", "Done steps"])
    }

    @Test func newResultWrapsTheTaskAndABlankNameWritesNothing() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let call = try card(try snapshot(board), "Call bank")
        #expect(try board.newResult([call.item.key], name: "  ") == nil)
        #expect(vault.text == Self.file)
        #expect(try board.newResult([call.item.key], name: "Bank") != nil)
        #expect(vault.text.contains("- [ ] 🎯 Bank 📁\n\t- [ ] Call bank\n"))
    }

    @Test func makeResultAndMakeTaskToggleTheMark() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.setResult(try card(try snapshot(board), "Call bank").item.key, true)
        #expect(vault.text.contains("- [ ] 🎯 Call bank\n"))
        try board.setResult(try card(try snapshot(board), "Call bank").item.key, false)
        #expect(vault.text.contains("- [ ] Call bank\n"))
    }

    @Test func theResultMarkIsASettingTheCoreChecks() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.setResultMark(" ★ ")
        let saved = try #require(vault.files[try core.settingsFile()])
        vault.settings = saved
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(form.resultMark == "★")
        try board.setResultMark("two words")
        #expect(vault.files[try core.settingsFile()] == saved)
    }
}
