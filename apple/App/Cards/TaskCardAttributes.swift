import ActivityKit
import Foundation

/// A task's card on the lock screen: everything it shows and its buttons need is fixed when it is asked for.
struct TaskCardAttributes: ActivityAttributes {
    /// `confirming`: Done was pressed, and the card asks before it closes the task.
    struct ContentState: Codable, Hashable {
        var confirming = false
    }

    /// The meeting to wait out, as the notification offers it: its name, how long until it is over, and when.
    struct Meeting: Codable, Hashable {
        let name: String
        let left: String
        let until: Date
    }

    let reminderID: String
    let title: String
    /// The slot as the notification says it: `10:00` or `10:00–11:00`.
    let time: String
    /// The slot's date, `YYYY-MM-DD`: a tap opens the calendar on it.
    let date: String
    let start: Date
    let meeting: Meeting?
}
