import Core
import SwiftUI

/// A title or a line in pieces as a card writes it: the text as typed, each link by its word in the accent.
struct TitleText: View {
    let parts: [TextPart]
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        parts.reduce(Text(verbatim: "")) { text, part in
            text + (part.isLink ? Text(verbatim: part.shown).foregroundColor(Palette.accent(scheme)) : Text(verbatim: part.shown))
        }
    }
}

/// A task's description as it reads, as the plugin's full screen shows it in Obsidian's editor: headings, list items with
/// their bullets and depth, quotes, bold and italic, each link by its word in the accent and opening at a tap (the core's
/// `rules.textParts`); embedded images are left out. A tap anywhere else puts the caret in it. An empty description (the
/// template's lone list mark) shows the word Description, muted.
struct DescriptionText: View {
    let markdown: String
    let open: (TextPart) -> Void
    let edit: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var linkTapped = false

    var body: some View {
        let lines = Self.lines(markdown, parts: parts)
        let links = lines.flatMap(\.parts).filter(\.isLink)
        Group {
            if lines.isEmpty {
                Text("Description").foregroundStyle(Palette.muted)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in row(line, links: links) }
                }
            }
        }
        .font(.body)
        .tint(Palette.accent(scheme))
        .contentShape(.rect)
        .environment(\.openURL, OpenURLAction { url in
            linkTapped = true
            if let index = Int(url.host() ?? ""), links.indices.contains(index) { open(links[index]) }
            return .handled
        })
        .simultaneousGesture(TapGesture().onEnded {
            // A link's own tap opens it; any other tap types.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                if !linkTapped { edit() }
                linkTapped = false
            }
        })
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Edits the description")
    }

    private func parts(_ text: String) -> [TextPart] {
        (try? AppServices.shared.board.titleParts(text)) ?? [TextPart(text: text)]
    }

    private func row(_ line: Line, links: [TextPart]) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            if let mark = line.mark {
                Text(verbatim: mark).foregroundStyle(Palette.muted).monospacedDigit()
            }
            Text(attributed(line, links: links))
                .font(line.heading > 0 ? .system(size: Self.headingSize(line.heading), weight: .bold) : .body)
                .foregroundStyle(line.quote ? Palette.muted : Color.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, CGFloat(line.depth) * Self.indent)
        .padding(.leading, line.quote ? 10 : 0)
        .overlay(alignment: .leading) {
            if line.quote { Rectangle().fill(Palette.accent(scheme)).frame(width: 2).padding(.leading, CGFloat(line.depth) * Self.indent) }
        }
        .padding(.top, line.heading > 0 ? 6 : 0)
    }

    /// The line's text: markdown's inline marks read as they draw, each link a link to its place among the links.
    private func attributed(_ line: Line, links: [TextPart]) -> AttributedString {
        var text = AttributedString()
        for part in line.parts {
            if part.isLink, let index = links.firstIndex(where: { $0 == part }) {
                var piece = AttributedString(part.shown)
                piece.link = URL(string: "tc-link://\(index)")
                piece.foregroundColor = Palette.accent(scheme)
                text += piece
            } else {
                let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
                text += (try? AttributedString(markdown: part.text ?? "", options: options)) ?? AttributedString(part.text ?? "")
            }
        }
        return text
    }

    private static let indent: CGFloat = 18

    private static func headingSize(_ level: Int) -> CGFloat {
        switch level {
        case 1: 24
        case 2: 21
        case 3: 19
        default: 17
        }
    }

    /// A line of the description as drawn: its depth, its bullet or number, a heading's level, a quote.
    struct Line {
        let depth: Int
        let mark: String?
        let heading: Int
        let quote: Bool
        let parts: [TextPart]
    }

    private static let embed = try! Regex(#"!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)"#)
    private static let ordered = try! Regex(#"^(\d+)[.)]\s+"#)

    /// The description's lines as they read; a line with nothing to read (an empty list item, an image alone) is left out.
    static func lines(_ markdown: String, parts: (String) -> [TextPart]) -> [Line] {
        markdown.split(separator: "\n", omittingEmptySubsequences: true).compactMap { raw in
            var rest = Substring(raw)
            var depth = 0
            var spaces = 0
            while let first = rest.first, first == "\t" || first == " " {
                if first == "\t" { depth += 1; spaces = 0 } else { spaces += 1; if spaces == 2 { depth += 1; spaces = 0 } }
                rest = rest.dropFirst()
            }
            var mark: String?
            var heading = 0
            var quote = false
            if rest.hasPrefix(">") {
                quote = true
                rest = rest.dropFirst().drop { $0 == " " }
            }
            if let hashes = rest.firstIndex(where: { $0 != "#" }), (1...6).contains(rest.distance(from: rest.startIndex, to: hashes)), rest[hashes] == " " {
                heading = rest.distance(from: rest.startIndex, to: hashes)
                rest = rest[hashes...].dropFirst()
            } else if rest == "-" || rest == "*" || rest == "+" || rest.hasPrefix("- ") || rest.hasPrefix("* ") || rest.hasPrefix("+ ") {
                mark = "•"
                rest = rest.dropFirst().drop { $0 == " " }
            } else if let number = rest.firstMatch(of: ordered) {
                mark = String(rest[number.range].trimmingCharacters(in: .whitespaces))
                rest = rest[number.range.upperBound...]
            }
            let text = String(rest).replacing(embed, with: "").trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return nil }
            return Line(depth: depth, mark: mark, heading: heading, quote: quote, parts: parts(text))
        }
    }
}
