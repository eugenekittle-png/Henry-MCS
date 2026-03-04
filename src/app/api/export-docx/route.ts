import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";

interface ClientMatterInfo {
  clientName: string;
  clientNumber: string;
  matterDescription: string;
  matterNumber: string;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  value: string;
}

interface DiffData {
  lines: DiffLine[];
  file1Name: string;
  file2Name: string;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

function checkPage(doc: PDFKit.PDFDocument, needed = 60) {
  if (doc.y > doc.page.height - needed) {
    doc.addPage();
  }
}

function renderClientMatterHeader(doc: PDFKit.PDFDocument, cm: ClientMatterInfo) {
  doc.fontSize(11);
  doc.font("Helvetica-Bold").text("Client: ", { continued: true });
  doc.font("Helvetica").text(`${cm.clientName} (${cm.clientNumber})`);
  doc.font("Helvetica-Bold").text("Matter: ", { continued: true });
  doc.font("Helvetica").text(`${cm.matterDescription} (${cm.matterNumber})`);
  doc.font("Helvetica-Bold").text("Date: ", { continued: true });
  doc.font("Helvetica").text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  );
  doc.moveDown(0.5);
  doc
    .strokeColor("#999999")
    .lineWidth(0.5)
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

function renderDiff(doc: PDFKit.PDFDocument, diffData: DiffData) {
  doc.fontSize(16).font("Helvetica-Bold").text("Line-by-Line Comparison");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").text(
    `Comparing: ${diffData.file1Name} vs ${diffData.file2Name}`
  );
  doc.moveDown(0.3);

  // Legend
  const legendY = doc.y;
  doc.fontSize(8);
  doc.rect(doc.x, legendY, 8, 8).fill("#DBEAFE").stroke("#93C5FD");
  doc.fillColor("#1E40AF").text(` Added in ${diffData.file2Name}`, doc.x + 12, legendY, { continued: false });
  const legendY2 = doc.y + 2;
  doc.rect(50, legendY2, 8, 8).fill("#FEE2E2").stroke("#FCA5A5");
  doc.fillColor("#991B1B").text(` Removed from ${diffData.file1Name}`, 62, legendY2, { continued: false });
  doc.moveDown(0.5);
  doc.fillColor("#000000");

  // Diff lines
  doc.font("Courier").fontSize(8);
  const pageWidth = doc.page.width - 100;

  for (const line of diffData.lines) {
    checkPage(doc);
    const lineY = doc.y;
    const text = line.value || " ";

    if (line.type === "added") {
      doc.rect(50, lineY - 1, pageWidth, 12).fill("#EFF6FF");
      doc.rect(50, lineY - 1, 3, 12).fill("#3B82F6");
      doc.fillColor("#1D4ED8").text(`+ ${text}`, 56, lineY, { width: pageWidth - 10 });
      doc.fillColor("#000000");
    } else if (line.type === "removed") {
      doc.rect(50, lineY - 1, pageWidth, 12).fill("#FEF2F2");
      doc.rect(50, lineY - 1, 3, 12).fill("#EF4444");
      doc.fillColor("#DC2626");
      doc.text(`- ${text}`, 56, lineY, { width: pageWidth - 10 });
      const textWidth = doc.widthOfString(`- ${text}`);
      const strikeWidth = Math.min(textWidth, pageWidth - 10);
      doc
        .strokeColor("#DC2626")
        .lineWidth(0.5)
        .moveTo(56, lineY + 5)
        .lineTo(56 + strikeWidth, lineY + 5)
        .stroke();
      doc.fillColor("#000000").strokeColor("#000000");
    } else {
      doc.fillColor("#374151").text(`  ${text}`, 56, lineY, { width: pageWidth - 10 });
      doc.fillColor("#000000");
    }
  }

  // Reset x cursor to left margin so subsequent content isn't misaligned
  doc.x = 50;
}

