import Foundation
import Testing
@testable import Core

@Suite struct SyncLinkTests {
    @Test func theButtonAsksObsidianToSyncTheVault() {
        #expect(SyncLink.request(vault: "Obsidian") == URL(string: "obsidian://task-calendar-sync?vault=Obsidian"))
        #expect(SyncLink.request(vault: "My Vault") == URL(string: "obsidian://task-calendar-sync?vault=My%20Vault"))
    }

    @Test func aVaultNameKeepsItsAmpersandsAndPluses() {
        #expect(SyncLink.request(vault: "Work & Home+") == URL(string: "obsidian://task-calendar-sync?vault=Work%20%26%20Home%2B"))
    }

    @Test func syncedWithoutAnErrorIsSynced() {
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced")!) == .synced)
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?vault=Obsidian")!) == .synced)
    }

    @Test func anErrorIsTheReasonAsThePluginWroteIt() {
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error=Obsidian%20Sync%20is%20paused")!)
            == .notSynced(reason: "Obsidian Sync is paused"))
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error=Obsidian%20Sync%20didn't%20finish%20in%2045%20seconds")!)
            == .notSynced(reason: "Obsidian Sync didn't finish in 45 seconds"))
    }

    @Test func aFormEncodedReasonReadsTheSame() {
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error=Obsidian+Sync+is+off+in+this+vault")!)
            == .notSynced(reason: "Obsidian Sync is off in this vault"))
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error=1%2B1")!) == .notSynced(reason: "1+1"))
    }

    @Test func anEmptyErrorIsStillNotSynced() {
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error=")!) == .notSynced(reason: ""))
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://synced?error")!) == .notSynced(reason: ""))
    }

    @Test func anotherLinkIsNotTheWayBack() {
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://refresh?vault=V")!) == nil)
        #expect(SyncLink.outcome(from: URL(string: "taskcalendar://new-task")!) == nil)
        #expect(SyncLink.outcome(from: URL(string: "obsidian://synced")!) == nil)
    }
}
