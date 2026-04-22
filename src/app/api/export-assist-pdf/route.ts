import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { markdown, clientMatter } = await req.json();

    if (!markdown) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Header
    if (clientMatter) {
      doc.fontSize(11);
      doc.font("Helvetica-Bold").text("Client: ", { continued: true });
      doc.font("Helvetica").text(`${clientMatter.clientName} (${clientMatter.clientNumber})`);
      doc.font("Helvetica-Bold").text("Matter: ", { continued: true });
      doc.font("Helvetica").text(`${clientMatter.matterDescription} (${clientMatter.matterNumber})`);
      doc.font("Helvetica-Bold").text("Date: ", { continued: true });
      doc.font("Helvetica").text(
        new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      );
      doc.moveDown(0.5);
      doc.strokeColor("#999999").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown(0.5);
    }

    // Render markdown
    const lines = markdown.split("\n");
    for (const line of lines) {
      if (doc.y > doc.page.height - 60) doc.addPage();

      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h3 = line.match(/^###\s+(.+)/);

      if (h1) {
        doc.moveDown(0.3);
        doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text(h1[1]);
        doc.moveDown(0.2);
        continue;
      }
      if (h2) {
        doc.moveDown(0.3);
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text(h2[1]);
        doc.moveDown(0.2);
        continue;
      }
      if (h3) {
        doc.moveDown(0.2);
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text(h3[1]);
        doc.moveDown(0.1);
        continue;
      }

      const bullet = line.match(/^[\s]*[-*]\s+(.+)/);
      if (bullet) {
        doc.fontSize(10).font("Helvetica").fillColor("#1a1a1a")
          .text(`  \u2022  ${stripMarkdown(bullet[1])}`);
        continue;
      }

      const numbered = line.match(/^[\s]*(\d+)\.\s+(.+)/);
      if (numbered) {
        doc.fontSize(10).font("Helvetica").fillColor("#1a1a1a")
          .text(`  ${numbered[1]}.  ${stripMarkdown(numbered[2])}`);
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        doc.moveDown(0.3);
        doc.strokeColor("#999999").lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown(0.3);
        doc.strokeColor("#000000");
        continue;
      }

      if (line.trim() === "") {
        doc.moveDown(0.3);
        continue;
      }

      doc.fontSize(10).font("Helvetica").fillColor("#1a1a1a").text(stripMarkdown(line));
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="assist-response.pdf"',
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
