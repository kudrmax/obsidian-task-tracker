import Core
import SwiftUI

/// A new task: typed, recorded, or both, into one of the four lists. Once added, the screen is empty for the next one.
struct CaptureView: View {
    /// The lists by their headings' names, read again each time the screen shows: a heading renamed in Obsidian shows here.
    @State private var options: [CaptureList] = []
    @State private var listKey: String?
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var failure: String?
    @State private var sending = false
    /// The list the last task went into, told of until the next one is typed.
    @State private var added: CaptureList?
    @FocusState private var typing: Bool
    @Environment(\.scenePhase) private var scene

    var body: some View {
        ScrollView {
            VStack(spacing: Layout.margin) {
                Picker("List", selection: $listKey) {
                    ForEach(options, id: \.key) { option in
                        Text(option.name).tag(Optional(option.key))
                    }
                }
                .pickerStyle(.segmented)

                // The task's field takes the page down to the recording's bar, as a note does: a tap anywhere on it types.
                TextField("New task", text: $text, axis: .vertical)
                    .focused($typing)
                    .submitLabel(.done)
                    .padding(Layout.margin)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .card()
                    .contentShape(.rect)
                    .onTapGesture { typing = true }

                if let added {
                    Label("Added to \(added.name)", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                if let failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
                if let problem = recorder.problem {
                    Label(problem, systemImage: "mic.slash.fill")
                        .foregroundStyle(.red)
                }
            }
            // No margin on top: a `Form` starts its first section right under the title.
            .padding([.horizontal, .bottom], Layout.margin)
            .containerRelativeFrame(.vertical)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenGround()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            RecorderBar(recorder: recorder)
                .padding(.horizontal, Layout.margin - Layout.glassButtonInset)
                .padding(.bottom, Layout.margin)
        }
        .toolbar {
            if canSend {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Clear", systemImage: "xmark") { clear() }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Add", systemImage: "checkmark") { Task { await send() } }
                    .disabled(!canSend || sending || list == nil)
            }
        }
        .onChange(of: text) { if !text.isEmpty { added = nil } }
        .task { readLists() }
        .onChange(of: scene) { if scene == .active { readLists() } }
        .sensoryFeedback(.success, trigger: added) { _, new in new != nil }
        .tabScreen("New Task")
    }

    private var list: CaptureList? {
        options.first { $0.key == listKey } ?? options.first
    }

    private func readLists() {
        options = AppServices.shared.captureLists()
        if !options.contains(where: { $0.key == listKey }) { listKey = options.first?.key }
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || recorder.state != .idle
    }

    private func clear() {
        recorder.discard()
        text = ""
        failure = nil
        added = nil
    }

    private func send() async {
        sending = true
        defer { sending = false }
        let recording = recorder.take()
        guard let target = list else { return }
        let typed = text
        let tag = AppSettings.recordingTag
        let outcome = await Task.detached { AppServices.shared.capture(list: target, text: typed, recording: recording, tag: tag) }.value
        switch outcome {
        case .saved:
            clear()
            added = target
        case .blank:
            failure = nil
        case .failed(let reason):
            failure = reason
        }
    }
}
