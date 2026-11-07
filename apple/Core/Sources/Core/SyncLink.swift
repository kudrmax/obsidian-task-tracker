import Foundation

/// The round trip of the Sync button: the app asks Obsidian to sync the vault with
/// `obsidian://task-calendar-sync?vault=<name>`, and the plugin hands the phone back with `taskcalendar://synced`, or
/// `taskcalendar://synced?error=<reason>` when Sync could not finish.
public enum SyncLink {
    public enum Outcome: Equatable, Sendable {
        case synced
        /// The plugin's reason, an English sentence shown as is; empty when the link named none.
        case notSynced(reason: String)
    }

    /// The link that opens Obsidian on `vault` and asks it to sync.
    public static func request(vault: String) -> URL? {
        var link = URLComponents()
        link.scheme = "obsidian"
        link.host = "task-calendar-sync"
        link.percentEncodedQueryItems = [URLQueryItem(name: "vault", value: encoded(vault))]
        return link.url
    }

    /// What the plugin said when it handed the phone back; `nil` for any other link.
    public static func outcome(from url: URL) -> Outcome? {
        guard url.scheme == RefreshLink.scheme, url.host == "synced",
              let link = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }
        guard let error = link.percentEncodedQueryItems?.first(where: { $0.name == "error" }) else { return .synced }
        return .notSynced(reason: decoded(error.value ?? ""))
    }

    private static let valueCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))

    private static func encoded(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: valueCharacters) ?? value
    }

    /// Both ways a page encodes a space, `%20` (`encodeURIComponent`) and `+` (`URLSearchParams`), read as a space.
    private static func decoded(_ value: String) -> String {
        let spaced = value.replacingOccurrences(of: "+", with: " ")
        return (spaced.removingPercentEncoding ?? spaced).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
