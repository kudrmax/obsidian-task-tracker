import Foundation
import Testing
@testable import Core

/// The vault's notes as a scan finds them, in memory.
final class FakeFolder: NoteFolder, @unchecked Sendable {
    var notes: [String: (text: String, modified: Date)]
    /// Notes iCloud keeps only in the cloud: listed by their paths, never read.
    var cloudOnly: Set<String> = []
    private(set) var reads: [String] = []

    init(_ notes: [String: String]) {
        self.notes = notes.mapValues { ($0, Date(timeIntervalSince1970: 1)) }
    }

    func scanNotes(wanted: (String, Date) -> Bool) throws -> [ScannedNote] {
        notes.map { path, note in
            let text = !cloudOnly.contains(path) && wanted(path, note.modified) ? note.text : nil
            if text != nil { reads.append(path) }
            return ScannedNote(path: path, modified: note.modified, text: text)
        }
    }
}

/// Projects in the app: the groups the core gives Backlog and Soon, the device's grouping, the project notes the app finds
/// in the vault, the moves, the menu, the title drop and the search, through the door in JavaScriptCore.
@Suite struct ProjectGroupTests {
    static let day = "2030-01-07"
    static let friends = "Окружение в новой стране"
    static let field = "🗂️ [[Окружение в новой стране]]"
    static let file = [
        "## Inbox", "",
        "- [ ] Idea", "",
        "## Now", "",
        "## Soon", "",
        "- [ ] Exchange \(field)",
        "- [ ] Plain soon", "",
        "## Backlog", "",
        "- [ ] Club \(field)",
        "\t- [ ] Find one",
        "- [ ] Free",
        "### Far",
        "- [ ] Language course \(field)",
        "- [ ] Far plain", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let notes = [
        "Projects/Окружение в новой стране.md": "---\ntags:\n  - project\n---\nWhy: friends.",
        "Health.md": "Run more. #project",
        "Diary/2030-01-07.md": "#project/idea is a child tag, `#project` is code",
        "Nested.md": "---\ntags: [area, \"#Project\"]\n---\n",
        "Code.md": "```\n#project\n```\n",
        "A/Health.md": "Another note of the same name",
    ]
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(7, 9)

    func board(_ vault: FakeVault, grouping: DeviceText = MemoryText()) -> TaskBoard {
        TaskBoard(core: core, vault: vault, grouping: grouping, projects: VaultProjects(folder: FakeFolder(Self.notes), core: core, background: false))
    }

    func snapshot(_ board: TaskBoard) throws -> BoardSnapshot {
        try board.snapshot(day: Self.day, measures: Self.measures, now: at)
    }

    // MARK: The project notes

    @Test func aNoteIsAProjectByItsExactTagInPropertiesOrText() throws {
        let found = VaultProjects(folder: FakeFolder(Self.notes), core: core, background: false).notes(tag: "#project")
        #expect(found.map(\.name) == ["Health", "Nested", "Окружение в новой стране"])
        #expect(found.map(\.path) == ["Health.md", "Nested.md", "Projects/Окружение в новой стране.md"])
        #expect(found.map(\.link) == ["Health", "Nested", "Окружение в новой стране"])
    }

    @Test func aNoteWhoseNameAnotherHasIsLinkedByItsPath() throws {
        let folder = FakeFolder(["A/Health.md": "#project", "B/Health.md": "plain"])
        let found = VaultProjects(folder: folder, core: core, background: false).notes(tag: "project")
        #expect(found == [ProjectNote(name: "Health", path: "A/Health.md", link: "A/Health")])
    }

    @Test func aScanReadsOnlyTheNotesChangedSinceAndTellsAChangedList() throws {
        let folder = FakeFolder(Self.notes)
        let projects = VaultProjects(folder: folder, core: core, background: false, every: 0)
        _ = projects.notes(tag: "#project")
        #expect(folder.reads.count == Self.notes.count)
        folder.notes["Free.md"] = ("#project", Date(timeIntervalSince1970: 2))
        #expect(projects.scan(tag: "#project"))
        #expect(folder.reads.count == Self.notes.count + 1)
        #expect(!projects.scan(tag: "#project"))
    }

    @Test func theListFoundLastIsKeptOnTheDevice() throws {
        let kept = MemoryText()
        _ = VaultProjects(folder: FakeFolder(Self.notes), core: core, remembered: kept, background: false).notes(tag: "#project")
        let later = VaultProjects(folder: FakeFolder([:]), core: core, remembered: kept, background: true, every: 1000)
        #expect(later.notes(tag: "#project").count == 3)
    }

    @Test func theTagsReadAreKeptOnTheDeviceAndNoNoteIsReadAgain() throws {
        let kept = MemoryText()
        let first = VaultProjects(folder: FakeFolder(Self.notes), core: core, rememberedTags: kept, background: false)
        let found = first.notes(tag: "#project")
        let folder = FakeFolder(Self.notes)
        let later = VaultProjects(folder: folder, core: core, rememberedTags: kept, background: false)
        #expect(later.notes(tag: "#project") == found)
        #expect(folder.reads.isEmpty)
    }

    @Test func theListIsMadeAgainOnlyWhenANoteWasReadOrAPathCameOrWent() throws {
        let folder = FakeFolder(Self.notes)
        let projects = VaultProjects(folder: folder, core: core, background: false, every: 0)
        _ = projects.notes(tag: "#project")
        #expect(projects.listsMade == 1)
        projects.scan(tag: "#project")
        #expect(projects.listsMade == 1)
        folder.notes["Health.md"] = nil
        #expect(projects.scan(tag: "#project"))
        #expect(projects.listsMade == 2)
    }

    @Test func aNoteOnlyInTheCloudIsNotReadButCountsForTheNames() throws {
        let folder = FakeFolder(["A/Health.md": "#project", "B/Health.md": "#project"])
        folder.cloudOnly = ["B/Health.md"]
        let found = VaultProjects(folder: folder, core: core, background: false).notes(tag: "#project")
        #expect(found == [ProjectNote(name: "Health", path: "A/Health.md", link: "A/Health")])
        #expect(folder.reads == ["A/Health.md"])
    }

    // MARK: Groups

    @Test func backlogIsGroupedByProjectByDefaultNoProjectLast() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        let backlog = try #require(snapshot.lists[.backlog])
        #expect(backlog.grouped && backlog.canGroup)
        #expect(backlog.projects.map(\.title) == ["Health", "Nested", Self.friends, "No project"])
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        #expect(friends.canOpenNote && friends.project?.note == "Projects/Окружение в новой стране.md")
        let parts = friends.sections.map { backlog.groups[$0] }
        #expect(parts.map(\.header) == [nil, "Far"])
        #expect(parts.map { $0.cards.map(\.item.title) } == [["Club", "Find one"], ["Language course"]])
        #expect(parts.allSatisfy { $0.zone == .string(Self.friends) })
        let health = try #require(backlog.projects.first)
        #expect(backlog.groups[health.sections.lowerBound].empty)
        #expect(backlog.projects.last?.canOpenNote == false)
        #expect(snapshot.lists[.soon]?.grouped == false)
        #expect(snapshot.lists[.soon]?.canGroup == true)
        #expect(snapshot.lists[.inbox]?.canGroup == false)
        let card = try #require(backlog.cards.first { $0.item.title == "Find one" })
        #expect(card.item.project?.name == Self.friends && card.item.project?.mark == true)
        #expect(card.item.can.setProject == false)
    }

