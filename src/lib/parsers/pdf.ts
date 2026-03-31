export async function parsePdf(buffer: Buffer): Promise<string> {
  // pdf-parse handles Node.js/serverless compatibility internally
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text as string;
}
