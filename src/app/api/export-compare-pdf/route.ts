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

export async function POST(req: NextRequest) {
  try {
    const { diff, markdown, clientMatter } = await req.json();

    if (!diff) {
      return Response.json({ error: "No diff data provided" }, { status: 400 });
    }

    const diffData = diff as DiffData;
    const cm = clientMatter as ClientMatterInfo | undefined;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Header with client/matter info
    if (cm) {
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

    // Diff section
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
      // Check if we need a new page
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
      }

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
        // Strikethrough: draw text then line through it
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

    // Summary section (if provided)
    if (markdown && typeof markdown === "string") {
      doc.addPage();

      // Separator
      doc
        .strokeColor("#999999")
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .stroke();
      doc.moveDown(0.5);

      doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text("Summary");
      doc.moveDown(0.5);

      // Render markdown as simple formatted text
      const lines = markdown.split("\n");
      for (const line of lines) {
        if (doc.y > doc.page.height - 60) {
          doc.addPage();
        }

        // Headings
        const h1 = line.match(/^#\s+(.+)/);
        const h2 = line.match(/^##\s+(.+)/);
        const h3 = line.match(/^###\s+(.+)/);
        if (h1) {
          doc.moveDown(0.3);
          doc.fontSize(14).font("Helvetica-Bold").text(h1[1]);
          doc.moveDown(0.2);
          continue;
        }
        if (h2) {
          doc.moveDown(0.3);
          doc.fontSize(12).font("Helvetica-Bold").text(h2[1]);
          doc.moveDown(0.2);
          continue;
        }
        if (h3) {
          doc.moveDown(0.2);
          doc.fontSize(11).font("Helvetica-Bold").text(h3[1]);
          doc.moveDown(0.1);
          continue;
        }

        // Bullet points
        const bullet = line.match(/^[\s]*[-*]\s+(.+)/);
        if (bullet) {
          doc.fontSize(10).font("Helvetica").text(`  \u2022  ${stripMarkdown(bullet[1])}`);
          continue;
        }

        // Numbered list
        const numbered = line.match(/^[\s]*(\d+)\.\s+(.+)/);
        if (numbered) {
          doc.fontSize(10).font("Helvetica").text(`  ${numbered[1]}.  ${stripMarkdown(numbered[2])}`);
          continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          doc.moveDown(0.3);
          doc
            .strokeColor("#999999")
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(doc.page.width - 50, doc.y)
            .stroke();
          doc.moveDown(0.3);
          doc.strokeColor("#000000");
          continue;
        }

        // Empty line
        if (line.trim() === "") {
          doc.moveDown(0.3);
          continue;
        }

        // Regular text
        doc.fontSize(10).font("Helvetica").text(stripMarkdown(line));
      }
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="comparison.pdf"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
