import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export async function POST(req: NextRequest) {
  try {
    const { markdown, title } = await req.json();
    if (!markdown) return Response.json({ error: "No content provided" }, { status: 400 });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Title
    if (title) {
      doc.fontSize(18).font("Helvetica-Bold").text(title);
      doc.moveDown(0.3);
      doc.strokeColor("#cccccc").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown(0.5);
      doc.strokeColor("#000000");
    }

    // Date
    doc.fontSize(9).font("Helvetica").fillColor("#666666")
      .text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    doc.fillColor("#000000").moveDown(0.5);

    const lines = markdown.split("\n");
    let inTable = false;
    let tableRows: string[][] = [];

    function flushTable() {
      if (tableRows.length === 0) return;
      const pageWidth = doc.page.width - 100;
      const cols = tableRows[0].length;
      const colWidth = pageWidth / cols;

      tableRows.forEach((row, rowIdx) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const rowY = doc.y;
        const isHeader = rowIdx === 0;

        if (isHeader) {
          doc.rect(50, rowY - 2, pageWidth, 14).fill("#1f2937");
        } else if (rowIdx % 2 === 0) {
          doc.rect(50, rowY - 2, pageWidth, 14).fill("#f9fafb");
        }

        row.forEach((cell, colIdx) => {
          const x = 50 + colIdx * colWidth;
          doc.fontSize(7.5)
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .fillColor(isHeader ? "#ffffff" : "#111827")
            .text(stripInlineMarkdown(cell.trim()), x + 3, rowY, {
              width: colWidth - 6,
              lineBreak: false,
              ellipsis: true,
            });
        });

        doc.fillColor("#000000").moveDown(0.05);
        doc.y = rowY + 13;
      });

      doc.moveDown(0.5);
      tableRows = [];
      inTable = false;
    }

    for (const line of lines) {
      if (doc.y > doc.page.height - 60) doc.addPage();

      // Table row detection
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").slice(1, -1);
        // Skip separator rows (---|---|---)
        if (cells.every(c => /^[-: ]+$/.test(c))) continue;
        inTable = true;
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        flushTable();
      }

      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h3 = line.match(/^###\s+(.+)/);

      if (h1) {
        doc.moveDown(0.4);
        doc.fontSize(15).font("Helvetica-Bold").fillColor("#111827").text(h1[1]);
        doc.moveDown(0.2);
        doc.strokeColor("#d1d5db").lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown(0.3);
        doc.strokeColor("#000000").fillColor("#000000");
        continue;
      }
      if (h2) {
        doc.moveDown(0.4);
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#1f2937").text(h2[1]);
        doc.moveDown(0.2);
        doc.fillColor("#000000");
        continue;
      }
      if (h3) {
        doc.moveDown(0.3);
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#374151").text(h3[1]);
        doc.moveDown(0.1);
        doc.fillColor("#000000");
        continue;
      }

      const bullet = line.match(/^[\s]*[-*]\s+(.+)/);
      if (bullet) {
        doc.fontSize(10).font("Helvetica").fillColor("#111827")
          .text(`\u2022  ${stripInlineMarkdown(bullet[1])}`, { indent: 12 });
        continue;
      }

      const numbered = line.match(/^[\s]*(\d+)\.\s+(.+)/);
      if (numbered) {
        doc.fontSize(10).font("Helvetica").fillColor("#111827")
          .text(`${numbered[1]}.  ${stripInlineMarkdown(numbered[2])}`, { indent: 12 });
        continue;
      }

      // Blockquote
      const blockquote = line.match(/^>\s+(.+)/);
      if (blockquote) {
        const bqY = doc.y;
        doc.rect(50, bqY - 1, 3, 13).fill("#6b7280");
        doc.fontSize(9).font("Helvetica").fillColor("#4b5563")
          .text(stripInlineMarkdown(blockquote[1]), 58, bqY, { width: doc.page.width - 110 });
        doc.fillColor("#000000");
        doc.moveDown(0.1);
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        doc.moveDown(0.3);
        doc.strokeColor("#d1d5db").lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown(0.3);
        doc.strokeColor("#000000");
        continue;
      }

      if (line.trim() === "") {
        doc.moveDown(0.25);
        continue;
      }

      doc.fontSize(10).font("Helvetica").fillColor("#111827").text(stripInlineMarkdown(line));
    }

    if (inTable) flushTable();

    doc.end();
    const pdfBuffer = await pdfReady;

    const filename = (title || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf";
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
