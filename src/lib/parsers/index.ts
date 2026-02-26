import { parsePdf } from "./pdf";
import { parseDocx } from "./docx";
import { parseXlsx } from "./xlsx";
import { parseText } from "./text";
import { parsePptx } from "./pptx";

export async function parseFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();

  switch (ext) {
    case ".pdf":
      return parsePdf(buffer);
    case ".docx":
      return parseDocx(buffer);
    case ".xlsx":
      return parseXlsx(buffer);
    case ".pptx":
      return parsePptx(buffer);
    case ".txt":
    case ".md":
    case ".csv":
      return parseText(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
