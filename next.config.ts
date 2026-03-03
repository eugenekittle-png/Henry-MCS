import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth", "word-extractor", "pdfkit"],
};

export default nextConfig;
