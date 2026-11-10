import Testing
@testable import Core

/// A card's open menu under a screen that draws itself again (a project scan, the file read again, the clock).
@Suite struct MenuShapeTests {
    func menu(projects: [String], checked: String) -> MenuShape {
        .page(title: "", detail: "", children: [
            .page(title: "", detail: "", children: [.row("Done"), .row("In Progress")]),
            .page(title: "", detail: "", children: [
                .row("Rename"),
                .page(title: "Section", detail: "No section", children: [.row("Morning"), .row("No section ✓")]),
                .page(title: "Project", detail: checked, children: projects.map { .row($0 == checked ? "\($0) ✓" : $0) } + [.row("New project…")]),
            ]),
        ])
    }

    @Test func aRedrawThatChangesNothingLeavesTheOpenMenuAlone() {
        let shown = menu(projects: ["Attic", "Balcony"], checked: "Balcony")
        #expect(!MenuShape.needsUpdate(shown: shown, next: menu(projects: ["Attic", "Balcony"], checked: "Balcony")))
        #expect(MenuShape.needsUpdate(shown: shown, next: menu(projects: ["Attic", "Balcony", "Cellar"], checked: "Balcony")))
        #expect(MenuShape.needsUpdate(shown: nil, next: shown))
    }

    @Test func theOpenPageStaysOpenWhereverItStandsNow() {
        let next = menu(projects: ["Attic", "Balcony", "Cellar"], checked: "Balcony")
        #expect(MenuShape.path(toPage: "Project", in: next) == [1, 2])
        #expect(MenuShape.path(toPage: "Section", in: next) == [1, 1])
        #expect(MenuShape.path(toPage: "", in: next) == [])
        #expect(MenuShape.path(toPage: "Reminder", in: next) == nil)
    }
}
