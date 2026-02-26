import pdfParse from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<string> {
  // pdf-parse v1 expects a Buffer and returns {text, numpages, info}
  const data = await pdfParse(buffer);
  return data.text;
}
