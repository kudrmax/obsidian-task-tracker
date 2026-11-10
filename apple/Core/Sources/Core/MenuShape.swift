import Foundation

/// What an open menu shows, row by row, as a value: what decides whether a redraw of the screen under an open menu changes
/// the menu at all, and which page of the new menu stands where the person is.
public indirect enum MenuShape: Hashable, Sendable {
    /// A row: its words and its state (checked, off, red…), as the host writes them.
    case row(String)
    /// A page or a group: its title (empty for the menu itself and for an inline group) and what it holds.
    case page(title: String, detail: String, children: [MenuShape])

    /// A redraw puts the menu up again only when it shows something else: the same rows, written anew, leave the open
    /// menu and the page it is on as they are.
    public static func needsUpdate(shown: MenuShape?, next: MenuShape) -> Bool {
        shown != next
    }

    /// Where, in `menu`, the page titled `title` stands now (indices of children from the menu itself), so the open page
    /// stays the open page when rows above it come or go; the menu itself (`[]`) for an untitled page, nil when the page is
    /// gone.
    public static func path(toPage title: String, in menu: MenuShape) -> [Int]? {
        guard !title.isEmpty else { return [] }
        guard case .page(_, _, let children) = menu else { return nil }
        for (index, child) in children.enumerated() {
            if case .page(let childTitle, _, _) = child, childTitle == title { return [index] }
            if let below = path(toPage: title, in: child) { return [index] + below }
        }
        return nil
    }
}
