import Core
import QuartzCore
import SwiftUI
import UIKit

/// How the board moves under a carry, every number of it in one place: the lift, the copy's rise, the drop line's step,
/// the day arrow's dwell, the scroll at an edge, and the drop's one spring, which the copy's flight, the rows that open
/// and close, the rows that come in and the calendar's blocks all run on, so they end together.
enum CarryMotion {
    /// How long a card, a calendar block or a section header is pressed before it lifts: the system's drag lift as the
    /// app had it (measured on iOS 26.3: the lift began 0.326 s after the touch). The settings' Long Press Delay stays
    /// the calendar's empty-space press's.
    static let liftDelay: TimeInterval = 0.33

    /// The copy rising off the board as the system lifts a view (a little larger, a soft shadow).
    static let rise: TimeInterval = 0.25
    static let riseScale: CGFloat = 1.04
    /// Over the Projects page's tree the copy rides this far above (a card) or below (a lifted project) the finger.
    static let aboveFinger: CGFloat = 16

    /// The drop line stepping from one place to the next.
    static let lineStep: TimeInterval = 0.12

    /// How long a carry stays over a day arrow before it turns the day: the system's spring loading as the app had it on
    /// the system's drag (measured on iOS 26.3: 1.25 s from the card reaching the arrow).
    static let springLoad: TimeInterval = 1.25

    /// The drop's one spring: no bounce, settled in 0.35 s, so the flight's end (when the card takes over from the copy)
    /// is where every motion of the drop ends, not a settling tail after it.
    static let drop = Spring(settlingDuration: 0.35, dampingRatio: 1)
    /// The drop's spring in time: what a piece of the drop waiting for its end waits.
    static var settles: TimeInterval { drop.settlingDuration }

    /// The drop's spring for SwiftUI's motion (the calendar's blocks, a fold's chevron).
    static var dropAnimation: Animation { .interpolatingSpring(drop) }

    /// The drop's spring for UIKit's motion (the copy's flight, the lists' rows in it).
    @MainActor
    static func animate(_ animations: @escaping @MainActor () -> Void, completion: (@MainActor (Bool) -> Void)? = nil) {
        UIView.animate(springDuration: drop.duration, bounce: 0, initialSpringVelocity: 0, delay: 0, options: [.allowUserInteraction], animations: animations, completion: completion)
    }

    /// The drop's spring for a layer's own animation (a list's row coming in from under the one above).
    static func layerSpring(_ keyPath: String) -> CASpringAnimation {
        let spring = CASpringAnimation(perceptualDuration: drop.duration, bounce: 0)
        spring.keyPath = keyPath
        spring.duration = settles
        return spring
    }

    /// A subtask's branch fading in once its row is at rest.
    static let branchFade: TimeInterval = 0.12

    /// What lights for a target, and a carry's rows folding away and back.
    static let hover = Animation.snappy(duration: 0.15)
    static let carry = Animation.snappy(duration: 0.25)

    /// A copy landing in a folded project part shrinks to this share of its size into the part's header (decision 56).
    static let foldedLanding: CGFloat = 0.3

    /// The scroll of a list or the calendar under a carry held at its edge: the band's depth and the most it scrolls in a
    /// second (9 points a frame at 60 Hz, as before).
    static let edges = EdgeScrollStep(band: 48, speed: 540)
}

/// The carry's haptics, each generator made once and kept ready: one made at the moment of a lift or a drop costs that
/// frame its start.
@MainActor
enum CarryFeel {
    private static let lifted = UIImpactFeedbackGenerator(style: .medium)
    private static let dropped = UIImpactFeedbackGenerator(style: .light)
    private static let ticked = UISelectionFeedbackGenerator()

    static func lift() {
        lifted.impactOccurred()
        dropped.prepare()
    }

    static func drop() { dropped.impactOccurred() }

    /// The place under the carry changed.
    static func tick() {
        ticked.selectionChanged()
        ticked.prepare()
    }
}
