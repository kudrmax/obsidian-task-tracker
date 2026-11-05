import ActivityKit
import Foundation

/// A task's card on the lock screen: everything it shows and its buttons need is fixed when it is asked for.
struct TaskCardAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {}

    let reminderID: String
    let title: String
    /// The slot as the notification says it: `10:00` or `10:00–11:00`.
    let time: String
    /// The slot's date, `YYYY-MM-DD`: a tap opens the calendar on it.
    let date: String
    let start: Date
}
