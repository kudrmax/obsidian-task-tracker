import Core
import SwiftUI

/// A new task: typed, recorded, or both, into one of the four lists. Once added, the screen is empty for the next one.
struct CaptureView: View {
    @State private var list = CaptureListOption.inbox
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var failure: String?
    @State private var sending = false
    /// The list the last task went into, told of until the next one is typed.
    @State private var added: CaptureListOption?
    @FocusState private var typing: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("List", selection: $list) {
                        ForEach(CaptureListOption.allCases, id: \.self) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)

                    TextField("New task", text: $text, axis: .vertical)
                        .font(.title3)
                        .focused($typing)
                        .submitLabel(.done)

                    if let added {
                        Label("Added to \(added.title)", systemImage: "checkmark.circle.fill")
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
                    // The empty page under the task is its field too: a tap there starts typing.
                    Color.clear
                        .frame(maxHeight: .infinity)
                        .contentShape(.rect)
                        .onTapGesture { typing = true }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .containerRelativeFrame(.vertical, alignment: .top)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                RecorderBar(recorder: recorder)
                    .padding(.horizontal)
                    .padding(.bottom, 8)
            }
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if canSend {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Clear", systemImage: "xmark") { clear() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", systemImage: "checkmark") { Task { await send() } }
                        .disabled(!canSend || sending)
                }
            }
            .onChange(of: text) { if !text.isEmpty { added = nil } }
            .sensoryFeedback(.success, trigger: added) { _, new in new != nil }
        }
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
        let typed = text
        let target = list.core
        let tag = AppSettings.recordingTag
        let outcome = await Task.detached { AppServices.shared.capture(list: target, text: typed, recording: recording, tag: tag) }.value
        switch outcome {
        case .saved:
            clear()
            added = list
        case .failed(let reason):
            failure = reason
        }
    }
}
