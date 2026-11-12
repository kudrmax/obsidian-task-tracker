import Foundation
import Testing
@testable import Core

/// The quick entry in the By project view (the Projects tab before 11-12), as the app drives it: the Projects list handed
/// in as a list the field stands in, so Rename, Add Subtask, the No tasks plate, the plus and a place chosen in the bar
/// all stay among the projects (Max,
/// 2026-11-11: «Это должно происходить ровно там, где задача стоит, то есть в проектах»).
@Suite struct ProjectsEntryTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    private final class Driver {
        let vault = FakeVault(ProjectsScreenTests.file)
        let board: TaskBoard
        var session = JSONValue.null

        init(core: PhoneCore) {
            board = TaskBoard(core: core, vault: vault, projectsScreen: MemoryText(), clock: { Fixtures.date(7, 9) })
        }

        var view: ProjectsView { try! board.projectsScreen() }

        /// The look the app hands in By project: the Projects list as the core gives it, shown alone.
        func look() throws -> JSONValue {
            let list = try board.projectsEntryLook(view)
            let shown: JSONValue = try board.rule("rules.viewEntryLists", ["byProject", "inbox"])
            return ["cards": ["projects": list.cards], "sections": ["projects": list.sections], "parts": ["projects": list.parts], "day": "2026-11-07", "shown": shown]
        }

        @discardableResult
        func call(_ method: String, _ arguments: [JSONValue] = []) throws -> JSONValue {
            let reply = try board.entry(method, [session, try look()] + arguments)
            session = reply["session"]
            return reply
        }

        /// Every job queued, written as the app's pump writes it.
        func runJobs() throws {
            guard case .array(let jobs) = session["jobs"] else { return }
            for job in jobs {
                guard let id = job["id"].string else { continue }
                let call = try call("call", [.string(id)])["value"]
                if let method = call["method"].string, case .array(let args) = call["args"] {
                    _ = try board.write("tasks." + (method == "createInPlace" ? "createWithId" : method), args)
                }
                try self.call("unshown", [.string(id)])
                try self.call("done", [.string(id)])
            }
        }
    }

    @Test func byProjectShowsItsOwnListOnly() throws {
        let shown: [String] = try Driver(core: core).board.rule("rules.viewEntryLists", ["byProject", "soon"])
        #expect(shown == ["projects"])
    }

    @Test func renameStandsInTheProjectsListAndWritesTheNewTitle() throws {
        let driver = Driver(core: core)
        try driver.board.selectProjectNode("project:Окружение")
        let card = try #require(driver.view.sections.first?.rows.first)
        let spot = try driver.call("renameSpot", [card.item.json, .bool(false)])["value"]
        #expect(spot["kind"].string == "list" && spot["column"].string == "projects")
        let opened = try driver.call("open", [spot, card.item.json])
        #expect(opened["state"]["renaming"]["id"].string == card.item.id)
        #expect(!(try driver.call("listEntry", ["projects"])["value"]).isNull)
        #expect((try driver.call("listEntry", ["soon"])["value"]).isNull)
        try driver.call("type", ["Брейншторм идей"])
        try driver.call("enter")
        try driver.runJobs()
        #expect(driver.vault.text.contains("- [ ] Брейншторм идей 🗂️ Окружение"))
    }

    @Test func aPlaceChosenInTheBarKeepsTheFieldOnProjects() throws {
        let driver = Driver(core: core)
        try driver.board.selectProjectNode("project:Окружение")
        let card = try #require(driver.view.sections.first?.rows.first)
        let spot = try driver.call("renameSpot", [card.item.json, .bool(false)])["value"]
        try driver.call("open", [spot, card.item.json])
        let move = try driver.call("choosePlace", [["kind": "inbox"]])["value"]
        #expect(move["column"].string == "projects")
        #expect(move["day"].isNull)
    }

    @Test func addSubtaskStandsUnderTheCardInTheProjectsList() throws {
        let driver = Driver(core: core)
        try driver.board.selectProjectNode("project:Окружение")
        let card = try #require(driver.view.sections.first?.rows.first)
        let spot = try driver.call("subtaskSpot", [card.item.key.json])["value"]
        #expect(spot["kind"].string == "list" && spot["column"].string == "projects")
        try driver.call("open", [spot])
        try driver.call("type", ["Шаг"])
        try driver.call("enter")
        try driver.runJobs()
        #expect(driver.vault.text.contains("- [ ] Брейншторм 🗂️ Окружение\n\t- [ ] Шаг"))
        // The subtask is a row of the list now, under its card.
        #expect(driver.view.sections.first?.rows.map(\.level) == [0, 1])
    }

    @Test func thePlusTypesInThePlusPartAndUnderDoneOpensNothing() throws {
        let driver = Driver(core: core)
        try driver.board.selectProjectNode("project:Окружение")
        #expect(try driver.call("plusOpens")["value"].bool == true)
        try driver.call("openFromPlus")
        #expect(try driver.call("state")["value"]["spot"]["column"].string == "projects")
        try driver.call("escape")
        try driver.board.selectProjectNode("done")
        #expect(try driver.call("plusOpens")["value"].bool == false)
        #expect(try driver.call("openFromPlus")["value"].bool == false)
        #expect(try driver.call("state")["value"].isNull)
    }

    @Test func thePartedListDrawsTheFieldAtItsPartsRow() {
        #expect(PartedEntryAt(kind: "top", section: nil, card: nil, rows: [2, 0]) == .top)
        #expect(PartedEntryAt(kind: "end", section: nil, card: nil, rows: [2, 0]) == .end)
        #expect(PartedEntryAt(kind: "in", section: 0, card: 1, rows: [2, 3]) == .part(0, row: 1))
        #expect(PartedEntryAt(kind: "in", section: 1, card: 5, rows: [2, 3]) == .part(1, row: 3))
        #expect(PartedEntryAt(kind: "in", section: 1, card: 2, rows: [2, 0]) == .part(1, row: 0))
        #expect(PartedEntryAt(kind: "in", section: 4, card: 2, rows: [2, 0]) == .end)
    }
}
