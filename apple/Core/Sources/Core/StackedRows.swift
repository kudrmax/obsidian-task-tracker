/// The heights of the lists the Rows view stacks one under another (Inbox, Backlog, Soon, the day), as the plugin's rows:
/// each list as tall as its title and rows while they all fit; when they don't, a list shorter than an even share keeps
/// its own height and the others share the rest evenly, each scrolling within it. No list is ever shorter than `least`
/// (its title and one card), so a long list never hides the ones under it.
public enum StackedRows {
    public static func heights(wanted: [Double], room: Double, least: Double) -> [Double] {
        guard !wanted.isEmpty else { return [] }
        let asked = wanted.map { max($0, least) }
        if asked.reduce(0, +) <= room { return asked }
        var heights = asked
        var left = max(room, least * Double(asked.count))
        var open = Array(asked.indices).sorted { asked[$0] < asked[$1] }
        while let first = open.first {
            let share = left / Double(open.count)
            guard asked[first] <= share else {
                for index in open { heights[index] = share }
                return heights
            }
            heights[first] = asked[first]
            left -= asked[first]
            open.removeFirst()
        }
        return heights
    }
}
