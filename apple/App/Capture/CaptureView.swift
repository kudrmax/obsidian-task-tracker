import Core
import SwiftUI

/// A new task: typed, recorded, or both, into one of the four lists.
struct CaptureView: View {
    let close: () -> Void

    @State private var list = CaptureListOption.inbox
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var failure: String?
    @State private var sending = false
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

                    if let failure {
                        Label(failure, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                    if let problem = recorder.problem {
                        Label(problem, systemImage: "mic.slash.fill")
                            .foregroundStyle(.red)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .interactiveDismissDisabled(canSend)
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") {
                        recorder.discard()
                        close()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", systemImage: "checkmark") { Task { await send() } }
                        .disabled(!canSend || sending)
                }
                recorderItems
            }
            .onAppear { typing = true }
        }
    }

    /// The recording's controls in the system bottom bar, drawn and animated by iOS as every toolbar is; above the
    /// keyboard while typing, as Notes has them.
    @ToolbarContentBuilder
    private var recorderItems: some ToolbarContent {
        if typing {
            ToolbarItemGroup(placement: .keyboard) {
                switch recorder.state {
                case .idle:
                    Spacer()
                    recordButton
                    Spacer()
                case .recording, .paused:
                    discardButton
                    Spacer()
                    elapsed
                    Spacer()
                    pauseButton
                    stopButton
                case .finished:
                    discardButton
                    Spacer()
                    voiceNote
                    Spacer()
                }
            }
        } else {
            switch recorder.state {
            case .idle:
                ToolbarSpacer(.flexible, placement: .bottomBar)
                ToolbarItem(placement: .bottomBar) { recordButton }
                ToolbarSpacer(.flexible, placement: .bottomBar)
            case .recording, .paused:
                ToolbarItem(placement: .bottomBar) { discardButton }
                ToolbarSpacer(.flexible, placement: .bottomBar)
                ToolbarItem(placement: .status) { elapsed }
                ToolbarSpacer(.flexible, placement: .bottomBar)
                ToolbarItemGroup(placement: .bottomBar) {
                    pauseButton
                    stopButton
                }
            case .finished:
                ToolbarItem(placement: .bottomBar) { discardButton }
                ToolbarSpacer(.flexible, placement: .bottomBar)
                ToolbarItem(placement: .status) { voiceNote }
                ToolbarSpacer(.flexible, placement: .bottomBar)
            }
        }
    }

    private var recordButton: some View {
        Button("Record", systemImage: "mic.fill") { Task { await recorder.start() } }
            .buttonStyle(.glassProminent)
            .tint(.red)
    }

    private var discardButton: some View {
        Button("Discard", systemImage: "trash", role: .destructive) { recorder.discard() }
    }

    @ViewBuilder
    private var pauseButton: some View {
        if recorder.state == .recording {
            Button("Pause", systemImage: "pause.fill") { recorder.pause() }
        } else {
            Button("Resume", systemImage: "mic.fill") { recorder.resume() }
        }
    }

    private var stopButton: some View {
        Button("Stop", systemImage: "stop.fill") { recorder.finish() }
    }

    private var elapsed: some View {
        VStack(spacing: 0) {
            Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                .font(.headline.monospacedDigit())
                .contentTransition(.numericText())
            Text(recorder.state == .recording ? "Recording" : "Paused")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .fixedSize()
    }

    private var voiceNote: some View {
        VStack(spacing: 0) {
            Label("Voice note", systemImage: "waveform")
                .font(.headline)
            Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .fixedSize()
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || recorder.state != .idle
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
            recorder.discard()
            close()
        case .failed(let reason):
            failure = reason
        }
    }
}
