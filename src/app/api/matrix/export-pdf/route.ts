import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { getSessionFromRequest } from "@/lib/auth";

interface ExtractionRow {
  filename: string;
  isConsensus: boolean;
  values: Record<string, string | null>;
}

interface ExportPayload {
  templateName: string;
  clientNumber?: string | null;
  matterNumber?: string | null;
  columns: string[];
  rows: ExtractionRow[];
}

const PAGE_MARGIN = 50;
const COL_LABEL_WIDTH = 150;
const PAGE_WIDTH = 595; // A4 portrait
const VALUE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2 - COL_LABEL_WIDTH - 8;

function checkPage(doc: PDFKit.PDFDocument, neededHeight: number) {
  if (doc.y + neededHeight > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload: ExportPayload = await req.json();
    const { templateName, clientNumber, matterNumber, columns, rows } = payload;

    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2;

    // ── Cover / header ─────────────────────────────────────────
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827").text("Matrix Extraction", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1d4ed8").text(templateName);
    doc.moveDown(0.5);

    doc.fontSize(9).font("Helvetica").fillColor("#6b7280");
    if (clientNumber || matterNumber) {
      doc.text(`${clientNumber ?? ""}${matterNumber ? ` / ${matterNumber}` : ""}`);
    }
    doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    doc.text(`${columns.length} column${columns.length !== 1 ? "s" : ""}  ·  ${rows.filter((r) => !r.isConsensus).length} document${rows.filter((r) => !r.isConsensus).length !== 1 ? "s" : ""}`);
    doc.moveDown(0.6);

    doc.strokeColor("#d1d5db").lineWidth(0.5)
      .moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke();
    doc.moveDown(0.8);

    // ── Render each row as a section ──────────────────────────
    // Consensus first, then documents
    const sorted = [...rows.filter((r) => r.isConsensus), ...rows.filter((r) => !r.isConsensus)];

    for (const row of sorted) {
      checkPage(doc, 40);

      // Section heading
      if (row.isConsensus) {
        doc.rect(PAGE_MARGIN, doc.y, contentWidth, 20).fill("#dbeafe");
        doc.fillColor("#1e40af").fontSize(10).font("Helvetica-Bold")
          .text("CONSENSUS", PAGE_MARGIN + 6, doc.y - 16, { width: contentWidth - 12 });
        doc.moveDown(0.6);
      } else {
        doc.rect(PAGE_MARGIN, doc.y, contentWidth, 20).fill("#f3f4f6");
        doc.fillColor("#111827").fontSize(10).font("Helvetica-Bold")
          .text(row.filename, PAGE_MARGIN + 6, doc.y - 16, { width: contentWidth - 12, ellipsis: true });
        doc.moveDown(0.6);
      }

      // Field rows
      for (const col of columns) {
        const rawValue = row.values[col];
        const value = rawValue != null && rawValue !== "" ? rawValue : "—";

        // Estimate height needed
        doc.fontSize(9);
        const valueLines = doc.heightOfString(value, { width: VALUE_WIDTH });
        const rowHeight = Math.max(14, valueLines) + 6;
        checkPage(doc, rowHeight + 4);

        const rowTop = doc.y;

        // Alternating row tint
        if (columns.indexOf(col) % 2 === 0) {
          doc.rect(PAGE_MARGIN, rowTop, contentWidth, rowHeight).fill("#f9fafb");
        }

        // Column label
        doc.fillColor("#374151").fontSize(8.5).font("Helvetica-Bold")
          .text(col, PAGE_MARGIN + 4, rowTop + 3, { width: COL_LABEL_WIDTH - 8, ellipsis: true });

        // Value
        doc.fillColor(rawValue != null && rawValue !== "" ? "#111827" : "#9ca3af")
          .fontSize(9).font("Helvetica")
          .text(value, PAGE_MARGIN + COL_LABEL_WIDTH + 4, rowTop + 3, { width: VALUE_WIDTH, lineGap: 1 });

        // Move cursor to after this row
        doc.y = rowTop + rowHeight;
      }

      // Divider after section
      doc.moveDown(0.4);
      doc.strokeColor("#e5e7eb").lineWidth(0.5)
        .moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).stroke();
      doc.moveDown(0.8);
    }

    // ── Footer on last page ────────────────────────────────────
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(pageRange.start + i);
      doc.fontSize(8).font("Helvetica").fillColor("#9ca3af")
        .text(
          `Henry MCS  ·  ${templateName}  ·  Page ${i + 1} of ${pageRange.count}`,
          PAGE_MARGIN, doc.page.height - 30,
          { align: "center", width: contentWidth }
        );
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    const safeName = templateName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="matrix-${safeName}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
