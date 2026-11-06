import Foundation
import Testing
@testable import Core

@Suite struct NoticeIDTests {
    @Test func aNameIsReadBackAsItWasGiven() {
        let offer = AfterEvent(meeting: "Design #1", left: "40 min", until: Fixtures.date(4, 11))
        let ids: [NoticeID] = [
            .reminder(reminderID: "- [ ] Record #transcribe ⏰ 2026-11-04 10:00", minutes: 20, offer: NoticeID.Offer(offer)),
            .reminder(reminderID: "- [ ] Call ⏰ 2026-11-04 10:00", minutes: 0, offer: nil),
            .failure(reminderID: "- [ ] Call ⏰ 2026-11-04 10:00"),
            .problem,
            .signing(2),
        ]
        for id in ids { #expect(NoticeID(identifier: id.identifier) == id) }
    }

    @Test func theSameDeliveryHasTheSameName() {
        let a = NoticeID.reminder(reminderID: "A", minutes: 5, offer: nil).identifier
        #expect(a == NoticeID.reminder(reminderID: "A", minutes: 5, offer: nil).identifier)
        #expect(a != NoticeID.reminder(reminderID: "A", minutes: 10, offer: nil).identifier)
    }

    @Test func anOlderVersionsNameIsNotOne() {
        #expect(NoticeID(identifier: "- [ ] Call ⏰ 2026-11-04 10:00#5") == nil)
        #expect(NoticeID(identifier: "sync#problem") == nil)
        #expect(NoticeID.isSyncs("signing#0"))
        #expect(!NoticeID.isSyncs(NoticeID.signing(0).identifier))
    }
}
