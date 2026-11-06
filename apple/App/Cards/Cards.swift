import ActivityKit
import Core
import Foundation

/// The reminders' cards as Live Activities: iOS starts one at its task's time, the app need not be running.
final class Cards: CardScheduling {
    /// A card swiped away or ended by iOS is not counted: the next sync shows it again while the task is open.
    func shown() async -> [String: Date] {
        var result: [String: Date] = [:]
        for card in Activity<TaskCardAttributes>.activities where [.pending, .active, .stale].contains(card.activityState) {
            result[card.attributes.reminderID] = card.attributes.start
        }
        return result
    }

    func lingering() async -> [String] {
        Activity<TaskCardAttributes>.activities.filter { [.ended, .dismissed].contains($0.activityState) }.map(\.attributes.reminderID)
    }

    func show(_ reminder: Reminder, meeting: AfterEvent?) async throws {
        let offer = meeting.map { TaskCardAttributes.Meeting(name: $0.meeting, left: $0.left, until: $0.until) }
        let attributes = TaskCardAttributes(reminderID: reminder.id, title: reminder.title, time: reminder.body, date: reminder.date, start: reminder.start, meeting: offer)
        let content = ActivityContent(state: TaskCardAttributes.ContentState(), staleDate: reminder.dayEnd)
        guard reminder.start > Date() else {
            _ = try Activity.request(attributes: attributes, content: content)
            return
        }
        let alert = AlertConfiguration(title: LocalizedStringResource(stringLiteral: reminder.title), body: LocalizedStringResource(stringLiteral: reminder.body), sound: .named("silence.caf"))
        _ = try Activity.request(attributes: attributes, content: content, style: .standard, alertConfiguration: alert, start: reminder.start)
    }

    /// Done asks first: the card turns into the question, or back from it.
    static func confirm(_ reminderID: String, asking: Bool) async {
        for card in Activity<TaskCardAttributes>.activities where card.attributes.reminderID == reminderID {
            await card.update(ActivityContent(state: TaskCardAttributes.ContentState(confirming: asking), staleDate: card.content.staleDate))
        }
    }

    func remove(_ reminderIDs: [String]) async {
        for card in Activity<TaskCardAttributes>.activities where reminderIDs.contains(card.attributes.reminderID) {
            await card.end(nil, dismissalPolicy: .immediate)
        }
    }
}
