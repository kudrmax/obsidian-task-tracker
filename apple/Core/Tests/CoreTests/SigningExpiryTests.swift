import Foundation
import Testing
@testable import Core

@Suite struct SigningExpiryTests {
    let end = Fixtures.date(12, 14)

    func left(_ hours: Double) -> SigningCountdown {
        SigningExpiry.countdown(expiration: end, now: end.addingTimeInterval(-hours * 3600))
    }

    @Test func wholeDaysWhileADayOrMoreIsLeft() {
        #expect(left(6 * 24 + 23) == SigningCountdown(urgency: .calm, left: .days(6)))
        #expect(left(2 * 24 + 20).left == .days(2))
        #expect(left(24).left == .days(1))
    }

    @Test func hoursRoundedUpInTheLastDay() {
        #expect(left(23.5) == SigningCountdown(urgency: .urgent, left: .hours(24)))
        #expect(left(1.0 / 60).left == .hours(1))
    }

    @Test func urgencyTurnsAtTwoDaysAndAtOneDay() {
        #expect(left(48.1).urgency == .calm)
        #expect(left(48).urgency == .soon)
        #expect(left(24.1).urgency == .soon)
        #expect(left(24).urgency == .urgent)
    }

    @Test func expiredOnceTheMomentPasses() {
        #expect(left(0) == SigningCountdown(urgency: .expired, left: .expired))
        #expect(left(-5) == SigningCountdown(urgency: .expired, left: .expired))
    }

    @Test func warningsTwoDaysOneDayHalfADayTwoHoursAndOneHourBefore() {
        let warnings = SigningExpiry.warnings(expiration: end, now: Fixtures.date(5, 14))
        #expect(warnings.map(\.fire) == [Fixtures.date(10, 14), Fixtures.date(11, 14), Fixtures.date(12, 2), Fixtures.date(12, 12), Fixtures.date(12, 13)])
        #expect(warnings.map(\.left) == [.days(2), .days(1), .hours(12), .hours(2), .hours(1)])
    }

    @Test func noWarningsInThePast() {
        let warnings = SigningExpiry.warnings(expiration: end, now: Fixtures.date(12, 3))
        #expect(warnings.map(\.fire) == [Fixtures.date(12, 12), Fixtures.date(12, 13)])
        #expect(SigningExpiry.warnings(expiration: end, now: end).isEmpty)
    }
}
