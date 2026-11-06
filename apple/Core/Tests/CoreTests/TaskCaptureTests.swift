import Foundation
import Testing
@testable import Core

@Suite struct AttachmentFolderTests {
    @Test func obsidianDefaultIsTheVaultFolder() {
        #expect(AttachmentFolder.path(appJSON: nil, notePath: "Tasks/TODOs.md") == "")
        #expect(AttachmentFolder.path(appJSON: #"{"attachmentFolderPath":"/"}"#, notePath: "Tasks/TODOs.md") == "")
    }

    @Test func aFolderOfTheVault() {
        #expect(AttachmentFolder.path(appJSON: #"{"attachmentFolderPath":"Files/Audio/"}"#, notePath: "Tasks/TODOs.md") == "Files/Audio")
    }

    @Test func theNotesFolderAndASubfolderOfIt() {
        #expect(AttachmentFolder.path(appJSON: #"{"attachmentFolderPath":"./"}"#, notePath: "Tasks/TODOs.md") == "Tasks")
        #expect(AttachmentFolder.path(appJSON: #"{"attachmentFolderPath":"./att"}"#, notePath: "Tasks/TODOs.md") == "Tasks/att")
        #expect(AttachmentFolder.path(appJSON: #"{"attachmentFolderPath":"./att"}"#, notePath: "TODOs.md") == "att")
    }
}

@Suite struct TaskCaptureTests {
    static let file = "## Inbox\n\n- [ ] Old\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n"
    let at = Fixtures.date(6, 14, 32)

    func capture(_ vault: FakeVault) throws -> TaskCapture {
        TaskCapture(vault: vault, rules: try PhoneCore(script: Fixtures.phoneScript), now: { [at] in at })
    }

    @Test func typedTextGoesLastInInbox() throws {
        let vault = FakeVault(Self.file)
        #expect(try capture(vault).capture(list: .inbox, text: " Call the bank\n", recording: nil) == .saved)
        #expect(vault.text.contains("- [ ] Old\n- [ ] Call the bank\n"))
    }

    @Test func nowTakesTodaysDate() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .now, text: "Buy milk", recording: nil)
        #expect(vault.text.contains("## Now\n\n- [ ] Buy milk 📅 2026-11-06\n"))
    }

    @Test func linesTypedBecomeOneTitle() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .inbox, text: "Call\n\n the bank", recording: nil)
        #expect(vault.text.contains("- [ ] Call the bank\n"))
    }

    @Test func backlogAndSoonTakeNoDate() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .backlog, text: "Learn Go", recording: nil)
        _ = try capture(vault).capture(list: .soon, text: "Book a table", recording: nil)
        #expect(vault.text.contains("## Soon\n\n- [ ] Book a table\n"))
        #expect(vault.text.contains("## Backlog\n\n- [ ] Learn Go\n"))
    }

    @Test func aRecordingIsSavedAndLinkedWithTheTag() throws {
        let vault = FakeVault(Self.file)
        vault.files[".obsidian/app.json"] = #"{"attachmentFolderPath":"Audio"}"#
        let sound = Data([1, 2, 3])
        #expect(try capture(vault).capture(list: .inbox, text: "", recording: sound, tag: "#transcribe") == .saved)
        #expect(vault.saved["Audio/Recording 20261106143200.m4a"] == sound)
        #expect(vault.text.contains("- [ ] Old\n- [ ] [[Recording 20261106143200.m4a]] #transcribe\n"))
    }

    @Test func textAndRecordingTogether() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .now, text: "Idea", recording: Data([1]), tag: "transcribe")
        #expect(vault.text.contains("- [ ] Idea [[Recording 20261106143200.m4a]] #transcribe 📅 2026-11-06\n"))
    }

    @Test func noTagWhenNoneIsSet() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .inbox, text: "", recording: Data([1]), tag: " ")
        #expect(vault.text.contains("- [ ] [[Recording 20261106143200.m4a]]\n"))
    }

    @Test func theTagIsOnlyForARecording() throws {
        let vault = FakeVault(Self.file)
        _ = try capture(vault).capture(list: .inbox, text: "Typed", recording: nil, tag: "#transcribe")
        #expect(vault.text.contains("- [ ] Typed\n"))
    }

    @Test func nothingToWrite() throws {
        let vault = FakeVault(Self.file)
        #expect(try capture(vault).capture(list: .inbox, text: "  ", recording: nil) == .saved)
        #expect(vault.text == Self.file)
    }

    @Test func aFileChangedInBetweenIsReadAgain() throws {
        let vault = FakeVault(Self.file)
        vault.changeBeforeWrite = "## Inbox\n\n- [ ] Typed in Obsidian\n"
        _ = try capture(vault).capture(list: .inbox, text: "A", recording: nil)
        #expect(vault.text.contains("- [ ] Typed in Obsidian\n- [ ] A\n"))
    }

    @Test func noAccessIsSaid() throws {
        let vault = FakeVault(Self.file)
        vault.readFails = .noAccess
        #expect(try capture(vault).capture(list: .inbox, text: "A", recording: nil) == .failed("No access to the vault folder: choose it in the app"))
    }
}
