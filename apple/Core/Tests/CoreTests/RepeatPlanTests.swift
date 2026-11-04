import Foundation
import Testing
@testable import Core

@Suite struct RepeatPlanTests {
    func reminder(_ id: String, _ kind: ReminderKind = .notification, start: Date = Fixtures.date(4, 10), dayEnd: Date = Fixtures.date(5, 5)) -> Reminder {
        Reminder(id: id, title: id, body: "", kind: kind, date: "2026-11-04", start: start, dayEnd: dayEnd)
    }

    @Test func offsetsStartEveryMinuteThenThin() {
        let offsets = RepeatPlan.offsets(for: .notification)
        #expect(Array(offsets.prefix(26)) == Array(0...14) + [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75])
        #expect(RepeatPlan.offsets(for: .alarm).first == 1)
        #expect(RepeatPlan.offsets(for: .alarm) == Array(offsets.dropFirst()))
    }

    @Test func nothingAfterTheDayEnds() {
        let plan = RepeatPlan.plan([reminder("A", dayEnd: Fixtures.date(4, 10, 3))], now: Fixtures.date(4, 9))
        #expect(plan.map(\.fire) == [Fixtures.date(4, 10), Fixtures.date(4, 10, 1), Fixtures.date(4, 10, 2)])
    }

    @Test func nothingInThePast() {
        let plan = RepeatPlan.plan([reminder("A")], now: Fixtures.date(4, 10, 20))
        #expect(plan.first?.fire == Fixtures.date(4, 10, 25))
    }

    @Test func nearestFirstWithinTheBudget() {
        let reminders = [reminder("A"), reminder("B", start: Fixtures.date(4, 10, 2)), reminder("C", start: Fixtures.date(4, 11))]
        let plan = RepeatPlan.plan(reminders, now: Fixtures.date(4, 9))
        #expect(plan.count == RepeatPlan.budget)
        let latest = plan.map(\.fire).max()!
        let all = reminders.flatMap { r in RepeatPlan.offsets(for: r.kind).map { r.start.addingTimeInterval(Double($0) * 60) } }.filter { $0 < Fixtures.date(5, 5) }
        #expect(all.filter { $0 < latest }.count <= RepeatPlan.budget)
        #expect(plan == plan.sorted { $0.fire < $1.fire })
    }

    @Test func identifiersAreStable() {
        let a = RepeatPlan.plan([reminder("A")], now: Fixtures.date(4, 9))
        let b = RepeatPlan.plan([reminder("A")], now: Fixtures.date(4, 9, 30))
        #expect(a.first?.identifier == "A#0")
        #expect(Set(b.map(\.identifier)).isSubset(of: Set(a.map(\.identifier))))
    }
}
