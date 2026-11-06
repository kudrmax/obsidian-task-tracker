import Foundation

/// The plugin's Refresh now: `taskcalendar://refresh?vault=<name>` asks the app to write the phone's calendars and go
/// back to that vault in Obsidian.
public enum RefreshLink {
    public static let scheme = "taskcalendar"

    /// Where to go back to after the refresh; `nil` for any other link.
    public static func back(from url: URL) -> URL? {
        guard url.scheme == scheme, url.host == "refresh",
              let vault = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "vault" })?.value
        else { return nil }
        var back = URLComponents(string: "obsidian://open")!
        back.queryItems = [URLQueryItem(name: "vault", value: vault)]
        return back.url
    }
}
