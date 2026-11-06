import Foundation
import Testing
@testable import Core

@Suite struct RefreshLinkTests {
    @Test func refreshNowNamesTheVaultToGoBackTo() {
        let back = RefreshLink.back(from: URL(string: "taskcalendar://refresh?vault=My%20Vault")!)
        #expect(back == URL(string: "obsidian://open?vault=My%20Vault"))
    }

    @Test func anotherLinkIsNotRefreshNow() {
        #expect(RefreshLink.back(from: URL(string: "taskcalendar://other?vault=V")!) == nil)
        #expect(RefreshLink.back(from: URL(string: "https://example.com/refresh?vault=V")!) == nil)
    }
}
