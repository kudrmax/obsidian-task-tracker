import Core
import SwiftUI

/// A new task: typed, recorded, or both, into Inbox or Now.
struct CaptureView: View {
    let request: CaptureRequest
    let close: () -> Void

    @State private var list: CaptureListOption
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var failure: String?
    @State private var sending = false
    @FocusState private var typing: Bool

    init(request: CaptureRequest, close: @escaping () -> Void) {
        self.request = request
        self.close = close
        _list = State(initialValue: request.list)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Picker("List", selection: $list) {
                    ForEach(CaptureListOption.allCases, id: \.self) { option in
                        Label(option.title, systemImage: option.symbol).tag(option)
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
                Spacer(minLength: 0)
            }
            .padding()
            .safeAreaInset(edge: .bottom) {
                RecorderBar(recorder: recorder)
                    .padding()
            }
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
                        .buttonStyle(.borderedProminent)
                        .disabled(!canSend || sending)
                }
            }
            .task {
                if request.voice { await recorder.start() } else { typing = true }
            }
        }
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

/// The microphone and, once it is going, the recording's time with pause, resume and stop.
private struct RecorderBar: View {
    let recorder: VoiceRecorder

    var body: some View {
        VStack(spacing: 12) {
            if let problem = recorder.problem {
                Label(problem, systemImage: "mic.slash.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            switch recorder.state {
            case .idle:
                Button { Task { await recorder.start() } } label: {
                    Label("Record", systemImage: "mic.fill")
                        .font(.title2)
                        .labelStyle(.iconOnly)
                        .frame(width: 72, height: 72)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.circle)
                .tint(.red)
                .accessibilityLabel("Record")
            case .recording, .paused:
                running
            case .finished:
                finished
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var running: some View {
        HStack(spacing: 20) {
            Button("Discard", systemImage: "trash", role: .destructive) { recorder.discard() }
                .labelStyle(.iconOnly)
                .font(.title3)
                .frame(width: 52, height: 52)

            VStack(spacing: 4) {
                Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                    .font(.system(.largeTitle, design: .rounded, weight: .semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Label(recorder.state == .recording ? "Recording" : "Paused", systemImage: recorder.state == .recording ? "record.circle" : "pause.circle")
                    .font(.footnote)
                    .foregroundStyle(recorder.state == .recording ? .red : .secondary)
                    .symbolEffect(.pulse, isActive: recorder.state == .recording)
            }
            .frame(maxWidth: .infinity)

            Button(recorder.state == .recording ? "Pause" : "Resume", systemImage: recorder.state == .recording ? "pause.fill" : "mic.fill") {
                if recorder.state == .recording { recorder.pause() } else { recorder.resume() }
            }
            .labelStyle(.iconOnly)
            .font(.title2)
            .frame(width: 64, height: 64)
            .background(.red.opacity(0.15), in: .circle)
            .foregroundStyle(.red)

            Button("Stop", systemImage: "stop.fill") { recorder.finish() }
                .labelStyle(.iconOnly)
                .font(.title3)
                .frame(width: 52, height: 52)
                .background(.quaternary, in: .circle)
        }
        .buttonStyle(.plain)
    }

    private var finished: some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform")
                .font(.title3)
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 2) {
                Text("Voice note")
                    .font(.headline)
                Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Discard", systemImage: "trash", role: .destructive) { recorder.discard() }
                .labelStyle(.iconOnly)
                .font(.title3)
        }
        .padding()
        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 16))
    }
}

extension CaptureListOption {
    var symbol: String {
        switch self {
        case .inbox: "tray"
        case .now: "sun.max"
        case .soon: "calendar"
        case .backlog: "archivebox"
        }
    }
}
