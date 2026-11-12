import Testing
@testable import Core

/// The Rows view's lists one under another: each as tall as it is while all fit, the long ones sharing what is left.
@Suite struct StackedRowsTests {
    @Test func listsThatFitTakeTheirOwnHeight() {
        #expect(StackedRows.heights(wanted: [100, 60, 80, 40], room: 700, least: 70) == [100, 70, 80, 70])
    }

    @Test func aLongListSharesWhatTheShortOnesLeave() {
        let heights = StackedRows.heights(wanted: [900, 70, 400, 70], room: 600, least: 70)
        #expect(heights == [230, 70, 230, 70])
        #expect(heights.reduce(0, +) == 600)
    }

    @Test func noListIsShorterThanItsTitleAndACard() {
        #expect(StackedRows.heights(wanted: [500, 500], room: 100, least: 70) == [70, 70])
    }
}
