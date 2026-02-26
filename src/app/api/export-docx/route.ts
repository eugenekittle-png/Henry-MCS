import { NextRequest } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle,
} from "docx";

interface ClientMatterInfo {
  clientName: string;
  clientNumber: string;
  matterDescription: string;
  matterNumber: string;
}

function buildClientMatterHeader(cm: ClientMatterInfo): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: "Client: ", bold: true, size: 22 }),
        new TextRun({ text: `${cm.clientName} (${cm.clientNumber})`, size: 22 }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Matter: ", bold: true, size: 22 }),
        new TextRun({ text: `${cm.matterDescription} (${cm.matterNumber})`, size: 22 }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true, size: 22 }),
        new TextRun({ text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), size: 22 }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
      },
      children: [],
    }),
    new Paragraph({ children: [] }),
  ];
}

export async function POST(req: NextRequest) {
  try {
    const { markdown, clientMatter } = await req.json();
    if (!markdown || typeof markdown !== "string") {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }

    const header = clientMatter ? buildClientMatterHeader(clientMatter as ClientMatterInfo) : [];
    const body = markdownToDocxElements(markdown);

    const doc = new Document({
      sections: [{ children: [...header, ...body] }],
    });

    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="analysis.docx"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

function markdownToDocxElements(md: string): (Paragraph | Table)[] {
  const lines = md.split("\n");
  const elements: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (i + 1 < lines.length && /^\|(.+\|)+$/.test(line.trim()) && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseTable(tableLines);
      if (table) elements.push(table);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingLevel =
        level === 1 ? HeadingLevel.HEADING_1 :
        level === 2 ? HeadingLevel.HEADING_2 :
        HeadingLevel.HEADING_3;
      elements.push(
        new Paragraph({
          heading: headingLevel,
          children: parseInlineFormatting(headingMatch[2]),
        })
      );
      i++;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (ulMatch) {
      elements.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineFormatting(ulMatch[1]),
        })
      );
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (olMatch) {
      elements.push(
        new Paragraph({
          numbering: { reference: "default-numbering", level: 0 },
          children: parseInlineFormatting(olMatch[1]),
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
          },
          children: [],
        })
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(new Paragraph({ children: [] }));
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      new Paragraph({
        children: parseInlineFormatting(line),
      })
    );
    i++;
  }

  return elements;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Match bold+italic, bold, italic, inline code, or plain text
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // bold + italic
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      // bold
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      // italic
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[5]) {
      // inline code
      runs.push(new TextRun({ text: match[5], font: "Courier New", size: 20 }));
    } else if (match[6]) {
      runs.push(new TextRun({ text: match[6] }));
    }
  }

  return runs.length ? runs : [new TextRun({ text })];
}

function parseTable(lines: string[]): Table | null {
  const rows = lines
    .filter((l) => !/^\|[\s-:|]+\|$/.test(l.trim())) // skip separator row
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

  if (rows.length === 0) return null;

  const tableRows = rows.map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: parseInlineFormatting(cell).map(
                    (run) =>
                      new TextRun({
                        ...run,
                        bold: rowIndex === 0 ? true : (run as unknown as { bold?: boolean }).bold,
                      } as unknown as ConstructorParameters<typeof TextRun>[0])
                  ),
                }),
              ],
            })
        ),
      })
  );

  return new Table({ rows: tableRows });
}
