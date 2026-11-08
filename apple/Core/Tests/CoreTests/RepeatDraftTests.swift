import Foundation
import Testing
@testable import Core

/// The repeat page's draft as the core hands it: every rule decodes, the ones that show nothing under their unit too.
@Suite struct RepeatDraftTests {
    let board = TaskBoard(core: try! PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(""))

    func rule(kind: String = "schedule", every: Int, unit: String, days: [Int] = [], dayOfMonth: Int? = nil) -> JSONValue {
        ["kind": .string(kind), "every": .number(Double(every)), "unit": .string(unit), "days": .array(days.map { .number(Double($0)) }), "dayOfMonth": dayOfMonth.map { .number(Double($0)) } ?? .null, "from": .null]
    }

    @Test func everyFewDaysShowsNothingUnderItsUnit() throws {
        let draft: RepeatDraft = try board.rule("rules.repeatDraft", ["2026-11-06", rule(every: 3, unit: "day")])
        #expect(draft.every == 3)
        #expect(draft.unit == "day")
        #expect(draft.detail == nil)
    }

    @Test func afterDoneShowsNothingUnderItsUnit() throws {
        let draft: RepeatDraft = try board.rule("rules.repeatDraft", ["2026-11-06", rule(kind: "afterDone", every: 2, unit: "week")])
        #expect(draft.kind == "afterDone")
        #expect(draft.detail == nil)
        #expect(draft.removable)
    }

    @Test func aMonthlyRuleShowsItsDay() throws {
        let draft: RepeatDraft = try board.rule("rules.repeatDraft", ["2026-11-06", rule(every: 1, unit: "month", dayOfMonth: 15)])
        #expect(draft.detail == "monthDay")
        #expect(draft.dayOfMonth == 15)
    }

    @Test func aWeeklyRuleShowsItsWeekdays() throws {
        let draft: RepeatDraft = try board.rule("rules.repeatDraft", ["2026-11-06", .null])
        #expect(draft.detail == "weekdays")
    }

    @Test func turningToAfterDoneOrDaysIsADraftToo() throws {
        let weekly: RepeatDraft = try board.rule("rules.repeatDraft", ["2026-11-06", .null])
        let afterDone: RepeatDraft = try board.rule("rules.editRepeat", [weekly.json, ["what": "kind", "to": "afterDone"]])
        #expect(afterDone.kind == "afterDone")
        #expect(afterDone.detail == nil)
        let daily: RepeatDraft = try board.rule("rules.editRepeat", [weekly.json, ["what": "unit", "to": "day"]])
        #expect(daily.unit == "day")
        #expect(daily.detail == nil)
    }
}
