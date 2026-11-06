import Core

/// A list the new task screen offers: one the plugin writes a new task into, Inbox first.
struct CaptureListOption: Hashable {
    /// Where Siri's task and the screen's first choice go.
    static let inbox = CaptureList("inbox")
    private static let order = ["inbox", "now", "soon", "backlog"]

    let list: CaptureList

    /// The plugin's lists in the order the screen shows them.
    static func options(_ lists: [CaptureList]) -> [CaptureListOption] {
        lists.map(CaptureListOption.init).sorted { $0.rank < $1.rank }
    }

    var title: String {
        list.name.prefix(1).uppercased() + list.name.dropFirst()
    }

    private var rank: Int {
        Self.order.firstIndex(of: list.name) ?? Self.order.count
    }
}
