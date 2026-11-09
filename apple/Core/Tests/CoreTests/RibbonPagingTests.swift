import Testing
@testable import Core

/// Max, three times (11-07, 11-09 twice): one swipe of the lists moves them one place, never two.
@Suite struct RibbonPagingTests {
    /// Inbox, Soon, Today; and with the Done column search opens, Done, Inbox, Soon, Today.
    static let ribbon = RibbonPaging(stops: [0, 200, 402])
    static let withDone = RibbonPaging(stops: [0, 200, 400, 602])

    @Test func aSwipeRightAfterLaunchStartsWhereTheRibbonStands() {
        // Nothing has scrolled since the app opened: the swipe still starts from the place shown.
        #expect(Self.ribbon.start(at: 0, gliding: nil) == 0)
        #expect(Self.ribbon.start(at: 402, gliding: nil) == 2)
        #expect(Self.ribbon.start(at: 210, gliding: nil) == 1)
    }

    @Test func aSwipeDuringAGlideStartsFromWhereTheGlideGoes() {
        #expect(Self.ribbon.start(at: 120, gliding: 1) == 1)
        #expect(Self.ribbon.start(at: 120, gliding: 7) == 1)
    }

    @Test func theFingerDrawsTheRibbonNoFurtherThanTheNextPlace() {
        #expect(Self.ribbon.clamp(402, from: 0) == 200)
        #expect(Self.ribbon.clamp(-50, from: 2) == 200)
        #expect(Self.ribbon.clamp(300, from: 1) == 300)
    }

    @Test func noAnswerOfTheRuleMovesItMoreThanOnePlace() {
        for paging in [Self.ribbon, Self.withDone] {
            for from in paging.stops.indices {
                for offset in stride(from: -100.0, through: 700.0, by: 25) {
                    for shift in [-5, -2, -1, 0, 1, 2, 5] {
                        let landed = paging.landing(from: from, offset: offset, speed: 9) { _, _, _ in shift }
                        #expect(abs(landed - from) <= 1, "from \(from) at \(offset), rule \(shift) → \(landed)")
                        #expect(paging.stops.indices.contains(landed))
                    }
                }
            }
        }
    }

    @Test func aFlickFromInboxLandsOnSoon() {
        let landed = Self.ribbon.landing(from: 0, offset: 200, speed: 5) { _, _, _ in 1 }
        #expect(landed == 1)
        let back = Self.ribbon.landing(from: 2, offset: 200, speed: -5) { _, _, _ in 1 }
        #expect(back == 1)
    }

    @Test func aShortSlowSwipeGoesBack() {
        #expect(Self.ribbon.landing(from: 1, offset: 230, speed: 0.01) { _, _, _ in 0 } == 1)
    }

    @Test func theCoreRuleAndTheRibbonTogether() throws {
        let board = TaskBoard(core: try PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(CoreDecidesTests.file))
        let rule = { (moved: Double, distance: Double, speed: Double) in
            (try? board.swipeLanding(moved: moved, distance: distance, speed: speed)) ?? 0
        }
        #expect(Self.ribbon.landing(from: 0, offset: 200, speed: 9, rule: rule) == 1)
        #expect(Self.ribbon.landing(from: 2, offset: 200, speed: -9, rule: rule) == 1)
        #expect(Self.ribbon.landing(from: 1, offset: 205, speed: 0.001, rule: rule) == 1)
    }
}

/// Max, three times: the divider sets the day list against the calendar at Today only; Inbox and Soon split the screen in
/// half, as the plugin's screen (`docs/plugin/screen.md`).
@Suite struct RibbonColumnsTests {
    @Test func inboxAndSoonAreHalfTheScreenWhateverTheDivider() {
        for list in [120.0, 201, 300] {
            let columns = RibbonColumns(width: 402, list: list, done: false)
            #expect(columns.half == 201)
            #expect(columns.stops == [0, 201, 402])
            #expect(columns.dayList(toToday: 0) == 201)
        }
    }

    @Test func atTodayTheDividerSetsTheDayList() {
        let columns = RibbonColumns(width: 402, list: 300, done: false)
        #expect(columns.toToday(at: 402) == 1)
        #expect(columns.dayList(toToday: 1) == 300)
        #expect(columns.calendar == 102)
    }

    @Test func betweenSoonAndTodayTheEdgeGlides() {
        let columns = RibbonColumns(width: 400, list: 300, done: false)
        #expect(columns.toToday(at: 200) == 0)
        #expect(columns.toToday(at: 300) == 0.5)
        #expect(columns.dayList(toToday: 0.5) == 250)
        #expect(columns.toToday(at: 0) == 0)
    }

    @Test func theDoneColumnMovesEveryPlaceByHalf() {
        let columns = RibbonColumns(width: 400, list: 120, done: true)
        #expect(columns.stops == [0, 200, 400, 600])
        #expect(columns.toToday(at: 600) == 1)
    }
}
