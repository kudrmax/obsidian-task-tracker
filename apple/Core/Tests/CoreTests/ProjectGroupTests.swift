import Foundation
import Testing
@testable import Core

/// The vault's notes as a scan finds them, in memory.
final class FakeFolder: NoteFolder, @unchecked Sendable {
    var notes: [String: (text: String, modified: Date)]
    private(set) var reads: [String] = []

    init(_ notes: [String: String]) {
        self.notes = notes.mapValues { ($0, Date(timeIntervalSince1970: 1)) }
    }

    func scanNotes(wanted: (String, Date) -> Bool) throws -> [ScannedNote] {
        notes.map { path, note in
            let text = wanted(path, note.modified) ? note.text : nil
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
        TaskBoard(core: core, vault: vault, grouping: grouping, projects: VaultProjects(folder: FakeFolder(Self.notes), background: false))
    }

    func snapshot(_ board: TaskBoard) throws -> BoardSnapshot {
        try board.snapshot(day: Self.day, measures: Self.measures, now: at)
    }

    // MARK: The project notes

    @Test func aNoteIsAProjectByItsExactTagInPropertiesOrText() throws {
        let found = VaultProjects(folder: FakeFolder(Self.notes), background: false).notes(tag: "#project")
        #expect(found.map(\.name) == ["Health", "Nested", "Окружение в новой стране"])
        #expect(found.map(\.path) == ["Health.md", "Nested.md", "Projects/Окружение в новой стране.md"])
        #expect(found.map(\.link) == ["Health", "Nested", "Окружение в новой стране"])
    }

    @Test func aNoteWhoseNameAnotherHasIsLinkedByItsPath() throws {
        let folder = FakeFolder(["A/Health.md": "#project", "B/Health.md": "plain"])
        let found = VaultProjects(folder: folder, background: false).notes(tag: "project")
        #expect(found == [ProjectNote(name: "Health", path: "A/Health.md", link: "A/Health")])
    }

    @Test func aScanReadsOnlyTheNotesChangedSinceAndTellsAChangedList() throws {
        let folder = FakeFolder(Self.notes)
        let projects = VaultProjects(folder: folder, background: false, every: 0)
        _ = projects.notes(tag: "#project")
        #expect(folder.reads.count == Self.notes.count)
        folder.notes["Free.md"] = ("#project", Date(timeIntervalSince1970: 2))
        #expect(projects.scan(tag: "#project"))
        #expect(folder.reads.count == Self.notes.count + 1)
        #expect(!projects.scan(tag: "#project"))
    }

    @Test func theListFoundLastIsKeptOnTheDevice() throws {
        let kept = MemoryText()
        _ = VaultProjects(folder: FakeFolder(Self.notes), remembered: kept, background: false).notes(tag: "#project")
        let later = VaultProjects(folder: FakeFolder([:]), remembered: kept, background: true, every: 1000)
        #expect(later.notes(tag: "#project").count == 3)
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

    private static func listCard(_ card: BoardCard) -> JSONValue {
        var json: [String: JSONValue] = ["key": card.item.key.json, "level": .number(Double(card.level)), "group": card.item.group.json]
        if let zone = card.zone { json["project"] = zone }
        return .object(json)
    }
}
