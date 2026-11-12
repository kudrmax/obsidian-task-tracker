import Foundation
import Testing
@testable import Core

/// Max, 2026-11-12: a folded card's menu is the whole task's (a move takes all its subtasks), but Done, In Progress and
/// Won't Do are for the step the card shows, the task he looks at.
@Suite struct FoldedStatusTests {
    static let day = "2026-11-11"
    static let file = [
        "## Inbox", "",
        "- [ ] Навести порядок 📁",
        "\t- [ ] Проверить проекты",
        "\t- [ ] Раскидать Inbox", "",
        "## Now", "", "## Soon", "", "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    @Test func theStatusRowsOfAFoldedCardWriteItsShownStep() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file), projectsScreen: MemoryText(), clock: { Fixtures.date(7, 9) })
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: Fixtures.date(7, 9))
        let card = try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == "Навести порядок" })
        let menu = try #require(snapshot.menus[card.item.id])
        #expect(menu.statusTasks.map(\.title) == ["Проверить проекты"])
    }
}
