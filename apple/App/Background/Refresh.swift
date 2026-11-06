import BackgroundTasks

/// The fallback wake-up: iOS runs it now and then, at most every 15 minutes, when it sees fit.
enum Refresh {
    static let identifier = "com.kudrmax.taskcalendar.refresh"
    private static let interval: TimeInterval = 15 * 60

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: interval)
        try? BGTaskScheduler.shared.submit(request)
    }
}
