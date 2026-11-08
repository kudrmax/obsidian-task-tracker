import QuartzCore
import UIKit

/// The day's slide as the plugin's pager runs it once let go (`ScreenPager`): from a share of the way to the end or back,
/// fast at first and slowing to a stop (cubic ease-out), over the plugin's `--tc-duration-slide` for the whole way and
/// that share of it for part of the way. One frame of the screen per step.
@MainActor
final class DaySlide {
    static let duration: CFTimeInterval = 0.3

    private var link: CADisplayLink?
    private var step: ((CGFloat) -> Void)?
    private var finish: CheckedContinuation<Bool, Never>?
    private var from: CGFloat = 0
    private var to: CGFloat = 0
    private var length: CFTimeInterval = 0
    private var start: CFTimeInterval?

    /// Runs the share from `from` to `to`; true once it got there, false when stopped before.
    func run(from: CGFloat, to: CGFloat, step: @escaping (CGFloat) -> Void) async -> Bool {
        stop()
        self.from = from
        self.to = to
        self.step = step
        length = Self.duration * Double(min(1, abs(to - from)))
        start = nil
        step(from)
        guard length > 0 else {
            step(to)
            return true
        }
        return await withCheckedContinuation { finish in
            self.finish = finish
            let link = CADisplayLink(target: Ticker(self), selector: #selector(Ticker.tick(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
        }
    }

    /// The slide stops where it is.
    func stop() {
        end(arrived: false)
    }

    fileprivate func tick(_ link: CADisplayLink) {
        let now = link.targetTimestamp
        start = start ?? link.timestamp
        let t = min(1, (now - (start ?? now)) / length)
        let eased = 1 - pow(1 - t, 3)
        step?(from + (to - from) * eased)
        if t >= 1 { end(arrived: true) }
    }

    private func end(arrived: Bool) {
        link?.invalidate()
        link = nil
        step = nil
        let finish = finish
        self.finish = nil
        finish?.resume(returning: arrived)
    }

    /// The display link holds its target strongly: a small one that holds the slide weakly.
    private final class Ticker: NSObject {
        weak var slide: DaySlide?
        init(_ slide: DaySlide) { self.slide = slide }
        @MainActor @objc func tick(_ link: CADisplayLink) { slide?.tick(link) }
    }
}
