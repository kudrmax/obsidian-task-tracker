import Core
import SwiftUI
import UIKit

/// The Sync button's round trip: Obsidian is sent to sync the vault and hands the phone back when it is done.
@MainActor
@Observable
final class ObsidianSync {
    static let shared = ObsidianSync()

    /// Why the last round trip did not sync: the «Not Synced» alert shows it.
    var notSynced: NotSynced?
    /// Counts the times Obsidian handed the phone back: the board reads the file again on each.
    private(set) var returns = 0

    /// The vault Obsidian is asked to sync: the folder chosen in Settings, as Open in Obsidian names it.
    var vault: String? { UserDefaults.standard.string(forKey: "vaultFolderName") }

    func start() async {
        guard let vault, let link = SyncLink.request(vault: vault) else { return }
        if !(await UIApplication.shared.open(link)) {
            notSynced = NotSynced(reason: "Obsidian isn’t installed")
        }
    }

    /// The way back from Obsidian; `false` for any other link.
    func handle(_ url: URL) -> Bool {
        guard let outcome = SyncLink.outcome(from: url) else { return false }
        returns += 1
        if case .notSynced(let reason) = outcome { notSynced = NotSynced(reason: reason) }
        Task { await AppServices.shared.refresh() }
        return true
    }

    struct NotSynced: Identifiable {
        let id = UUID()
        let reason: String
    }
}

extension View {
    /// The stock alert of a round trip that did not sync, the plugin's reason as its message.
    func notSyncedAlert(_ sync: ObsidianSync) -> some View {
        alert("Not Synced", isPresented: Binding(get: { sync.notSynced != nil }, set: { if !$0 { sync.notSynced = nil } }), presenting: sync.notSynced) { _ in
            Button("OK") {}
        } message: { failure in
            if !failure.reason.isEmpty { Text(failure.reason) }
        }
    }
}
