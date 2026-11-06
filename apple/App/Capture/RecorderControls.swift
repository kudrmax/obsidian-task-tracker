import SwiftUI

/// The recording's buttons and labels, the same above the tab bar and above the keyboard.
@MainActor
struct RecorderControls {
    let recorder: VoiceRecorder

    var discard: some View {
        Button("Discard", systemImage: "trash", role: .destructive) { recorder.discard() }
            .foregroundStyle(.red)
    }

    @ViewBuilder
    var pauseOrResume: some View {
        if recorder.state == .recording {
            Button("Pause", systemImage: "pause.fill") { recorder.pause() }
        } else {
            Button("Resume", systemImage: "mic.fill") { recorder.resume() }
        }
    }

    var stop: some View {
        Button("Stop", systemImage: "stop.fill") { recorder.finish() }
    }

    var elapsed: some View {
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

    var voiceNote: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                    .foregroundStyle(.red)
                Text("Voice note")
            }
            .font(.headline)
            Text(Duration.seconds(recorder.elapsed), format: .time(pattern: .minuteSecond))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .fixedSize()
    }
}

/// The recording's controls in the system bar above the tab bar, on both tabs as Music keeps its player: the tab bar
/// keeps one width. Recording from Settings goes to New Task, where the recording is added.
struct RecorderAccessory: View {
    let recorder: VoiceRecorder

    var body: some View {
        let controls = RecorderControls(recorder: recorder)
        HStack(spacing: 20) {
            switch recorder.state {
            case .idle:
                Button {
                    CaptureRouter.shared.open()
                    Task { await recorder.start() }
                } label: {
                    Label("Record", systemImage: "mic.fill")
                        .labelStyle(.titleAndIcon)
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
            case .recording, .paused:
                controls.discard
                Spacer()
                controls.elapsed
                Spacer()
                controls.pauseOrResume
                controls.stop
            case .finished:
                controls.discard
                Spacer()
                controls.voiceNote
                Spacer()
            }
        }
        .labelStyle(.iconOnly)
        .font(.headline)
        .tint(.primary)
        .padding(.horizontal)
    }
}

/// The recording's controls riding on the keyboard while typing: system glass buttons, as iOS's own bars over the
/// keyboard, with the room above it that Reminders leaves.
struct KeyboardRecorderBar: View {
    let recorder: VoiceRecorder

    var body: some View {
        let controls = RecorderControls(recorder: recorder)
        GlassEffectContainer {
            HStack {
                switch recorder.state {
                case .idle:
                    Spacer()
                    Button("Record", systemImage: "mic.fill") { Task { await recorder.start() } }
                        .foregroundStyle(.red)
                    Spacer()
                case .recording, .paused:
                    controls.discard
                    Spacer()
                    controls.elapsed
                    Spacer()
                    HStack(spacing: 0) {
                        controls.pauseOrResume
                        controls.stop
                    }
                case .finished:
                    controls.discard
                    Spacer()
                    controls.voiceNote
                    Spacer()
                }
            }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .controlSize(.large)
        .tint(.primary)
    }
}
