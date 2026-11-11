import Foundation
import Testing
@testable import Core

/// What the app asks of the core to do what the plugin does: a project's attached note, the lists without project
/// groups, a title's links, the `[[` search, the cards' size, and the words the plugin shows, through the door in JavaScriptCore.
@Suite struct ParityTests {
    static let day = "2026-11-06"
    static let file = [
        "## Inbox", "", "- [ ] Call [[Clients/Acme|Acme]] about https://acme.example/deal.", "",
        "## Projects", "", "- Acme [[Clients/Acme]]", "",
        "## Now", "", "- [ ] Weekly 📅 2026-11-06 🔁 every 3 days from 2026-11-06", "",
        "## Soon", "", "",
        "## Backlog", "", "- [ ] Draft the offer 🗂️ Acme", "- [ ] Free", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(6, 10)

    func board(_ vault: FakeVault) -> TaskBoard { TaskBoard(core: core, vault: vault) }

    func vault() -> FakeVault {
        let vault = FakeVault(Self.file)
        vault.files["Clients/Acme.md"] = "---\ntags: [project]\n---\nThe client."
        vault.files["Home.md"] = "Just a note #home"
        vault.files["Images/acme.png"] = ""
        return vault
    }

    @Test func aProjectsAttachedNoteComesWithItsCards() throws {
        let board = board(vault())
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let draft = try #require(snapshot.screen.backlog.first { $0.title == "Draft the offer" })
        #expect(draft.project?.note == "Clients/Acme")
        #expect(draft.project?.canOpenNote == true)
        #expect(draft.project?.mark == true)
        #expect(draft.can.setProject)
        let menu = try #require(snapshot.menus[draft.id])
        #expect(menu.project.value == "Acme")
        #expect(menu.project.noneLabel == "No project")
        #expect(menu.project.options.map(\.project.name) == ["Acme"])
    }

    @Test func aTitleComesInPiecesItsLinksWithWhatATapOpens() throws {
        let board = TaskBoard(core: core, vault: vault())
        let parts = try board.titleParts("Call [[Clients/Acme|Acme]] about https://acme.example/deal.")
        #expect(parts.map(\.kind) == ["text", "note", "text", "url", "text"])
        #expect(parts[1].shown == "Acme")
        #expect(parts[3].target == "https://acme.example/deal")
        #expect(try board.noteToOpen(try #require(parts[1].target))?.path == "Clients/Acme.md")
        #expect(try board.noteToOpen("Nowhere") == nil)
    }

    @Test func aDoubleBracketTypedOffersTheNotesAndWritesThePickedOnesLink() throws {
        let board = TaskBoard(core: core, vault: vault())
        let text = "Ask [[ac"
        let query = try #require(try board.linkQuery(in: text, caret: (text as NSString).length))
        #expect(query == LinkQuery(query: "ac", from: 4, to: 8))
        let offered = try board.suggestNotes(query.query)
        #expect(offered.map(\.path) == ["Clients/Acme.md", "Images/acme.png"])
        #expect(try board.insertLink(offered[0], in: text, at: query) == LinkInsert(text: "Ask [[Acme]]", caret: 12))
        #expect(try board.linkQuery(in: "Ask [[Acme]] ", caret: 13) == nil)
    }

    @Test func theCardsSizeIsTheSharedSettingsAndTheAppWritesIt() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        #expect(try board.screenSettings().cardHeight == 35)
        #expect(try board.screenSettings().cardGap == 2)
        try board.writeSettings("settings.setCardHeight", [30])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        try board.writeSettings("settings.setCardGap", [11])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        let settings = try board.screenSettings()
        #expect(settings.cardHeight == 30)
        #expect(settings.cardGap == 2)
        #expect(settings.longPressMs == 250)
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(form.cardHeights == SizeBounds(min: 28, max: 40))
        #expect(form.cardGaps == SizeBounds(min: 0, max: 10))
        #expect(form.labelPaints == ["stripes", "blend"])
        #expect(form.markerOrder.first == "dueDateMarker")
        #expect(form.markers["dueDateMarker"] == "📅")
        #expect(form.refreshSeconds == 60)
        #expect(form.googleClientReady == false)
        try board.writeSettings("settings.setMarker", ["repeatMarker", "🔄"])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        let marked: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(marked.markers["repeatMarker"] == "🔄")
        #expect(try board.rule("rules.formatZoomLevels", [[["hourPx": 28], ["hourPx": 56]]], as: String.self) == "28, 56")
    }

