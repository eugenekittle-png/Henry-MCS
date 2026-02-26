import JSZip from "jszip";

export async function parsePptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const texts: string[] = [];

  // PPTX slides are in ppt/slides/slide{N}.xml
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    // Extract text content from XML by stripping tags
    const textContent = xml
      .replace(/<a:t[^>]*>/g, "")
      .replace(/<\/a:t>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();

    if (textContent) {
      const slideNum = slidePath.match(/slide(\d+)/)?.[1];
      texts.push(`--- Slide ${slideNum} ---\n${textContent}`);
    }
  }

  return texts.join("\n\n") || "(No text content found in presentation)";
}
