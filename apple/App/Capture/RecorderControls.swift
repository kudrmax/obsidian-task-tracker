import SwiftUI

/// The recording's buttons and labels.
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

/// The recording's controls at the bottom of New Task, above the tab bar or riding on the keyboard: system glass
/// buttons with the room above the keyboard that Reminders leaves.
struct RecorderBar: View {
    let recorder: VoiceRecorder

    var body: some View {
        let controls = RecorderControls(recorder: recorder)
        GlassEffectContainer {
            HStack {
                switch recorder.state {
                case .idle:
                    Spacer()
                    Button("Record", systemImage: "mic.fill") { Task { await recorder.start() } }
                        .buttonStyle(.glassProminent)
                        .tint(.red)
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
                    // As wide as the trash on the left, so the voice note stands in the middle.
                    controls.discard.hidden()
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