function renderTable(doc: PDFKit.PDFDocument, tableLines: string[]) {
  const rows = tableLines
    .filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

  if (rows.length === 0) return;

  const margin = 50;
  const tableWidth = doc.page.width - margin * 2;
  const colCount = rows[0].length;
  const colWidth = tableWidth / colCount;
  const cellPadding = 4;
  const fontSize = 9;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const cells = rows[rowIdx];
    const isHeader = rowIdx === 0;

    // Measure row height
    doc.fontSize(fontSize).font(isHeader ? "Helvetica-Bold" : "Helvetica");
    let maxHeight = 0;
    for (let c = 0; c < cells.length; c++) {
      const cellText = stripMarkdown(cells[c]);
      const h = doc.heightOfString(cellText, { width: colWidth - cellPadding * 2 });
      if (h > maxHeight) maxHeight = h;
    }
    const rowHeight = maxHeight + cellPadding * 2;

    // Check for page break
    if (doc.y + rowHeight > doc.page.height - 50) {
      doc.addPage();
    }

    const rowY = doc.y;

    // Header background
    if (isHeader) {
      doc.rect(margin, rowY, tableWidth, rowHeight).fill("#F3F4F6");
      doc.fillColor("#000000");
    }

    // Draw cell borders and text
    for (let c = 0; c < cells.length; c++) {
      const cellX = margin + c * colWidth;
      const cellText = stripMarkdown(cells[c]);

      // Cell border
      doc
        .strokeColor("#D1D5DB")
        .lineWidth(0.5)
        .rect(cellX, rowY, colWidth, rowHeight)
        .stroke();

      // Cell text
      doc
        .fontSize(fontSize)
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .fillColor("#111827")
        .text(cellText, cellX + cellPadding, rowY + cellPadding, {
          width: colWidth - cellPadding * 2,
        });
    }

    // Move cursor below the row
    doc.y = rowY + rowHeight;
  }

  // Reset x cursor to left margin so subsequent content isn't stuck in the last column
  doc.x = margin;
  doc.moveDown(0.5);
  doc.fillColor("#000000").strokeColor("#000000");
}

function renderMarkdown(doc: PDFKit.PDFDocument, md: string) {
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (
      i + 1 < lines.length &&
      /^\|(.+\|)+$/.test(line.trim()) &&
      /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      renderTable(doc, tableLines);
      continue;
    }

    checkPage(doc);

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h3) {
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica-Bold").text(stripMarkdown(h3[1]));
      doc.moveDown(0.1);
      i++;
      continue;
    }
    if (h2) {
      doc.moveDown(0.3);
      doc.fontSize(12).font("Helvetica-Bold").text(stripMarkdown(h2[1]));
      doc.moveDown(0.2);
      i++;
      continue;
    }
    if (h1) {
      doc.moveDown(0.3);
      doc.fontSize(14).font("Helvetica-Bold").text(stripMarkdown(h1[1]));
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Bullet points
    const bullet = line.match(/^[\s]*[-*]\s+(.+)/);
    if (bullet) {
      doc.fontSize(10).font("Helvetica").text(`  \u2022  ${stripMarkdown(bullet[1])}`);
      i++;
      continue;
    }

    // Numbered list
    const numbered = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (numbered) {
      doc.fontSize(10).font("Helvetica").text(`  ${numbered[1]}.  ${stripMarkdown(numbered[2])}`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      doc.moveDown(0.3);
      doc
        .strokeColor("#999999")
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .stroke();
      doc.moveDown(0.3);
      doc.strokeColor("#000000");
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      doc.moveDown(0.3);
      i++;
      continue;
    }

    // Regular text
    doc.fontSize(10).font("Helvetica").text(stripMarkdown(line));
    i++;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { markdown, clientMatter, diff } = await req.json();

    if (!markdown && !diff) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Client/matter header
    if (clientMatter) {
      renderClientMatterHeader(doc, clientMatter as ClientMatterInfo);
    }

    // Diff section
    if (diff) {
      renderDiff(doc, diff as DiffData);
    }

    // Summary separator when both diff and markdown present
    if (diff && markdown) {
      doc.addPage();
      doc
        .strokeColor("#999999")
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .stroke();
      doc.moveDown(0.5);
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text("Summary");
      doc.moveDown(0.5);
    }

    // Markdown content
    if (markdown) {
      renderMarkdown(doc, markdown);
    }

    doc.end();
    const pdfBuffer = await pdfReady;
    const filename = diff ? "comparison.pdf" : "analysis.pdf";

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
