import Foundation
import Testing
@testable import Core

/// What the app asks of the core to do what the plugin does: the vault's projects, the grouping kept on the device, a
/// title's links, the `[[` search, the cards' size, and the words the plugin shows, through the door in JavaScriptCore.
@Suite struct ParityTests {
    static let day = "2026-11-06"
    static let file = [
        "## Inbox", "", "- [ ] Call [[Clients/Acme|Acme]] about https://acme.example/deal.", "",
        "## Now", "", "- [ ] Weekly 📅 2026-11-06 🔁 every 3 days from 2026-11-06", "",
        "## Soon", "", "",
        "## Backlog", "", "- [ ] Draft the offer 🗂️ [[Acme]]", "- [ ] Free", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(6, 10)

    func vault() -> FakeVault {
        let vault = FakeVault(Self.file)
        vault.files["Clients/Acme.md"] = "---\ntags: [project]\n---\nThe client."
        vault.files["Home.md"] = "Just a note #home"
        vault.files["Images/acme.png"] = ""
        return vault
    }

    @Test func theVaultsProjectNotesComeWithEveryCall() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        #expect(try board.projectNotes() == [NoteLink(name: "Acme", path: "Clients/Acme.md", link: "Acme")])
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let draft = try #require(snapshot.screen.backlog.first { $0.title == "Draft the offer" })
        #expect(draft.project?.note == "Clients/Acme.md")
        #expect(draft.project?.canOpenNote == true)
        #expect(draft.project?.mark == true)
        #expect(draft.can.setProject)
        let menu = try #require(snapshot.menus[draft.id])
        #expect(menu.project.value == "Acme")
        #expect(menu.project.options.map(\.project.name) == ["Acme"])
        #expect(snapshot.screen.projects["backlog"]?.groups.first?.canOpenNote == true)
    }

    @Test func aNoteTaggedLaterIsAProjectOnceTheNotesAreReadAgain() throws {
        let vault = vault()
        let board = TaskBoard(core: core, vault: vault)
        #expect(try board.projectNotes().map(\.name) == ["Acme"])
        try vault.write(path: "Home.md", text: "#project at home")
        #expect(try board.projectNotes().map(\.name) == ["Acme"])
        board.refreshNotes()
        #expect(try board.projectNotes().map(\.name) == ["Acme", "Home"])
    }

    @Test func theDeviceKeepsItsGroupingAsTheDoorAnswersIt() throws {
        let kept = MemoryGrouping()
        let board = TaskBoard(core: core, vault: vault(), grouping: kept)
        try board.setGrouping("soon", on: true)
        try board.toggleFold("backlog", key: "acme")
        let grouping = try JSONValue(any: JSONSerialization.jsonObject(with: Data(try #require(kept.load()).utf8)))
        #expect(grouping["on"]["soon"].bool == true)
        #expect(grouping["folded"]["backlog"] == ["acme"])
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        #expect(snapshot.screen.projects["soon"]?.on == true)
        #expect(snapshot.screen.projects["backlog"]?.groups.first?.folded == true)
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
}