    @Test func groupingAndFoldsAreKeptOnTheDevice() throws {
        let kept = MemoryText()
        let board = board(FakeVault(Self.file), grouping: kept)
        try board.group("tasks.setGrouping", ["soon", true])
        try board.group("tasks.toggleFold", ["backlog", .string(Self.friends.lowercased())])
        #expect(kept.load()?.contains("soon") == true)
        let snapshot = try snapshot(board)
        #expect(snapshot.lists[.soon]?.projects.map(\.title) == [Self.friends, "No project"])
        let friends = try #require(snapshot.lists[.backlog]?.projects.first { $0.title == Self.friends })
        #expect(friends.folded && friends.count == 2 && friends.sections.isEmpty)
        #expect(snapshot.lists[.backlog]?.cards.contains { $0.item.title == "Club" } == false)
    }

    // MARK: Moves

    @Test func aDropIntoAnotherProjectsGroupChangesTheProject() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let backlog = try #require(try snapshot(board).lists[.backlog])
        let free = try #require(backlog.cards.first { $0.item.title == "Free" })
        let health = try #require(backlog.projects.first)
        let others = backlog.cards.filter { $0.id != free.id }
        let cards = JSONValue.array(others.map(Self.listCard))
        // Into Health's empty group, at the list's top: past its header.
        let gap: JSONValue = try board.rule("rules.gapAt", [cards, 0, 0, [health.head], true])
        let place: JSONValue = try board.rule("rules.placeOfDrop", [cards, gap, .null])
        try board.write("tasks.drop", [[["key": free.item.key.json, "from": "backlog"]], ["kind": "place", "column": "backlog", "place": place], .string(Self.day)])
        #expect(vault.text.contains("- [ ] Free 🗂️ [[Health]]"))
        let after = try #require(try snapshot(board).lists[.backlog])
        let moved = try #require(after.projects.first)
        #expect(after.groups[moved.sections.lowerBound].cards.map(\.item.title) == ["Free"])
    }

    @Test func aDropOnAColumnsTitleKeepsTheProjectAtTheEndOfItsGroup() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let snapshot = try snapshot(board)
        let exchange = try #require(snapshot.lists[.soon]?.cards.first { $0.item.title == "Exchange" })
        let title = try #require(snapshot.lists[.backlog]?.titleDrop)
        #expect(title["kind"] == "title" && title["byProject"] == true)
        try board.write("tasks.drop", [[["key": exchange.item.key.json, "from": "soon"]], title, .string(Self.day)])
        let backlog = try #require(try self.snapshot(board).lists[.backlog])
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        #expect(backlog.groups[friends.sections.lowerBound].cards.map(\.item.title) == ["Club", "Find one", "Exchange"])
        #expect(vault.text.contains("- [ ] Exchange \(Self.field)"))
    }

    @Test func aDropBeforeAPartsFirstCardFliesThereWhenAnotherProjectStandsAboveInTheFile() throws {
        let file = Self.file.replacingOccurrences(of: "## Backlog\n\n", with: "## Backlog\n\n- [ ] Run 🗂️ [[Health]]\n")
        let board = board(FakeVault(file))
        let snapshot = try snapshot(board)
        let backlog = try #require(snapshot.lists[.backlog])
        let free = try #require(backlog.cards.first { $0.item.title == "Free" })
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        let others = backlog.cards.filter { $0.id != free.id }
        let club = try #require(others.firstIndex { $0.item.title == "Club" })
        let cards = JSONValue.array(others.map(Self.listCard))
        let gap: JSONValue = try board.rule("rules.gapAt", [cards, .number(Double(club)), 0, [friends.head], true])
        let place: JSONValue = try board.rule("rules.placeOfDrop", [cards, gap, .null])
        let tasks: JSONValue = [["key": free.item.key.json, "from": "backlog"]]
        let landed = try #require(try board.landing(tasks, to: ["kind": "place", "column": "backlog", "place": place], over: snapshot).first)
        #expect(landed.part?.zone == .string(Self.friends) && landed.part?.index == 0)
        let preview = try board.dropPreview(tasks, to: ["kind": "place", "column": "backlog", "place": place], over: snapshot, measures: Self.measures)
        let drawn = try #require(preview.snapshot.lists[.backlog])
        let part = try #require(drawn.projects.first { $0.title == Self.friends })
        #expect(drawn.groups[part.sections.lowerBound].cards.first?.id == free.id)
        _ = club
    }

    @Test func aDropIntoAFoldedPartLandsUnderItsHeaderWithNoRoom() throws {
        let board = board(FakeVault(Self.file))
        try board.group("tasks.toggleFold", ["backlog", .string(Self.friends.lowercased())])
        let snapshot = try snapshot(board)
        let exchange = try #require(snapshot.lists[.soon]?.cards.first { $0.item.title == "Exchange" })
        let backlog = try #require(snapshot.lists[.backlog])
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        let title = try #require(backlog.titleDrop)
        let landed = try #require(try board.landing([["key": exchange.item.key.json, "from": "soon"]], to: title, over: snapshot).first)
        #expect(landed.part?.folded == true && landed.part?.key == friends.key)
        let preview = try board.dropPreview([["key": exchange.item.key.json, "from": "soon"]], to: title, over: snapshot, measures: Self.measures)
        #expect(preview.snapshot.lists[.backlog]?.cards.contains { $0.id == exchange.id } == false)
    }

    @Test func aDropIntoNoProjectTakesTheFieldOff() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let backlog = try #require(try snapshot(board).lists[.backlog])
        let none = try #require(backlog.projects.last)
        try drop("Club", in: backlog, passed: [none.head], at: backlog.cards.count, board: board)
        #expect(vault.text.contains("- [ ] Club\n\t- [ ] Find one"))
        let after = try #require(try snapshot(board).lists[.backlog])
        let moved = try #require(after.cards.first { $0.item.title == "Club" })
        #expect(moved.item.project == nil && moved.zone == .null)
    }

    @Test func aDropInsideItsOwnGroupKeepsTheField() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let backlog = try #require(try snapshot(board).lists[.backlog])
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        try drop("Language course", in: backlog, passed: [friends.head], at: 0, board: board)
        #expect(vault.text.contains("- [ ] Language course \(Self.field)\n- [ ] Club \(Self.field)"))
    }

    @Test func aTaskTypedOnAGroupsPlateGetsItsProject() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let snapshot = try snapshot(board)
        let health = try #require(snapshot.lists[.backlog]?.projects.first)
        try type("Swim", opening: "openIn", ["backlog", .null, health.zone], over: snapshot, board: board)
        #expect(vault.text.contains("- [ ] Swim 🗂️ [[Health]]"))
    }

    @Test func thePlusLetGoInAGroupTypesATaskOfItsProject() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let snapshot = try snapshot(board)
        let backlog = try #require(snapshot.lists[.backlog])
        let friends = try #require(backlog.projects.first { $0.title == Self.friends })
        let cards = JSONValue.array(backlog.cards.map(Self.listCard))
        let gap: JSONValue = try board.rule("rules.gapAt", [cards, 0, 0, [friends.head], true])
        let place: JSONValue = try board.rule("rules.placeOfDrop", [cards, gap, .null])
        try type("Meet neighbours", opening: "openAtDrop", ["backlog", ["kind": "place", "column": "backlog", "place": place]], over: snapshot, board: board)
        #expect(vault.text.contains("- [ ] Meet neighbours \(Self.field)\n- [ ] Club"))
    }

    @Test func aSectionRemovedInsideAGroupTakesOutOnlyThatProjectsTasks() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let backlog = try #require(try snapshot(board).lists[.backlog])
        let far = try #require(backlog.groups.first { $0.name == "Far" && $0.zone == .string(Self.friends) })
        let menu = try #require(far.menu)
        try board.write("tasks.removeGroup", ["backlog", "Far", try #require(menu.project)])
        #expect(vault.text.contains("### Far\n- [ ] Far plain"))
        #expect(!vault.text.contains("### Far\n- [ ] Language course"))
        #expect(vault.text.contains("- [ ] Language course \(Self.field)"))
    }

    @Test func noProjectTakesTheFieldOffAndUndoPutsItBack() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let club = try #require(try snapshot(board).lists[.backlog]?.cards.first { $0.item.title == "Club" })
        try board.write("tasks.setProject", [[club.item.key.json], .null])
        #expect(vault.text.contains("- [ ] Club\n"))
        try board.write("history.undo")
        #expect(vault.text == Self.file)
    }

    // MARK: The menu, sections, search

    @Test func theProjectRowOffersTheNotesByNameAndWritesTheField() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let snapshot = try snapshot(board)
        let idea = try #require(snapshot.lists[.inbox]?.cards.first)
        let menu = try #require(snapshot.menus[idea.item.id]?.project)
        #expect(menu.options.map(\.project.name) == ["Health", "Nested", Self.friends])
        #expect(menu.none && menu.value == "No project" && !menu.disabled)
        try board.write("tasks.setProject", [[idea.item.key.json], .string(menu.options[2].project.link)])
        #expect(vault.text.contains("- [ ] Idea \(Self.field)"))
        let child = try #require(snapshot.lists[.backlog]?.cards.first { $0.item.title == "Find one" })
        let childMenu = try #require(snapshot.menus[child.item.id]?.project)
        #expect(childMenu.disabled && childMenu.value == Self.friends)
    }

    @Test func aSectionRenamedInsideAGroupMovesOnlyThatProjectsTasks() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let backlog = try #require(try snapshot(board).lists[.backlog])
        let far = try #require(backlog.groups.first { $0.name == "Far" && $0.zone == .string(Self.friends) })
        let menu = try #require(far.menu)
        #expect(menu.project == .string(Self.friends))
        try board.write("tasks.renameGroup", ["backlog", "Far", "Near", try #require(menu.project)])
        #expect(vault.text.contains("### Near\n- [ ] Language course"))
        #expect(vault.text.contains("### Far\n- [ ] Far plain"))
    }

    @Test func theSearchFindsATaskByItsProjectsName() throws {
        let board = board(FakeVault(Self.file))
        let groups: [SearchGroup] = try board.read("tasks.search", ["окружение"], over: try board.files(now: at))
        let hits = groups.flatMap(\.hits)
        #expect(Set(hits.map(\.item.title)) == ["Exchange", "Club", "Language course"])
        let parts = try #require(hits.first?.project)
        #expect(parts.map(\.text).joined() == Self.friends)
        #expect(parts.contains { $0.match })
    }

    @Test func theSettingsGiveTheProjectTag() throws {
        let board = board(FakeVault(Self.file))
        let form: SettingsForm = try board.read("settings.form", over: board.settingsOnly())
        #expect(form.projectTag == "#project")
    }

    /// A card let go before card `index` of the list without it, past the headers `passed`: the app's drop.
    private func drop(_ title: String, in list: BoardList, passed: [JSONValue], at index: Int, board: TaskBoard) throws {
        let lifted = try #require(list.cards.first { $0.item.title == title })
        let others = list.cards.filter { $0.id != lifted.id }
        let cards = JSONValue.array(others.map(Self.listCard))
        let gap: JSONValue = try board.rule("rules.gapAt", [cards, .number(Double(min(index, others.count))), 0, .array(passed), true])
        let place: JSONValue = try board.rule("rules.placeOfDrop", [cards, gap, .null])
        try board.write("tasks.drop", [[["key": lifted.item.key.json, "from": .string(list.column.rawValue)]], ["kind": "place", "column": .string(list.column.rawValue), "place": place], .string(Self.day)])
    }

    /// The quick entry as the app drives it over the grouped screen: opened, a title typed, Enter, its job written.
    private func type(_ text: String, opening: String, _ arguments: [JSONValue], over snapshot: BoardSnapshot, board: TaskBoard) throws {
        var cards: [String: JSONValue] = [:]
        var sections: [String: JSONValue] = [:]
        var sectioned: [String: JSONValue] = [:]
        for (column, list) in snapshot.lists {
            cards[column.rawValue] = .array(list.cards.map(Self.listCard))
            sections[column.rawValue] = list.places
            sectioned[column.rawValue] = .bool(list.sectioned)
        }
        let look: JSONValue = ["cards": .object(cards), "sections": .object(sections), "sectioned": .object(sectioned), "day": .string(snapshot.day), "shown": ["inbox", "backlog", "soon"]]
        var session = JSONValue.null
        func call(_ method: String, _ arguments: [JSONValue]) throws -> JSONValue {
            let reply = try board.entry(method, [session, look] + arguments)
            session = reply["session"]
            return reply
        }
        _ = try call(opening, arguments)
        _ = try call("type", [.string(text)])
        _ = try call("enter", [])
        guard case .array(let jobs) = session["jobs"], let id = jobs.first?["id"].string else { Issue.record("no job queued"); return }
        let job = try call("call", [.string(id)])["value"]
        guard let method = job["method"].string, case .array(let args) = job["args"] else { Issue.record("no job"); return }
        try board.write("tasks." + method, args)
    }

    private static func listCard(_ card: BoardCard) -> JSONValue {
        var json: [String: JSONValue] = ["key": card.item.key.json, "level": .number(Double(card.level)), "group": card.item.group.json]
        if let zone = card.zone { json["project"] = zone }
        return .object(json)
    }
}
