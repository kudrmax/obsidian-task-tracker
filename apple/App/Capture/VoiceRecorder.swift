import AVFoundation
import Foundation

/// One recording at a time, as AAC in an `m4a` file: started, paused and resumed, then taken or thrown away.
@MainActor
@Observable
final class VoiceRecorder {
    enum State: Equatable {
        case idle, recording, paused, finished
    }

    private(set) var state = State.idle
    private(set) var elapsed: TimeInterval = 0
    private(set) var problem: String?

    private var recorder: AVAudioRecorder?
    private var ticker: Timer?
    private let file = FileManager.default.temporaryDirectory.appendingPathComponent("capture.m4a")

    func start() async {
        problem = nil
        guard await AVAudioApplication.requestRecordPermission() else {
            problem = "Allow the microphone in Settings to record"
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true)
            try? FileManager.default.removeItem(at: file)
            let recorder = try AVAudioRecorder(url: file, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ])
            guard recorder.record() else { throw CocoaError(.fileWriteUnknown) }
            self.recorder = recorder
            state = .recording
            tick()
        } catch {
            problem = "Couldn't record: \(error.localizedDescription)"
        }
    }

    func pause() {
        recorder?.pause()
        state = .paused
        ticker?.invalidate()
    }

    func resume() {
        guard recorder?.record() == true else { return }
        state = .recording
        tick()
    }

    /// Ends the recording and keeps it to send.
    func finish() {
        guard let recorder else { return }
        elapsed = recorder.currentTime
        recorder.stop()
        ticker?.invalidate()
        state = .finished
        deactivate()
    }

    /// The recording's bytes once it is finished; a recording still going is finished first.
    func take() -> Data? {
        if state == .recording || state == .paused { finish() }
        guard state == .finished else { return nil }
        return try? Data(contentsOf: file)
    }

    func discard() {
        recorder?.stop()
        recorder = nil
        ticker?.invalidate()
        try? FileManager.default.removeItem(at: file)
        state = .idle
        elapsed = 0
        deactivate()
    }

    private func tick() {
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let recorder = self.recorder else { return }
                self.elapsed = recorder.currentTime
            }
        }
    }

    private func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
