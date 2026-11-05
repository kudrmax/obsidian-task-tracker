import Core
import EventKit

/// The meetings in the phone's calendars: those with a time, not cancelled and not declined.
final class PhoneCalendar: CalendarEvents {
    static var allowed: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    static func requestAccess() async {
        _ = try? await EKEventStore().requestFullAccessToEvents()
    }

    func events(from: Date, to: Date) async -> [Core.CalendarEvent] {
        guard Self.allowed else { return [] }
        let store = EKEventStore()
        return store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil))
            .filter { !$0.isAllDay && $0.status != .canceled && !Self.declined($0) }
            .map { Core.CalendarEvent(title: $0.title ?? "", start: $0.startDate, end: $0.endDate) }
    }

    private static func declined(_ event: EKEvent) -> Bool {
        event.attendees?.first(where: \.isCurrentUser)?.participantStatus == .declined
    }
}