    @Test func theZoomLevelsAreTheSharedSettingsAndTheAppWritesThem() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(form.zoomLevels == "28, 56, 112, 224")
        try board.writeSettings("settings.setZoomLevels", [" 40 , 80"])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        try board.writeSettings("settings.setZoomLevels", ["40, x"])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        let written: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(written.zoomLevels == "40, 80")
        #expect(try board.snapshot(day: Self.day, measures: Self.measures, now: at).timeline.zoomLevels == [40, 80])
    }

    @Test func theWordsAndBoundsTheAppShowsAreTheCores() throws {
        let board = TaskBoard(core: core, vault: vault())
        #expect(try board.listWidths(share: 0.9, viewWidth: 390, dividerWidth: 16) == ListWidths(width: 280, min: 110, max: 280, center: 187))
        let words = try board.repeatWords()
        #expect(words.units["day"] == "days")
        #expect(words.weekdays.map(\.letter) == ["M", "T", "W", "T", "F", "S", "S"])
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let weekly = try #require(snapshot.lists[.day]?.cards.first { $0.item.title == "Weekly" }?.item)
        #expect(snapshot.menus[weekly.id]?.repeat == RepeatRow(value: "Every 3 days", days: nil))
        let place: String = try board.read("tasks.placementTitle", [["kind": "date", "date": "2026-11-05"]], over: board.settingsOnly())
        #expect(place == "5 Nov")
        #expect(try board.rule("rules.canPick", ["timeline"], as: Bool.self) == false)
    }

    @Test func eachCalendarSourceComesWorded() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let work = try #require(snapshot.statuses.first { $0.source == "work" })
        #expect(work.words.name == "Work calendar")
        #expect(work.words.sub == "file missing")
        #expect(work.words.time == "")
    }

    @Test func aRuleWithNothingUnderItsUnitReadsAsADraft() throws {
        let board = TaskBoard(core: core, vault: vault())
        let rule: JSONValue = ["kind": "afterDone", "every": 3, "unit": "day", "days": [], "dayOfMonth": .null, "from": .null]
        let draft = try board.rule("rules.repeatDraft", [.string(Self.day), rule], as: RepeatDraft.self)
        #expect(draft.detail == nil)
        #expect(draft.kind == "afterDone")
    }

    /// Grouping by project inside the funnel went: Backlog is one list of sections, its cards and places name no project.
    @Test func backlogDrawsNoProjectParts() throws {
        let snapshot = try board(vault()).snapshot(day: Self.day, measures: Self.measures, now: at)
        let backlog = try #require(snapshot.lists[.backlog])
        #expect(backlog.groups.count == 1)
        #expect(backlog.cards.map(\.item.title) == ["Draft the offer", "Free"])
        #expect(backlog.cards.allSatisfy { $0.listCard["project"].isNull })
        #expect(snapshot.screen.titleDrops["backlog"]?["byProject"] == false)
    }

    @Test func aDropKeepsTheTasksProject() throws {
        let vault = vault()
        let board = board(vault)
        let backlog = try #require(try board.snapshot(day: Self.day, measures: Self.measures, now: at).lists[.backlog])
        let draft = try #require(backlog.cards.first { $0.item.title == "Draft the offer" })
        let place: JSONValue = try board.rule("rules.placeOfDrop", [.array(backlog.cards.map(\.listCard)), ["kind": "gap", "index": 2, "level": 0, "group": .null], .null])
        try board.write("tasks.drop", [[["key": draft.item.key.json, "from": "backlog"]], ["kind": "place", "column": "backlog", "place": place], .string(Self.day)])
        #expect(vault.text.contains("- [ ] Free\n- [ ] Draft the offer 🗂️ Acme\n"))
    }

    @Test func theCardsAreTheSettingsSizeAndCarryTheirTitlesLinks() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        try board.writeSettings("settings.setCardHeight", [30])
        vault.settings = vault.files[try core.settingsFile()] ?? ""
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        #expect(snapshot.look.cardHeight == 30)
        let call = try #require(snapshot.lists[.inbox]?.cards.first)
        #expect(call.parts.map(\.kind) == ["text", "note", "text", "url", "text"])
        let weekly = try #require(snapshot.lists[.day]?.cards.first { $0.item.title == "Weekly" })
        let drawn = try board.cards([ListRow(item: weekly.item, level: 0)])
        #expect(drawn.first?.repeats == true)
        #expect(drawn.first?.due != nil)
    }
}
