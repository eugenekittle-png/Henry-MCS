declare module "word-extractor" {
  interface Document {
    getBody(): string;
  }
  class WordExtractor {
    extract(input: Buffer | string): Promise<Document>;
  }
  export = WordExtractor;
}
