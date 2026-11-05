import Core
import EventKit
import UIKit

/// The phone's calendars for the plugin: every calendar of events, the meetings from a month back to three months ahead,
/// without the cancelled ones and those declined. Nothing without full access.
final class PhoneCalendarExport: CalendarExporting {
    private static let daysBack = 30
    private static let daysAhead = 90

    static var allowed: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    static func requestAccess() async {
        _ = try? await EKEventStore().requestFullAccessToEvents()
    }

    func export(now: Date) async throws -> String? {
        guard Self.allowed else { return nil }
        let store = EKEventStore()
        let today = Calendar.current.startOfDay(for: now)
        let from = Calendar.current.date(byAdding: .day, value: -Self.daysBack, to: today)!
        let to = Calendar.current.date(byAdding: .day, value: Self.daysAhead + 1, to: today)!
        let calendars = store.calendars(for: .event).map {
            ExportedCalendar(title: $0.title, calendarId: $0.calendarIdentifier, account: $0.source.title, color: Self.hex($0.cgColor))
        }
        let events = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil))
            .filter { $0.status != .canceled && !Self.declined($0) }
            .map { event in
                ExportedEvent(
                    id: "\(event.eventIdentifier ?? event.calendarItemIdentifier)@\(event.startDate.timeIntervalSince1970)",
                    title: event.title ?? "", start: event.startDate, end: event.endDate, allDay: event.isAllDay,
                    calendarId: event.calendar.calendarIdentifier)
            }
        let device = await UIDevice.current.name
        let text = CalendarExport.text(calendars: calendars, events: events, from: from, to: to, exportedAt: now, device: device, validUntil: AppSignature.expiration)
        Self.keepCopy(text)
        return text
    }

    /// The last export in the app's own folder too: a cable reads it there (`devicectl device copy from`), the vault it cannot.
    private static func keepCopy(_ text: String) {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        try? text.write(to: caches.appendingPathComponent("iphone.json"), atomically: true, encoding: .utf8)
    }

    private static func declined(_ event: EKEvent) -> Bool {
        event.attendees?.first(where: \.isCurrentUser)?.participantStatus == .declined
    }

    private static func hex(_ color: CGColor?) -> String? {
        guard let rgb = color?.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components, rgb.count >= 3 else { return nil }
        return String(format: "#%02X%02X%02X", Int(rgb[0] * 255), Int(rgb[1] * 255), Int(rgb[2] * 255))
    }
}
