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

/// The microphone and, once it is going, the recording's time with pause, resume and stop: system glass buttons, as
/// the controls floating over an iOS screen are.
private struct RecorderBar: View {
    let recorder: VoiceRecorder

    var body: some View {
        VStack(spacing: 12) {
            if let problem = recorder.problem {
                Label(problem, systemImage: "mic.slash.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            GlassEffectContainer(spacing: 16) {
                switch recorder.state {
                case .idle:
                    GlassCircle(title: "Record", symbol: "mic.fill", main: true) { Task { await recorder.start() } }
                case .recording, .paused:
                    running
                case .finished:
                    finished
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var running: some View {
        HStack(spacing: 16) {
            GlassCircle(title: "Discard", symbol: "trash") { recorder.discard() }

            VStack(spacing: 2) {
                Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                    .font(.title.monospacedDigit().weight(.semibold))
                    .contentTransition(.numericText())
                Text(recorder.state == .recording ? "Recording" : "Paused")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)

            GlassCircle(title: recorder.state == .recording ? "Pause" : "Resume", symbol: recorder.state == .recording ? "pause.fill" : "mic.fill", main: true) {
                if recorder.state == .recording { recorder.pause() } else { recorder.resume() }
            }

            GlassCircle(title: "Stop", symbol: "stop.fill") { recorder.finish() }
        }
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
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            GlassCircle(title: "Discard", symbol: "trash") { recorder.discard() }
        }
        .padding(12)
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
    }
}

/// A round button on system glass: the main one red and larger, the rest plain.
private struct GlassCircle: View {
    let title: String
    let symbol: String
    var main = false
    let action: () -> Void

    var body: some View {
        let button = Button(action: action) {
            Image(systemName: symbol)
                .font(main ? .title : .title3)
                .frame(width: main ? 56 : 40, height: main ? 56 : 40)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonBorderShape(.circle)
        .accessibilityLabel(title)
        if main {
            button.buttonStyle(.glassProminent).tint(.red)
        } else {
            button.buttonStyle(.glass)
        }
    }
}
